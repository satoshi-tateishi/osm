# 実装プロンプト: フロントエンドJS化 Phase 19(Settingsポップオーバーに測定ソース削除ボタンを追加)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 19を実装するための指示書。Phase 18(各測定行にEstimated Delayのリアルタイム表示・適用・手動入力)は完了・実機確認済み・push済み。今回は`web/src/`のみの変更。

## 背景

右ペインのTransfer Function(測定ソース一覧)には、測定ソースを削除する導線が今のところ存在しない(左ペインSession Dataの`×`ボタンによる削除は保存データ用で、測定ソースの一覧には及ばない)。Phase 17で追加したSettingsポップオーバー(歯車クリックで開く、`web/src/settingsPanel.ts`の`renderSettingsPanel`が描画)の一番下に、赤い「削除」ボタンを追加する。

## 現状

`web/src/settingsPanel.ts`の`renderSettingsPanel`は、フォームの最後に`.settings-actions`(Reset Average/Storeボタン)と`#settings-meter`(Level/Ref/Peakテキスト)を描画して終わる:

```html
<div class="settings-actions">
  <button data-action="reset-average">Reset Average</button>
  <button data-action="store">Store</button>
</div>
<div id="settings-meter" class="settings-meter"></div>
```

コールバック型:

```ts
export function renderSettingsPanel(
  container: HTMLElement,
  payload: SettingsPayload | null,
  callbacks: {
    onChange: (name: string, value: number | string | boolean) => void
    onResetAverage: () => void
    onStore: () => void
  },
) { ... }
```

左ペインSession Data(`web/src/sourceTree.ts`)の既存の削除ボタンは以下のパターンで実装されている(確認ダイアログの文言も揃えること):

```ts
row.querySelector('[data-delete]')?.addEventListener('click', () => {
  if (confirm('このアイテムを削除しますか?')) {
    callbacks.onDelete(uuid)
  }
})
```

`main.ts`では`channelReady.then(({ sourceTree, chartData, settings, generator, outputDevices, sourceList }) => {...})`のスコープ内に`sourceList`があり、実際の削除は`sourceList.removeItem(uuid, true)`で行う(`sourceTree.ts`用の`onDelete`配線: `onDelete: (uuid) => sourceList.removeItem(uuid, true)`と同じAPI)。

## 実装1: `web/src/settingsPanel.ts`の変更

`renderSettingsPanel`のコールバック型に`onDelete`を追加:

```ts
export function renderSettingsPanel(
  container: HTMLElement,
  payload: SettingsPayload | null,
  callbacks: {
    onChange: (name: string, value: number | string | boolean) => void
    onResetAverage: () => void
    onStore: () => void
    onDelete: () => void
  },
) { ... }
```

フォーム末尾(`#settings-meter`の後)に削除ボタンのブロックを追加:

```html
<div id="settings-meter" class="settings-meter"></div>
<div class="settings-danger-zone">
  <button type="button" class="settings-delete-button" data-action="delete">削除</button>
</div>
```

イベント登録(既存の`reset-average`/`store`の登録の近くに追加):

```ts
container.querySelector('[data-action="delete"]')?.addEventListener('click', callbacks.onDelete)
```

## 実装2: `web/src/main.ts`の変更

`renderPanel(payload)`内、`renderSettingsPanel`呼び出しのコールバックに`onDelete`を追加する。確認ダイアログの文言は`sourceTree.ts`と同じ「このアイテムを削除しますか?」を使うこと。削除確定後はポップオーバーを閉じる(`closeSettingsPopover()`は既にimport済み):

```ts
function renderPanel(payload: SettingsPayload) {
  if (!payload.uuid) return
  const content = getSettingsPopoverContentIfOpenFor(payload.uuid)
  if (!content) return
  currentSettingsUuid = payload.uuid
  renderSettingsPanel(content, payload, {
    onChange: (name, value) => { /* 既存のまま */ },
    onResetAverage: () => settings.resetAverage(payload.uuid),
    onStore: () => settings.store(payload.uuid),
    onDelete: () => {
      if (!confirm('このアイテムを削除しますか?')) {
        return
      }
      closeSettingsPopover()
      currentSettingsUuid = null
      sourceList.removeItem(payload.uuid, true)
    },
  })
  repositionSettingsPopover()
}
```

`chartData.sourceRemoved`の既存ハンドラ(Phase 17で追加済み)は、削除されたuuidがポップオーバーで開いていた場合に重ねて閉じようとするが、`closeSettingsPopover()`は複数回呼んでも安全な実装になっているはずなので問題ない(ハンドラ側の変更は不要)。

## 実装3: `web/src/style.css`の変更

`.settings-actions`の近くに追加:

```css
.settings-danger-zone {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.settings-delete-button {
  width: 100%;
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
  border: 1px solid rgba(244, 67, 54, 0.4);
  border-radius: 4px;
  padding: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.settings-delete-button:hover {
  background: rgba(244, 67, 54, 0.28);
  border-color: #f44336;
  color: #fff;
}
```

## 検証方法

1. `cd web && npm run build`が通ることを確認する。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルド・起動する。
3. いずれかの測定行の歯車をクリックしてSettingsポップオーバーを開き、フォームの一番下に赤い「削除」ボタンが表示されていることを確認する。
4. 削除ボタンをクリックすると確認ダイアログが出ること、キャンセルすると何も起きないことを確認する。
5. 確認ダイアログでOKを押すと、その測定ソースがTransfer Function一覧・Session Data・チャートから消え、ポップオーバーも閉じることを確認する。
6. 誤って別の測定ソースが削除されていないこと(意図した1件だけが消えること)を確認する。
7. 削除後に残りの測定ソースのSettingsポップオーバー・Estimated Delay等、Phase 6〜18で確認済みの機能に退行がないか一通り確認する。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 19のタスクチェックリストにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。
- [customizations.md](customizations.md)にも変更内容と理由を追記する。
