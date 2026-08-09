// QML版qml/Plot/SpectrogramThresholds.qmlの移植: Lower/Upperしきい値を操作する
// 縦方向のカラーグラデーションバー+ドラッグ可能なハンドル。

const DB_MIN = -80
const DB_MAX = 0
const MIN_GAP = 3
const BAR_TOP = 10
const BAR_BOTTOM_MARGIN = 20

export function setupSpectrogramThresholds(
  container: HTMLElement,
  onChange: (lower: number, upper: number) => void,
) {
  let lower = -70
  let upper = -10

  container.innerHTML = `
    <div class="spectrogram-thresholds-bar" data-spec-bar></div>
    <div class="spectrogram-thresholds-handle spectrogram-thresholds-handle-lower" data-spec-lower>&#9650;</div>
    <div class="spectrogram-thresholds-handle spectrogram-thresholds-handle-upper" data-spec-upper>&#9660;</div>
    <div class="spectrogram-thresholds-label spectrogram-thresholds-label-lower" data-spec-lower-label></div>
    <div class="spectrogram-thresholds-label spectrogram-thresholds-label-upper" data-spec-upper-label></div>
  `
  const barEl = container.querySelector<HTMLDivElement>('[data-spec-bar]')!
  const lowerHandleEl = container.querySelector<HTMLDivElement>('[data-spec-lower]')!
  const upperHandleEl = container.querySelector<HTMLDivElement>('[data-spec-upper]')!
  const lowerLabelEl = container.querySelector<HTMLDivElement>('[data-spec-lower-label]')!
  const upperLabelEl = container.querySelector<HTMLDivElement>('[data-spec-upper-label]')!

  function barBounds() {
    const barBottom = container.clientHeight - BAR_BOTTOM_MARGIN
    return { barTop: BAR_TOP, barBottom, barHeight: Math.max(1, barBottom - BAR_TOP) }
  }
  function posOf(value: number): number {
    return Math.max(0, Math.min(1, (DB_MAX - value) / (DB_MAX - DB_MIN)))
  }
  function valueToY(value: number): number {
    const { barBottom, barHeight } = barBounds()
    return barBottom - barHeight * (value - DB_MIN) / (DB_MAX - DB_MIN)
  }
  function yToValue(y: number): number {
    const { barBottom, barHeight } = barBounds()
    return DB_MIN + (DB_MAX - DB_MIN) * (barBottom - y) / barHeight
  }

  function render() {
    const seg = Math.max(0.001, (upper - lower) / 3)
    const mid1 = lower + seg
    const mid2 = upper - seg
    const posUpper = posOf(upper) * 100
    const posMid2 = Math.max(posUpper, posOf(mid2) * 100)
    const posMid1 = Math.max(posMid2, posOf(mid1) * 100)
    const posLower = Math.max(posMid1, posOf(lower) * 100)
    const posLowerEdge = Math.min(100, posLower + 0.1)
    barEl.style.background = `linear-gradient(to bottom,
      #F44336 0%, #F44336 ${posUpper}%,
      #FFEB3B ${posMid2}%,
      #8BC34A ${posMid1}%,
      #2196F3 ${posLower}%,
      transparent ${posLowerEdge}%, transparent 100%)`

    lowerHandleEl.style.top = `${valueToY(lower) - 8}px`
    upperHandleEl.style.top = `${valueToY(upper) - 8}px`
    lowerHandleEl.title = `${lower}dB`
    upperHandleEl.title = `${upper}dB`

    lowerLabelEl.style.top = `${valueToY(lower) - 8}px`
    upperLabelEl.style.top = `${valueToY(upper) - 8}px`
    lowerLabelEl.textContent = `${lower}dB`
    upperLabelEl.textContent = `${upper}dB`
  }

  function setLower(v: number) {
    lower = Math.max(DB_MIN, Math.min(upper - MIN_GAP, Math.round(v)))
  }
  function setUpper(v: number) {
    upper = Math.max(lower + MIN_GAP, Math.min(DB_MAX, Math.round(v)))
  }

  function bindDrag(handleEl: HTMLDivElement, apply: (v: number) => void) {
    handleEl.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      handleEl.setPointerCapture(event.pointerId)
      const onMove = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        apply(yToValue(moveEvent.clientY - rect.top))
        render()
        onChange(lower, upper)
      }
      const onUp = () => {
        handleEl.removeEventListener('pointermove', onMove)
        handleEl.removeEventListener('pointerup', onUp)
      }
      handleEl.addEventListener('pointermove', onMove)
      handleEl.addEventListener('pointerup', onUp)
    })
  }
  bindDrag(lowerHandleEl, setLower)
  bindDrag(upperHandleEl, setUpper)

  render()
  onChange(lower, upper)

  window.addEventListener('resize', render)
}
