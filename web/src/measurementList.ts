export interface MeasurementItem {
  uuid: string
  name: string
  color: string
  active: boolean
}

export interface MeasurementCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onSelect: (uuid: string) => void
  onOpenSettings: (uuid: string, anchor: HTMLElement) => void
  onSetDelay: (uuid: string, delaySamples: number) => void
  onApplyEstimatedDelay: (uuid: string) => void
  onAddMeasurement: () => void
}

export interface MeterValues {
  level: number | null
  referenceLevel: number | null
  measurementPeak: number | null
  referencePeak: number | null
  delay?: number | null
  estimatedDelay?: number | null
  sampleRate?: number | null
}

const METER_MIN_DB = -48
const METER_MAX_DB = 0

let selectedUuid: string | null = null

export function renderMeasurementList(container: HTMLElement, items: MeasurementItem[], callbacks: MeasurementCallbacks) {
  const rowsHtml = items.length
    ? items.map((item) => `
      <div class="measurement-row${item.uuid === selectedUuid ? ' selected' : ''}" data-uuid="${item.uuid}">
        <div class="measurement-row-header">
          <input type="checkbox" class="measurement-active" ${item.active ? 'checked' : ''} />
          <span class="tree-swatch" style="background:${item.color}"></span>
          <span class="measurement-name${item.active ? '' : ' tree-inactive'}">${escapeHtml(item.name)}</span>
          <input type="number" class="measurement-delay-input" data-delay-input step="0.1" title="適用中のディレイ(ms)" />
          <button type="button" class="measurement-delay-estimated" data-delay-estimated title="Estimated Delayを適用" disabled>—</button>
          <button type="button" class="measurement-gear" data-gear title="Settings">&#9881;</button>
        </div>
        <div class="meter-group">
          <div class="meter-line">
            <span class="meter-label">M</span>
            <div class="meter-bar">
              <div class="meter-fill" data-meter-fill="measurement"></div>
              <div class="meter-boundary meter-boundary-30"></div>
              <div class="meter-boundary meter-boundary-18"></div>
            </div>
          </div>
          <div class="meter-line">
            <span class="meter-label">R</span>
            <div class="meter-bar">
              <div class="meter-fill" data-meter-fill="reference"></div>
              <div class="meter-boundary meter-boundary-30"></div>
              <div class="meter-boundary meter-boundary-18"></div>
            </div>
          </div>
        </div>
      </div>
    `).join('')
    : '<p class="placeholder">測定ソースがありません</p>'

  container.innerHTML = `
    <div class="tree-toolbar">
      <button type="button" data-add-measurement>+ Measurement</button>
    </div>
    <div class="measurement-list">${rowsHtml}</div>
  `

  container.querySelector('[data-add-measurement]')?.addEventListener('click', () => callbacks.onAddMeasurement())

  container.querySelectorAll<HTMLInputElement>('.measurement-active').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation())
    checkbox.addEventListener('change', () => {
      const uuid = checkbox.closest<HTMLElement>('.measurement-row')!.dataset.uuid!
      callbacks.onToggleActive(uuid, checkbox.checked)
    })
  })
  container.querySelectorAll<HTMLElement>('.measurement-row').forEach((row) => {
    const uuid = row.dataset.uuid!
    const delayInput = row.querySelector<HTMLInputElement>('[data-delay-input]')
    delayInput?.addEventListener('click', (event) => event.stopPropagation())
    delayInput?.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        delayInput.blur()
      }
    })
    delayInput?.addEventListener('change', () => {
      const ms = Number(delayInput.value)
      const sampleRate = Number(row.dataset.sampleRate ?? '0')
      if (!Number.isFinite(ms) || !sampleRate) {
        return
      }
      callbacks.onSetDelay(uuid, Math.round((ms * sampleRate) / 1000))
    })
    row.querySelector<HTMLButtonElement>('[data-delay-estimated]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      callbacks.onApplyEstimatedDelay(uuid)
    })
    row.querySelector<HTMLButtonElement>('[data-gear]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      callbacks.onOpenSettings(uuid, event.currentTarget as HTMLElement)
    })
    row.addEventListener('click', () => {
      container.querySelectorAll('.measurement-row.selected').forEach((element) => element.classList.remove('selected'))
      row.classList.add('selected')
      selectedUuid = uuid
      callbacks.onSelect(uuid)
    })
  })
}

export function updateMeasurementMeter(container: HTMLElement, uuid: string, values: MeterValues) {
  const row = container.querySelector<HTMLElement>(`.measurement-row[data-uuid="${uuid}"]`)
  if (!row) return
  updateMeterLine(row, 'measurement', values.level, values.measurementPeak)
  updateMeterLine(row, 'reference', values.referenceLevel, values.referencePeak)
  updateDelayDisplay(row, values)
}

function updateDelayDisplay(row: HTMLElement, values: MeterValues) {
  const sampleRate = values.sampleRate
  if (typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0) {
    row.dataset.sampleRate = String(sampleRate)
  }

  const delayInput = row.querySelector<HTMLInputElement>('[data-delay-input]')
  if (delayInput && document.activeElement !== delayInput) {
    if (typeof values.delay === 'number' && Number.isFinite(values.delay) && sampleRate) {
      delayInput.value = ((1000 * values.delay) / sampleRate).toFixed(2)
    }
  }

  const estimatedButton = row.querySelector<HTMLButtonElement>('[data-delay-estimated]')
  if (estimatedButton) {
    if (typeof values.estimatedDelay === 'number' && Number.isFinite(values.estimatedDelay) && sampleRate) {
      estimatedButton.textContent = `${((1000 * values.estimatedDelay) / sampleRate).toFixed(2)}ms`
      estimatedButton.disabled = false
    } else {
      estimatedButton.textContent = '—'
      estimatedButton.disabled = true
    }
  }
}

function updateMeterLine(row: HTMLElement, kind: 'measurement' | 'reference', level: number | null, peak: number | null) {
  const fill = row.querySelector<HTMLElement>(`[data-meter-fill="${kind}"]`)
  if (!fill) return
  if (typeof level === 'number' && Number.isFinite(level)) {
    const ratio = Math.min(1, Math.max(0, (level - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)))
    fill.style.clipPath = `inset(0 ${100 - ratio * 100}% 0 0)`
    fill.classList.toggle('meter-clip', typeof peak === 'number' && peak > -3)
  } else {
    fill.style.clipPath = 'inset(0 100% 0 0)'
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
