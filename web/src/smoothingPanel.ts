const PPO_VALUES = [1, 3, 6, 12, 24, 48]
const PPO_LABELS = ['1/1 oct', '1/3 oct', '1/6 oct', '1/12 oct', '1/24 oct', '1/48 oct']

export function setupSmoothingPanel(container: HTMLElement, globalSmoothing: any) {
  container.innerHTML = `
    <select class="smoothing-select" data-smoothing-select>
      ${PPO_VALUES.map((value, i) => `<option value="${value}">${PPO_LABELS[i]}</option>`).join('')}
    </select>
  `

  const selectEl = container.querySelector<HTMLSelectElement>('[data-smoothing-select]')!

  function syncFromGlobalSmoothing() {
    selectEl.value = String(globalSmoothing.pointsPerOctave)
  }
  syncFromGlobalSmoothing()
  globalSmoothing.pointsPerOctaveChanged.connect(syncFromGlobalSmoothing)

  selectEl.addEventListener('change', () => {
    globalSmoothing.pointsPerOctave = Number(selectEl.value)
  })
}
