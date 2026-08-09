let popoverEl: HTMLDivElement | null = null
let contentEl: HTMLDivElement | null = null
let openUuid: string | null = null
let anchorEl: HTMLElement | null = null

function ensurePopover(): { popover: HTMLDivElement; content: HTMLDivElement } {
  if (popoverEl && contentEl) {
    return { popover: popoverEl, content: contentEl }
  }

  popoverEl = document.createElement('div')
  popoverEl.className = 'settings-popover'
  popoverEl.hidden = true

  const header = document.createElement('div')
  header.className = 'settings-popover-header'
  header.innerHTML = `<span>Settings</span><button type="button" class="settings-popover-close" data-close>&times;</button>`
  header.querySelector('[data-close]')!.addEventListener('click', () => closeSettingsPopover())

  contentEl = document.createElement('div')
  contentEl.className = 'settings-popover-content'

  popoverEl.appendChild(header)
  popoverEl.appendChild(contentEl)
  document.body.appendChild(popoverEl)

  document.addEventListener('click', (event) => {
    if (!openUuid || !popoverEl) return
    const target = event.target as Element
    if (popoverEl.contains(target) || target.closest('[data-gear]')) return
    closeSettingsPopover()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSettingsPopover()
  })
  window.addEventListener('resize', () => repositionSettingsPopover())

  return { popover: popoverEl, content: contentEl }
}

function positionPopover(popover: HTMLDivElement) {
  const chartRect = document.querySelector<HTMLElement>('.pane-center')?.getBoundingClientRect()
  const width = popover.offsetWidth || 300
  const height = popover.offsetHeight || Math.min(320, window.innerHeight * 0.7)
  let left = chartRect ? chartRect.right - width - 16 : window.innerWidth - width - 16
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  popover.style.left = `${left}px`

  let top = (chartRect?.top ?? 0) + 16
  top = Math.max(8, Math.min(top, window.innerHeight - height - 8))
  popover.style.top = `${top}px`
}

export function getOpenSettingsUuid(): string | null {
  return openUuid
}

export function openSettingsPopover(uuid: string, anchor: HTMLElement): HTMLElement {
  const { popover, content } = ensurePopover()
  if (openUuid !== uuid) content.textContent = ''
  openUuid = uuid
  anchorEl = anchor
  popover.hidden = false
  positionPopover(popover)
  return content
}

export function repositionSettingsPopover(): void {
  if (!popoverEl || !openUuid || !anchorEl) return
  positionPopover(popoverEl)
}

export function closeSettingsPopover(): void {
  if (popoverEl) popoverEl.hidden = true
  openUuid = null
  anchorEl = null
}

export function getSettingsPopoverContentIfOpenFor(uuid: string): HTMLElement | null {
  return openUuid === uuid ? contentEl : null
}
