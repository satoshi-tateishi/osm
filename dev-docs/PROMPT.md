# 実装プロンプト: フロントエンドJS化 Phase 9(測定ソースと保存データの表示分離)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 9を実装するための指示書。Phase 8(設定パネル: 選択ソース連動、読み取り+書き込み)は完了・実機確認(CDP経由でのDOM操作検証含む)済み。

## この修正の背景

ユーザーからのフィードバック: 「現在左側のエクスプローラー部にSTOREされたデータと測定ソースが一緒に表示されている。Smaartでは測定ソースおよびそのレベルメーターは右側の測定ソースカラムに表示される。ストアしたデータと測定ソースが混在して左側に表示されると混乱しやすい」。

Smaart v9(リファレンス画像)の実際のUIは、左に過去セッションの保存データツリー(Session Data)、右に現在稼働中の測定ソース一覧(Transfer Function、レベルメーター付き)を常時表示する構成になっている。これに合わせ、表示エリアを完全に分離する。

## 現状(Phase 8完了時点)

- `SourceTreeBridge`(`src/chart/sourcetreebridge.h/.cpp`)は、トップレベルの`SourceList`の全アイテム(Measurement/Stored/Group問わず)を1つのフラットなJSON配列として`treeChanged`で配信している。
- `web/src/sourceTree.ts`の`renderSourceTree()`が、その配列を無条件に1つのリストとして左ペインに描画している(アクティブ切替チェックボックス+行クリックでの選択、選択はSpectrogram切替と`SettingsBridge::selectSource`の両方を駆動)。
- 右ペインは`web/src/settingsPanel.ts`による設定フォーム(選択中の1ソース分のみ)だけで、常時表示のソース一覧は存在しない。
- `SettingsBridge`は選択中ソースの`readyRead`を購読し、`meterUpdated`でレベルメーター(level/referenceLevel/measurementPeak/referencePeak)を配信している(**選択中の1ソース分のみ**)。

## Phase 9のスコープ

1. `SourceTreeBridge`自体は変更しない。JS側で`type === "Measurement"`かどうかによって表示先を振り分ける。
2. **左ペイン**(`Session Data`に改称): Stored/Groupのみを表示する読み取り専用寄りのリストにする(アクティブ切替チェックボックスは残すが、行クリックでの選択機能は削除する)。
3. **右ペイン**: 新規に`Transfer Function`セクションを追加し、アクティブなMeasurement全件をレベルメーター付きで常時一覧表示する。行をクリックすると、既存の`Settings`セクション(Phase 8で実装済み)にその設定フォームが表示される(Spectrogramの選択もここから駆動する)。
4. `DataBridge`に`levelUpdated`シグナルを追加し、全トップレベルMeasurementのレベルメーターを常時配信する(現状`SettingsBridge`が選択中の1ソース分だけ配信している`meterUpdated`は削除し、`DataBridge::levelUpdated`をuuidでフィルタする方式に一本化する。二重の`readyRead`購読を避けるため)。

**明示的にスコープ外(今回は扱わない)**: Storedの「active」チェックボックスをONにしたときにチャートへ重ね描画する機能(recall表示)。`DataBridge`はMeasurementのみをサンプリング対象としており、Stored側のデータをチャートに流す仕組みは別途必要になるため、今回は表示エリアの分離のみを行う。

## 実装1: `src/chart/databridge.h`の変更

```cpp
signals:
    void magnitudeUpdated(const QString &json);
    void phaseUpdated(const QString &json);
    void coherenceUpdated(const QString &json);
    void rtaUpdated(const QString &json);
    void spectrogramRowUpdated(const QString &json);
    void levelUpdated(const QString &json); // 追加
    void sourceRemoved(const QString &uuid);
```

## 実装2: `src/chart/databridge.cpp`の変更(`onReadyRead`の末尾に追加)

```cpp
#include <cmath>
#include <QJsonDocument>
#include <QJsonObject>
// ...(既存include群に追加)

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

    // ...(既存のmagnitude/phase/coherence/rta/spectrogram emit、変更なし)...

    if (auto *measurement = dynamic_cast<Measurement *>(source)) {
        auto finiteOrNull = [](float v) {
            return std::isfinite(v) ? QJsonValue(v) : QJsonValue();
        };
        QJsonObject levelPayload;
        levelPayload["uuid"] = source->uuid().toString();
        levelPayload["level"] = finiteOrNull(measurement->level());
        levelPayload["referenceLevel"] = finiteOrNull(measurement->referenceLevel());
        levelPayload["measurementPeak"] = finiteOrNull(measurement->measurementPeak());
        levelPayload["referencePeak"] = finiteOrNull(measurement->referencePeak());
        emit levelUpdated(QString::fromUtf8(QJsonDocument(levelPayload).toJson(QJsonDocument::Compact)));
    }
}
```

`#include "src/source/measurement.h"`は既に`databridge.cpp`にある想定(Phase 7で追加済み)。無ければ追加すること。

## 実装3: `src/chart/settingsbridge.h`の変更(メーター関連を削除)

```cpp
class SettingsBridge : public QObject
{
    Q_OBJECT
public:
    explicit SettingsBridge(SourceList *sourceList, QObject *parent = nullptr);

    Q_INVOKABLE void selectSource(const QString &uuid);
    Q_INVOKABLE void setProperty(const QString &uuid, const QString &name, const QVariant &value);
    Q_INVOKABLE void setMode(const QString &uuid, int value);
    Q_INVOKABLE void setAverageType(const QString &uuid, int value);
    Q_INVOKABLE void setFiltersFrequency(const QString &uuid, int value);
    Q_INVOKABLE void setInputFilter(const QString &uuid, int value);
    Q_INVOKABLE void resetAverage(const QString &uuid);
    Q_INVOKABLE void store(const QString &uuid);
    Q_INVOKABLE void applyAutoGain(const QString &uuid, float reference);

signals:
    void settingsChanged(const QString &json);
    // meterUpdatedは削除(DataBridge::levelUpdatedに一本化)

private slots:
    void onSourceRemoved(QUuid uuid);
    // onReadyReadは削除

private:
    void emitSettings();

    SourceList *m_sourceList;
    QUuid m_selectedUuid;
    Shared::Source m_selectedSource;
};
```

## 実装4: `src/chart/settingsbridge.cpp`の変更

`selectSource`から`readyRead`のconnect/disconnectを削除:
```cpp
void SettingsBridge::selectSource(const QString &uuidString)
{
    m_selectedUuid = QUuid(uuidString);
    m_selectedSource = m_sourceList->getByUUid(m_selectedUuid);
    emitSettings();
}
```

`onSourceRemoved`から同様に`readyRead`のdisconnectを削除:
```cpp
void SettingsBridge::onSourceRemoved(QUuid uuid)
{
    if (uuid != m_selectedUuid) {
        return;
    }
    m_selectedUuid = QUuid();
    m_selectedSource.reset();
    emitSettings();
}
```

`onReadyRead`関数本体は丸ごと削除する。

## 実装5: `web/src/webchannel.ts`の変更

`ChannelObjects`はそのまま(`settings`はPhase 8のまま維持、`chartData`が既に`levelUpdated`を含むようになるだけで型定義側の変更は不要)。

## 実装6(新規): `web/src/measurementList.ts`

```ts
export interface MeasurementItem {
  uuid: string
  name: string
  color: string
  active: boolean
}

export interface MeasurementCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onSelect: (uuid: string) => void
}

const METER_MIN_DB = -60
const METER_MAX_DB = 0

let selectedUuid: string | null = null

export function renderMeasurementList(container: HTMLElement, items: MeasurementItem[], callbacks: MeasurementCallbacks) {
  container.innerHTML = items.length
    ? items.map((item) => `
      <div class="measurement-row${item.uuid === selectedUuid ? ' selected' : ''}" data-uuid="${item.uuid}">
        <input type="checkbox" class="measurement-active" ${item.active ? 'checked' : ''} />
        <span class="tree-swatch" style="background:${item.color}"></span>
        <span class="measurement-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
        <div class="meter-bar"><div class="meter-fill" data-meter-fill></div></div>
        <span class="meter-text" data-meter-text>—</span>
      </div>
    `).join('')
    : '<p class="placeholder">測定ソースがありません</p>'

  container.querySelectorAll<HTMLInputElement>('.measurement-active').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation())
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.measurement-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })
  container.querySelectorAll<HTMLElement>('.measurement-row').forEach((row) => {
    row.addEventListener('click', () => {
      const uuid = row.dataset.uuid!
      container.querySelectorAll('.measurement-row.selected').forEach((element) => element.classList.remove('selected'))
      row.classList.add('selected')
      selectedUuid = uuid
      callbacks.onSelect(uuid)
    })
  })
}

export function updateMeasurementMeter(container: HTMLElement, uuid: string, level: number | null, peak: number | null) {
  const row = container.querySelector<HTMLElement>(`.measurement-row[data-uuid="${uuid}"]`)
  if (!row) return
  const fill = row.querySelector<HTMLElement>('[data-meter-fill]')
  const text = row.querySelector<HTMLElement>('[data-meter-text]')
  if (typeof level === 'number' && Number.isFinite(level)) {
    const ratio = Math.min(1, Math.max(0, (level - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)))
    if (fill) {
      fill.style.width = `${ratio * 100}%`
      fill.classList.toggle('meter-clip', typeof peak === 'number' && peak > -3)
    }
    if (text) text.textContent = `${level.toFixed(1)} dB`
  } else {
    if (fill) fill.style.width = '0%'
    if (text) text.textContent = '—'
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

## 実装7: `web/src/sourceTree.ts`の変更(選択機能を削除、activeチェックボックスのみ残す)

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
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

export function renderSourceTree(container: HTMLElement, items: TreeItem[], callbacks: TreeCallbacks) {
  container.innerHTML = items.length
    ? items.map((item) => `
      <div class="tree-row" data-uuid="${item.uuid}">
        <input type="checkbox" class="tree-active" ${item.active ? 'checked' : ''} />
        <span class="tree-swatch" style="background:${item.color}"></span>
        <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
        <span class="tree-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
      </div>
    `).join('')
    : '<p class="placeholder">保存データがありません</p>'

  container.querySelectorAll<HTMLInputElement>('.tree-active').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.tree-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

(行クリック・`selected`・`selectedUuid`まわりのコードを丸ごと削除する)

## 実装8: `web/src/settingsPanel.ts`の変更

`MeterPayload`の`uuid`フィールドを追加(`DataBridge::levelUpdated`由来のpayloadをそのまま渡せるように):

```ts
export interface MeterPayload {
  uuid: string
  level: number | null
  referenceLevel: number | null
  measurementPeak: number | null
  referencePeak: number | null
}
```

`renderMeter`の実装はそのまま(`formatMeterValue`含め変更不要)。

## 実装9: `web/src/main.ts`の変更

1. DOM構築を変更(左ペインの見出しを`Session Data`に、右ペインに`Transfer Function`セクションを追加):
```html
<div class="pane pane-left">
  <h2>Session Data</h2>
  <p id="status">QWebChannel接続待ち...</p>
  <div id="source-tree"></div>
</div>
<div class="pane pane-center">
  ...(変更なし)...
</div>
<div class="pane pane-right">
  <h2>Transfer Function</h2>
  <div id="measurement-list"></div>
  <h2>Settings</h2>
  <div id="settings-panel"><p class="placeholder">左のリストからソースを選択してください</p></div>
</div>
```
2. `import { renderMeasurementList, updateMeasurementMeter, type MeasurementItem } from './measurementList'`を追加。
3. `const measurementListEl = document.querySelector<HTMLDivElement>('#measurement-list')!`を追加。
4. `sourceTree.treeChanged`のハンドラを変更(`type`で振り分け、`onSelect`はMeasurement一覧側に移す):
```ts
sourceTree.treeChanged.connect((json: string) => {
  let items: TreeItem[]
  try {
    items = JSON.parse(json) as TreeItem[]
  } catch (error) {
    console.error('treeChanged parse error', error)
    return
  }

  const measurementItems: MeasurementItem[] = items.filter((item) => item.type === 'Measurement')
  const sessionItems = items.filter((item) => item.type !== 'Measurement')

  renderSourceTree(sourceTreeEl, sessionItems, {
    onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
  })
  renderMeasurementList(measurementListEl, measurementItems, {
    onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
    onSelect: (uuid) => {
      charts.setSpectrogramSource(uuid, canvases.spectrogram)
      settings.selectSource(uuid)
    },
  })
  charts.setActiveUuids(new Set(items.filter((item) => item.active).map((item) => item.uuid)), canvases)
})
```
5. `settings.meterUpdated.connect(...)`の購読を削除する。
6. `chartData.levelUpdated`の購読を新規追加し、一覧側のメーターと、選択中ソースと一致する場合は設定フォーム側のメーターの両方を更新する:
```ts
chartData.levelUpdated.connect((json: string) => {
  let payload: MeterPayload
  try {
    payload = JSON.parse(json) as MeterPayload
  } catch (error) {
    console.error('levelUpdated parse error', error)
    return
  }
  updateMeasurementMeter(measurementListEl, payload.uuid, payload.level, payload.measurementPeak)
  if (payload.uuid === currentSettingsUuid) {
    renderMeter(payload)
  }
})
```
(`MeterPayload`のインポートを`settingsPanel`から追加すること)

## 実装10: `web/src/style.css`の追加分

```css
.measurement-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.2rem;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.measurement-row:hover {
  background: rgba(255, 255, 255, 0.08);
}
.measurement-row.selected {
  background: rgba(33, 150, 243, 0.25);
}
.measurement-active {
  flex: 0 0 auto;
  margin: 0;
}
.measurement-name {
  flex: 0 0 auto;
  min-width: 5.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meter-bar {
  flex: 1 1 auto;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
}
.meter-fill {
  height: 100%;
  width: 0%;
  background: #4caf50;
  transition: width 0.08s linear;
}
.meter-fill.meter-clip {
  background: #f44336;
}
.meter-text {
  flex: 0 0 auto;
  width: 3.5rem;
  text-align: right;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}
```

`.tree-row`から`cursor: pointer`を削除する(左ペインはもう行クリックで選択しないため)。既存の`.tree-row.selected`ルールは未使用になるため削除してよい。

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. 左ペイン(`Session Data`)にMeasurementが一切表示されず、Stored/Groupのみが並ぶことを確認する。
5. 右ペイン(`Transfer Function`)にアクティブなMeasurementが一覧表示され、無音でない入力に対してレベルメーター(バー+dB数値)が継続的に動くことを確認する。複数のMeasurementがあれば、それぞれ独立したメーターが動くことを確認する。
6. `Transfer Function`一覧のアクティブチェックボックスをOFFにすると、対応するチャート上の線が消え(Phase 7の挙動と同じ)、メーターも更新が止まる(直前の値のまま、または0%表示になる)ことを確認する。
7. `Transfer Function`一覧の行をクリックすると、その下の`Settings`セクションに設定フォームが表示され、Phase 8の読み書き機能(Gain変更、Reset Average、Store等)がそのまま動作することを確認する。Spectrogramの表示対象もクリックしたソースに切り替わることを確認する。
8. 左ペインの`Session Data`側では行クリックが何も起こさず(選択機能なし)、アクティブチェックボックスだけが機能することを確認する(Stored行のチェックボックス操作自体はできるが、チャートへの反映は今回スコープ外)。
9. `npm run build`(tscの型チェック含む)が通ること。
10. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 9のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。
- [customizations.md](customizations.md)の該当節に、Phase 9で行った表示分離の内容(左=Session Data/右=Transfer Function)、`DataBridge::levelUpdated`への一本化、Stored recallを今回スコープ外とした判断を追記する。
