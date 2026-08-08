import { defineConfig } from 'vite'

// qrc:/経由で読み込むリリースビルドはドメインルートを持たないため、相対パスでビルドする。
// 開発サーバーのポートはQWebEngineViewの接続先(dev-docs/js-frontend-rewrite-plan.md 3.1節)と合わせて固定する。
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // qrc:/へ同梱する.qrcファイルを固定内容にできるよう、キャッシュバスティング用のハッシュを付けない
    // (アプリバイナリと一体で配布されるためブラウザキャッシュのハッシュ管理は不要)。
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
