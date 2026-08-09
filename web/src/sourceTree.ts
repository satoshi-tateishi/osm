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
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

export function renderSourceTree(container: HTMLElement, items: TreeItem[], callbacks: TreeCallbacks) {
  container.innerHTML = items.length
    ? items.map((item) => `
    <div class="tree-row" data-uuid="${item.uuid}" style="padding-left: ${(item.depth * 1).toFixed(1)}rem">
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
