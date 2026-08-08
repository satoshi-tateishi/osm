# 実装プロンプト: フロントエンドJS化 Phase 7(マルチソース重ね描画 + アクティブ切替)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 7を実装するための指示書。Phase 6(シングルウィンドウ化+左ペイン読み取り専用ツリー)は完了・実機確認済み。

## Phase 6完了時点の状態(前提)

- `JsFrontendManager`は単一の`QWebEngineView`+単一`QWebChannel`を起動時に1回だけ生成し、`sourceList`(ルート`SourceList*`そのまま)・`sourceTree`(`Chart::SourceTreeBridge`)・`chartData`(`Chart::DataBridge`)の3つを固定名で登録する。
- `SourceTreeBridge`は既にトップレベルソースの読み取り専用ツリーJSONを`treeChanged`で配信しており、`Q_INVOKABLE setActive(QString uuid, bool active)`・`storeItem(QString uuid)`・`requestTree()`も**実装済み**(Phase 6実装時に前倒しで追加された)。**本Phaseでは`sourcetreebridge.h/.cpp`の変更は不要**。
- `DataBridge`は現在「先頭のトップレベルMeasurement1つだけに固定バインドする」実装のまま(`setSource()`を1回呼ぶだけ)。本Phaseの主眼はここをマルチソース対応に拡張すること。
- 中央チャートは`web/src/main.ts`が単一の`chartData`オブジェクトの5シグナルを購読し、受信のたびに該当canvas全体を「黒塗り→グリッド→1系列」で描き直す実装のまま(複数ソース重ね描きには未対応)。

## Phase 7のスコープ

1. `DataBridge`を**トップレベルMeasurement全件**に対応させ、ソースの追加/削除に追従してサンプラー一式を動的に生成/破棄する。JSON payloadに`uuid`フィールドを追加する。
2. JS側でチャート種別ごとに`Map<uuid, payload>`キャッシュを持ち、複数ソースを同一チャートに重ね描きする。ソース削除時にキャッシュから除去する。
3. 左ペインのツリー行にアクティブ切替チェックボックスを追加し、`sourceTree.setActive(uuid, active)`(Phase 6で実装済み)を呼び出す。非アクティブなソースはチャートの重ね描きから即座に除外する。
4. Spectrogramは2Dスクロールヒートマップの性質上、複数ソース重ね描きに意味がないため**選択中1ソースのみ表示**する。選択は**ツリー行のクリックによるJSローカルな状態**とする(`SourceList::selectedIndex`とのアプリ全体レベルでの相互同期は、右ペイン設定パネルを作るPhase 8でSettingsBridgeと一緒に導入する。今回はスコープを絞り、二重実装を避ける)。

## 実装1: `src/chart/databridge.h`(全面書き換え)

```cpp
#ifndef CHART_DATABRIDGE_H
#define CHART_DATABRIDGE_H

#include <QMap>
#include <QObject>
#include <QUuid>

#include "seriessampler.h"
#include "shared/source_shared.h"

class SourceList;

namespace Chart {

// トップレベルのMeasurement全件についてサンプラー一式を保持し、各ソースの
// readyRead()のたびに該当ソース分のJSONを配信する(複数ウィンドウではなく
// 単一のchartDataオブジェクトが全ソース分を多重化して流す設計)。
class DataBridge : public QObject
{
    Q_OBJECT
public:
    explicit DataBridge(SourceList *sourceList, QObject *parent = nullptr);
    ~DataBridge() override;

signals:
    void magnitudeUpdated(const QString &json);
    void phaseUpdated(const QString &json);
    void coherenceUpdated(const QString &json);
    void rtaUpdated(const QString &json);
    void spectrogramRowUpdated(const QString &json);
    void sourceRemoved(const QString &uuid);

private slots:
    void onItemAppended(const Shared::Source &item);
    void onItemRemoved(QUuid uuid);
    void onReadyRead();

private:
    struct SamplerSet {
        MagnitudeSeriesSampler magnitude;
        PhaseSeriesSampler phase;
        CoherenceSeriesSampler coherence;
        RTASeriesSampler rta;
        SpectrogramSeriesSampler spectrogram;
    };

    SourceList *m_sourceList;
    QMap<QUuid, SamplerSet *> m_samplers;
};

} // namespace Chart

#endif // CHART_DATABRIDGE_H
```

## 実装2: `src/chart/databridge.cpp`(全面書き換え)

```cpp
#include "databridge.h"

#include "abstract/source.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

namespace Chart {

DataBridge::DataBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    connect(m_sourceList, &SourceList::postItemAppended, this, &DataBridge::onItemAppended);
    connect(m_sourceList, &SourceList::preItemRemoved, this, &DataBridge::onItemRemoved);

    for (const auto &item : m_sourceList->items()) {
        onItemAppended(item);
    }
}

DataBridge::~DataBridge()
{
    qDeleteAll(m_samplers);
}

void DataBridge::onItemAppended(const Shared::Source &item)
{
    if (!dynamic_cast<Measurement *>(item.get())) {
        return;
    }
    auto uuid = item->uuid();
    if (m_samplers.contains(uuid)) {
        return;
    }

    auto *samplers = new SamplerSet();
    samplers->magnitude.setSource(item);
    samplers->phase.setSource(item);
    samplers->coherence.setSource(item);
    samplers->rta.setSource(item);
    samplers->spectrogram.setSource(item);
    m_samplers.insert(uuid, samplers);

    connect(item.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
}

void DataBridge::onItemRemoved(QUuid uuid)
{
    // preItemRemoved(uuid)を使う(postItemRemovedは引数を持たないため、
    // どのソースのサンプラーを破棄すべきか特定できない)。SourceTreeBridgeが
    // ツリー再構築にpostItemRemovedを使っているのとは目的が異なる点に注意。
    auto it = m_samplers.find(uuid);
    if (it == m_samplers.end()) {
        return;
    }
    delete it.value();
    m_samplers.erase(it);
    emit sourceRemoved(uuid.toString());
}

void DataBridge::onReadyRead()
{
    auto *source = qobject_cast<Abstract::Source *>(sender());
    if (!source) {
        return;
    }
    auto it = m_samplers.find(source->uuid());
    if (it == m_samplers.end()) {
        return;
    }
    auto *samplers = it.value();

    auto magnitudeJson = samplers->magnitude.sampleJson();
    if (!magnitudeJson.isEmpty()) {
        emit magnitudeUpdated(magnitudeJson);
    }

    auto phaseJson = samplers->phase.sampleJson();
    if (!phaseJson.isEmpty()) {
        emit phaseUpdated(phaseJson);
    }

    auto coherenceJson = samplers->coherence.sampleJson();
    if (!coherenceJson.isEmpty()) {
        emit coherenceUpdated(coherenceJson);
    }

    auto rtaJson = samplers->rta.sampleJson();
    if (!rtaJson.isEmpty()) {
        emit rtaUpdated(rtaJson);
    }

    auto spectrogramJson = samplers->spectrogram.sampleJson();
    if (!spectrogramJson.isEmpty()) {
        emit spectrogramRowUpdated(spectrogramJson);
    }
}

} // namespace Chart
```

**補足**: `setSource()`という公開メソッドは廃止した(呼び出し元は`JsFrontendManager`のみで、コンストラクタで`SourceList`を渡す設計に一本化したため)。

## 実装3: `src/chart/seriessampler.cpp`の変更(5箇所、`uuid`フィールド追加)

`payload["sourceName"] = m_source->name();`という行が5箇所(Magnitude/Phase/Coherence/RTA/Spectrogramの各`sampleJson()`、66・134・191・254・321行目付近)にあるので、**それぞれの直後**に以下を追加する:

```cpp
    payload["uuid"] = m_source->uuid().toString();
```

(Spectrogramのpayloadは元々`color`フィールドを持たない設計のままでよい。`uuid`だけ追加する。)

## 実装4: `src/chart/jsfrontendmanager.cpp`の変更

コンストラクタを以下のように簡略化する(`DataBridge`が`SourceList`を直接受け取って自己管理するようになったため、先頭Measurementを探すforループと`src/source/measurement.h`のincludeが不要になる):

```cpp
#include "jsfrontendmanager.h"

#include <QWebChannel>
#include <QWebEngineView>

#include "databridge.h"
#include "sourcetreebridge.h"
#include "src/sourcelist.h"

namespace Chart {

JsFrontendManager::JsFrontendManager(SourceList *sourceList, bool useDevServer, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    m_dataBridge = new DataBridge(m_sourceList, this);
    m_sourceTreeBridge = new SourceTreeBridge(m_sourceList, this);

    m_channel = new QWebChannel(this);
    m_channel->registerObject(QStringLiteral("sourceList"), m_sourceList);
    m_channel->registerObject(QStringLiteral("sourceTree"), m_sourceTreeBridge);
    m_channel->registerObject(QStringLiteral("chartData"), m_dataBridge);

    m_view = new QWebEngineView();
    m_view->page()->setWebChannel(m_channel);
    m_view->resize(1440, 900);
    m_view->setWindowTitle(QStringLiteral("OSM"));
    m_view->load(useDevServer
                 ? QUrl(QStringLiteral("http://localhost:5173/"))
                 : QUrl(QStringLiteral("qrc:/web/index.html")));
    m_view->show();
}

JsFrontendManager::~JsFrontendManager()
{
    delete m_view;
}

} // namespace Chart
```

`jsfrontendmanager.h`は変更不要。`OpenSoundMeter.pro`も変更不要(新規ファイルなし)。

## 実装5(新規): `web/src/charts.ts`(チャート描画をmain.tsから分離、マルチソース対応)

```ts
export interface SeriesPayload {
  uuid: string
  sourceName: string
  color: string
  frequency: number[]
}
export interface MagnitudePayload extends SeriesPayload { magnitudeDb: (number | null)[] }
export interface PhasePayload extends SeriesPayload { phaseDeg: (number | null)[] }
export interface CoherencePayload extends SeriesPayload { coherenceValue: (number | null)[] }
export interface RTAPayload extends SeriesPayload { levelDb: (number | null)[] }
export interface SpectrogramPayload {
  uuid: string
  sourceName: string
  frequency: number[]
  levelDb: number[]
}

const XMIN = 20
const XMAX = 20000
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

function xForFreq(f: number, width: number) {
  return (Math.log(f) - Math.log(XMIN)) / Math.log(XMAX / XMIN) * width
}

function drawGrid(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)
  ctx.strokeStyle = 'rgba(255,255,255,0.157)'
  ctx.lineWidth = 1
  for (const f of GRID_FREQS) {
    const x = xForFreq(f, cw)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }
  ctx.restore()
}

// wrapThreshold: 隣接点の差がこれを超えたら線を繋がず区切る(Phaseの±180度ラップ対策)。
function drawOneSeries(
  canvas: HTMLCanvasElement,
  frequency: number[],
  values: (number | null)[],
  color: string,
  yMin: number,
  yMax: number,
  wrapThreshold = Infinity
) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  const yForValue = (v: number) => ch - (v - yMin) / (yMax - yMin) * ch

  ctx.strokeStyle = color || '#3F51B5'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  let penDown = false
  let lastValue: number | null = null
  frequency.forEach((f, idx) => {
    const v = values[idx]
    if (v === null || !Number.isFinite(v)) {
      penDown = false
      lastValue = null
      return
    }
    if (lastValue !== null && Math.abs(v - lastValue) > wrapThreshold) {
      penDown = false
    }
    const x = xForFreq(f, cw)
    const y = yForValue(v)
    if (!penDown) {
      ctx.moveTo(x, y)
      penDown = true
    } else {
      ctx.lineTo(x, y)
    }
    lastValue = v
  })
  ctx.stroke()
  ctx.restore()
}

function drawLegend(canvas: HTMLCanvasElement, entries: { color: string; name: string }[]) {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.font = '11px sans-serif'
  entries.forEach((entry, i) => {
    const y = 12 + i * 13
    ctx.fillStyle = entry.color || '#3F51B5'
    ctx.fillRect(8, y - 8, 8, 8)
    ctx.fillStyle = 'rgba(255,255,255,255)'
    ctx.fillText(entry.name, 20, y)
  })
  ctx.restore()
}

function finiteRange(valuesList: (number | null)[][], padRatio = 0.1, fallbackPad = 1) {
  const finite = valuesList.flat().filter((v): v is number => v !== null && Number.isFinite(v))
  if (!finite.length) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * padRatio || fallbackPad
  return { min: min - pad, max: max + pad }
}

let activeUuids: Set<string> | null = null // nullの間は全件を有効として扱う(初回treeChanged受信前の暫定措置)

const magnitudeCache = new Map<string, MagnitudePayload>()
const phaseCache = new Map<string, PhasePayload>()
const coherenceCache = new Map<string, CoherencePayload>()
const rtaCache = new Map<string, RTAPayload>()

function visibleEntries<T extends { uuid: string }>(cache: Map<string, T>): T[] {
  const all = [...cache.values()]
  if (!activeUuids) return all
  return all.filter((e) => activeUuids!.has(e.uuid))
}

export interface ChartCanvases {
  magnitude: HTMLCanvasElement
  phase: HTMLCanvasElement
  coherence: HTMLCanvasElement
  rta: HTMLCanvasElement
  spectrogram: HTMLCanvasElement
}

export function setActiveUuids(uuids: Set<string>, canvases: ChartCanvases) {
  activeUuids = uuids
  redrawMagnitude(canvases.magnitude)
  redrawPhase(canvases.phase)
  redrawCoherence(canvases.coherence)
  redrawRTA(canvases.rta)
}

function redrawMagnitude(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(magnitudeCache)
  const range = finiteRange(entries.map((e) => e.magnitudeDb)) ?? { min: -1, max: 1 }
  entries.forEach((e) => drawOneSeries(canvas, e.frequency, e.magnitudeDb, e.color, range.min, range.max))
  drawLegend(canvas, entries.map((e) => ({ color: e.color, name: e.sourceName })))
}
export function updateMagnitude(canvas: HTMLCanvasElement, payload: MagnitudePayload) {
  magnitudeCache.set(payload.uuid, payload)
  redrawMagnitude(canvas)
}

function redrawPhase(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(phaseCache)
  entries.forEach((e) => drawOneSeries(canvas, e.frequency, e.phaseDeg, e.color, -180, 180, 180))
  drawLegend(canvas, entries.map((e) => ({ color: e.color, name: e.sourceName })))
}
export function updatePhase(canvas: HTMLCanvasElement, payload: PhasePayload) {
  phaseCache.set(payload.uuid, payload)
  redrawPhase(canvas)
}

function redrawCoherence(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(coherenceCache)
  entries.forEach((e) => drawOneSeries(canvas, e.frequency, e.coherenceValue, e.color, 0, 1))
  drawLegend(canvas, entries.map((e) => ({ color: e.color, name: e.sourceName })))
}
export function updateCoherence(canvas: HTMLCanvasElement, payload: CoherencePayload) {
  coherenceCache.set(payload.uuid, payload)
  redrawCoherence(canvas)
}

function redrawRTA(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(rtaCache)
  const range = finiteRange(entries.map((e) => e.levelDb)) ?? { min: -1, max: 1 }
  entries.forEach((e) => drawOneSeries(canvas, e.frequency, e.levelDb, e.color, range.min, range.max))
  drawLegend(canvas, entries.map((e) => ({ color: e.color, name: e.sourceName })))
}
export function updateRTA(canvas: HTMLCanvasElement, payload: RTAPayload) {
  rtaCache.set(payload.uuid, payload)
  redrawRTA(canvas)
}

export function removeSource(uuid: string, canvases: ChartCanvases) {
  magnitudeCache.delete(uuid)
  phaseCache.delete(uuid)
  coherenceCache.delete(uuid)
  rtaCache.delete(uuid)
  redrawMagnitude(canvases.magnitude)
  redrawPhase(canvases.phase)
  redrawCoherence(canvases.coherence)
  redrawRTA(canvases.rta)
  if (spectrogramSourceUuid === uuid) {
    spectrogramSourceUuid = null
  }
}

// --- Spectrogram: 選択中1ソースのみ表示 ---

const SPECTROGRAM_ROWS = 51
const SPEC_LOWER = -70
const SPEC_UPPER = -10
const COLOR_BLUE: [number, number, number] = [33, 150, 243]
const COLOR_GREEN: [number, number, number] = [139, 195, 74]
const COLOR_YELLOW: [number, number, number] = [255, 235, 59]
const COLOR_RED: [number, number, number] = [244, 67, 54]

function mixColor(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i] + k * (b[i] - a[i])) as [number, number, number]
}

function spectrogramColor(db: number): string {
  if (db <= SPEC_LOWER) return 'rgb(0,0,0)'
  const seg = (SPEC_UPPER - SPEC_LOWER) / 3
  let rgb: [number, number, number]
  if (seg <= 0 || db >= SPEC_UPPER) {
    rgb = COLOR_RED
  } else if (db < SPEC_LOWER + seg) {
    rgb = mixColor(COLOR_BLUE, COLOR_GREEN, (db - SPEC_LOWER) / seg)
  } else if (db < SPEC_LOWER + 2 * seg) {
    rgb = mixColor(COLOR_GREEN, COLOR_YELLOW, (db - (SPEC_LOWER + seg)) / seg)
  } else {
    rgb = mixColor(COLOR_YELLOW, COLOR_RED, (db - (SPEC_LOWER + 2 * seg)) / seg)
  }
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`
}

let spectrogramSourceUuid: string | null = null

// ツリー行クリックで呼ばれる。選択切り替え時はスクロール履歴が別ソースのものになるためクリアする。
export function setSpectrogramSource(uuid: string, canvas: HTMLCanvasElement) {
  if (spectrogramSourceUuid === uuid) return
  spectrogramSourceUuid = uuid
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function updateSpectrogramRow(canvas: HTMLCanvasElement, payload: SpectrogramPayload) {
  if (spectrogramSourceUuid === null) {
    spectrogramSourceUuid = payload.uuid // 初回受信ソースを暫定的に自動選択
  }
  if (payload.uuid !== spectrogramSourceUuid) return

  const ctx = canvas.getContext('2d')!
  const cw = canvas.width
  const ch = canvas.height
  const rowHeight = Math.max(1, Math.floor(ch / SPECTROGRAM_ROWS))

  if (ch > rowHeight) {
    const img = ctx.getImageData(0, 0, cw, ch - rowHeight)
    ctx.putImageData(img, 0, rowHeight)
  }

  const n = payload.frequency.length
  for (let i = 0; i < n; i++) {
    const prevX = i > 0 ? xForFreq(payload.frequency[i - 1], cw) : 0
    const curX = xForFreq(payload.frequency[i], cw)
    const nextX = i < n - 1 ? xForFreq(payload.frequency[i + 1], cw) : cw
    const xStart = i > 0 ? (prevX + curX) / 2 : 0
    const xEnd = i < n - 1 ? (curX + nextX) / 2 : cw
    ctx.fillStyle = spectrogramColor(payload.levelDb[i])
    ctx.fillRect(xStart, 0, Math.max(1, xEnd - xStart), rowHeight)
  }
}
```

## 実装6: `web/src/sourceTree.ts`の変更(アクティブ切替チェックボックス + クリック選択)

```ts
export interface TreeItem {
  uuid: string
  type: string
  name: string
  color: string
  active: boolean
}

export interface TreeCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onSelect: (uuid: string) => void
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

let selectedUuid: string | null = null

export function renderSourceTree(container: HTMLElement, items: TreeItem[], callbacks: TreeCallbacks) {
  container.innerHTML = items.map((item) => `
    <div class="tree-row${item.uuid === selectedUuid ? ' selected' : ''}" data-uuid="${item.uuid}">
      <input type="checkbox" class="tree-active" ${item.active ? 'checked' : ''} />
      <span class="tree-swatch" style="background:${item.color}"></span>
      <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
      <span class="tree-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
    </div>
  `).join('')

  container.querySelectorAll<HTMLInputElement>('.tree-active').forEach((checkbox) => {
    checkbox.addEventListener('click', (e) => e.stopPropagation())
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.tree-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })
  container.querySelectorAll<HTMLElement>('.tree-row').forEach((row) => {
    row.addEventListener('click', () => {
      const uuid = row.dataset.uuid!
      container.querySelectorAll('.tree-row.selected').forEach((el) => el.classList.remove('selected'))
      row.classList.add('selected')
      selectedUuid = uuid
      callbacks.onSelect(uuid)
    })
  })
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

## 実装7: `web/src/main.ts`の変更(charts.ts経由の配線に差し替え)

```ts
import './style.css'
import * as charts from './charts'
import { renderSourceTree, type TreeItem } from './sourceTree'
import { channelReady, connectWebChannel } from './webchannel'

// DOM構築(Phase 6と同じ3ペイン構成、変更なし)
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="pane pane-left">
    <h2>Sources</h2>
    <p id="status">QWebChannel接続待ち...</p>
    <div id="source-tree"></div>
  </div>
  <div class="pane pane-center">
    <h2>Magnitude</h2>
    <canvas id="chart-magnitude" class="chart"></canvas>
    <h2>RTA</h2>
    <canvas id="chart-rta" class="chart"></canvas>
    <h2>Spectrogram</h2>
    <canvas id="chart-spectrogram" class="chart"></canvas>
    <h2>Phase</h2>
    <canvas id="chart-phase" class="chart"></canvas>
    <h2>Coherence</h2>
    <canvas id="chart-coherence" class="chart"></canvas>
  </div>
  <div class="pane pane-right">
    <h2>Settings</h2>
    <p class="placeholder">Phase 8で実装予定</p>
  </div>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const sourceTreeEl = document.querySelector<HTMLDivElement>('#source-tree')!
const centerPaneEl = document.querySelector<HTMLDivElement>('.pane-center')!
const canvases: charts.ChartCanvases = {
  magnitude: document.querySelector<HTMLCanvasElement>('#chart-magnitude')!,
  rta: document.querySelector<HTMLCanvasElement>('#chart-rta')!,
  spectrogram: document.querySelector<HTMLCanvasElement>('#chart-spectrogram')!,
  phase: document.querySelector<HTMLCanvasElement>('#chart-phase')!,
  coherence: document.querySelector<HTMLCanvasElement>('#chart-coherence')!,
}

function resizeCanvas(canvas: HTMLCanvasElement, height: number) {
  const width = Math.max(1, centerPaneEl.clientWidth - 32)
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}
function resizeAll() {
  resizeCanvas(canvases.magnitude, 300)
  resizeCanvas(canvases.rta, 220)
  resizeCanvas(canvases.spectrogram, 220)
  resizeCanvas(canvases.phase, 220)
  resizeCanvas(canvases.coherence, 160)
}
window.addEventListener('resize', resizeAll)
resizeAll()

connectWebChannel((message) => { statusEl.textContent = message })

channelReady.then(({ sourceTree, chartData }) => {
  sourceTree.treeChanged.connect((json: string) => {
    let items: TreeItem[]
    try {
      items = JSON.parse(json) as TreeItem[]
    } catch (e) {
      console.error('treeChanged parse error', e)
      return
    }
    renderSourceTree(sourceTreeEl, items, {
      onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
      onSelect: (uuid) => charts.setSpectrogramSource(uuid, canvases.spectrogram),
    })
    charts.setActiveUuids(new Set(items.filter((i) => i.active).map((i) => i.uuid)), canvases)
  })
  sourceTree.requestTree()

  chartData.magnitudeUpdated.connect((json: string) => {
    try { charts.updateMagnitude(canvases.magnitude, JSON.parse(json)) } catch (e) { console.error('magnitudeUpdated parse error', e) }
  })
  chartData.phaseUpdated.connect((json: string) => {
    try { charts.updatePhase(canvases.phase, JSON.parse(json)) } catch (e) { console.error('phaseUpdated parse error', e) }
  })
  chartData.coherenceUpdated.connect((json: string) => {
    try { charts.updateCoherence(canvases.coherence, JSON.parse(json)) } catch (e) { console.error('coherenceUpdated parse error', e) }
  })
  chartData.rtaUpdated.connect((json: string) => {
    try { charts.updateRTA(canvases.rta, JSON.parse(json)) } catch (e) { console.error('rtaUpdated parse error', e) }
  })
  chartData.spectrogramRowUpdated.connect((json: string) => {
    try { charts.updateSpectrogramRow(canvases.spectrogram, JSON.parse(json)) } catch (e) { console.error('spectrogramRowUpdated parse error', e) }
  })
  chartData.sourceRemoved.connect((uuid: string) => {
    charts.removeSource(uuid, canvases)
  })
})
```

`SeriesPayload`等の型定義・`drawSeries`等の描画関数は`charts.ts`に移したため、`main.ts`からは削除する。

## 実装8: `web/src/style.css`の追加分

既存のスタイルに以下を追加する:

```css
.tree-row {
  cursor: pointer;
}

.tree-row.selected {
  background: rgba(33, 150, 243, 0.25);
}

.tree-active {
  flex: 0 0 auto;
  margin: 0;
}
```

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. QML側でMeasurementを複数(2〜3個)アクティブにし、JS側のMagnitude/RTA/Phase/Coherenceそれぞれに全ソース分の線が該当ソース色で重ね描きされ、左上に凡例(色+名前)が並ぶことを確認する。
5. 左ペインのチェックボックスでいずれかのソースを非アクティブにすると、対応する線が即座にチャートから消えること(新しいデータが届くのを待たずに)を確認する。QML側のチェックボックスと状態が一致することも確認する。
6. QML側からMeasurementを1つ削除すると、対応する線がJS側チャートから即座に消えることを確認する(`sourceRemoved`経由)。
7. 左ペインのツリー行をクリックすると、その行がハイライトされ、Spectrogramがそのソースのデータのみに切り替わり、切り替え時に旧ソースの残像が残らず(バッファがクリアされ)描き直されることを確認する。
8. `npm run build`(tscの型チェック含む)が通ること。
9. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。
10. Measurementを3〜5個同時にアクティブにして数分間動作させ、クラッシュ・著しいCPU/メモリ増加が無いか確認する(Phase 5完了メモの「5枚は動作確認済みの目安」を踏まえた参考値との比較でよい)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 7のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。あわせて、当初の「`sourceList.selectedChanged`受信でバッファをクリア」という記述を、実際に採用した「ツリー行クリックによるJSローカル選択」に修正する(Phase 8でSettingsBridgeと一緒に本格的な選択同期を導入する旨も明記する)。
- [customizations.md](customizations.md)の「方針転換」節に、Phase 7で行った`DataBridge`のマルチソース対応・凡例表示・Spectrogramのローカル選択方式について追記する。
