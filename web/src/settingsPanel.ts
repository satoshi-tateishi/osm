export interface SettingsPayload {
  uuid: string | null
  type?: string
  editable?: boolean
  name?: string
  active?: boolean
  averageType?: number
  average?: number
  averageTickSeconds?: number
  filtersFrequency?: number
  gain?: number
  offset?: number
  delay?: number
  mode?: number
  tfcReferenceTime?: number
  inputFilter?: number
  polarity?: boolean
  deviceId?: string
  dataChanel?: number
  referenceChanel?: number
  channelNames?: string[]
  devices?: { id: string; name: string }[]
}

export interface MeterPayload {
  uuid: string
  level: number | null
  referenceLevel: number | null
  measurementPeak: number | null
  referencePeak: number | null
}

const MODE_LABELS = ['FFT 1024', 'FFT 2048', 'FFT 4096', 'FFT 8192', 'FFT 16384', 'FFT 32768', 'FFT 65536', 'LTW', 'TFC']
const AVERAGE_TYPE_LABELS = ['Off', 'LPF', 'FIFO']
const FILTERS_FREQUENCY_LABELS = ['0.25 Hz', '0.5 Hz', '1 Hz']
const INPUT_FILTER_LABELS = ['Z', 'A', 'C', 'Notch', 'BP100', 'LP200']
const AVERAGE_TYPE_LPF = 1
const AVERAGE_TYPE_FIFO = 2
const MODE_TFC = 8

function options(labels: string[], selected: number | undefined) {
  return labels.map((label, i) => `<option value="${i}" ${selected === i ? 'selected' : ''}>${label}</option>`).join('')
}

export function renderSettingsPanel(
  container: HTMLElement,
  payload: SettingsPayload | null,
  callbacks: {
    onChange: (name: string, value: number | string | boolean) => void
    onResetAverage: () => void
    onStore: () => void
  },
) {
  if (!payload || !payload.uuid) {
    container.innerHTML = '<p class="placeholder">左のリストからソースを選択してください</p>'
    return
  }
  if (!payload.editable) {
    container.innerHTML = `<p class="placeholder">${escapeHtml(payload.type ?? '')}の設定はまだ対応していません</p>`
    return
  }

  container.innerHTML = `
    <div class="settings-field"><label>Name</label><input type="text" data-prop="name" value="${escapeAttr(payload.name ?? '')}" /></div>
    <div class="settings-field"><label>Gain (dB)</label><input type="number" step="0.1" data-prop="gain" value="${payload.gain}" /></div>
    <div class="settings-field"><label>Offset (dB)</label><input type="number" step="0.1" data-prop="offset" value="${payload.offset}" /></div>
    <div class="settings-field"><label>Delay (samples)</label><input type="number" step="1" data-prop="delay" value="${payload.delay}" /></div>
    <div class="settings-field"><label>Mode</label>
      <select data-prop="mode">${options(MODE_LABELS, payload.mode)}</select>
    </div>
    <div class="settings-field" ${payload.mode === MODE_TFC ? '' : 'style="display:none"'}>
      <label>TFC reference time (ms)</label><input type="number" step="1" data-prop="tfcReferenceTime" value="${payload.tfcReferenceTime}" />
    </div>
    <div class="settings-field"><label>Average type</label>
      <select data-prop="averageType">${options(AVERAGE_TYPE_LABELS, payload.averageType)}</select>
    </div>
    <div class="settings-field" ${payload.averageType === AVERAGE_TYPE_FIFO ? '' : 'style="display:none"'}>
      <label>Average count (≈${((payload.average ?? 0) * (payload.averageTickSeconds ?? 0)).toFixed(2)}s)</label>
      <input type="number" step="1" data-prop="average" value="${payload.average}" />
    </div>
    <div class="settings-field" ${payload.averageType === AVERAGE_TYPE_LPF ? '' : 'style="display:none"'}>
      <label>Filter frequency</label>
      <select data-prop="filtersFrequency">${options(FILTERS_FREQUENCY_LABELS, payload.filtersFrequency)}</select>
    </div>
    <div class="settings-field"><label>Input filter</label>
      <select data-prop="inputFilter">${options(INPUT_FILTER_LABELS, payload.inputFilter)}</select>
    </div>
    <div class="settings-field"><label>Input device</label>
      <select data-prop="deviceId">${(payload.devices ?? []).map((device) =>
        `<option value="${escapeAttr(device.id)}" ${device.id === payload.deviceId ? 'selected' : ''}>${escapeHtml(device.name)}</option>`
      ).join('')}</select>
    </div>
    <div class="settings-field"><label>Measurement channel (M)</label>
      <select data-prop="dataChanel">${options(payload.channelNames ?? [], payload.dataChanel)}</select>
    </div>
    <div class="settings-field"><label>Reference channel (R)</label>
      <select data-prop="referenceChanel">${options(payload.channelNames ?? [], payload.referenceChanel)}</select>
    </div>
    <div class="settings-actions">
      <button data-action="reset-average">Reset Average</button>
      <button data-action="store">Store</button>
    </div>
    <div id="settings-meter" class="settings-meter"></div>
  `

  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]').forEach((el) => {
    el.addEventListener('change', () => {
      const name = el.dataset.prop!
      const isStringProp = name === 'name' || name === 'deviceId'
      const value = el instanceof HTMLSelectElement
        ? (isStringProp ? el.value : Number(el.value))
        : (el as HTMLInputElement).type === 'number'
          ? Number(el.value)
          : el.value
      callbacks.onChange(name, value)
    })
  })
  container.querySelector('[data-action="reset-average"]')?.addEventListener('click', callbacks.onResetAverage)
  container.querySelector('[data-action="store"]')?.addEventListener('click', callbacks.onStore)
}

export function renderMeter(payload: MeterPayload) {
  const el = document.querySelector<HTMLDivElement>('#settings-meter')
  if (!el) return
  el.textContent = `Level ${formatMeterValue(payload.level)} dB   Ref ${formatMeterValue(payload.referenceLevel)} dB   Peak ${formatMeterValue(payload.measurementPeak)} dB`
}

function formatMeterValue(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—'
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}
