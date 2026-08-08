export interface TreeItem {
  uuid: string
  type: string
  name: string
  color: string
  active: boolean
}

const TYPE_ICON: Record<string, string> = {
  Measurement: '\u{1F399}',
  Stored: '\u{1F4BE}',
  Group: '\u{1F4C1}',
}

export function renderSourceTree(container: HTMLElement, items: TreeItem[]) {
  container.innerHTML = items.map((item) => `
    <div class="tree-row" data-uuid="${item.uuid}">
      <span class="tree-swatch" style="background:${item.color}"></span>
      <span class="tree-icon">${TYPE_ICON[item.type] ?? '•'}</span>
      <span class="tree-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
    </div>
  `).join('')
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
