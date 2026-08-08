# 実装プロンプト: フロントエンドJS化 Phase 10(信号発生器パネル)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 10を実装するための指示書。Phase 9(測定ソースと保存データの表示分離+2ch入力メーター/チャンネル選択UI)は完了・実機確認(CDP経由でのDOM操作検証含む)済み。

## Phase 9完了時点の状態(前提)

- 右ペインは`Transfer Function`(測定ソース一覧、M/R 2chメーター付き)+`Settings`(選択中ソースの設定フォーム、Input device/Measurement channel/Reference channelを含む)の2セクション構成。
- `src/chart/jsfrontendmanager.h/.cpp`は`sourceList`・`sourceTree`(`SourceTreeBridge`)・`chartData`(`DataBridge`)の3オブジェクトを固定登録している。`generator`はまだ登録されていない。
- `src/main.cpp:94`で`auto generator = std::make_shared<Generator>(settings.getGroup("generator"));`が生成され、`main.cpp:136`で`engine.rootContext()->setContextProperty("generatorModel", generator.get())`によりQML側にのみ公開されている。`JsFrontendManager`のコンストラクタ(`main.cpp:147-148`)には現状`Generator`が渡されていない。

## Phase 10のスコープ

`Generator`(`src/generator/generator.h`)は既に`enabled`/`type`/`frequency`/`startFrequency`/`endFrequency`/`gain`/`duration`/`deviceId`/`evenPolarity`のQ_PROPERTYを持つ安定した単一インスタンス(アプリ起動時に1回だけ生成、以後破棄されない)。**新しいブリッジクラスは作らず、この`Generator`インスタンスをそのまま`QWebChannel`へ`"generator"`として直接登録する**(`sourceList`と同じ「安定シングルトンを直接登録する」パターン)。qwebchannel.jsはQ_PROPERTY+NOTIFYシグナルを自動的にJS側の双方向プロパティバインディングに変換するため、C++側のJSON手組みシグナルは不要。

**唯一の例外**: `channels`は`Q_PROPERTY(QSet<int> channels ...)`(`generator.h:54`)で、`QSet<int>`はJSON化できずQWebChannel越しにJSへ正しく渡らない。ただし`Generator`には既に`QList<QVariant> channelsList`相当の相互変換ロジック(`channelsChangedQList(QList<QVariant>)`シグナル、`setChannels(const QList<QVariant>)`オーバーロード、`generator.cpp:49-58`)が用意されているため、これをQ_PROPERTYとして正式に公開するだけでよい。

**今回のスコープ外**: 出力デバイス選択UI(`deviceId`の名前付きドロップダウン)。`audio::DeviceModel`の`rowCount()`/`data()`はQ_INVOKABLEではなくQWebChannel越しにJSから列挙できないため(`channelNames`/`deviceId`/`indexOf`のみQ_INVOKABLE)、名前付きの出力デバイス一覧UIを作るには追加のブリッジ実装が要る。今回は出力チャンネルのルーティングをカンマ区切りの数値入力(簡易版)にとどめる。

## 実装1: `src/generator/generator.h`の変更(`channelsList`プロパティ追加)

```cpp
    Q_PROPERTY(QSet<int> channels READ channels WRITE setChannels NOTIFY channelsChanged)
    Q_PROPERTY(QVariantList channelsList READ channelsList WRITE setChannels NOTIFY channelsChangedQList) // 追加
```

```cpp
    QSet<int> channels() const;
    void setChannels(const QSet<int> &channels);
    void setChannels(const QList<QVariant> channels);
    QVariantList channelsList() const; // 追加
```

## 実装2: `src/generator/generator.cpp`の変更

```cpp
QVariantList Generator::channelsList() const
{
    QVariantList list;
    const auto set = channels();
    list.reserve(set.count());
    for (const auto &channel : set) {
        list.append(channel);
    }
    return list;
}
```

(`channels()`は既存、`setChannels(const QList<QVariant>)`も既存のためそのまま流用する。`channelsChangedQList`シグナルも既に`channelsChanged`と同時に発火しているため追加の配線は不要。)

## 実装3: `src/chart/jsfrontendmanager.h`の変更

```cpp
class QWebChannel;
class QWebEngineView;
class SourceList;
class Generator; // 追加

namespace Chart {

class DataBridge;
class SourceTreeBridge;
class SettingsBridge;

class JsFrontendManager : public QObject
{
    Q_OBJECT
public:
    explicit JsFrontendManager(SourceList *sourceList, Generator *generator, bool useDevServer, QObject *parent = nullptr); // 引数追加
    ~JsFrontendManager() override;

private:
    SourceList *m_sourceList;
    Generator *m_generator; // 追加
    QWebChannel *m_channel;
    QWebEngineView *m_view;
    DataBridge *m_dataBridge;
    SourceTreeBridge *m_sourceTreeBridge;
    SettingsBridge *m_settingsBridge;
};

} // namespace Chart
```

## 実装4: `src/chart/jsfrontendmanager.cpp`の変更

コンストラクタに`Generator *generator`引数を追加し、`registerObject`を1行追加する:

```cpp
JsFrontendManager::JsFrontendManager(SourceList *sourceList, Generator *generator, bool useDevServer, QObject *parent)
    : QObject(parent), m_sourceList(sourceList), m_generator(generator)
{
    m_dataBridge = new DataBridge(m_sourceList, this);
    m_sourceTreeBridge = new SourceTreeBridge(m_sourceList, this);
    m_settingsBridge = new SettingsBridge(m_sourceList, this);

    m_channel = new QWebChannel(this);
    m_channel->registerObject(QStringLiteral("sourceList"), m_sourceList);
    m_channel->registerObject(QStringLiteral("sourceTree"), m_sourceTreeBridge);
    m_channel->registerObject(QStringLiteral("chartData"), m_dataBridge);
    m_channel->registerObject(QStringLiteral("settings"), m_settingsBridge);
    m_channel->registerObject(QStringLiteral("generator"), m_generator); // 追加

    // ...(以降は変更なし)
```

`#include "src/generator/generator.h"`を追加すること。

## 実装5: `src/main.cpp`の変更

`JsFrontendManager`生成箇所(145〜149行目付近)を以下に変更:

```cpp
    std::unique_ptr<Chart::JsFrontendManager> jsFrontendManager;
    if (qEnvironmentVariableIsSet("OSM_JS_FRONTEND")) {
        jsFrontendManager = std::make_unique<Chart::JsFrontendManager>(
            sourceList.get(), generator.get(), qEnvironmentVariableIsSet("OSM_JS_DEV_SERVER"), &app);
    }
```

## 実装6(新規): `web/src/generatorPanel.ts`

qwebchannel.jsの自動プロパティバインディングを使い、手動JSON配信を行わずに直接読み書きする(他のパネルとは異なるパターンであることに注意):

```ts
export function setupGeneratorPanel(container: HTMLElement, generator: any) {
  const typeLabels: string[] = (generator.types as string[]) ?? []

  container.innerHTML = `
    <div class="settings-actions">
      <button data-gen-toggle>Generator: Off</button>
    </div>
    <div class="settings-field"><label>Type</label>
      <select data-gen="type">${typeLabels.map((label, i) => `<option value="${i}">${escapeHtml(label)}</option>`).join('')}</select>
    </div>
    <div class="settings-field"><label>Gain (dB)</label><input type="number" step="0.5" data-gen="gain" /></div>
    <div class="settings-field"><label>Frequency (Hz)</label><input type="number" step="1" data-gen="frequency" /></div>
    <div class="settings-field"><label>Sweep start (Hz)</label><input type="number" step="1" data-gen="startFrequency" /></div>
    <div class="settings-field"><label>Sweep end (Hz)</label><input type="number" step="1" data-gen="endFrequency" /></div>
    <div class="settings-field"><label>Sweep duration (s)</label><input type="number" step="0.1" data-gen="duration" /></div>
    <div class="settings-field">
      <label><input type="checkbox" data-gen="evenPolarity" /> Even channels inverse polarity</label>
    </div>
    <div class="settings-field"><label>Output channels (comma separated, 1-based)</label>
      <input type="text" data-gen-channels placeholder="e.g. 1,2" />
    </div>
  `

  const typeEl = container.querySelector<HTMLSelectElement>('[data-gen="type"]')!
  const gainEl = container.querySelector<HTMLInputElement>('[data-gen="gain"]')!
  const freqEl = container.querySelector<HTMLInputElement>('[data-gen="frequency"]')!
  const startFreqEl = container.querySelector<HTMLInputElement>('[data-gen="startFrequency"]')!
  const endFreqEl = container.querySelector<HTMLInputElement>('[data-gen="endFrequency"]')!
  const durationEl = container.querySelector<HTMLInputElement>('[data-gen="duration"]')!
  const evenPolarityEl = container.querySelector<HTMLInputElement>('[data-gen="evenPolarity"]')!
  const channelsEl = container.querySelector<HTMLInputElement>('[data-gen-channels]')!
  const toggleEl = container.querySelector<HTMLButtonElement>('[data-gen-toggle]')!

  function syncFromGenerator() {
    typeEl.value = String(generator.type)
    gainEl.value = String(generator.gain)
    freqEl.value = String(generator.frequency)
    startFreqEl.value = String(generator.startFrequency)
    endFreqEl.value = String(generator.endFrequency)
    durationEl.value = String(generator.duration)
    evenPolarityEl.checked = Boolean(generator.evenPolarity)
    toggleEl.textContent = generator.enabled ? 'Generator: On' : 'Generator: Off'
    toggleEl.classList.toggle('generator-on', Boolean(generator.enabled))
  }

  function syncChannelsFromGenerator() {
    const list: number[] = (generator.channelsList as number[]) ?? []
    channelsEl.value = list.map((n) => n + 1).join(',') // 表示は1始まり
  }

  syncFromGenerator()
  syncChannelsFromGenerator()

  generator.enabledChanged.connect(syncFromGenerator)
  generator.typeChanged.connect(syncFromGenerator)
  generator.gainChanged.connect(syncFromGenerator)
  generator.frequencyChanged.connect(syncFromGenerator)
  generator.startFrequencyChanged.connect(syncFromGenerator)
  generator.endFrequencyChanged.connect(syncFromGenerator)
  generator.durationChanged.connect(syncFromGenerator)
  generator.evenPolarityChanged.connect(syncFromGenerator)
  generator.channelsChangedQList.connect(syncChannelsFromGenerator)

  toggleEl.addEventListener('click', () => { generator.enabled = !generator.enabled })
  typeEl.addEventListener('change', () => { generator.type = Number(typeEl.value) })
  gainEl.addEventListener('change', () => { generator.gain = Number(gainEl.value) })
  freqEl.addEventListener('change', () => { generator.frequency = Number(freqEl.value) })
  startFreqEl.addEventListener('change', () => { generator.startFrequency = Number(startFreqEl.value) })
  endFreqEl.addEventListener('change', () => { generator.endFrequency = Number(endFreqEl.value) })
  durationEl.addEventListener('change', () => { generator.duration = Number(durationEl.value) })
  evenPolarityEl.addEventListener('change', () => { generator.evenPolarity = evenPolarityEl.checked })
  channelsEl.addEventListener('change', () => {
    const parsed = channelsEl.value
      .split(',')
      .map((token) => Number(token.trim()) - 1) // 内部は0始まり
      .filter((n) => Number.isInteger(n) && n >= 0)
    generator.channelsList = parsed
  })
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

## 実装7: `web/src/webchannel.ts`の変更

```ts
export interface ChannelObjects {
  sourceList: any
  sourceTree: any
  chartData: any
  settings: any
  generator: any // 追加
}
```

分割代入・nullチェック・`resolveObjects`にも`generator`を追加する。

## 実装8: `web/src/main.ts`の変更

1. DOM構築の`.pane-right`に`Generator`セクションを追加(`Settings`の下、一番下に配置):
```html
<div class="pane pane-right">
  <h2>Transfer Function</h2>
  <div id="measurement-list"></div>
  <h2>Settings</h2>
  <div id="settings-panel"><p class="placeholder">左のリストからソースを選択してください</p></div>
  <h2>Generator</h2>
  <div id="generator-panel"></div>
</div>
```
2. `import { setupGeneratorPanel } from './generatorPanel'`を追加。
3. `const generatorPanelEl = document.querySelector<HTMLDivElement>('#generator-panel')!`を追加。
4. `channelReady.then(({ sourceTree, chartData, settings, generator }) => { ... })`に`generator`を追加し、末尾で`setupGeneratorPanel(generatorPanelEl, generator)`を1回呼ぶ(`setupGeneratorPanel`内部でqwebchannel.jsのシグナルに直接connectするため、再呼び出しは不要)。

## 実装9: `web/src/style.css`の追加分

```css
.generator-on {
  background: #2e7d32;
  border-color: #2e7d32;
}
```

(`.settings-actions button`の既存スタイルをベースに、ON状態だけ緑色にする)

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. 右ペイン下部に`Generator`セクションが表示され、QML側のGenerator設定(Pink Noise、Gain等)の実際の値が反映されていることを確認する。
5. 「Generator: Off」ボタンをクリックすると実際に音が出て「Generator: On」(緑色)に変わり、QML側のトグルも連動して変化することを確認する(逆方向、QML側でONにした場合もJS側の表示が追従することを確認する)。
6. Gain/Frequencyを変更すると、実際の出力に反映され、QML側の表示も追従することを確認する。
7. Output channelsに`1,2`のように入力すると、QML側の出力チャンネル選択と一致することを確認する。
8. `npm run build`(tscの型チェック含む)が通ること。
9. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 10のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。
- [customizations.md](customizations.md)の該当節に、`Generator`を直接registerObjectする方式を採用したこと、出力デバイス選択UIを今回スコープ外とした理由(`DeviceModel`のrowCount/dataがQ_INVOKABLEでない)を追記する。
