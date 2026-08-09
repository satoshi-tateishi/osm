# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語について

このリポジトリで作業する際は、常に日本語で応答してください。コメントやコミットメッセージなど、明示的に別の指示がない限り日本語を使用してください。

## プロジェクト概要

Open Sound Meter (OpenSoundMeter) — Qt 5.15 / C++17製のクロスプラットフォーム音響測定ソフトウェア(`OpenSoundMeter.pro`がビルドのエントリポイント)。対応OS: macOS, Windows, Linux。

## macOSでのビルド方法(このMac: macOS 12.7.4 / Apple Silicon)

このMacはmacOS 12.7.4(Monterey)のため、Homebrewの`qt@5`はbottleが提供されずソースビルドになり、かつフルXcode.appが必須(Command Line Toolsのみでは`qt@5: A full installation of Xcode.app is required`で失敗する)。そのため`aqtinstall`でQt公式のビルド済みバイナリ(x86_64、`clang_64`キット)を取得している。

- Qt本体: `aqtinstall`で`~/Qt/5.15.2/clang_64`に導入済み(`pip install --user aqtinstall`はHomebrewのpython@3.14ではなく`/usr/bin/python3`のpipで実行すること。Homebrewのpython@3.14はmacOS 12を"サポート外"としてensurepip/venvが失敗する)
- ビルドは**必ずシャドウビルド(`build/`ディレクトリ)で行うこと**。rootでqmakeするとソースツリー内に大量の`.o`/`moc_*.cpp`/`Makefile`等が生成され散らかる(`build/`は`.gitignore`済み):
  ```
  mkdir -p build && cd build
  ~/Qt/5.15.2/clang_64/bin/qmake ../OpenSoundMeter.pro
  make -j$(sysctl -n hw.ncpu)
  ```
- 実行: `open build/OpenSoundMeter.app`
- **注意: 現状のビルドはx86_64バイナリ**(`lipo -info`で確認可能)。Apple SiliconではRosetta 2経由で動作する。測定用途のDSP処理はRosetta 2でも実用上問題なし。
- ネイティブarm64バイナリが必要な場合: フルXcode.app(App Store)をインストールした上で`brew install qt@5`(ソースビルド、数時間規模)してから同様にqmake/makeする。Homebrewは実行環境(arm64)向けにネイティブビルドするため、この経路でのみarm64ネイティブになる。
- `.pro`内の`GRAPH_BACKEND`環境変数で描画バックエンドを切替可能(デフォルト`OPENGL`、`METAL`指定でMetal使用・フルXcode推奨)。

### 機能修正後の動作確認手順

機能修正・バグ修正のあとにアプリを起動して動作確認する際は、必ず以下の順序で行うこと:

1. `OpenSoundMeter.app`が起動中であれば終了する
2. ビルドする(上記のシャドウビルド手順)
3. `open build/OpenSoundMeter.app`で起動する
4. ユーザーに確認してもらう

起動中のまま`make`だけ実行すると、ソースに差分がない場合は`make`が何もせず終わる(`Nothing to be done`)ため、「起動中だから反映されなかった」と誤解しやすい。実際は単にビルド対象がなかっただけだが、確認しているものが確実に最新ビルドであると保証するため、この順序を徹底する。

### フロントエンドの起動方法

環境変数なしの通常起動ではJS版がデフォルトUIとして表示され、QML版はメニューバー等のインフラを提供するため裏で読み込まれるがウィンドウは非表示になる。Vite開発サーバーを使う場合は、別ターミナルで`cd web && npm run dev`を起動し、`OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`を実行する。qrc同梱版は先に`cd web && npm run build`してアプリを再ビルドする。従来のQML版だけを表示する場合は`OSM_JS_FRONTEND_DISABLE=1`、JS版とQML版を同時表示して比較する場合は`OSM_QML_FRONTEND=1`を付ける。

## このフォークでの変更点(本家との差分)

このフォークは開発に不要なファイルを整理済み。本家に追従する際はこの差分を意識すること。詳細な一覧・変更理由は[dev-docs/customizations.md](dev-docs/customizations.md)を参照。

- 削除: `overview.key`(41MBのKeynote資料)、`.travis.yml`(未使用のTravis CI設定)、`.github/FUNDING.yml`(本家作者への寄付リンク)、`CONTRIBUTING`(本家への貢献ガイド)、`PVS-Studio.pri`(有料静的解析ツール連携)、`future.tasks`(本家作者の個人メモ)、`docs/`(公開サイトのJekyllソース)
- `OpenSoundMeter.pro`から上記`PVS-Studio.pri`のinclude・`pvs_studio`ターゲット、および`DISTFILES`中の`future.tasks`/`list.tasks`(実体が存在しなかった)を削除

## 機能の修正・変更時の記録について

アプリの挙動・機能を修正/変更したときは、必ず[dev-docs/customizations.md](dev-docs/customizations.md)に変更内容と理由を追記すること(何を・なぜ変更したかが分かるように)。測定タイプの設定項目など仕様そのものを調査した場合は[dev-docs/measurement-types.md](dev-docs/measurement-types.md)側を更新する。コードのコメントだけに頼らず、`dev-docs/`にまとまった記録を残すことで、本家との差分把握や将来の変更理由の追跡をしやすくする。

## コミット・pushについて

このプロジェクトは個人開発のため、コミットとpushは連動して構わない(pushの都度、都度の承認確認は不要)。ユーザーから明示的に「コミットして」「pushして」と指示された場合は、通常のgit安全プロトコル(force push等の破壊的操作の回避、コミットメッセージの作法など)に従いつつ、コミット後に続けてpushしてよい。
