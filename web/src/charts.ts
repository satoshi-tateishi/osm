export interface SeriesPayload {
  uuid: string
  sourceName: string
  color: string
  frequency: number[]
}
export interface MagnitudePayload extends SeriesPayload { magnitudeDb: (number | null)[] }
export interface PhasePayload extends SeriesPayload { phaseDeg: (number | null)[] }
export interface CoherencePayload extends SeriesPayload { coherenceValue: (number | null)[] }
export interface RTAPayload extends SeriesPayload { levelDb: (number | null)[] }
export interface SpectrogramPayload {
  uuid: string
  sourceName: string
  frequency: number[]
  levelDb: number[]
}

const XMIN = 20
const XMAX = 20000
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

function xForFreq(f: number, width: number) {
  return (Math.log(f) - Math.log(XMIN)) / Math.log(XMAX / XMIN) * width
}

function drawGrid(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)
  ctx.strokeStyle = 'rgba(255,255,255,0.157)'
  ctx.lineWidth = 1
  for (const f of GRID_FREQS) {
    const x = xForFreq(f, cw)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }
  ctx.restore()
}

// wrapThreshold: 隣接点の差がこれを超えたら線を繋がず区切る(Phaseの±180度ラップ対策)。
function drawOneSeries(
  canvas: HTMLCanvasElement,
  frequency: number[],
  values: (number | null)[],
  color: string,
  yMin: number,
  yMax: number,
  wrapThreshold = Infinity
) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  const yForValue = (v: number) => ch - (v - yMin) / (yMax - yMin) * ch

  ctx.strokeStyle = color || '#3F51B5'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  let penDown = false
  let lastValue: number | null = null
  frequency.forEach((f, idx) => {
    const v = values[idx]
    if (v === null || !Number.isFinite(v)) {
      penDown = false
      lastValue = null
      return
    }
    if (lastValue !== null && Math.abs(v - lastValue) > wrapThreshold) {
      penDown = false
    }
    const x = xForFreq(f, cw)
    const y = yForValue(v)
    if (!penDown) {
      ctx.moveTo(x, y)
      penDown = true
    } else {
      ctx.lineTo(x, y)
    }
    lastValue = v
  })
  ctx.stroke()
  ctx.restore()
}

function drawLegend(canvas: HTMLCanvasElement, entries: { color: string; name: string }[]) {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.font = '11px sans-serif'
  entries.forEach((entry, i) => {
    const y = 12 + i * 13
    ctx.fillStyle = entry.color || '#3F51B5'
    ctx.fillRect(8, y - 8, 8, 8)
    ctx.fillStyle = 'rgba(255,255,255,255)'
    ctx.fillText(entry.name, 20, y)
  })
  ctx.restore()
}

function finiteRange(valuesList: (number | null)[][], padRatio = 0.1, fallbackPad = 1) {
  const finite = valuesList.flat().filter((v): v is number => v !== null && Number.isFinite(v))
  if (!finite.length) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * padRatio || fallbackPad
  return { min: min - pad, max: max + pad }
}

let activeUuids: Set<string> | null = null

const magnitudeCache = new Map<string, MagnitudePayload>()
const phaseCache = new Map<string, PhasePayload>()
const coherenceCache = new Map<string, CoherencePayload>()
const rtaCache = new Map<string, RTAPayload>()

function visibleEntries<T extends { uuid: string }>(cache: Map<string, T>): T[] {
  const all = [...cache.values()]
  if (!activeUuids) return all
  return all.filter((entry) => activeUuids!.has(entry.uuid))
}

export interface ChartCanvases {
  magnitude: HTMLCanvasElement
  phase: HTMLCanvasElement
  coherence: HTMLCanvasElement
  rta: HTMLCanvasElement
  spectrogram: HTMLCanvasElement
}

export function setActiveUuids(uuids: Set<string>, canvases: ChartCanvases) {
  activeUuids = uuids
  redrawMagnitude(canvases.magnitude)
  redrawPhase(canvases.phase)
  redrawCoherence(canvases.coherence)
  redrawRTA(canvases.rta)
}

function redrawMagnitude(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(magnitudeCache)
  const range = finiteRange(entries.map((entry) => entry.magnitudeDb)) ?? { min: -1, max: 1 }
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.magnitudeDb, entry.color, range.min, range.max))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updateMagnitude(canvas: HTMLCanvasElement, payload: MagnitudePayload) {
  magnitudeCache.set(payload.uuid, payload)
  redrawMagnitude(canvas)
}

function redrawPhase(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(phaseCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.phaseDeg, entry.color, -180, 180, 180))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updatePhase(canvas: HTMLCanvasElement, payload: PhasePayload) {
  phaseCache.set(payload.uuid, payload)
  redrawPhase(canvas)
}

function redrawCoherence(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(coherenceCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.coherenceValue, entry.color, 0, 1))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updateCoherence(canvas: HTMLCanvasElement, payload: CoherencePayload) {
  coherenceCache.set(payload.uuid, payload)
  redrawCoherence(canvas)
}

function redrawRTA(canvas: HTMLCanvasElement) {
  drawGrid(canvas)
  const entries = visibleEntries(rtaCache)
  const range = finiteRange(entries.map((entry) => entry.levelDb)) ?? { min: -1, max: 1 }
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.levelDb, entry.color, range.min, range.max))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updateRTA(canvas: HTMLCanvasElement, payload: RTAPayload) {
  rtaCache.set(payload.uuid, payload)
  redrawRTA(canvas)
}

export function removeSource(uuid: string, canvases: ChartCanvases) {
  magnitudeCache.delete(uuid)
  phaseCache.delete(uuid)
  coherenceCache.delete(uuid)
  rtaCache.delete(uuid)
  redrawMagnitude(canvases.magnitude)
  redrawPhase(canvases.phase)
  redrawCoherence(canvases.coherence)
  redrawRTA(canvases.rta)
  if (spectrogramSourceUuid === uuid) {
    spectrogramSourceUuid = null
  }
}

// --- Spectrogram: 選択中1ソースのみ表示 ---

const SPECTROGRAM_ROWS = 51
const SPEC_LOWER = -70
const SPEC_UPPER = -10
const COLOR_BLUE: [number, number, number] = [33, 150, 243]
const COLOR_GREEN: [number, number, number] = [139, 195, 74]
const COLOR_YELLOW: [number, number, number] = [255, 235, 59]
const COLOR_RED: [number, number, number] = [244, 67, 54]

function mixColor(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i] + k * (b[i] - a[i])) as [number, number, number]
}

function spectrogramColor(db: number): string {
  if (db <= SPEC_LOWER) return 'rgb(0,0,0)'
  const seg = (SPEC_UPPER - SPEC_LOWER) / 3
  let rgb: [number, number, number]
  if (seg <= 0 || db >= SPEC_UPPER) {
    rgb = COLOR_RED
  } else if (db < SPEC_LOWER + seg) {
    rgb = mixColor(COLOR_BLUE, COLOR_GREEN, (db - SPEC_LOWER) / seg)
  } else if (db < SPEC_LOWER + 2 * seg) {
    rgb = mixColor(COLOR_GREEN, COLOR_YELLOW, (db - (SPEC_LOWER + seg)) / seg)
  } else {
    rgb = mixColor(COLOR_YELLOW, COLOR_RED, (db - (SPEC_LOWER + 2 * seg)) / seg)
  }
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`
}

let spectrogramSourceUuid: string | null = null

export function setSpectrogramSource(uuid: string, canvas: HTMLCanvasElement) {
  if (spectrogramSourceUuid === uuid) return
  spectrogramSourceUuid = uuid
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function updateSpectrogramRow(canvas: HTMLCanvasElement, payload: SpectrogramPayload) {
  if (spectrogramSourceUuid === null) {
    spectrogramSourceUuid = payload.uuid
  }
  if (payload.uuid !== spectrogramSourceUuid) return

  const ctx = canvas.getContext('2d')!
  const cw = canvas.width
  const ch = canvas.height
  const rowHeight = Math.max(1, Math.floor(ch / SPECTROGRAM_ROWS))

  if (ch > rowHeight) {
    const img = ctx.getImageData(0, 0, cw, ch - rowHeight)
    ctx.putImageData(img, 0, rowHeight)
  }

  const n = payload.frequency.length
  for (let i = 0; i < n; i++) {
    const prevX = i > 0 ? xForFreq(payload.frequency[i - 1], cw) : 0
    const curX = xForFreq(payload.frequency[i], cw)
    const nextX = i < n - 1 ? xForFreq(payload.frequency[i + 1], cw) : cw
    const xStart = i > 0 ? (prevX + curX) / 2 : 0
    const xEnd = i < n - 1 ? (curX + nextX) / 2 : cw
    ctx.fillStyle = spectrogramColor(payload.levelDb[i])
    ctx.fillRect(xStart, 0, Math.max(1, xEnd - xStart), rowHeight)
  }
}
