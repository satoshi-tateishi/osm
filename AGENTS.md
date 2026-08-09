# AGENT.md

このファイルは、このリポジトリで作業する AI コーディングエージェント向けのガイドです。

## 言語について

このリポジトリで作業する際は、常に日本語で応答してください。コメントやコミットメッセージなども、明示的に別の指示がない限り日本語を使用してください。

## プロジェクト概要

Open Sound Meter（OpenSoundMeter）は、Qt 5.15 / C++17 製のクロスプラットフォーム音響測定ソフトウェアです。`OpenSoundMeter.pro` がビルドのエントリーポイントです。macOS、Windows、Linux に対応しています。

## macOS でのビルド方法（この Mac: macOS 12.7.4 / Apple Silicon）

この Mac は macOS 12.7.4（Monterey）のため、Homebrew の `qt@5` には bottle が提供されず、ソースビルドとフル版の Xcode.app が必要です（Command Line Tools のみでは `qt@5: A full installation of Xcode.app is required` で失敗します）。そのため、`aqtinstall` で Qt 公式のビルド済みバイナリ（x86_64、`clang_64` キット）を取得しています。

- Qt 本体は、`aqtinstall` で `~/Qt/5.15.2/clang_64` に導入済みです。
- `pip install --user aqtinstall` は Homebrew の python@3.14 ではなく、`/usr/bin/python3` の pip で実行してください。Homebrew の python@3.14 は macOS 12 をサポート外として扱い、ensurepip / venv が失敗します。
- ビルドは必ず `build/` ディレクトリでシャドウビルドしてください。リポジトリルートで qmake を実行すると、ソースツリー内に大量の `.o`、`moc_*.cpp`、`Makefile` などが生成されます。`build/` は `.gitignore` 済みです。

```sh
mkdir -p build
cd build
~/Qt/5.15.2/clang_64/bin/qmake ../OpenSoundMeter.pro
make -j$(sysctl -n hw.ncpu)
```

- 実行コマンドは `open build/OpenSoundMeter.app` です。
- 現状のビルドは x86_64 バイナリです（`lipo -info` で確認できます）。Apple Silicon では Rosetta 2 経由で動作します。測定用途の DSP 処理も実用上問題ありません。
- ネイティブ arm64 バイナリが必要な場合は、フル版の Xcode.app（App Store）をインストールし、`brew install qt@5` でソースビルドしてから、同様に qmake / make を実行してください。この経路で Homebrew が実行環境向けにネイティブビルドします。
- `.pro` 内の `GRAPH_BACKEND` 環境変数で描画バックエンドを切り替えられます。デフォルトは `OPENGL` です。`METAL` を指定する場合はフル版の Xcode を推奨します。

### 機能修正後の動作確認手順

機能修正やバグ修正後にアプリを起動して確認する場合は、必ず次の順序で行ってください。

1. `OpenSoundMeter.app` が起動中であれば終了する。
2. 上記のシャドウビルド手順でビルドする。
3. `open build/OpenSoundMeter.app` で起動する。
4. ユーザーに動作確認を依頼する。

起動中のまま `make` だけを実行した場合、ソースに差分がなければ `Nothing to be done` と表示されます。確認対象が確実に最新のビルドであることを保証するため、この順序を守ってください。

## このフォークでの変更点（本家との差分）

このフォークでは開発に不要なファイルを整理済みです。本家に追従する際は、この差分を考慮してください。詳細な一覧と変更理由は [`dev-docs/customizations.md`](dev-docs/customizations.md) を参照してください。

- 削除済み: `overview.key`（41 MB の Keynote 資料）、`.travis.yml`（未使用の Travis CI 設定）、`.github/FUNDING.yml`（本家作者への寄付リンク）、`CONTRIBUTING`（本家への貢献ガイド）、`PVS-Studio.pri`（有料静的解析ツール連携）、`future.tasks`（本家作者の個人メモ）、`docs/`（公開サイトの Jekyll ソース）
- `OpenSoundMeter.pro` から、`PVS-Studio.pri` の include、`pvs_studio` ターゲット、および `DISTFILES` 内の `future.tasks` / `list.tasks`（実体なし）を削除済みです。

## 機能の修正・変更時の記録

アプリの挙動や機能を修正・変更した場合は、必ず [`dev-docs/customizations.md`](dev-docs/customizations.md) に変更内容と理由を追記してください。何を、なぜ変更したのかが分かるように記録します。

測定タイプの設定項目など、仕様そのものを調査した場合は [`dev-docs/measurement-types.md`](dev-docs/measurement-types.md) を更新してください。コード内のコメントだけに頼らず、`dev-docs/` にまとまった記録を残し、本家との差分や将来の変更理由を追跡できる状態にしてください。

## コミットと push

このプロジェクトは個人開発のため、コミットと push は連動して構いません。ユーザーから明示的に「コミットして」または「pushして」と指示された場合は、通常の Git の安全方針（force push などの破壊的操作を避ける、適切なコミットメッセージを付けるなど）に従い、コミット後に追加確認なしで続けて push して構いません。
