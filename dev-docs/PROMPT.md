# 修正プロンプト: データ名の編集導線 + 重複禁止 + Group非表示時の配下名グレー表示

Phase 12(左ペインDnD移動 + 挿入位置バー表示 + 階層的な表示/非表示)はレビュー済み・動作確認済み(CDPでのGroup内へのドラッグ、並び替え、チェックボックスのマスク表示を実機確認)。ユーザーから3件のフィードバックがあったため、まとめて対応する。

## フィードバック内容

> データ名の編集や削除の導線がないです。データ名の重複は認めないようにしたい。(複製時に重複した場合は末尾に"_copy-N"を自動でつける)、データ名を編集した時、重複した名前が存在する場合は"同じ名前では保存できません"などのダイアログを出して、再入力を促す等。
>
> GroupのチェックをOFFにしたとき、配下のデータ名もグレーにしたい。

(削除の導線自体はPhase 12で「×」ボタンとして既に実装済み。不足しているのは**名前編集の導線**と**重複防止**。)

## 設計方針

- **手動リネーム時の重複チェック**: 左ペインのツリーはJS側で既にツリー全体(全階層)の配列を保持しているため、**JS側でクライアントサイドの重複チェック**を行い、重複していれば`alert()`で通知して変更を確定しない(再度ダブルクリック/編集アイコンで入力し直せる)。バックエンド(`SourceTreeBridge::setName`)側でも**同じ階層の兄弟間**で防御的に重複チェックし、`bool`の成否をコールバックで返す(JS側のチェックをすり抜けた場合の保険。二重チェックだが軽量なので問題ない)。
- **自動生成名(Store/複製)の重複回避**: `SourceList::appendItem()`(`storeItem`/`cloneItem`含む全ての追加経路が最終的に通る一元的な入り口)に、追加直前の名前重複チェック+`_copy-N`自動付与を追加する。**スコープは追加先と同じリスト内の兄弟のみ**(Group内の`SourceList`はルートとは独立したインスタンスのため、ツリー全体を横断した重複チェックをこの1箇所で行うには親リストへの参照が必要になり大掛かりになる。現実的な衝突パターン=同一階層での連続Store/複製、をカバーすれば十分と判断)。
- **Group非表示時の配下名グレー表示**: 前回のプロンプトで用意した`isMaskedByAncestor`をチェックボックスだけでなくデータ名の`<span>`にも適用する。

## 実装1: `src/sourcelist.h`の変更

```cpp
private:
    // ...(既存のprivateメンバの近くに追加)
    QString uniqueName(const QString &baseName) const noexcept;
```

## 実装2: `src/sourcelist.cpp`の変更

`appendItem`の直前に重複チェック+リネームを追加:

```cpp
void SourceList::appendItem(const Shared::Source &item, bool autocolor)
{
    if (!item || getByUUid(item->uuid())) {
        return;
    }
    auto guard = lock();
    emit preItemAppended();

    if (autocolor) {
        item->setColor(nextColor());
    }
    item->setName(uniqueName(item->name()));
    m_items.append(item);
    emit postItemAppended(item);
    emit countChanged();
}

QString SourceList::uniqueName(const QString &baseName) const noexcept
{
    QString candidate = baseName;
    int suffix = 1;
    bool collided;
    do {
        collided = false;
        for (const auto &existing : m_items) {
            if (existing && existing->name() == candidate) {
                collided = true;
                break;
            }
        }
        if (collided) {
            candidate = QStringLiteral("%1_copy-%2").arg(baseName).arg(++suffix);
        }
    } while (collided);
    return candidate;
}
```

**注意**: これは`appendItem`を通る**全ての**追加(Measurement/Group/Stored/複製/Store/セッション読み込み時の`fromJSON`)に一律で適用される。既存セッションファイルに同名アイテムが含まれていた場合、読み込み時に自動でリネームされる点をユーザーに伝えること(実害はないが挙動として明記が必要)。

## 実装3: `src/chart/sourcetreebridge.h`の変更

```cpp
public:
    // ...(既存のQ_INVOKABLEの並びに追加)
    Q_INVOKABLE bool setName(const QString &uuid, const QString &name);
```

## 実装4: `src/chart/sourcetreebridge.cpp`の変更

```cpp
bool SourceTreeBridge::setName(const QString &uuidString, const QString &name)
{
    auto trimmed = name.trimmed();
    if (trimmed.isEmpty()) {
        return false;
    }

    auto uuid = QUuid(uuidString);
    auto source = m_sourceList->getByUUid(uuid);
    if (!source) {
        return false;
    }
    if (trimmed == source->name()) {
        return true; // 変更なし
    }

    // 同じ階層の兄弟内で重複していないか確認(自分自身は除外)。JS側の全階層チェックの保険。
    auto parentSource = m_sourceList->getByUUid(source->parent() ? QUuid() : QUuid()); // 未使用(下記siblingsで代替)
    Q_UNUSED(parentSource);

    bool duplicate = false;
    std::function<void(SourceList *)> checkSiblings = [&](SourceList *list) {
        for (const auto &sibling : list->items()) {
            if (sibling && sibling->uuid() != uuid && sibling->name() == trimmed) {
                duplicate = true;
                return;
            }
        }
    };

    // uuidが属しているリストを特定するため、ツリー全体を辿って親リストを探す
    std::function<SourceList *(SourceList *)> findOwningList = [&](SourceList * list) -> SourceList * {
        for (const auto &candidate : list->items()) {
            if (candidate && candidate->uuid() == uuid) {
                return list;
            }
            if (auto *group = dynamic_cast<Source::Group *>(candidate.get())) {
                if (auto *found = findOwningList(group->sourceList())) {
                    return found;
                }
            }
        }
        return nullptr;
    };

    if (auto *owningList = findOwningList(m_sourceList)) {
        checkSiblings(owningList);
    }

    if (duplicate) {
        return false;
    }

    source->setName(trimmed);
    return true;
}
```

**上記コードの`parentSource`の行は不要な残骸なので削除すること(実装時のコピペミス防止のための注記)。** 実際に必要なのは`findOwningList`で対象アイテムが属する`SourceList`を特定し、`checkSiblings`でその兄弟内の重複だけを見る、という2つの関数だけ。`#include <functional>`を追加すること。

## 実装5: `web/src/sourceTree.ts`を全面置き換え

リネームUI(編集アイコン+ダブルクリック)、送信失敗時のアラート、Group非表示時の配下名グレー表示をまとめて反映する:

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
  onMove: (uuid: string, targetParentUuid: string, index: number) => void
  onDelete: (uuid: string) => void
  onAddGroup: () => void
  onRename: (uuid: string, name: string) => void
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

function isMaskedByAncestor(item: TreeItem, byUuid: Map<string, TreeItem>): boolean {
  let parent = item.parentUuid ? byUuid.get(item.parentUuid) : undefined
  while (parent) {
    if (!parent.active) {
      return true
    }
    parent = parent.parentUuid ? byUuid.get(parent.parentUuid) : undefined
  }
  return false
}

export function renderSourceTree(container: HTMLElement, items: TreeItem[], callbacks: TreeCallbacks) {
  const byUuid = new Map(items.map((item) => [item.uuid, item]))

  function siblingsOf(parentUuid: string | null): TreeItem[] {
    return items.filter((item) => item.parentUuid === parentUuid)
  }
  function localIndex(item: TreeItem): number {
    return siblingsOf(item.parentUuid).findIndex((sibling) => sibling.uuid === item.uuid)
  }

  const rowsHtml = items.length
    ? items.map((item) => {
        const masked = isMaskedByAncestor(item, byUuid)
        return `
      <div class="tree-row" draggable="true" data-uuid="${item.uuid}" data-type="${item.type}" data-parent="${item.parentUuid ?? ''}" style="padding-left: ${(item.depth * 1).toFixed(1)}rem">
        <input type="checkbox" class="tree-active${masked ? ' tree-checkbox-masked' : ''}" ${item.active ? 'checked' : ''} />
        <span class="tree-swatch" style="background:${item.color}"></span>
        <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
        <span class="tree-name${item.active ? '' : ' tree-inactive'}${masked ? ' tree-name-masked' : ''}" data-name>${escapeHtml(item.name)}</span>
        <button type="button" class="tree-rename" title="Rename" data-rename>&#9998;</button>
        <button type="button" class="tree-delete" title="Delete" data-delete>&times;</button>
      </div>
    `
      }).join('')
    : '<p class="placeholder">保存データがありません</p>'

  container.innerHTML = `
    <div class="tree-toolbar">
      <button type="button" data-add-group>+ Group</button>
    </div>
    <div class="tree-list" data-tree-list>${rowsHtml}</div>
    <div class="tree-drop-root" data-drop-root>ここへドロップでトップレベルへ移動</div>
  `

  container.querySelector('[data-add-group]')?.addEventListener('click', () => callbacks.onAddGroup())

  const listEl = container.querySelector<HTMLElement>('[data-tree-list]')!
  const dropBar = document.createElement('div')
  dropBar.className = 'tree-drop-bar'
  dropBar.hidden = true
  listEl.appendChild(dropBar)

  let pendingDrop: { targetParentUuid: string; index: number } | null = null

  function clearDropIndicators() {
    dropBar.hidden = true
    listEl.querySelectorAll('.tree-drop-target').forEach((element) => element.classList.remove('tree-drop-target'))
  }

  function startRename(row: HTMLElement, item: TreeItem) {
    const nameSpan = row.querySelector<HTMLElement>('[data-name]')
    if (!nameSpan) {
      return
    }
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'tree-name-edit'
    input.value = item.name
    nameSpan.replaceWith(input)
    input.focus()
    input.select()

    let settled = false
    function restore() {
      if (settled) {
        return
      }
      settled = true
      input.replaceWith(nameSpan!)
    }
    function commit() {
      if (settled) {
        return
      }
      const newName = input.value.trim()
      restore()
      if (!newName || newName === item.name) {
        return
      }
      // 重複チェックはツリー全体(items配列)に対してJS側で先に行う。
      // 重複していればアラートを出して送信しない(再度ダブルクリック/編集アイコンで入力し直せる)。
      const duplicate = items.some((other) => other.uuid !== item.uuid && other.name === newName)
      if (duplicate) {
        alert('同じ名前では保存できません')
        return
      }
      callbacks.onRename(item.uuid, newName)
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        commit()
      } else if (event.key === 'Escape') {
        restore()
      }
    })
    input.addEventListener('blur', commit)
  }

  container.querySelectorAll<HTMLElement>('.tree-row').forEach((row) => {
    const uuid = row.dataset.uuid!
    const item = byUuid.get(uuid)!
    const isGroup = item.type === 'Group'

    row.querySelector<HTMLInputElement>('.tree-active')?.addEventListener('change', (event) => {
      callbacks.onToggleActive(uuid, (event.target as HTMLInputElement).checked)
    })
    row.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (confirm('このアイテムを削除しますか?')) {
        callbacks.onDelete(uuid)
      }
    })
    row.querySelector('[data-rename]')?.addEventListener('click', () => startRename(row, item))
    row.querySelector('[data-name]')?.addEventListener('dblclick', () => startRename(row, item))

    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', uuid)
      event.dataTransfer!.effectAllowed = 'move'
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging')
      clearDropIndicators()
      pendingDrop = null
    })

    row.addEventListener('dragover', (event) => {
      event.preventDefault()
      const draggedUuid = event.dataTransfer?.getData('text/plain')
      if (draggedUuid === uuid) {
        return
      }

      const rect = row.getBoundingClientRect()
      const offsetRatio = (event.clientY - rect.top) / rect.height
      const zone: 'before' | 'after' | 'into' =
        isGroup && offsetRatio > 0.25 && offsetRatio < 0.75
          ? 'into'
          : offsetRatio < 0.5 ? 'before' : 'after'

      clearDropIndicators()

      if (zone === 'into') {
        row.classList.add('tree-drop-target')
        pendingDrop = { targetParentUuid: uuid, index: siblingsOf(uuid).length }
      } else {
        const listRect = listEl.getBoundingClientRect()
        const barTop = (zone === 'before' ? rect.top : rect.bottom) - listRect.top
        dropBar.style.top = `${barTop}px`
        dropBar.style.left = `${item.depth * 1}rem`
        dropBar.hidden = false
        const targetParentUuid = item.parentUuid ?? ''
        const index = localIndex(item) + (zone === 'after' ? 1 : 0)
        pendingDrop = { targetParentUuid, index }
      }
    })

    row.addEventListener('drop', (event) => {
      event.preventDefault()
      const draggedUuid = event.dataTransfer?.getData('text/plain')
      clearDropIndicators()
      if (draggedUuid && pendingDrop && draggedUuid !== uuid) {
        callbacks.onMove(draggedUuid, pendingDrop.targetParentUuid, pendingDrop.index)
      }
      pendingDrop = null
    })
  })

  const dropRoot = container.querySelector<HTMLElement>('[data-drop-root]')!
  dropRoot.addEventListener('dragover', (event) => {
    event.preventDefault()
    clearDropIndicators()
    dropRoot.classList.add('tree-drop-target')
    pendingDrop = { targetParentUuid: '', index: siblingsOf(null).length }
  })
  dropRoot.addEventListener('dragleave', (event) => {
    if (!dropRoot.contains(event.relatedTarget as Node | null)) {
      dropRoot.classList.remove('tree-drop-target')
      pendingDrop = null
    }
  })
  dropRoot.addEventListener('drop', (event) => {
    event.preventDefault()
    const draggedUuid = event.dataTransfer?.getData('text/plain')
    clearDropIndicators()
    dropRoot.classList.remove('tree-drop-target')
    if (draggedUuid && pendingDrop) {
      callbacks.onMove(draggedUuid, pendingDrop.targetParentUuid, pendingDrop.index)
    }
    pendingDrop = null
  })
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

## 実装6: `web/src/main.ts`の変更

`renderSourceTree`の呼び出しに`onRename`を追加(`setName`のコールバックで失敗時にアラートを出す):

```ts
renderSourceTree(sourceTreeEl, sessionItems, {
  onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
  onMove: (uuid, targetParentUuid, index) => sourceTree.moveToPosition(uuid, targetParentUuid, index),
  onDelete: (uuid) => sourceList.removeItem(uuid, true),
  onAddGroup: () => sourceList.addGroup(),
  onRename: (uuid, name) => {
    sourceTree.setName(uuid, name, (success: boolean) => {
      if (!success) {
        alert('同じ名前では保存できません')
      }
    })
  },
})
```

## 実装7: `web/src/style.css`の追加分

```css
.tree-name-masked {
  opacity: 0.35;
}

.tree-rename {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0 0.2rem;
}
.tree-rename:hover {
  color: rgba(255, 255, 255, 0.9);
}
.tree-delete {
  margin-left: 0; /* 既存の margin-left: auto はrenameボタンへ移す */
}
.tree-row {
  /* 既存のflexレイアウトのまま。rename/deleteボタンを右端に寄せるため、name直後の要素に auto-margin を付ける */
}
.tree-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-name-edit {
  flex: 1 1 auto;
  min-width: 0;
  background: #111;
  color: #fff;
  border: 1px solid #2196f3;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
  font-size: inherit;
  font-family: inherit;
}
```

**注意**: 既存の`.tree-delete { margin-left: auto; ... }`ルールがある場合、rename/deleteボタン2つを右端にまとめて寄せたいので、`.tree-name`に`flex: 1 1 auto`を与えて名前欄が伸縮するようにし、`margin-left: auto`は削除してよい(名前欄が伸びることで自然にボタン群が右に押し出される)。既存のCSSと整合するよう調整すること。

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。
4. 左ペインの「✎」アイコン、またはデータ名のダブルクリックで編集モードになり、Enterで確定・Escapeでキャンセルできることを確認する。
5. 既存の別のアイテムと同じ名前に変更しようとすると、「同じ名前では保存できません」のアラートが出て変更が確定しないことを確認する。
6. Storeボタンを短時間に連続で押し、自動生成名(`Measure @ HH:mm`)が衝突するケースで、2つ目以降が自動的に`_copy-2`等の連番付きになることを確認する(既存のバグとして実際に重複表示していたことをこの修正で解消できることも確認する)。
7. Group配下にStoredがある状態でGroupのチェックボックスをオフにすると、配下の行の**データ名の文字も**グレー表示になることを確認する(チェックボックスだけでなく)。
8. `npm run build`(tscの型チェック含む)が通ること。
9. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 12完了メモに、この追加修正(リネームUI、重複防止、配下名グレー表示)を追記する。
- [customizations.md](customizations.md)の該当節に、`SourceList::appendItem`での自動リネーム(`_copy-N`)の挙動と、既存セッション読み込み時にも適用される点を明記する。
