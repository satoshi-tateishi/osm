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
    checkbox.addEventListener('click', (event) => event.stopPropagation())
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.tree-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })
  container.querySelectorAll<HTMLElement>('.tree-row').forEach((row) => {
    row.addEventListener('click', () => {
      const uuid = row.dataset.uuid!
      container.querySelectorAll('.tree-row.selected').forEach((element) => element.classList.remove('selected'))
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
