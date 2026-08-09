import './style.css'
import * as charts from './charts'
import { renderMeasurementList, updateMeasurementMeter, type MeasurementItem } from './measurementList'
import { renderSourceTree, type TreeItem } from './sourceTree'
import { renderSettingsPanel, renderMeter, type SettingsPayload, type MeterPayload } from './settingsPanel'
import { channelReady, connectWebChannel } from './webchannel'
import { setupGeneratorPanel } from './generatorPanel'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="pane pane-left">
    <h2>Session Data</h2>
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
    <h2>Transfer Function</h2>
    <div id="measurement-list"></div>
    <h2>Settings</h2>
    <div id="settings-panel"><p class="placeholder">左のリストからソースを選択してください</p></div>
    <h2>Generator</h2>
    <div id="generator-panel"></div>
  </div>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const sourceTreeEl = document.querySelector<HTMLDivElement>('#source-tree')!
const measurementListEl = document.querySelector<HTMLDivElement>('#measurement-list')!
const settingsPanelEl = document.querySelector<HTMLDivElement>('#settings-panel')!
const generatorPanelEl = document.querySelector<HTMLDivElement>('#generator-panel')!
const centerPaneEl = document.querySelector<HTMLDivElement>('.pane-center')!
const canvases: charts.ChartCanvases = {
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
  resizeCanvas(canvases.spectrogram, 220)
  resizeCanvas(canvases.phase, 220)
  resizeCanvas(canvases.coherence, 160)
}
window.addEventListener('resize', resizeAll)
resizeAll()

connectWebChannel((message) => { statusEl.textContent = message })

channelReady.then(({ sourceTree, chartData, settings, generator, outputDevices }) => {
  let currentSettingsUuid: string | null = null

  function renderPanel(payload: SettingsPayload) {
    currentSettingsUuid = payload.uuid
    renderSettingsPanel(settingsPanelEl, payload, {
      onChange: (name, value) => {
        const enumSetters: Record<string, string> = {
          mode: 'setMode',
          averageType: 'setAverageType',
          filtersFrequency: 'setFiltersFrequency',
          inputFilter: 'setInputFilter',
        }
        const setter = enumSetters[name]
        if (setter) {
          settings[setter](payload.uuid, value)
        } else {
          settings.setProperty(payload.uuid, name, value)
        }
      },
      onResetAverage: () => settings.resetAverage(payload.uuid),
      onStore: () => settings.store(payload.uuid),
    })
  }

  sourceTree.treeChanged.connect((json: string) => {
    let items: TreeItem[]
    try {
      items = JSON.parse(json) as TreeItem[]
    } catch (error) {
      console.error('treeChanged parse error', error)
      return
    }
    const measurementItems: MeasurementItem[] = items.filter((item) => item.type === 'Measurement')
    const sessionItems = items.filter((item) => item.type !== 'Measurement')

    renderSourceTree(sourceTreeEl, sessionItems, {
      onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
    })
    renderMeasurementList(measurementListEl, measurementItems, {
      onToggleActive: (uuid, active) => sourceTree.setActive(uuid, active),
      onSelect: (uuid) => {
        charts.setSpectrogramSource(uuid, canvases.spectrogram)
        settings.selectSource(uuid)
      },
    })
    charts.setActiveUuids(new Set(items.filter((item) => item.active).map((item) => item.uuid)), canvases)
  })
  sourceTree.requestTree()

  settings.settingsChanged.connect((json: string) => {
    try { renderPanel(JSON.parse(json) as SettingsPayload) } catch (error) { console.error('settingsChanged parse error', error) }
  })

  chartData.levelUpdated.connect((json: string) => {
    let payload: MeterPayload
    try {
      payload = JSON.parse(json) as MeterPayload
    } catch (error) {
      console.error('levelUpdated parse error', error)
      return
    }
    updateMeasurementMeter(measurementListEl, payload.uuid, payload)
    if (payload.uuid === currentSettingsUuid) {
      renderMeter(payload)
    }
  })

  chartData.magnitudeUpdated.connect((json: string) => {
    try { charts.updateMagnitude(canvases.magnitude, JSON.parse(json)) } catch (error) { console.error('magnitudeUpdated parse error', error) }
  })
  chartData.phaseUpdated.connect((json: string) => {
    try { charts.updatePhase(canvases.phase, JSON.parse(json)) } catch (error) { console.error('phaseUpdated parse error', error) }
  })
  chartData.coherenceUpdated.connect((json: string) => {
    try { charts.updateCoherence(canvases.coherence, JSON.parse(json)) } catch (error) { console.error('coherenceUpdated parse error', error) }
  })
  chartData.rtaUpdated.connect((json: string) => {
    try { charts.updateRTA(canvases.rta, JSON.parse(json)) } catch (error) { console.error('rtaUpdated parse error', error) }
  })
  chartData.spectrogramRowUpdated.connect((json: string) => {
    try { charts.updateSpectrogramRow(canvases.spectrogram, JSON.parse(json)) } catch (error) { console.error('spectrogramRowUpdated parse error', error) }
  })
  chartData.sourceRemoved.connect((uuid: string) => {
    charts.removeSource(uuid, canvases)
    if (currentSettingsUuid === uuid) {
      renderPanel({ uuid: null })
    }
  })

  setupGeneratorPanel(generatorPanelEl, generator, outputDevices)
})
