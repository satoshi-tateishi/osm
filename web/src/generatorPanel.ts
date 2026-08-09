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
