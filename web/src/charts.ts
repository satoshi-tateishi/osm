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

// QML版(Chart::PaintedItem)のpadding(left:50, right:10, top:10, bottom:20)に合わせて
// Y軸ラベル用の左余白・X軸ラベル用の下余白を確保する。
const PADDING = { left: 50, right: 10, top: 10, bottom: 20 }

// QML版Palette(darkMode)の色に合わせる: lineColor rgba(255,255,255,40/255)、
// centerLineColor rgba(255,255,255,128/255)、textColor 白、背景 黒。
const GRID_LINE_COLOR = 'rgba(255,255,255,0.157)'
const GRID_MINOR_LINE_COLOR = 'rgba(255,255,255,0.078)'
const CENTER_LINE_COLOR = 'rgba(255,255,255,0.502)'
const TEXT_COLOR = 'rgba(255,255,255,255)'
const BACKGROUND_COLOR = '#000000'
const AXIS_FONT = '11px sans-serif'

interface AxisSpec {
  scaleType: 'log' | 'linear'
  min: number
  max: number
  labels: number[]
  centralLabel?: number
  minorGridStep?: number
}

// QML版PaintedItem::format()と同じ整形(1000以上は1000で割って"K"を付与、小数第1位で丸め)。
function axisFormat(v: number): string {
  let value = v
  let suffix = ''
  if (Math.abs(value) >= 1000) {
    value /= 1000
    suffix = 'K'
  }
  value = Math.round(value * 10) / 10
  return `${value}${suffix}`
}

const XMIN = 20
const XMAX = 20000
// QML版FrequencyBasedPlot::configureXAxis()のISO_LABELSと同じグリッド周波数。X軸範囲は20Hz-20kHzで固定。
const X_AXIS: AxisSpec = {
  scaleType: 'log',
  min: XMIN,
  max: XMAX,
  labels: [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
}

// QML版MagnitudePlot(dBモード既定表示 -12dB〜+12dB、3dB刻み、0dBを中心線)と同じ。
const MAGNITUDE_Y_AXIS: AxisSpec = {
  scaleType: 'linear',
  min: -12,
  max: 12,
  labels: [-12, -9, -6, -3, 0, 3, 6, 9, 12],
  centralLabel: 0,
}

// QML版PhasePlot(既定表示 -180°〜+180°、45°刻み、0°を中心線)と同じ。
const PHASE_Y_AXIS: AxisSpec = {
  scaleType: 'linear',
  min: -180,
  max: 180,
  labels: [-180, -135, -90, -45, 0, 45, 90, 135, 180],
  centralLabel: 0,
}

// QML版CoherencePlot(Normalモード、0〜1、0.2刻み)と同じ。
const COHERENCE_Y_AXIS: AxisSpec = {
  scaleType: 'linear',
  min: 0,
  max: 1,
  labels: [0, 0.2, 0.4, 0.6, 0.8, 1],
}

// QML版RTAPlot(DBfsモード既定表示 -70dB〜0dB、10dB刻み、5dB刻みの補助線)と同じ。
const RTA_Y_AXIS: AxisSpec = {
  scaleType: 'linear',
  min: -70,
  max: 0,
  labels: [-70, -60, -50, -40, -30, -20, -10, 0],
  minorGridStep: 5,
}

function axisCoord(spec: AxisSpec, value: number, size: number): number {
  if (spec.scaleType === 'log') {
    return size * (Math.log(value) - Math.log(spec.min)) / Math.log(spec.max / spec.min)
  }
  return size * (value - spec.min) / (spec.max - spec.min)
}

function valueToX(spec: AxisSpec, value: number, cw: number): number {
  const plotWidth = cw - PADDING.left - PADDING.right
  return PADDING.left + axisCoord(spec, value, plotWidth)
}

function valueToY(spec: AxisSpec, value: number, ch: number): number {
  const plotHeight = ch - PADDING.top - PADDING.bottom
  return ch - PADDING.bottom - axisCoord(spec, value, plotHeight)
}

function xForFreq(f: number, cw: number) {
  return valueToX(X_AXIS, f, cw)
}

// QML版Axis::paint()相当: グリッド線とラベルを描画する。
function drawAxes(ctx: CanvasRenderingContext2D, cw: number, ch: number, xSpec: AxisSpec, ySpec: AxisSpec, xGridVisible = true) {
  const plotLeft = PADDING.left
  const plotRight = cw - PADDING.right
  const plotTop = PADDING.top
  const plotBottom = ch - PADDING.bottom

  ctx.font = AXIS_FONT

  if (ySpec.minorGridStep) {
    ctx.strokeStyle = GRID_MINOR_LINE_COLOR
    ctx.lineWidth = 1
    const start = Math.ceil(ySpec.min / ySpec.minorGridStep) * ySpec.minorGridStep
    for (let v = start; v <= ySpec.max; v += ySpec.minorGridStep) {
      const y = valueToY(ySpec, v, ch)
      ctx.beginPath()
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(plotRight, y)
      ctx.stroke()
    }
  }

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ySpec.labels.forEach((v) => {
    const y = valueToY(ySpec, v, ch)
    ctx.strokeStyle = ySpec.centralLabel !== undefined && v === ySpec.centralLabel ? CENTER_LINE_COLOR : GRID_LINE_COLOR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plotLeft, y)
    ctx.lineTo(plotRight, y)
    ctx.stroke()

    ctx.fillStyle = TEXT_COLOR
    ctx.fillText(axisFormat(v), plotLeft - 5, y)
  })

  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  let lastLabelRight = -Infinity
  xSpec.labels.forEach((v) => {
    const x = valueToX(xSpec, v, cw)
    if (xGridVisible) {
      ctx.strokeStyle = GRID_LINE_COLOR
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, plotTop)
      ctx.lineTo(x, plotBottom)
      ctx.stroke()
    }
    const label = axisFormat(v)
    const labelWidth = ctx.measureText(label).width
    if (x - labelWidth / 2 <= lastLabelRight) {
      return
    }
    ctx.fillStyle = TEXT_COLOR
    ctx.fillText(label, x, plotBottom + 2)
    lastLabelRight = x + labelWidth / 2
  })
}

function drawChartBackground(canvas: HTMLCanvasElement, ySpec: AxisSpec, xGridVisible = true) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, cw, ch)
  drawAxes(ctx, cw, ch, X_AXIS, ySpec, xGridVisible)
  ctx.restore()
}

// wrapThreshold: 隣接点の差がこれを超えたら線を繋がず区切る(Phaseの±180度ラップ対策)。
function drawOneSeries(
  canvas: HTMLCanvasElement,
  frequency: number[],
  values: (number | null)[],
  color: string,
  ySpec: AxisSpec,
  wrapThreshold = Infinity
) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.beginPath()
  ctx.rect(PADDING.left, PADDING.top, cw - PADDING.left - PADDING.right, ch - PADDING.top - PADDING.bottom)
  ctx.clip()

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
    const y = valueToY(ySpec, v, ch)
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
  const x0 = PADDING.left + 8
  entries.forEach((entry, i) => {
    const y = PADDING.top + 10 + i * 13
    ctx.fillStyle = entry.color || '#3F51B5'
    ctx.fillRect(x0, y - 8, 8, 8)
    ctx.fillStyle = 'rgba(255,255,255,255)'
    ctx.fillText(entry.name, x0 + 12, y)
  })
  ctx.restore()
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
  drawChartBackground(canvas, MAGNITUDE_Y_AXIS)
  const entries = visibleEntries(magnitudeCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.magnitudeDb, entry.color, MAGNITUDE_Y_AXIS))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updateMagnitude(canvas: HTMLCanvasElement, payload: MagnitudePayload) {
  magnitudeCache.set(payload.uuid, payload)
  redrawMagnitude(canvas)
}

function redrawPhase(canvas: HTMLCanvasElement) {
  drawChartBackground(canvas, PHASE_Y_AXIS)
  const entries = visibleEntries(phaseCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.phaseDeg, entry.color, PHASE_Y_AXIS, 180))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updatePhase(canvas: HTMLCanvasElement, payload: PhasePayload) {
  phaseCache.set(payload.uuid, payload)
  redrawPhase(canvas)
}

function redrawCoherence(canvas: HTMLCanvasElement) {
  drawChartBackground(canvas, COHERENCE_Y_AXIS)
  const entries = visibleEntries(coherenceCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.coherenceValue, entry.color, COHERENCE_Y_AXIS))
  drawLegend(canvas, entries.map((entry) => ({ color: entry.color, name: entry.sourceName })))
}
export function updateCoherence(canvas: HTMLCanvasElement, payload: CoherencePayload) {
  coherenceCache.set(payload.uuid, payload)
  redrawCoherence(canvas)
}

function redrawRTA(canvas: HTMLCanvasElement) {
  drawChartBackground(canvas, RTA_Y_AXIS)
  const entries = visibleEntries(rtaCache)
  entries.forEach((entry) => drawOneSeries(canvas, entry.frequency, entry.levelDb, entry.color, RTA_Y_AXIS))
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

// 初期表示・リサイズ後にキャッシュ済みデータ(なければ軸のみ)を再描画する。
export function redrawAll(canvases: ChartCanvases) {
  redrawMagnitude(canvases.magnitude)
  redrawPhase(canvases.phase)
  redrawCoherence(canvases.coherence)
  redrawRTA(canvases.rta)
  drawSpectrogramFrame(canvases.spectrogram)
}

// --- Spectrogram: 選択中1ソースのみ表示 ---

const SPECTROGRAM_ROWS = 51
// QML版SpectrogramPlotのDEFAULT_DB_LOWER/DEFAULT_DB_UPPERと同じ既定値。しきい値スライダー(spectrogramThresholds.ts)で変更可能。
let spectrogramLower = -70
let spectrogramUpper = -10
const COLOR_BLUE: [number, number, number] = [33, 150, 243]
const COLOR_GREEN: [number, number, number] = [139, 195, 74]
const COLOR_YELLOW: [number, number, number] = [255, 235, 59]
const COLOR_RED: [number, number, number] = [244, 67, 54]

export function setSpectrogramThresholds(lower: number, upper: number) {
  spectrogramLower = lower
  spectrogramUpper = upper
}

function mixColor(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i] + k * (b[i] - a[i])) as [number, number, number]
}

function spectrogramColor(db: number): string {
  if (db <= spectrogramLower) return 'rgb(0,0,0)'
  const seg = (spectrogramUpper - spectrogramLower) / 3
  let rgb: [number, number, number]
  if (seg <= 0 || db >= spectrogramUpper) {
    rgb = COLOR_RED
  } else if (db < spectrogramLower + seg) {
    rgb = mixColor(COLOR_BLUE, COLOR_GREEN, (db - spectrogramLower) / seg)
  } else if (db < spectrogramLower + 2 * seg) {
    rgb = mixColor(COLOR_GREEN, COLOR_YELLOW, (db - (spectrogramLower + seg)) / seg)
  } else {
    rgb = mixColor(COLOR_YELLOW, COLOR_RED, (db - (spectrogramLower + 2 * seg)) / seg)
  }
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`
}

let spectrogramSourceUuid: string | null = null

// 背景を塗り直し、X軸(周波数)のラベルのみ描画する(QML版はSpectrogramでm_x.setGridVisible(false)のため縦グリッド線は表示しない)。
function drawSpectrogramFrame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, cw, ch)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.font = AXIS_FONT
  const plotBottom = ch - PADDING.bottom
  let lastLabelRight = -Infinity
  X_AXIS.labels.forEach((v) => {
    const x = valueToX(X_AXIS, v, cw)
    const label = axisFormat(v)
    const labelWidth = ctx.measureText(label).width
    if (x - labelWidth / 2 <= lastLabelRight) {
      return
    }
    ctx.fillStyle = TEXT_COLOR
    ctx.fillText(label, x, plotBottom + 2)
    lastLabelRight = x + labelWidth / 2
  })
  ctx.restore()
}

export function setSpectrogramSource(uuid: string, canvas: HTMLCanvasElement) {
  if (spectrogramSourceUuid === uuid) return
  spectrogramSourceUuid = uuid
  drawSpectrogramFrame(canvas)
}

export function updateSpectrogramRow(canvas: HTMLCanvasElement, payload: SpectrogramPayload) {
  if (spectrogramSourceUuid === null) {
    spectrogramSourceUuid = payload.uuid
  }
  if (payload.uuid !== spectrogramSourceUuid) return

  const ctx = canvas.getContext('2d')!
  const dpr = devicePixelRatio
  const padLeft = PADDING.left * dpr
  const padRight = PADDING.right * dpr
  const padTop = PADDING.top * dpr
  const padBottom = PADDING.bottom * dpr
  const plotW = canvas.width - padLeft - padRight
  const plotH = canvas.height - padTop - padBottom
  const rowHeight = Math.max(1, Math.floor(plotH / SPECTROGRAM_ROWS))

  // QML版は新しいデータが下端から入り、時間経過とともに上へ流れる(SpectrogramSeriesRendererのY軸方向)。
  // それに合わせ、既存の行を上へシフトし、新しい行を下端に描画する。
  if (plotH > rowHeight) {
    const img = ctx.getImageData(padLeft, padTop + rowHeight, plotW, plotH - rowHeight)
    ctx.putImageData(img, padLeft, padTop)
  }
  const rowY = padTop + plotH - rowHeight

  const n = payload.frequency.length
  for (let i = 0; i < n; i++) {
    const prevX = i > 0 ? axisCoord(X_AXIS, payload.frequency[i - 1], plotW) : 0
    const curX = axisCoord(X_AXIS, payload.frequency[i], plotW)
    const nextX = i < n - 1 ? axisCoord(X_AXIS, payload.frequency[i + 1], plotW) : plotW
    const xStart = i > 0 ? (prevX + curX) / 2 : 0
    const xEnd = i < n - 1 ? (curX + nextX) / 2 : plotW
    ctx.fillStyle = spectrogramColor(payload.levelDb[i])
    ctx.fillRect(padLeft + xStart, rowY, Math.max(1, xEnd - xStart), rowHeight)
  }
}
