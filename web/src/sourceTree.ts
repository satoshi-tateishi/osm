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
    ? items.map((item) => `
      <div class="tree-row" draggable="true" data-uuid="${item.uuid}" data-type="${item.type}" data-parent="${item.parentUuid ?? ''}" style="padding-left: ${(item.depth * 1).toFixed(1)}rem">
        <input type="checkbox" class="tree-active${isMaskedByAncestor(item, byUuid) ? ' tree-checkbox-masked' : ''}" ${item.active ? 'checked' : ''} />
        <span class="tree-swatch" style="background:${item.color}"></span>
        <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
        <span class="tree-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
        <button type="button" class="tree-delete" title="Delete" data-delete>&times;</button>
      </div>
    `).join('')
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
    container.querySelectorAll('.tree-drop-target').forEach((element) => element.classList.remove('tree-drop-target'))
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
