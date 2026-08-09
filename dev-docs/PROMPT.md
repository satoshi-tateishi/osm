# 実装プロンプト: フロントエンドJS化 Phase 12(左ペインの操作: 追加/Store/移動/削除)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 12を実装するための指示書。Phase 11(グループのツリー再帰対応、Stored専用)は完了・実機確認(CDP経由での実際のGroup作成・Stored移動・インデント表示確認含む)済み。

## Phase 11完了時点の状態(前提)

- 左ペイン「Session Data」は読み取り専用(アクティブ切替チェックボックスのみ)。Group作成・アイテムの移動・削除は現状QML側からしかできない。
- 右ペイン「Transfer Function」も一覧表示のみで、新規Measurementの追加ボタンは無い。
- `SourceList`は`sourceList`という固定チャンネルオブジェクトとしてQWebChannelに直接登録済み(Phase 6)。以下のQ_INVOKABLEがJSから直接呼べる: `addGroup()`、`addMeasurement()`、`moveItem(QUuid itemId, QUuid targetGroupId)`、`removeItem(QUuid uuid, bool deleteItem = true)`(`src/sourcelist.h:86,138,143,149`)。
- `moveItem`の`targetGroupId`は**空文字列を渡すとnull QUuidとして解釈され「トップレベルへ移動」を意味する**(`sourcelist.cpp:295-303`の`targetGroupId.isNull()`分岐)。
- `SourceTreeBridge::storeItem(QString uuid)`は既にPhase 6で実装済み(`Shared::Source`引数の`SourceList::storeItem`をuuid経由で呼ぶラッパー)。**Measurementのスナップショット保存は既にPhase 8のSettingsパネルの「Store」ボタンで実現済みのため、本Phaseでは重複実装しない**。
- Phase 11でユーザーから明示された方針により、**グループ化はStored/Session Data側のみ**(測定ソースは4〜8個程度で増えないためグループ化不要、`SourceList::isGroupableData()`が既にMeasurementのグループ化を禁止している)。したがって本Phaseの「移動」機能は左ペインのみに実装し、右ペイン(Transfer Function)には移動機能を追加しない。

## Phase 12のスコープ

1. 左ペイン「Session Data」: 上部に「+ Group」ボタンを追加。各行に「移動」(クリックでグループ一覧が現れ、選択すると即座に`moveItem`)と「削除」ボタンを追加。
2. 右ペイン「Transfer Function」: 上部に「+ Measurement」ボタンを追加(新規ライブ測定ソースの追加)。
3. ドラッグ&ドロップは今回のスコープ外(ボタン操作のみ)。

## 実装1: `web/src/sourceTree.ts`を全面置き換え

Phase 10の出力ポート選択(`<details>`/`<summary>`)と同じ軽量ドロップダウンパターンを、行ごとの「移動先」メニューに流用する。グループ一覧は`items`配列(既にPhase 11で`depth`付き・再帰済み)から`type === "Group"`で抽出するだけでよく、追加の非同期呼び出しは不要。

```ts
export interface TreeItem {
  uuid: string
  type: string
  name: string
  color: string
  active: boolean
  depth: number
  parentUuid: string | null
}

export interface TreeCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onMove: (uuid: string, targetGroupUuid: string) => void // 空文字列 = トップレベルへ移動
  onDelete: (uuid: string) => void
  onAddGroup: () => void
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

export function renderSourceTree(container: HTMLElement, items: TreeItem[], callbacks: TreeCallbacks) {
  const groups = items.filter((item) => item.type === 'Group')

  const rowsHtml = items.length
    ? items.map((item) => `
      <div class="tree-row" data-uuid="${item.uuid}" style="padding-left: ${(item.depth * 1).toFixed(1)}rem">
        <input type="checkbox" class="tree-active" ${item.active ? 'checked' : ''} />
        <span class="tree-swatch" style="background:${item.color}"></span>
        <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
        <span class="tree-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
        <details class="tree-move">
          <summary title="Move to...">&#8677;</summary>
          <div class="tree-move-list">
            <button type="button" data-target-group="">Top level</button>
            ${groups.filter((group) => group.uuid !== item.uuid).map((group) =>
              `<button type="button" data-target-group="${group.uuid}">${escapeHtml(group.name)}</button>`
            ).join('')}
          </div>
        </details>
        <button type="button" class="tree-delete" title="Delete" data-delete>&times;</button>
      </div>
    `).join('')
    : '<p class="placeholder">保存データがありません</p>'

  container.innerHTML = `
    <div class="tree-toolbar">
      <button type="button" data-add-group>+ Group</button>
    </div>
    ${rowsHtml}
  `

  container.querySelector('[data-add-group]')?.addEventListener('click', () => callbacks.onAddGroup())

  container.querySelectorAll<HTMLInputElement>('.tree-active').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.tree-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })

  container.querySelectorAll<HTMLElement>('.tree-row').forEach((row) => {
    const uuid = row.dataset.uuid!
    row.querySelectorAll<HTMLButtonElement>('[data-target-group]').forEach((button) => {
      button.addEventListener('click', () => {
        callbacks.onMove(uuid, button.dataset.targetGroup ?? '')
        row.querySelector('details')?.removeAttribute('open')
      })
    })
    row.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (confirm('このアイテムを削除しますか?')) {
        callbacks.onDelete(uuid)
      }
    })
  })
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

## 実装2: `web/src/measurementList.ts`の変更(「+ Measurement」ボタン追加)

```ts
export interface MeasurementCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onSelect: (uuid: string) => void
  onAddMeasurement: () => void // 追加
}
```

`renderMeasurementList`のテンプレートの先頭にツールバーを追加:

```ts
export function renderMeasurementList(container: HTMLElement, items: MeasurementItem[], callbacks: MeasurementCallbacks) {
  const rowsHtml = items.length
    ? items.map((item) => ` ... (既存のまま) `).join('')
    : '<p class="placeholder">測定ソースがありません</p>'

  container.innerHTML = `
    <div class="tree-toolbar">
      <button type="button" data-add-measurement>+ Measurement</button>
    </div>
    ${rowsHtml}
  `

  container.querySelector('[data-add-measurement]')?.addEventListener('click', () => callbacks.onAddMeasurement())

  // ...(以降、既存のcheckbox/rowイベント配線はそのまま)
}
```

## 実装3: `web/src/main.ts`の変更

1. `channelReady.then(({ sourceTree, chartData, settings, generator, outputDevices, sourceList }) => { ... })`のように`sourceList`を分割代入に追加する。
2. `renderSourceTree`の呼び出しに`onMove`/`onDelete`/`onAddGroup`コールバックを追加:
```ts
renderSourceTree(sourceTreeEl, sessionItems, {
  onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
  onMove: (uuid, targetGroupUuid) => sourceList.moveItem(uuid, targetGroupUuid),
  onDelete: (uuid) => sourceList.removeItem(uuid, true),
  onAddGroup: () => sourceList.addGroup(),
})
```
3. `renderMeasurementList`の呼び出しに`onAddMeasurement`コールバックを追加:
```ts
renderMeasurementList(measurementListEl, measurementItems, {
  onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
  onSelect: (uuid) => {
    charts.setSpectrogramSource(uuid, canvases.spectrogram)
    settings.selectSource(uuid)
  },
  onAddMeasurement: () => sourceList.addMeasurement(),
})
```

## 実装4: `web/src/style.css`の追加分

```css
.tree-toolbar {
  margin-bottom: 0.5rem;
}
.tree-toolbar button {
  background: #222;
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.tree-toolbar button:hover {
  background: #333;
}

.tree-move {
  margin-left: auto;
  position: relative;
}
.tree-move summary {
  list-style: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  padding: 0.1rem 0.3rem;
}
.tree-move summary::-webkit-details-marker {
  display: none;
}
.tree-move-list {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 10;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.2rem;
  min-width: 8rem;
  max-height: 10rem;
  overflow-y: auto;
}
.tree-move-list button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
}
.tree-move-list button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tree-delete {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0 0.2rem;
}
.tree-delete:hover {
  color: #f44336;
}
```

`.tree-row`は既に`display:flex; align-items:center; gap:0.4rem;`のため、`.tree-move`/`.tree-delete`は追加の子要素として自然に右側へ並ぶ(`.tree-move`の`margin-left:auto`で右寄せ)。

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. 左ペインの「+ Group」ボタンをクリックすると新しいGroupが作成され、ツリーに表示されることを確認する(QML側でも同じGroupが見えることを確認する)。
5. Stored行の「移動」アイコンをクリックすると、作成済みGroup一覧+「Top level」が表示され、Groupを選択するとそのGroup配下へインデントされて移動することを確認する(Phase 11のインデント表示と連動)。「Top level」を選択すると再びトップレベルへ戻ることを確認する。
6. Stored/Group行の「×」(削除)をクリックすると確認ダイアログが出て、OKすると実際に削除されることを確認する(Groupを削除した場合、配下のStoredも連鎖的に消えることを確認する)。
7. 右ペイン「Transfer Function」の「+ Measurement」ボタンをクリックすると、新しいMeasurementソースが追加され一覧に表示されることを確認する(QML側でも見えることを確認する)。
8. 右ペインには移動機能が無いこと(測定ソースは常にトップレベルのままであること)を確認する。
9. `npm run build`(tscの型チェック含む)が通ること。
10. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 12のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。
- [customizations.md](customizations.md)の該当節に、移動機能を左ペイン(Stored/Group)限定にした理由(Phase 11でのユーザー方針: 測定ソースは元々グループ化不可)を追記する。
