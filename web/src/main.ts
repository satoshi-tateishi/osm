import './style.css'

interface MagnitudePayload {
  sourceName: string
  color: string
  frequency: number[]
  magnitudeDb: number[]
}

declare const qt: any
declare const QWebChannel: any

const XMIN = 20
const XMAX = 20000

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>OSM JS Frontend — Magnitude (Phase 1)</h1>
  <p id="status">QWebChannel接続待ち...</p>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const canvas = document.createElement('canvas')
canvas.id = 'chart'
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas)

function resizeCanvas() {
  const width = Math.max(600, document.body.clientWidth - 48)
  canvas.width = width * devicePixelRatio
  canvas.height = 400 * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = '400px'
}
window.addEventListener('resize', resizeCanvas)
resizeCanvas()

function xForFreq(f: number, width: number) {
  return (Math.log(f) - Math.log(XMIN)) / Math.log(XMAX / XMIN) * width
}

function drawMagnitude(payload: MagnitudePayload) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  // ダークモード配色: src/chart/palette.cpp の Palette::initColors() dark分岐に合わせる
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)

  ctx.strokeStyle = 'rgba(255,255,255,0.157)'
  ctx.lineWidth = 1
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const x = xForFreq(f, cw)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }

  if (!payload.frequency.length) {
    ctx.restore()
    return
  }

  const magMin = Math.min(...payload.magnitudeDb)
  const magMax = Math.max(...payload.magnitudeDb)
  const pad = (magMax - magMin) * 0.1 || 1
  const yMin = magMin - pad
  const yMax = magMax + pad
  const yForDb = (db: number) => ch - (db - yMin) / (yMax - yMin) * ch

  ctx.strokeStyle = payload.color || '#3F51B5'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  payload.frequency.forEach((f, idx) => {
    const x = xForFreq(f, cw)
    const y = yForDb(payload.magnitudeDb[idx])
    if (idx === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,255)'
  ctx.font = '11px sans-serif'
  ctx.fillText(`${payload.sourceName}  ${yMax.toFixed(1)} .. ${yMin.toFixed(1)} dB`, 8, 14)

  ctx.restore()
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
        const payload = JSON.parse(json) as MagnitudePayload
        statusEl.textContent = `${payload.sourceName}: ${payload.frequency.length}点`
        drawMagnitude(payload)
      } catch (e) {
        console.error('magnitudeUpdated parse error', e)
      }
    })
  })
}

connectWebChannel()
