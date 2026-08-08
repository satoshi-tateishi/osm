import './style.css'

interface SeriesPayload {
  sourceName: string
  color: string
  frequency: number[]
}
interface MagnitudePayload extends SeriesPayload { magnitudeDb: (number | null)[] }
interface PhasePayload extends SeriesPayload { phaseDeg: (number | null)[] }
interface CoherencePayload extends SeriesPayload { coherenceValue: (number | null)[] }
interface RTAPayload extends SeriesPayload { levelDb: (number | null)[] }

declare const qt: any
declare const QWebChannel: any

const XMIN = 20
const XMAX = 20000
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>OSM JS Frontend — Phase 3</h1>
  <p id="status">QWebChannel接続待ち...</p>
  <h2>Magnitude</h2>
  <canvas id="chart-magnitude" class="chart"></canvas>
  <h2>RTA</h2>
  <canvas id="chart-rta" class="chart"></canvas>
  <h2>Phase</h2>
  <canvas id="chart-phase" class="chart"></canvas>
  <h2>Coherence</h2>
  <canvas id="chart-coherence" class="chart"></canvas>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const canvases = {
  magnitude: document.querySelector<HTMLCanvasElement>('#chart-magnitude')!,
  rta: document.querySelector<HTMLCanvasElement>('#chart-rta')!,
  phase: document.querySelector<HTMLCanvasElement>('#chart-phase')!,
  coherence: document.querySelector<HTMLCanvasElement>('#chart-coherence')!,
}

function resizeCanvas(canvas: HTMLCanvasElement, height: number) {
  const width = Math.max(600, document.body.clientWidth - 48)
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}
function resizeAll() {
  resizeCanvas(canvases.magnitude, 300)
  resizeCanvas(canvases.rta, 220)
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

function connectWebChannel() {
  if (typeof qt === 'undefined' || !qt.webChannelTransport) {
    statusEl.textContent = 'qt.webChannelTransportが見つかりません(QWebEngineView外で開いていないか確認)'
    return
  }
  new QWebChannel(qt.webChannelTransport, (channel: any) => {
    const dataBridge = channel.objects.dataBridge
    if (!dataBridge) {
      statusEl.textContent = 'dataBridgeオブジェクトが見つかりません'
      return
    }
    statusEl.textContent = 'QWebChannel接続済み。データ待ち...'

    dataBridge.magnitudeUpdated.connect((json: string) => {
      try {
        drawMagnitude(JSON.parse(json) as MagnitudePayload)
      } catch (e) {
        console.error('magnitudeUpdated parse error', e)
      }
    })
    dataBridge.phaseUpdated.connect((json: string) => {
      try {
        drawPhase(JSON.parse(json) as PhasePayload)
      } catch (e) {
        console.error('phaseUpdated parse error', e)
      }
    })
    dataBridge.coherenceUpdated.connect((json: string) => {
      try {
        drawCoherence(JSON.parse(json) as CoherencePayload)
      } catch (e) {
        console.error('coherenceUpdated parse error', e)
      }
    })
    dataBridge.rtaUpdated.connect((json: string) => {
      try {
        drawRTA(JSON.parse(json) as RTAPayload)
      } catch (e) {
        console.error('rtaUpdated parse error', e)
      }
    })
  })
}

connectWebChannel()
