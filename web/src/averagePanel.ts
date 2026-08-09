const AVERAGE_VALUES = [1, 2, 3, 4]
const AVERAGE_LABELS = ['1s', '2s', '3s', '4s']

export function setupAveragePanel(container: HTMLElement, globalAverage: any) {
  container.innerHTML = `
    <select class="smoothing-select" data-average-select>
      ${AVERAGE_VALUES.map((value, i) => `<option value="${value}">${AVERAGE_LABELS[i]}</option>`).join('')}
    </select>
  `

  const selectEl = container.querySelector<HTMLSelectElement>('[data-average-select]')!

  function syncFromGlobalAverage() {
    selectEl.value = String(globalAverage.seconds)
  }
  syncFromGlobalAverage()
  globalAverage.secondsChanged.connect(syncFromGlobalAverage)

  selectEl.addEventListener('change', () => {
    globalAverage.seconds = Number(selectEl.value)
  })
}
