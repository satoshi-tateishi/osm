import './style.css'
import { renderSourceTree, type TreeItem } from './sourceTree'
import { channelReady, connectWebChannel } from './webchannel'

interface SeriesPayload {
  sourceName: string
  color: string
  frequency: number[]
}
interface MagnitudePayload extends SeriesPayload { magnitudeDb: (number | null)[] }
interface PhasePayload extends SeriesPayload { phaseDeg: (number | null)[] }
interface CoherencePayload extends SeriesPayload { coherenceValue: (number | null)[] }
interface RTAPayload extends SeriesPayload { levelDb: (number | null)[] }
interface SpectrogramPayload {
  sourceName: string
  frequency: number[]
  levelDb: number[]
}

const XMIN = 20
const XMAX = 20000
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="pane pane-left">
    <h2>Sources</h2>
    <p id="status">QWebChannel接続待ち...</p>
    <div id="source-tree"></div>
  </div>
  <div class="pane pane-center">
    <h2>Magnitude</h2>
    <canvas id="chart-magnitude" class="chart"></canvas>
    <h2>RTA</h2>
    <canvas id="chart-rta" class="chart"></canvas>
    <h2>Spectrogram</h2>
    <canvas id="chart-spectrogram" class="chart"></canvas>
    <h2>Phase</h2>
    <canvas id="chart-phase" class="chart"></canvas>
    <h2>Coherence</h2>
    <canvas id="chart-coherence" class="chart"></canvas>
  </div>
  <div class="pane pane-right">
    <h2>Settings</h2>
    <p class="placeholder">Phase 8で実装予定</p>
  </div>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const sourceTreeEl = document.querySelector<HTMLDivElement>('#source-tree')!
const centerPaneEl = document.querySelector<HTMLDivElement>('.pane-center')!
const canvases = {
  magnitude: document.querySelector<HTMLCanvasElement>('#chart-magnitude')!,
  rta: document.querySelector<HTMLCanvasElement>('#chart-rta')!,
  spectrogram: document.querySelector<HTMLCanvasElement>('#chart-spectrogram')!,
  phase: document.querySelector<HTMLCanvasElement>('#chart-phase')!,
  coherence: document.querySelector<HTMLCanvasElement>('#chart-coherence')!,
}

function resizeCanvas(canvas: HTMLCanvasElement, height: number) {
  const width = Math.max(1, centerPaneEl.clientWidth - 32)
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}
function resizeAll() {
  resizeCanvas(canvases.magnitude, 300)
  resizeCanvas(canvases.rta, 220)
  // canvasのサイズ変更でSpectrogramの描画履歴が消えることはPhase 4では許容する。
  resizeCanvas(canvases.spectrogram, 220)
  resizeCanvas(canvases.phase, 220)
  resizeCanvas(canvases.coherence, 160)
}
window.addEventListener('resize', resizeAll)
resizeAll()

function xForFreq(f: number, width: number) {
  return (Math.log(f) - Math.log(XMIN)) / Math.log(XMAX / XMIN) * width
}

// 汎用描画: 対数周波数軸 + ダークモード配色。
// wrapThreshold: 隣接点の差がこれを超えたら線を繋がず区切る(Phaseの±180度ラップ対策。既定は無効)。
function drawSeries(
  canvas: HTMLCanvasElement,
  frequency: number[],
  values: (number | null)[],
  color: string,
  yMin: number,
  yMax: number,
  label: string,
  wrapThreshold = Infinity
) {
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

  ctx.fillStyle = 'rgba(255,255,255,255)'
  ctx.font = '11px sans-serif'
  ctx.fillText(`${label}  ${yMax.toFixed(1)} .. ${yMin.toFixed(1)}`, 8, 14)

  ctx.restore()
}

function finiteRange(values: (number | null)[], padRatio = 0.1, fallbackPad = 1) {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!finite.length) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * padRatio || fallbackPad
  return { min: min - pad, max: max + pad }
}

function drawMagnitude(payload: MagnitudePayload) {
  const range = finiteRange(payload.magnitudeDb) ?? { min: -1, max: 1 }
  drawSeries(canvases.magnitude, payload.frequency, payload.magnitudeDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}

function drawPhase(payload: PhasePayload) {
  // 表示レンジは-180..180度で固定。±180度境界のラップは区切り線として扱う(wrapThreshold=180)。
  drawSeries(canvases.phase, payload.frequency, payload.phaseDeg, payload.color, -180, 180,
    `${payload.sourceName} deg`, 180)
}

function drawRTA(payload: RTAPayload) {
  const range = finiteRange(payload.levelDb) ?? { min: -1, max: 1 }
  drawSeries(canvases.rta, payload.frequency, payload.levelDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}

function drawCoherence(payload: CoherencePayload) {
  drawSeries(canvases.coherence, payload.frequency, payload.coherenceValue, payload.color, 0, 1,
    `${payload.sourceName} coherence`)
}

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

// src/chart/opengl/spectrogramseriesrenderer.cppの配色ロジックを移植。
// lower未満は背景色(黒)に揃えて見えなくする(元のalpha=0相当。putImageDataでの
// スクロール時に透明ピクセルだと過去の行が透けて残ってしまうため、透明ではなく
// 不透明な黒で塗る)。
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

// 新しい1行を最上部に追加し、既存の内容を1行分下へスクロールする。
// devicePixelRatioのscale変換はせず、Canvasの実ピクセル(canvas.width/height)を直接使う。
function drawSpectrogramRow(payload: SpectrogramPayload) {
  const canvas = canvases.spectrogram
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

connectWebChannel((message) => { statusEl.textContent = message })

channelReady.then(({ sourceTree, chartData }) => {
    sourceTree.treeChanged.connect((json: string) => {
      try {
        renderSourceTree(sourceTreeEl, JSON.parse(json) as TreeItem[])
      } catch (e) {
        console.error('treeChanged parse error', e)
      }
    })
    // Signals emitted during bridge construction precede the browser's
    // WebChannel connection, so explicitly request the initial snapshot.
    sourceTree.requestTree()

    chartData.magnitudeUpdated.connect((json: string) => {
      try {
        drawMagnitude(JSON.parse(json) as MagnitudePayload)
      } catch (e) {
        console.error('magnitudeUpdated parse error', e)
      }
    })
    chartData.phaseUpdated.connect((json: string) => {
      try {
        drawPhase(JSON.parse(json) as PhasePayload)
      } catch (e) {
        console.error('phaseUpdated parse error', e)
      }
    })
    chartData.coherenceUpdated.connect((json: string) => {
      try {
        drawCoherence(JSON.parse(json) as CoherencePayload)
      } catch (e) {
        console.error('coherenceUpdated parse error', e)
      }
    })
    chartData.rtaUpdated.connect((json: string) => {
      try {
        drawRTA(JSON.parse(json) as RTAPayload)
      } catch (e) {
        console.error('rtaUpdated parse error', e)
      }
    })
    chartData.spectrogramRowUpdated.connect((json: string) => {
      try {
        drawSpectrogramRow(JSON.parse(json) as SpectrogramPayload)
      } catch (e) {
        console.error('spectrogramRowUpdated parse error', e)
      }
    })
})
