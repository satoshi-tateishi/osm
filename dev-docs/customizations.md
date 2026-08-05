# このフォークでのカスタマイズ一覧

本家(upstream: `satoshi-tateishi/osm`の元になった`opensoundmeter/osm`)から変更した内容の記録。本家に追従(rebase/merge)する際や、変更理由を思い出すために参照する。

## リポジトリ整理

- `docs/`(opensoundmeter.com公開用のJekyllサイト)を削除。このフォークでは公開サイトを運用しないため不要。(`add62f7`)
- 開発に不要なファイルを削除: `overview.key`(41MBのKeynote)、`.travis.yml`(未使用のTravis CI設定)、`.github/FUNDING.yml`(本家作者への寄付リンク)、`CONTRIBUTING`(本家への貢献ガイド)、`PVS-Studio.pri`(有料静的解析ツール連携、`OpenSoundMeter.pro`の該当ブロックも削除)、`future.tasks`(本家作者の個人メモ)。(`0d45a8b`)
- ビルドは`build/`ディレクトリでのシャドウビルドに統一(`.gitignore`に`/build/`を追加)。in-sourceビルドでルート直下が`.o`/`moc_*.cpp`等で汚れる問題への対応。
- `CLAUDE.md`を新設し、Claude Codeがこのリポジトリで作業する際は日本語で応答する旨、およびmacOS(Apple Silicon / macOS 12.7.4)でのビルド手順を明記。(`0d45a8b`)
- `dev-docs/`を新設し、開発用ドキュメント(本ファイル、測定タイプの仕様調査など)の置き場とした。

## 起動時の挙動変更

- 起動時に毎回表示されていたAboutダイアログ(アプリ紹介ポップアップ)を無効化。`src/common/appearance.cpp`の`Appearance::showAboutOnStartup()`を常に`false`を返すように変更。(`3ec64ec`)
- 起動時に自動実行されていたアップデート確認(`Your version (...) is different then the latest release.`ダイアログ)を無効化。`qml/Updater.qml`の`Component.onCompleted`(自動チェック処理)を削除。手動でのチェック機能(`show()`関数)自体は残置。(`3ec64ec`)

これらは元々、gitタグが存在しないビルド(`APP_GIT_VERSION`が空文字)だと本家サーバー上の最新リリースと必ず不一致になり、毎回ポップアップが出てしまう問題への対応でもある。

## Magnitude測定のカスタマイズ

`src/chart/magnitudeplot.h` / `.cpp`、`qml/Plot/MagnitudeProperties.qml`

- **Y axis modeを`dB`固定化**: `Linear`/`Impedance`モードの切り替えUI(コンボボックス)と、`Impedance`モード専用だった`Sensor resistance`入力欄を削除。`MagnitudePlot::setSettings()`でも保存済み設定から`mode`を復元しないようにした(常にコンストラクタ既定値の`dB`のまま)。
- **デフォルトの軸範囲を変更**:
  - X軸: `20Hz〜20,000Hz` → `40Hz〜20,000Hz`(`MagnitudePlot`コンストラクタで`m_x.setReset(40.f, 20'000.f)`)
  - Y軸(dBモード): `-18dB〜18dB` → `-12dB〜12dB`(`MagnitudePlot::setMode()`のdBケースで`m_y.setReset(-12.f, 12.f)`)
- **軸範囲入力欄の小数点表示を廃止**: `x from`/`x to`/`y from`/`y to`の`FloatSpinBox`に`decimals: 0`を指定し、整数表示に統一。

測定タイプごとの設定項目の詳細は[measurement-types.md](measurement-types.md)を参照。
