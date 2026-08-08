declare const qt: any
declare const QWebChannel: any

export interface ChannelObjects {
  sourceList: any
  sourceTree: any
  chartData: any
}

let resolveObjects: (objects: ChannelObjects) => void
export const channelReady: Promise<ChannelObjects> = new Promise((resolve) => {
  resolveObjects = resolve
})

export function connectWebChannel(onStatus: (message: string) => void) {
  if (typeof qt === 'undefined' || !qt.webChannelTransport) {
    onStatus('qt.webChannelTransportが見つかりません(QWebEngineView外で開いていないか確認)')
    return
  }
  new QWebChannel(qt.webChannelTransport, (channel: any) => {
    const { sourceList, sourceTree, chartData } = channel.objects
    if (!sourceList || !sourceTree || !chartData) {
      onStatus('必要なチャンネルオブジェクト(sourceList/sourceTree/chartData)が見つかりません')
      return
    }
    onStatus('QWebChannel接続済み')
    resolveObjects({ sourceList, sourceTree, chartData })
  })
}
