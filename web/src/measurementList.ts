export interface MeasurementItem {
  uuid: string
  name: string
  color: string
  active: boolean
}

export interface MeasurementCallbacks {
  onToggleActive: (uuid: string, active: boolean) => void
  onSelect: (uuid: string) => void
  onAddMeasurement: () => void
}

export interface MeterValues {
  level: number | null
  referenceLevel: number | null
  measurementPeak: number | null
  referencePeak: number | null
}

const METER_MIN_DB = -60
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
        </div>
        <div class="meter-group">
          <div class="meter-line">
            <span class="meter-label">M</span>
            <div class="meter-bar"><div class="meter-fill" data-meter-fill="measurement"></div></div>
          </div>
          <div class="meter-line">
            <span class="meter-label">R</span>
            <div class="meter-bar"><div class="meter-fill" data-meter-fill="reference"></div></div>
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
    row.addEventListener('click', () => {
      const uuid = row.dataset.uuid!
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
}

function updateMeterLine(row: HTMLElement, kind: 'measurement' | 'reference', level: number | null, peak: number | null) {
  const fill = row.querySelector<HTMLElement>(`[data-meter-fill="${kind}"]`)
  if (typeof level === 'number' && Number.isFinite(level)) {
    const ratio = Math.min(1, Math.max(0, (level - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)))
    if (fill) {
      fill.style.width = `${ratio * 100}%`
      fill.classList.toggle('meter-clip', typeof peak === 'number' && peak > -3)
    }
  } else {
    if (fill) fill.style.width = '0%'
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
