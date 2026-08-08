# 実装プロンプト: フロントエンドJS化 Phase 8(設定パネル: 選択ソース連動、読み取り+書き込み)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 8を実装するための指示書。Phase 7(マルチソース重ね描画+アクティブ切替)は完了・実機確認(CDP経由でのDOM操作検証含む)済み。

## Phase 7完了時点の状態(前提)

- 左ペインのツリー行クリックは、現在**JSローカルな状態**として扱われており(`web/src/sourceTree.ts`の`selectedUuid`変数)、クリックされたuuidは`onSelect`コールバック経由で`web/src/charts.ts`の`setSpectrogramSource(uuid, canvas)`に渡され、Spectrogramの表示対象を切り替えるためだけに使われている。`SourceList::selectedIndex`(QMLの選択と共有されるプロパティ)は**まだ使っていない**。
- `SourceList::selectedUuid()`はQ_INVOKABLEでもQ_PROPERTYでもない plain C++メソッドのため、そもそもJSから直接呼び出せない(Phase 7で判明した制約)。
- `Abstract::Source`(`src/abstract/source.h`)は`Q_PROPERTY(QColor color...)`/`Q_PROPERTY(bool active...)`/`Q_PROPERTY(QString name...)`を持つ。`Measurement`(`src/source/measurement.h`)はさらに多数のQ_PROPERTY(後述)を持ち、対応する列挙型(`AverageType`/`Mode`/`Filter::Frequency`/`InputFilter`)は全て`Q_ENUM`登録済みであることを確認した(`src/meta/metameasurement.h:38-46`、`src/math/bessellpf.h:29-30`)。これにより`QObject::setProperty(name, QVariant(intValue))`によるenumプロパティへの汎用書き込みが、Qtのメタオブジェクトシステムのint↔enum自動変換で機能する見込みが高い(**ただし実装時に実機で必ず動作確認すること**。もし特定のenumプロパティで書き込みが効かない場合は、そのプロパティだけ`Q_INVOKABLE`の専用セッターを追加するフォールバックとする)。

## Phase 8のスコープ

1. 左ペインのツリー行クリックを「選択」として、Spectrogram切替に加えて**右ペインの設定パネル切替**にも使う(2つの独立した選択の仕組みを作らず、既存のクリックハンドラを両方に配線する)。
2. 新規`Chart::SettingsBridge`を追加し、選択中ソースが`Measurement`であれば設定値のJSONスナップショットを配信し、JSからの書き込み(`setProperty`)・平均リセット(`resetAverage`)・スナップショット保存(`store`)を受け付ける。
3. 右ペインに実フォームを実装し、Averaging Depth・Gain・Offset・Delay・Mode・Input Filter等を編集可能にする。
4. レベルメーター(level/referenceLevel/peak)を軽量な別シグナルで高頻度配信する。

**今回スコープ外(意図的に見送る)**: `deviceId`(型が`Q_PROPERTY`宣言上は`QString`だが実際のC++アクセサは`audio::DeviceInfo::Id`を返す独自型で、汎用`setProperty`での書き込みが安全に動くか未検証)、`dataChanel`/`referenceChanel`(デバイスのチャンネル一覧UIが別途必要で範囲が広がる)、`calibration`ファイル読み込み(ファイルダイアログが必要)。これらは将来のPhaseで扱う。

## 実装1(新規): `src/chart/settingsbridge.h`

```cpp
#ifndef CHART_SETTINGSBRIDGE_H
#define CHART_SETTINGSBRIDGE_H

#include <QObject>
#include <QString>
#include <QUuid>
#include <QVariant>

#include "shared/source_shared.h"

class SourceList;

namespace Chart {

// 右ペイン用ブリッジ。選択中1ソース分の設定値スナップショットをsettingsChangedで
// 配信し、setProperty()等のQ_INVOKABLEで書き込みを受け付ける。選択状態は
// SourceList::selectedIndexとは連動させず、左ペインのクリックによるJSローカル選択を
// そのまま流用する(Phase 7でSpectrogram選択に採用した方式と統一するため)。
class SettingsBridge : public QObject
{
    Q_OBJECT
public:
    explicit SettingsBridge(SourceList *sourceList, QObject *parent = nullptr);

    Q_INVOKABLE void selectSource(const QString &uuid);
    Q_INVOKABLE void setProperty(const QString &uuid, const QString &name, const QVariant &value);
    Q_INVOKABLE void resetAverage(const QString &uuid);
    Q_INVOKABLE void store(const QString &uuid);
    Q_INVOKABLE void applyAutoGain(const QString &uuid, float reference);

signals:
    void settingsChanged(const QString &json);
    void meterUpdated(const QString &json);

private slots:
    void onReadyRead();

private:
    void emitSettings();

    SourceList *m_sourceList;
    QUuid m_selectedUuid;
    Shared::Source m_selectedSource;
};

} // namespace Chart

#endif // CHART_SETTINGSBRIDGE_H
```

## 実装2(新規): `src/chart/settingsbridge.cpp`

```cpp
#include "settingsbridge.h"

#include <QJsonDocument>
#include <QJsonObject>

#include "abstract/source.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

namespace Chart {

SettingsBridge::SettingsBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
}

void SettingsBridge::selectSource(const QString &uuidString)
{
    if (m_selectedSource) {
        disconnect(m_selectedSource.get(), &Abstract::Source::readyRead, this, &SettingsBridge::onReadyRead);
    }

    m_selectedUuid = QUuid(uuidString);
    m_selectedSource = m_sourceList->getByUUid(m_selectedUuid);

    if (m_selectedSource) {
        connect(m_selectedSource.get(), &Abstract::Source::readyRead, this, &SettingsBridge::onReadyRead);
    }
    emitSettings();
}

void SettingsBridge::setProperty(const QString &uuidString, const QString &name, const QVariant &value)
{
    if (QUuid(uuidString) != m_selectedUuid || !m_selectedSource) {
        return; // 選択が既に切り替わった後の遅延書き込みは無視する
    }
    m_selectedSource->setProperty(name.toUtf8().constData(), value);
    emitSettings();
}

void SettingsBridge::resetAverage(const QString &uuidString)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->resetAverage();
    }
}

void SettingsBridge::store(const QString &uuidString)
{
    if (QUuid(uuidString) != m_selectedUuid || !m_selectedSource) {
        return;
    }
    m_sourceList->storeItem(m_selectedSource);
}

void SettingsBridge::applyAutoGain(const QString &uuidString, float reference)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->applyAutoGain(reference);
    }
    emitSettings();
}

void SettingsBridge::onReadyRead()
{
    auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get());
    if (!measurement) {
        return;
    }
    QJsonObject payload;
    payload["level"] = measurement->level();
    payload["referenceLevel"] = measurement->referenceLevel();
    payload["measurementPeak"] = measurement->measurementPeak();
    payload["referencePeak"] = measurement->referencePeak();
    emit meterUpdated(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
}

void SettingsBridge::emitSettings()
{
    QJsonObject payload;

    if (!m_selectedSource) {
        payload["uuid"] = QJsonValue();
        emit settingsChanged(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
        return;
    }

    payload["uuid"] = m_selectedUuid.toString();
    payload["type"] = m_selectedSource->objectName();

    auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get());
    payload["editable"] = measurement != nullptr;
    if (measurement) {
        payload["name"] = measurement->name();
        payload["active"] = measurement->active();
        payload["averageType"] = static_cast<int>(measurement->averageType());
        payload["average"] = measurement->average();
        payload["averageTickSeconds"] = measurement->averageTickSeconds();
        payload["filtersFrequency"] = static_cast<int>(measurement->filtersFrequency());
        payload["gain"] = measurement->gain();
        payload["offset"] = measurement->offset();
        payload["delay"] = measurement->delay();
        payload["mode"] = static_cast<int>(measurement->mode());
        payload["tfcReferenceTime"] = measurement->tfcReferenceTime();
        payload["inputFilter"] = static_cast<int>(measurement->inputFilter());
        payload["polarity"] = measurement->polarity();
    }

    emit settingsChanged(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
}

} // namespace Chart
```

**列挙値の対応表(JS側のラベル表示に使用、`src/meta/metameasurement.h:38-46`・`src/math/bessellpf.h:29`より)**:
- `averageType`: 0=Off, 1=LPF, 2=FIFO
- `mode`: 0=FFT10(1024), 1=FFT11(2048), 2=FFT12(4096), 3=FFT13(8192), 4=FFT14(16384), 5=FFT15(32768), 6=FFT16(65536), 7=LFT(LTW), 8=TFC
- `filtersFrequency`: 0=0.25Hz, 1=0.5Hz, 2=1Hz
- `inputFilter`: 0=Z, 1=A, 2=C, 3=Notch, 4=BP100, 5=LP200

## 実装3: `OpenSoundMeter.pro`の変更

`SOURCES +=`ブロックの`src/chart/sourcetreebridge.cpp \`の直後に追加:
```
    src/chart/settingsbridge.cpp \
```
`HEADERS +=`ブロックの`src/chart/sourcetreebridge.h \`の直後に追加:
```
    src/chart/settingsbridge.h \
```

## 実装4: `src/chart/jsfrontendmanager.h`/`.cpp`の変更

`jsfrontendmanager.h`: `SettingsBridge`の前方宣言と`m_settingsBridge`メンバを追加。

```cpp
namespace Chart {

class DataBridge;
class SourceTreeBridge;
class SettingsBridge; // 追加

class JsFrontendManager : public QObject
{
    ...
private:
    SourceList *m_sourceList;
    QWebChannel *m_channel;
    QWebEngineView *m_view;
    DataBridge *m_dataBridge;
    SourceTreeBridge *m_sourceTreeBridge;
    SettingsBridge *m_settingsBridge; // 追加
};

}
```

`jsfrontendmanager.cpp`のコンストラクタに追加(`#include "settingsbridge.h"`も追加):

```cpp
    m_settingsBridge = new SettingsBridge(m_sourceList, this);
    ...
    m_channel->registerObject(QStringLiteral("settings"), m_settingsBridge);
```

## 実装5: `web/src/webchannel.ts`の変更(`settings`オブジェクトを追加)

```ts
export interface ChannelObjects {
  sourceList: any
  sourceTree: any
  chartData: any
  settings: any // 追加
}
```

`connectWebChannel`内の分割代入・null チェック・`resolveObjects`呼び出しにも`settings`を追加する。

## 実装6(新規): `web/src/settingsPanel.ts`

```ts
export interface SettingsPayload {
  uuid: string | null
  type?: string
  editable?: boolean
  name?: string
  active?: boolean
  averageType?: number
  average?: number
  averageTickSeconds?: number
  filtersFrequency?: number
  gain?: number
  offset?: number
  delay?: number
  mode?: number
  tfcReferenceTime?: number
  inputFilter?: number
  polarity?: boolean
}

export interface MeterPayload {
  level: number
  referenceLevel: number
  measurementPeak: number
  referencePeak: number
}

const MODE_LABELS = ['FFT 1024', 'FFT 2048', 'FFT 4096', 'FFT 8192', 'FFT 16384', 'FFT 32768', 'FFT 65536', 'LTW', 'TFC']
const AVERAGE_TYPE_LABELS = ['Off', 'LPF', 'FIFO']
const FILTERS_FREQUENCY_LABELS = ['0.25 Hz', '0.5 Hz', '1 Hz']
const INPUT_FILTER_LABELS = ['Z', 'A', 'C', 'Notch', 'BP100', 'LP200']
const AVERAGE_TYPE_LPF = 1
const AVERAGE_TYPE_FIFO = 2
const MODE_TFC = 8

function options(labels: string[], selected: number | undefined) {
  return labels.map((label, i) => `<option value="${i}" ${selected === i ? 'selected' : ''}>${label}</option>`).join('')
}

export function renderSettingsPanel(
  container: HTMLElement,
  payload: SettingsPayload | null,
  callbacks: {
    onChange: (name: string, value: number | string | boolean) => void
    onResetAverage: () => void
    onStore: () => void
  }
) {
  if (!payload || !payload.uuid) {
    container.innerHTML = '<p class="placeholder">左のリストからソースを選択してください</p>'
    return
  }
  if (!payload.editable) {
    container.innerHTML = `<p class="placeholder">${escapeHtml(payload.type ?? '')}の設定はまだ対応していません</p>`
    return
  }

  container.innerHTML = `
    <div class="settings-field"><label>Name</label><input type="text" data-prop="name" value="${escapeAttr(payload.name ?? '')}" /></div>
    <div class="settings-field"><label>Gain (dB)</label><input type="number" step="0.1" data-prop="gain" value="${payload.gain}" /></div>
    <div class="settings-field"><label>Offset (dB)</label><input type="number" step="0.1" data-prop="offset" value="${payload.offset}" /></div>
    <div class="settings-field"><label>Delay (samples)</label><input type="number" step="1" data-prop="delay" value="${payload.delay}" /></div>
    <div class="settings-field"><label>Mode</label>
      <select data-prop="mode">${options(MODE_LABELS, payload.mode)}</select>
    </div>
    <div class="settings-field" ${payload.mode === MODE_TFC ? '' : 'style="display:none"'}>
      <label>TFC reference time (ms)</label><input type="number" step="1" data-prop="tfcReferenceTime" value="${payload.tfcReferenceTime}" />
    </div>
    <div class="settings-field"><label>Average type</label>
      <select data-prop="averageType">${options(AVERAGE_TYPE_LABELS, payload.averageType)}</select>
    </div>
    <div class="settings-field" ${payload.averageType === AVERAGE_TYPE_FIFO ? '' : 'style="display:none"'}>
      <label>Average count (≈${((payload.average ?? 0) * (payload.averageTickSeconds ?? 0)).toFixed(2)}s)</label>
      <input type="number" step="1" data-prop="average" value="${payload.average}" />
    </div>
    <div class="settings-field" ${payload.averageType === AVERAGE_TYPE_LPF ? '' : 'style="display:none"'}>
      <label>Filter frequency</label>
      <select data-prop="filtersFrequency">${options(FILTERS_FREQUENCY_LABELS, payload.filtersFrequency)}</select>
    </div>
    <div class="settings-field"><label>Input filter</label>
      <select data-prop="inputFilter">${options(INPUT_FILTER_LABELS, payload.inputFilter)}</select>
    </div>
    <div class="settings-actions">
      <button data-action="reset-average">Reset Average</button>
      <button data-action="store">Store</button>
    </div>
    <div id="settings-meter" class="settings-meter"></div>
  `

  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]').forEach((el) => {
    el.addEventListener('change', () => {
      const name = el.dataset.prop!
      const value = el instanceof HTMLSelectElement || (el as HTMLInputElement).type === 'number'
        ? Number(el.value)
        : el.value
      callbacks.onChange(name, value)
    })
  })
  container.querySelector('[data-action="reset-average"]')?.addEventListener('click', callbacks.onResetAverage)
  container.querySelector('[data-action="store"]')?.addEventListener('click', callbacks.onStore)
}

export function renderMeter(payload: MeterPayload) {
  const el = document.querySelector<HTMLDivElement>('#settings-meter')
  if (!el) return
  el.textContent = `Level ${payload.level.toFixed(1)} dB   Ref ${payload.referenceLevel.toFixed(1)} dB   Peak ${payload.measurementPeak.toFixed(1)} dB`
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}
```

## 実装7: `web/src/main.ts`の変更

1. DOM構築の`.pane-right`を以下に変更:
```html
<div class="pane pane-right">
  <h2>Settings</h2>
  <div id="settings-panel"><p class="placeholder">左のリストからソースを選択してください</p></div>
</div>
```
2. `import { renderSettingsPanel, renderMeter, type SettingsPayload, type MeterPayload } from './settingsPanel'`を追加。
3. `const settingsPanelEl = document.querySelector<HTMLDivElement>('#settings-panel')!`を追加。
4. `renderSourceTree`の`onSelect`コールバックを拡張し、Spectrogram切替に加えて設定パネルの選択も行う:
```ts
onSelect: (uuid) => {
  charts.setSpectrogramSource(uuid, canvases.spectrogram)
  settings.selectSource(uuid)
},
```
5. `channelReady.then(({ sourceTree, chartData, settings }) => { ... })`に`settings`を追加し、以下を配線する:
```ts
let currentSettingsUuid: string | null = null

function renderPanel(payload: SettingsPayload) {
  currentSettingsUuid = payload.uuid
  renderSettingsPanel(settingsPanelEl, payload, {
    onChange: (name, value) => settings.setProperty(payload.uuid, name, value),
    onResetAverage: () => settings.resetAverage(payload.uuid),
    onStore: () => settings.store(payload.uuid),
  })
}

settings.settingsChanged.connect((json: string) => {
  try { renderPanel(JSON.parse(json) as SettingsPayload) } catch (e) { console.error('settingsChanged parse error', e) }
})
settings.meterUpdated.connect((json: string) => {
  try { renderMeter(JSON.parse(json) as MeterPayload) } catch (e) { console.error('meterUpdated parse error', e) }
})
```
6. 既存の`chartData.sourceRemoved.connect(...)`の中で、削除されたソースが現在設定パネルに表示中のソースなら選択解除する:
```ts
chartData.sourceRemoved.connect((uuid: string) => {
  charts.removeSource(uuid, canvases)
  if (currentSettingsUuid === uuid) {
    renderPanel({ uuid: null })
  }
})
```

## 実装8: `web/src/style.css`の追加分

```css
.settings-field {
  margin-bottom: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.settings-field label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}
.settings-field input,
.settings-field select {
  background: #111;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
  font-size: 0.85rem;
}
.settings-actions {
  display: flex;
  gap: 0.5rem;
  margin: 0.8rem 0;
}
.settings-actions button {
  background: #222;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.settings-actions button:hover {
  background: #333;
}
.settings-meter {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 0.5rem;
}
```

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. 左ペインでMeasurement行をクリックすると、右ペインに実際の値(Gain/Offset/Delay/Mode/Average type等)が表示されることを確認する。QML側の同じMeasurementのプロパティパネルと数値が一致することを確認する。
5. Gainの数値を変更してEnterまたはフォーカスを外すと、実際の測定に反映され(QML側のGain表示も追従)、直後にサーバーからの応答(`settingsChanged`再送)でJS側の表示も更新されることを確認する。
6. Average typeを`FIFO`に切り替えるとAverage countの入力欄が現れ、`LPF`に切り替えるとFilter frequencyの入力欄が現れることを確認する(相互排他)。Modeを`TFC`に切り替えるとTFC reference timeの入力欄が現れることを確認する。
7. `mode`/`averageType`/`filtersFrequency`/`inputFilter`のenumプロパティが実際に書き込めることを個別に確認する(**前提のセクションで触れた検証ポイント**。もし特定のプロパティで反映されない場合は、そのプロパティ専用の`Q_INVOKABLE`セッターを`SettingsBridge`に追加するフォールバックを行うこと)。
8. Reset Averageボタン・Storeボタンがそれぞれ動作すること(Storeで左ペインのツリーに新しいStoredアイテムが追加されることも確認する)を確認する。
9. Stored/Groupの行を選択すると「◯◯の設定はまだ対応していません」のプレースホルダーが表示され、クラッシュしないことを確認する。
10. Measurementを選択した状態でそのソースをQML側から削除すると、右ペインが「左のリストからソースを選択してください」に戻ることを確認する。
11. `npm run build`(tscの型チェック含む)が通ること。
12. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 8のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。あわせて、既存のPhase 8セクションに書かれている`SettingsBridge`の設計案(`SourceList::selectedChanged`を使う案)を、実際に採用した「左ペインクリックによるJSローカル選択の流用」に更新する。
- [customizations.md](customizations.md)の該当節に、Phase 8で追加した`SettingsBridge`・設定フォームの対象範囲(デバイス/チャンネル選択とキャリブレーションは対象外とした判断)を追記する。
