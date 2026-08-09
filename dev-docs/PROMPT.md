# 修正プロンプト: Generatorパネルの出力ポート選択(チェックボックス)を追加、レイアウトを差し替え

前回の修正で出力インターフェース(デバイス)は選択できるようになったが、**そのインターフェースのどの出力ポートを使うか**を選択できないというフィードバックがあった。

## 対応方針(ユーザー指示)

- 左上の「Pink Noise」固定表示を**廃止**する。
- その場所(左上)に、出力インターフェース選択(前回実装したデバイス選択)を移動する。
- 空いた左下のスペースに、**選択したインターフェースの出力ポートをチェックボックスで複数選択できるセレクター**を配置する(`Generator::channelsList`、既存プロパティ)。

新しいレイアウト(2行×3列):

```
[Interface select ▾]         [-15 dB]  [On]  (赤=ON時)
[Output ports (checkboxes)]  [ - ]     [ + ]
```

Pink Noise固定のロジック自体(`generator.type`を内部的にPinkへ強制する処理)は**そのまま維持**する(表示だけ廃止し、動作は変えない)。

## 前提(前回実装済みのはずのもの)

- `src/audio/devicemodel.h/.cpp`に`Q_INVOKABLE QVariantList list() const`が追加済み(`{id, name}`配列を返す)。
- `src/chart/jsfrontendmanager.cpp`で出力専用`audio::DeviceModel`(scope: OutputOnly)を生成し`"outputDevices"`として`registerObject`済み。
- `web/src/webchannel.ts`の`ChannelObjects`に`outputDevices: any`が追加済み。

これらが未実装の場合は先に前回のプロンプト内容(devicemodel.h/.cppへの`list()`追加、jsfrontendmanager.cppでの`outputDevices`登録、webchannel.tsへの追加)を適用してから、以下の`generatorPanel.ts`の変更に進むこと。

## 実装: `web/src/generatorPanel.ts`を全面置き換え

出力ポート選択には`<details>`/`<summary>`要素を使った軽量なチェックボックス・ドロップダウンを実装する(独自のポップオーバー位置計算コードを書かずに済むため)。`DeviceModel::channelNames(index)`(scope: OutputOnly、既存のQ_INVOKABLE)で選択中インターフェースのポート名一覧を取得する。

```ts
export function setupGeneratorPanel(container: HTMLElement, generator: any, outputDevices: any) {
  const typeLabels: string[] = (generator.types as string[]) ?? []
  const pinkIndex = typeLabels.indexOf('Pink')
  if (pinkIndex >= 0 && generator.type !== pinkIndex) {
    generator.type = pinkIndex
  }

  container.innerHTML = `
    <div class="generator-grid">
      <select class="generator-device" data-gen-device></select>
      <div class="generator-level" data-gen-level>0 dB</div>
      <button class="generator-toggle" data-gen-toggle>On</button>

      <details class="generator-channels">
        <summary data-gen-channels-summary>Ch: —</summary>
        <div class="generator-channels-list" data-gen-channels-list></div>
      </details>
      <button class="generator-step" data-gen-dec>&minus;</button>
      <button class="generator-step" data-gen-inc>+</button>
    </div>
  `

  const deviceEl = container.querySelector<HTMLSelectElement>('[data-gen-device]')!
  const levelEl = container.querySelector<HTMLDivElement>('[data-gen-level]')!
  const toggleEl = container.querySelector<HTMLButtonElement>('[data-gen-toggle]')!
  const channelsSummaryEl = container.querySelector<HTMLElement>('[data-gen-channels-summary]')!
  const channelsListEl = container.querySelector<HTMLDivElement>('[data-gen-channels-list]')!
  const decEl = container.querySelector<HTMLButtonElement>('[data-gen-dec]')!
  const incEl = container.querySelector<HTMLButtonElement>('[data-gen-inc]')!

  function syncFromGenerator() {
    levelEl.textContent = `${Math.round(generator.gain)} dB`
    toggleEl.classList.toggle('generator-on', Boolean(generator.enabled))
  }
  syncFromGenerator()
  generator.enabledChanged.connect(syncFromGenerator)
  generator.gainChanged.connect(syncFromGenerator)

  toggleEl.addEventListener('click', () => { generator.enabled = !generator.enabled })
  decEl.addEventListener('click', () => { generator.gain = Math.round(generator.gain) - 1 })
  incEl.addEventListener('click', () => { generator.gain = Math.round(generator.gain) + 1 })

  function updateChannelsSummary(names: string[], selected: Set<number>) {
    if (selected.size === 0) {
      channelsSummaryEl.textContent = 'Ch: —'
      return
    }
    const labels = [...selected].sort((a, b) => a - b).map((i) => names[i] ?? String(i + 1))
    channelsSummaryEl.textContent = `Ch: ${labels.join(', ')}`
  }

  function populateChannelList() {
    outputDevices.indexOf(generator.deviceId, (deviceIndex: number) => {
      outputDevices.channelNames(deviceIndex, (names: string[]) => {
        const selected = new Set<number>((generator.channelsList as number[]) ?? [])
        channelsListEl.innerHTML = names.map((name, i) => `
          <label><input type="checkbox" data-channel="${i}" ${selected.has(i) ? 'checked' : ''} /> ${escapeHtml(name)}</label>
        `).join('')
        channelsListEl.querySelectorAll<HTMLInputElement>('input[data-channel]').forEach((checkbox) => {
          checkbox.addEventListener('change', () => {
            const current = new Set<number>((generator.channelsList as number[]) ?? [])
            const index = Number(checkbox.dataset.channel)
            if (checkbox.checked) {
              current.add(index)
            } else {
              current.delete(index)
            }
            generator.channelsList = [...current]
          })
        })
        updateChannelsSummary(names, selected)
      })
    })
  }

  function populateDeviceList() {
    outputDevices.list((devices: { id: string; name: string }[]) => {
      deviceEl.innerHTML = devices.map((device) =>
        `<option value="${escapeAttr(device.id)}" ${device.id === generator.deviceId ? 'selected' : ''}>${escapeHtml(device.name)}</option>`
      ).join('')
      populateChannelList()
    })
  }

  populateDeviceList()
  outputDevices.modelReset.connect(populateDeviceList)
  generator.deviceIdChanged.connect(() => {
    deviceEl.value = generator.deviceId
    populateChannelList()
  })
  generator.channelsChangedQList.connect(populateChannelList)
  deviceEl.addEventListener('change', () => {
    generator.deviceId = deviceEl.value
  })
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

**注意**: `outputDevices.indexOf(...)`・`outputDevices.channelNames(...)`・`outputDevices.list(...)`はいずれもQ_INVOKABLEメソッドの呼び出しでqwebchannel.js越しに**非同期**(コールバック引数)になる。`await`できない点に注意し、コールバックのネストで処理すること(上記コード通り)。

## 実装: `web/src/style.css`の変更

前回追加した`.generator-type-fixed`関連ルールを、`<details>`ベースのチェックボックスセレクター用のスタイルに置き換える:

```css
.generator-grid {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.4rem;
  align-items: start;
}
.generator-device {
  background: #222;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
}
.generator-level {
  background: #222;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  text-align: center;
  min-width: 4rem;
}
.generator-toggle,
.generator-step {
  background: #333;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
  min-width: 3rem;
}
.generator-toggle.generator-on {
  background: #e53935;
  border-color: #e53935;
}
.generator-toggle:hover,
.generator-step:hover {
  filter: brightness(1.2);
}

.generator-channels {
  position: relative;
}
.generator-channels summary {
  list-style: none;
  cursor: pointer;
  background: #222;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.generator-channels summary::-webkit-details-marker {
  display: none;
}
.generator-channels-list {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.3rem;
  margin-top: 0.2rem;
  min-width: 8rem;
  max-height: 10rem;
  overflow-y: auto;
}
.generator-channels-list label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.3rem;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}
```

(前回の`.generator-type-fixed`ルールは削除する。)

## 検証方法

1. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
2. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
3. Generatorセクション左上にインターフェース選択、右に「−15 dB」「On」が並び、左下に出力ポート選択(クリックで展開するチェックボックスリスト)、その右に「−」「+」が並ぶことを確認する。
4. インターフェースを切り替えると、出力ポートのチェックボックス一覧がそのインターフェースの実際のポート名に更新されることを確認する。
5. 出力ポートのチェックボックスを1つ以上チェックすると、サマリー表示(`Ch: ...`)が選択したポート名で更新され、QML側のGenerator設定の出力チャンネル選択にも同じ内容が反映されることを確認する。
6. 「On」をクリックすると実際にチェックした出力ポートから音が出ることを確認する。
7. 「−」「+」でレベルが1dB刻みで変化することを確認する。
8. QML版のGeneratorProperties.qmlでSignal Typeが常に"Pink"のままであることを確認する(JS側にはもう表示がないが、内部的に固定され続けていることの確認)。
9. `npm run build`(tscの型チェック含む)が通ること。
10. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 10完了メモに、出力ポート選択(チェックボックス)UIを追加した経緯と最終レイアウトを追記する。
- [customizations.md](customizations.md)の該当節を、最終的なフィールド構成(インターフェース選択・出力ポートチェックボックス選択・レベル・On/Off、Pink Noiseは非表示の内部固定のみ)に合わせて更新する。
