# フロントエンドJS化 Phase分割計画

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md)の設計内容を、実装・検証の単位でPhaseに分割したもの。各Phaseは独立してビルド・動作確認できる粒度にしてあり、[customizations.md](customizations.md)に記載の個人開発の方針(コミット・pushを都度連動してよい)に沿って、Phase単位でコミットしていくことを想定している。

Phase 0〜5が完了し、5チャートとトップレベルの複数Measurementに対応済み。

**方針転換(2026-08-08)**: 本フォークは本家OSMから独自の方向へ進む方針となり、**QML版は廃止してよい**判断に変わった(Phase 5完了メモの「QML版併存を継続する」という当時の判断を上書きする)。JSフロントエンドをSmaart v9風の単一ウィンドウ・3ペイン構成(左: ソースエクスプローラー、中央: 複数ソース重ね描きチャート、右: 測定設定+信号発生器)へ作り替え、段階的に**デフォルトUI**へ昇格させる。Phase 6以降がこの再設計にあたる。バックエンド(`src/`)もJS版が使いやすくなるよう必要に応じて自由に改良してよく、QML版との厳密な数値突き合わせ検証は必須ゲートではなくなった(任意の健全性チェックとしては有用)。

## 進捗状況

| Phase | 内容 | 状態 |
|---|---|---|
| Phase 0 | 環境構築 | 完了 |
| Phase 1 | Magnitude単体疎通(最小の垂直スライス) | 完了 |
| Phase 2 | Phase・Coherenceを追加 | 完了 |
| Phase 3 | RTA(Spectrum)を追加 | 完了 |
| Phase 4 | Spectrogramを追加 | 完了 |
| Phase 5 | 結合検証・DataBridgeライフサイクル確定・QML版の扱い判断 | 完了 |
| Phase 6 | シングルウィンドウ化 + 左ペイン(読み取り専用ツリー) | 完了 |
| Phase 7 | マルチソース重ね描画 + アクティブ切替 | 完了 |
| Phase 8 | 設定パネル(選択ソース連動、読み取り+書き込み) | 未着手 |
| Phase 9 | 信号発生器パネル | 未着手 |
| Phase 10 | グループのツリー再帰対応(任意・低優先) | 未着手 |
| Phase 11 | 左ペインの操作(追加/Store/移動/削除)(任意・低優先) | 未着手 |
| Phase 12 | JS版をデフォルトUIへ昇格 + QML版の扱い | 未着手 |

実装を進めるたびに、この表の「状態」列(未着手/着手中/完了)を更新すること。

---

## Phase 0: 環境構築

**目的**: JS開発基盤を整備し、後続Phaseがビルド・実行可能な状態を作る。本移行計画全体の前提となる「QtWebEngineコンポーネントがこの環境に導入できるか」([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.5節・5節の最大リスク項目)を最優先で確認する。

**対象ファイル**: `OpenSoundMeter.pro`、(新規)JS側プロジェクト一式(仮に`web/`ディレクトリ)、CLAUDE.md(Qt導入手順に変更が必要なら追記)

**タスク**:
- [x] `aqtinstall`で現行環境(`~/Qt/5.15.2/clang_64`)にQtWebEngineコンポーネントが導入可能か確認(`aqt list-qt mac desktop --modules 5.15.2 clang_64`等でモジュール一覧を確認し、実際に`aqt install-qt`でwebengine系モジュールを追加してみる)
- [x] `OpenSoundMeter.pro`に`QT += webenginewidgets webchannel`を追加
- [x] Vite等によるJS側の雛形作成(`web/`ディレクトリ、`package.json`/`vite.config.ts`等)
- [x] 開発用に`QWebEngineView`を一時的に埋め込み、開発サーバー(`http://localhost:5173`)への接続確認(表示内容は空白でよい、疎通確認が目的)
- [x] `QTWEBENGINE_REMOTE_DEBUGGING=<port>`環境変数でChrome DevToolsからの接続確認
- [x] リリースビルド時、Viteのビルド出力を`qrc:/`に同梱する手順を試作(`.qrc`への組み込み、パス解決の確認)

**完了条件・検証方法**:
- [x] シャドウビルド(`build/`)でwebengine/webchannelを含めてビルドが通ること — `otool -L`で`QtWebEngineWidgets`/`QtWebEngineCore`/`QtWebChannel`のリンクを確認済み
- [x] 開発時: `QWebEngineView`がVite dev serverの内容を表示でき、JS側のホットリロードが反映されること — スクラッチ検証用アプリでdev server(`localhost:5173`)を読み込み、`main.ts`編集が自動反映されることを確認済み
- [x] リリース時: `qrc:/`同梱の静的ファイルでも表示できること — `npm run build`の出力(`web/dist/`)を`qrc:/web/`に同梱して読み込み確認済み
- [x] Chrome DevToolsでリモートデバッグ接続できること — `QTWEBENGINE_REMOTE_DEBUGGING=9223`で`http://localhost:9223/json/version`・`/json`がCDPレスポンスを返すことを確認済み

**依存Phase**: なし(最上流)

**注意点**: [js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.5節(QtWebEngine 5.15はEOL、Apple SiliconではRosetta 2前提)を参照。ここでQtWebEngineが導入不可と判明した場合、本移行計画全体の前提が崩れるため、他のタスクより先にこの導入確認だけを最初に行うこと。

**完了メモ(実施結果)**:
- `aqt install-qt`は`--outputdir`を指定しないとカレントディレクトリ配下に新規Qtツリーを作ってしまう(既存の`~/Qt/5.15.2/clang_64`には追加されない)。`--outputdir ~/Qt`を明示することで正しく既存ツリーにwebengineモジュールが追加された(`~/Qt/5.15.2/clang_64`が421MB→658MBに増加、`QtWebEngine*.framework`が追加)。
- 導入されたQtWebEngineのChromiumバージョンは83.0.4103.122(User-Agent文字列より確認)。[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.5節の「Chromium ~87」という記述はやや不正確(実際は83系)だが、EOLである点の結論は変わらない。
- `web/`はVite(vanilla-ts テンプレート)で作成。デモ用のロゴ・カウンター等は削除し、疎通確認用の最小限の内容(タイトル・時刻表示)に置き換えた。
- `web/vite.config.ts`で`base: './'`(qrc同梱時の相対パス解決用)と、`rollupOptions.output`でビルド成果物のファイル名からキャッシュバスティング用ハッシュを除去(`.qrc`を固定内容にできるようにするため)を設定済み。
- `web/web.qrc`にqrc同梱テンプレートを作成済みだが、`web/dist/`は`npm run build`を実行するまで存在しないため、**まだ`OpenSoundMeter.pro`の`RESOURCES`には追加していない**(追加すると`npm run build`未実行時に`qmake`後の`make`が失敗する)。実アプリへの組み込み(`QWebEngineView`の実装含む)はPhase 1で行う。
- QWebEngineViewの疎通確認・CDP確認・qrc確認は、本体の`src/main.cpp`を変更せず、スクラッチ領域の最小Qt Widgetsプロジェクトで実施した(Phase 1で行う`DataBridge`+QWebChannel登録の設計を先取りしないため)。

---

## Phase 1: Magnitude単体疎通(最小の垂直スライス)

**目的**: `SeriesSampler`抽出→`DataBridge`+QWebChannel登録→JS側の購読+Canvas描画、という新パイプライン全体を、Magnitudeチャート1つ・1ソース・コントロールなしという最小の面積で検証する([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.4節)。

**事実訂正(調査により判明)**: [js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 2.3節は「オクターブ平滑化ロジックは現状レンダラー内に埋め込まれている」「平滑化済み配列だけを返すAPIは現状存在しない」としているが、実際には`src/chart/frequencybasedserieshelper.h/.cpp`の`iterate()`/`iterateForSpline()`が既にGL非依存な形でオクターブ集計ロジックを提供しており、そのまま流用できる。GL頂点書込みと混在しているのは`MagnitudeSeriesRenderer::renderSeries()`(`src/chart/opengl/magnitudeseriesrenderer.cpp`)内の`collected`コールバック(118〜156行目付近)のみであり、この部分だけを書き替えればよい。したがって本Phaseの抽出作業は当初想定より小さく済む見込み。

**対象ファイル**: (新規)`src/chart/seriessampler.h`/`.cpp`、(新規)`src/chart/databridge.h`/`.cpp`、`src/chart/frequencybasedserieshelper.h`/`.cpp`(流用、変更なし想定)、`src/chart/opengl/magnitudeseriesrenderer.cpp`(参照元)、`src/main.cpp`(QWebChannel初期化)、(新規)`web/src/...`(JS側)

**タスク**:
- [x] Magnitude用`SeriesSampler`実装: `iterate()`のコールバックとして、GL頂点ではなく`frequency[]`/`magnitudeDb[]`の平行配列を蓄積するように書き換え
- [x] `DataBridge`実装: `Measurement::readyRead()`(80ms周期、`measurement.cpp:581`でemit)を契機に`SeriesSampler`を実行し、`magnitudeUpdated(...)`をemit
- [x] `src/main.cpp`に`QWebChannel`と`QWebEngineView`のセットアップを追加、`DataBridge`インスタンスを1つ生成し`registerObject`
- [x] JS側: QWebChannelクライアント接続、`magnitudeUpdated`シグナル購読、Canvas 2Dでの対数周波数軸描画
- [x] 新旧表示値の突き合わせ検証: QML版と同じ`FrequencyBasedSeriesHelper::iterate()`、パワー加算、`10 * log10(value / count)`を使用し、スプライン適用前のバンド中心値が同じになることをコード経路で確認

**完了条件・検証方法**:
- [x] Magnitude 1ソースがJS側Canvasにリアルタイム(80ms周期)で描画されること
- [x] QML版と同一の周波数ビン・振幅値になること(共通の`iterate()`と同一のdB集計式を使用)
- [x] Vite dev serverからQWebChannel接続できること(ホットリロード自体はPhase 0で確認済み)

**依存Phase**: Phase 0完了後

**注意点**: [js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.5節「新旧の表示値を同一シグナル・同一ソース・同一フレームで突き合わせて検証する工程」を必ず設ける。オクターブ平滑化ロジックの移植はこれまで単体テストされたことのない箇所からの抽出のため、本移行で最もバグが出やすい。

**完了メモ(実施結果)**:
- `MagnitudeSeriesSampler`は`FrequencyBasedSeriesHelper::iterate()`を直接利用し、既存`MagnitudeSeriesRenderer`のdBモードと同じ「線形Magnitudeの2乗をバンド内で加算し、`10 * log10(value / count)`」でJSON化する。GL用の`iterateForSpline()`は使用せず、比較対象であるスプライン適用前のバンド中心値を送る。
- `DataBridge`を`Measurement::readyRead()`へ接続し、`magnitudeUpdated(QString)`をQWebChannel経由でpushする。実機では既定Measurementから1更新あたり119点を継続受信し、Canvas描画まで到達した。
- `qwebchannel.js`はnpm追加やローカルコピーを必要とせず、`qrc:///qtwebchannel/qwebchannel.js`をそのまま使用できた。Vite dev server(`http://localhost:5173/`)とqrc同梱版(`qrc:/web/index.html`)の両方で`QWebChannel`、`qt.webChannelTransport`、`dataBridge`接続を確認した。
- JS版は`OSM_JS_FRONTEND`設定時だけ生成される別ウィンドウとし、`OSM_JS_DEV_SERVER`設定時だけViteへ接続する。未設定時の既存QML起動シーケンスは変更していない。
- Canvasとページ背景は`rgb(0, 0, 0)`、グリッド/枠線は`rgba(255, 255, 255, 0.157)`であることをDevTools Protocolから確認した。ソース色のMagnitude線と白文字を描画する。
- `npm run build`、Qt 5.15.2でのqmake/make、qrc同梱起動に成功した。`web/dist`を一時退避した状態でも`exists(web/dist/index.html)`ガードによりqmake/makeが成功し、検証後に`dist`を復元した。
- Phase 1完了後のレビューで、Measurementのワーカースレッドが次フレームを書き換えている間にGUIスレッドのサンプラーが同じ周波数領域データを読む競合を確認した。`frequencyDomainSize()`の確認から`iterate()`完了までを`Abstract::Data::lock()`/`unlock()`で保護し、既存`SeriesRenderer`と同じ排他パターンに修正した。
- 無音/未接続時に`10 * log10(0)`が`-Infinity`となる帯域は、C++側で明示的にJSONの`null`へ変換する。JS側は有限値だけでY軸範囲を計算し、`null`の前後で描画パスを分断することで、無音区間が0dBへスパイクする問題を防止した。
- 修正版のqrc同梱ページを約2分連続動作させ、クラッシュ・フリーズなく119点の更新が継続することを確認した。検証時の無音入力は119点すべてが`null`で、Canvas内のソース色画素は0件だったため、0dBスパイクを描かずグリッドだけが残ることも確認できた。

---

## Phase 2: Phase・Coherenceを追加

**目的**: Phase 1で確立した`SeriesSampler`→`DataBridge`→JS Canvasのパターンを、Phase/Coherenceチャートに横展開する。Magnitudeとほぼ同じサンプラー構造でフィールドが異なるだけ([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.4節)。

**対象ファイル**: `src/chart/opengl/phaseseriesrenderer.cpp`/`.h`(移植元)、`src/chart/opengl/coherenceseriesrenderer.cpp`/`.h`(移植元)、`src/chart/seriessampler.h`/`.cpp`(拡張)、`src/chart/databridge.h`/`.cpp`(拡張)、JS側(CanvasChart継承クラス追加)

**タスク**:
- [x] Phase用`SeriesSampler`実装(`phase(i)`を使用し、バンド内の複素数平均を度数へ変換)
- [x] Coherence用`SeriesSampler`実装(`coherence(i)`を使用し、Normal値のバンド平均を取得)
- [x] `DataBridge`をPhase/Coherenceのシグナルにも対応させる
- [x] JS側Canvas描画: 位相ラップ境界でのパス分断、Coherence値の0〜1固定レンジ描画
- [x] 新旧表示値の突き合わせ検証(既存レンダラーとサンプリング元・集計式をコード経路で比較)

**完了条件・検証方法**: Phase/CoherenceチャートがJS側で描画され、意図的な簡略化を除いてQML版と同じ元データ・集計方法を使用すること

**依存Phase**: Phase 1完了後

**注意点**: 位相ラップとcoherence連動描画は本アプリ固有仕様([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.3節)。本Phaseでは実装プロンプトに従い、位相ラップはパス分断へ簡略化し、coherence連動透明度は見送る。

**完了メモ(実施結果)**:
- `PhaseSeriesSampler`と`CoherenceSeriesSampler`を追加し、Magnitudeと同じ`FrequencyBasedSeriesHelper::iterate()`でスプライン適用前のバンド中心値をJSON化する。payloadは共通の`sourceName`/`color`/`frequency`に加え、Phaseが`phaseDeg`、Coherenceが`coherenceValue`を持つ。非有限値はJSONの`null`へ変換する。
- Phaseはバンド内の`phase(i)`を複素数のまま平均して`atan2`で度数へ変換する。既存OpenGL2フォールバックのスプライン後アンラップは移植せず、JS側で隣接点の差が180度を超えた箇所の描画パスを分断する簡易方式とした。`PhasePlot::rotate`も無視し、常に0度として扱う。
- Coherenceは`CoherencePlot::Type::Normal`固定で`coherence(i)`を平均し、0〜1の固定レンジへ描画する。`Squared`/`SNR`は対象外。またMagnitude/Phaseレンダラーにあるcoherence連動の透明度はチャート自身の値ではなく見た目の演出なので、本Phaseでは見送った。
- 新規2サンプラーも`frequencyDomainSize()`確認から`iterate()`完了までを`m_source->lock()`/`unlock()`で保護し、Measurementワーカースレッドとのデータ競合を避ける。
- `DataBridge`から`magnitudeUpdated`/`phaseUpdated`/`coherenceUpdated`を同じ`readyRead()`契機で送信し、JS側は共通の`drawSeries()`で3枚のCanvasを縦積み描画する。
- `npm run build`によるTypeScript型チェック/Viteビルドと、Qt 5.15.2のシャドウビルド(qmake/make)が成功した。
- Phase 2レビューで、リファレンス未接続/無信号時にもPhaseの生値が有限の0度となり、119点すべてが有効値として描画される問題を確認した。`PhaseSeriesSampler`でPhaseと並行して同じ帯域のMagnitudeパワーを集計し、MagnitudeのdB値が非有限ならPhaseも`null`にする防御的な妥当性チェックを追加した。
- 根本原因は`Measurement::averaging()`のPhase計算にMagnitude側と同等のNaN/Infガードがないことに起因する可能性が高い。ただし既存DSP計算の変更と広範な回帰確認はJSフロントエンド化の範囲を超えるため、DSP本体は変更せずサンプラー層で対処した。
- 修正後のqrc同梱版を無信号状態で起動し、Chrome DevTools Protocol経由でCanvas画素を検査した。Phase Canvasのソース色画素は0件で、グリッドだけが残り、0度への偽の直線が描画されないことを確認した。

---

## Phase 3: RTA(Spectrum)を追加

**目的**: 単一系列・coherence着色なしのシンプルなチャートを追加する。Magnitude/Phase/Coherenceより単純([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.4節)。

**対象ファイル**: `src/chart/opengl/rtaseriesrenderer.cpp`/`.h`(移植元)、`src/chart/seriessampler.h`/`.cpp`(拡張)、JS側

**タスク**:
- [x] RTA用`SeriesSampler`実装(`module(i)`のみ使用、リファレンスチャンネル不使用)
- [x] JS側Canvas描画(単一系列)
- [x] 新旧表示値の突き合わせ検証

**完了条件・検証方法**: RTAチャートがJS側で正しく描画され、QML版と数値・見た目が一致すること

**依存Phase**: Phase 1完了後(Phase 2と並行着手可)

**完了メモ(実施結果)**:
- `RTASeriesSampler`を追加し、既存`RTASeriesRenderer::renderPPOLine()`と同じ`FrequencyBasedSeriesHelper::iterate()`を使用して、`module(i)`の二乗をバンド内で加算し`10 * log10(value)`へ変換する。Magnitudeとは異なりバンド内のカウント数では割らず、RTAのバンド内エネルギー合計という既存仕様を維持した。payloadは`{"sourceName", "color", "frequency": [...], "levelDb": [...]}`で、非有限値は`null`にする。
- `RTASeriesSampler`の既定値はRTAPlotに合わせて6 points/octaveとし、Phase 3では`Mode::Line`・`Scale::DBfs`・ピーク表示なしに固定した。`Scale::SPL`/`Phon`、Bars/Lines、ピーク表示と各コントロールは対象外。
- RTAは伝達関数用の`magnitudeRaw(i)`ではなく単一チャンネルの`module(i)`だけを読むため、リファレンスチャンネルの有無に依存しない。DC成分は既存レンダラーと同じく明示的に除外する。
- `frequencyDomainSize()`確認から`iterate()`完了までをソースの`lock()`/`unlock()`で保護し、Measurementワーカースレッドとのデータ競合を避ける。
- `DataBridge`に`rtaUpdated(QString)`を追加し、Magnitude/Phase/Coherenceと同じ`readyRead()`契機でJSONをpushする。JS側は`levelDb`の有限値から表示レンジを求め、既存の対数周波数軸と共通`drawSeries()`で4枚目のCanvasへ描画する。
- 既存OpenGL版とのコード経路比較により、サンプリング元、バンド集計、dB変換、中心周波数の算出が一致することを確認した。意図的な差はスプライン適用前のバンド中心値を直接結ぶ点と、上記の固定スコープのみ。
- `npm run build`によるTypeScript型チェック/Viteビルドと、Qt 5.15.2のシャドウビルド(qmake/make)が成功した。qrc同梱版を起動してChrome DevTools ProtocolからRTA Canvasを検査し、ソース色の曲線が描かれ、3秒間隔で画素チェックサムが変化することを確認した。環境変数なしの通常版も起動後10秒間クラッシュしないことを確認した。
- **レビュー修正: データなし時も空のチャートを描画する**: Magnitude/RTAは有限値から動的レンジを求めており、全点`null`のときは`drawSeries()`を呼ばず、背景・グリッド・ラベルまで未描画になっていた。データなし時は表示レンジ`-1..1`へフォールバックして常に`drawSeries()`を呼ぶようにし、線だけを描かない空チャートとしてPhase/Coherenceと見た目を統一した。有限値がある場合の動的レンジと曲線描画は従来どおり。

---

## Phase 4: Spectrogramを追加

**目的**: 51行の履歴バッファ/スクロール描画という、他4チャートと異なる設計([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.2節・3.3節)が必要なため最後に着手する。

**対象ファイル**: `src/chart/opengl/spectrogramseriesrenderer.cpp`/`.h`(移植元)、`src/chart/seriessampler.h`/`.cpp`(拡張)、`src/chart/databridge.h`/`.cpp`(1行pushへの変更)、JS側(ImageDataスクロールバッファ)

**タスク**:
- [x] Spectrogram用`SeriesSampler`実装(`module(i)`のみ、1行分のデータを返す)
- [x] `DataBridge`: 全履歴ではなく新規1行のみをpushするシグナルに変更
- [x] JS側: 51行のスクロールバッファ実装(`getImageData`/`putImageData`での1行スクロール+1行追記)
- [x] 新旧表示値の突き合わせ検証(該当行のみの比較でよい)

**完了条件・検証方法**: SpectrogramチャートがJS側で正しく描画され、QML版と数値・見た目(色マッピング含む)が一致すること

**依存Phase**: Phase 1完了後

**注意点**: [js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 2.3節の通り、既存QML版は毎フレーム全メッシュを再構築する方式だが、JS版は1行スクロール方式にするため描画方式そのものが異なる。見た目上の一致確認の際はこの違いを踏まえること。

---

## Phase 5: 結合検証・DataBridgeライフサイクル確定・QML版の扱い判断

**目的**: 5チャート全てが揃った状態で、複数パネル・複数ソースを同時に開いた場合の挙動を検証し、`DataBridge`のインスタンス管理(登録/解除タイミング、上限)を正式に設計する。あわせてQML版チャートコードを削除するかどうかを判断する。Phase 1〜4は1パネル・1ソースの素朴な実装に留めており、複数パネル対応の一般設計は本Phaseで初めて確定させる方針とした([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 5節の未決事項に対応)。

**対象ファイル**: (新規)`src/chart/jsfrontendmanager.h`/`.cpp`、`src/main.cpp`、`OpenSoundMeter.pro`、`src/chart/databridge.h`(責務コメント)、`customizations.md`(判断結果の記録)

**タスク**:
- [x] 複数チャートパネル・複数ソースを同時に開いた場合の`DataBridge`ライフサイクル設計(トップレベルMeasurementの追加/削除とJSウィンドウを連動)
- [x] `DataBridge`インスタンス数の実用上の上限目安を実機確認
- [x] 5チャート全てでPhase 1〜4のQML版との表示値検証が完了していることの最終確認
- [x] QML側の対応チャートコードは削除せず併存を継続すると判断し、`customizations.md`に記録
- [x] CLAUDE.md記載の手順でアプリ終了→ビルド→起動の最終確認を実施

**完了条件**: ユーザーによる動作確認完了、`DataBridge`ライフサイクル設計がドキュメント化されていること

**依存Phase**: Phase 1〜4完了後

**完了メモ(実施結果)**:
- `JsFrontendManager`がルート`SourceList`の`postItemAppended`/`preItemRemoved`を購読し、トップレベルのMeasurement 1つにつき`DataBridge`/`QWebChannel`/`QWebEngineView`を1組作る。ユーザーがウィンドウを閉じる場合とソース削除時の両方で`QWebEngineView::close()`→`destroyed`を通し、`m_panels`からの除去とbridge/channelの`deleteLater()`を1か所に集約した。
- 検証専用の一時コード(最終ソースには残していない)でMeasurementを5個に増やし、DevToolsのターゲットIDが5枚すべて異なることを確認した。その後、指定ソースの削除で対応IDが消え、Measurementの再追加で新しいIDのページが生成されることを確認した。その間、クラッシュやマップ不整合は発生しなかった。
- 5パネルを約5分連続動作させ、クラッシュ・フリーズなし。サンプル時の本体プロセスは約495 MiB RSS、CPU約128%(オーディオ処理と5ページ更新を含む)だった。したがって5枚は動作確認済みの目安とするが、WebEngineの負荷が小さくないため無制限の常用を保証する上限とはしない。
- `npm run build`(型チェック含む)とQt 5.15.2のシャドウビルドが成功。`OSM_JS_FRONTEND=1`でqrc版JSページの生成を確認した。環境変数の判定は従来どおりのため、未設定時はJSウィンドウを生成しない。
- QML版は削除しない。JS版はチャートの設定コントロール、coherence連動の透過度演出、QMLパネルレイアウトとの統合が未実装で、依然として環境変数が必要な実験機能である。機能的にQML版を代替できる段階で改めて削除を検討する。

  **(2026-08-08時点での更新)**: この判断はプロジェクトの方針転換により上書きされた。本フォークは独自の方向へ進む方針となり、QML版は廃止してよい判断に変わった。以降のPhase 6〜12でJS版をSmaart v9風の3ペインUIへ作り替え、デフォルトUIへ昇格させる。

---

## Phase 6: シングルウィンドウ化 + 左ペイン(読み取り専用ツリー)

**目的**: `JsFrontendManager`をper-source-window方式から単一永続ウィンドウ方式へ転換し、Smaart v9風の3ペインシェルを作る。中央は暫定的に先頭のトップレベルMeasurement1つのみ表示(Phase 5までと同等の見た目を維持)。左ペインに実`SourceList`ツリーを読み取り専用で表示する。

**背景・アーキテクチャ方針**: Qt 5.15系の`qwebchannel.js`クライアント実装を確認した結果、`channel.objects`は接続時の`init`メッセージ1回だけで構築され、接続済みチャンネルへ新規`QObject`を`registerObject()`しても既存クライアントには反映されないことを確認した(`objectsChanged`のようなメッセージ型が存在しない)。一方、既に登録済みのオブジェクトのプロパティ値やinvokableの戻り値として`QObject*`が返る場合は動的にラップされる(`unwrapQObject`経路)。現行の「ウィンドウ=ソース単位」設計はウィンドウ生成のたびに新しいチャンネルを作るためこの制約を回避できていたが、単一永続ウィンドウ化するとこの制約が直接効いてくる。したがって、**ソースの増減に追従してQWebChannelへ新規オブジェクトを登録する設計は採用しない**。代わりに、アプリ起動時(=ウィンドウ生成時)に1回だけ登録する少数の固定オブジェクトを用意し、ソースの増減はその固定オブジェクトが発行するJSON文字列シグナル(既存`DataBridge`と同じパターン)で表現する。

登録する固定オブジェクトの全体設計(Phase 6〜9で段階的に登録):

| 名前 | 実体 | 役割 |
|---|---|---|
| `sourceList` | 既存のルート`SourceList*`をそのまま登録(新規クラス不要) | `count`/`currentFile`/`selectedIndex`/`selected`/`selectedUuid`等のQ_PROPERTYと、`removeItem(uuid)`/`moveToGroup`/`moveItem`/`save`/`load`/`addMeasurement()`/`addGroup()`等、既にuuid/QUrl引数で完結しているQ_INVOKABLEをそのまま利用。ソース選択も`SourceList::selectedIndex`/`selectedChanged`という既存の仕組みをJSとQML双方で共有する |
| `sourceTree` | (新規)`Chart::SourceTreeBridge` | `SourceList`のうちJSから直接呼べない部分だけを薄くラップ: ツリー構造のJSONスナップショット配信(`treeChanged(QString)`)、`setActive(QUuid,bool)`、`storeItem(QUuid)`(`Shared::Source`引数の`SourceList::storeItem`をuuidルックアップ経由で呼ぶラッパー) |
| `chartData` | 既存`Chart::DataBridge`を複数ソース対応に拡張(Phase 7) | 5チャートのJSON配信を、トップレベルMeasurement全件についてまとめて行う |
| `settings` | (新規)`Chart::SettingsBridge`(Phase 8) | 選択中ソースの設定JSON配信+汎用`setProperty(uuid,name,value)`書き込み |
| `generator` | 既存`Generator*`をそのまま登録(Phase 9) | qwebchannel.jsのQ_PROPERTY+NOTIFY自動バインディングをそのまま利用 |

**対象ファイル**: `src/chart/jsfrontendmanager.h/.cpp`(全面書き換え。`QMap<QUuid,QWebEngineView*>`とper-uuid open/closeを廃し、単一`QWebEngineView`+単一`QWebChannel`を起動時に1回だけ生成)、(新規)`src/chart/sourcetreebridge.h/.cpp`、`OpenSoundMeter.pro`(新規ファイル追加)、`src/main.cpp`(変更小)、`web/index.html`(3ペインCSS Grid化)、`web/src/main.ts`(モジュール分割の起点)、(新規)`web/src/webchannel.ts`、(新規)`web/src/sourceTree.ts`、`web/src/style.css`

**タスク**:
- [x] `SourceTreeBridge`実装: ルート`SourceList`の`postItemAppended`/`preItemRemoved`を購読(トップレベルのみ、Group再帰はPhase 10)。`signal treeChanged(QString json)`でuuid/type/name/color/activeの配列を通知
- [x] `JsFrontendManager`を単一ウィンドウ化。`channel->registerObject("sourceList", sourceList)`・`registerObject("sourceTree", bridge)`。既存`dataBridge`相当は暫定的に「先頭のトップレベルMeasurement」に固定バインドしたまま`"chartData"`という名前で登録(複数ソース対応はPhase 7)
- [x] 3ペインCSS Grid雛形(`#pane-left`/`#pane-center`/`#pane-right`)。左ペインに`treeChanged`購読でツリー描画(色スウォッチ、type別ラベル、depthはこのPhaseでは常に0でよい)
- [x] `main.ts`のQWebChannel接続処理を`webchannel.ts`へ切り出し、ソースツリー描画を`sourceTree.ts`へ切り出す(既存チャート描画ロジックは`main.ts`に残したままでよい、次Phaseで`charts.ts`へ分離)

**完了条件・検証方法**: `OSM_JS_FRONTEND=1`起動で単一ウィンドウが開き、左ペインのツリーが実際のソース追加/削除/Group作成(QML側操作)と連動して更新される。中央チャートはPhase 5までと同じ見た目・数値を維持する。`OSM_JS_FRONTEND`未設定時の通常起動に影響がないこと。

**依存Phase**: Phase 5完了後

**完了メモ(実施結果)**:
- Cのシャドウビルド(`qmake`/`make`)、`web`側`npm run build`(tsc型チェック含む)とも成功。`OSM_JS_FRONTEND=1`起動で単一ウィンドウ(タイトル"OSM")が1つだけ開き、Phase 5までのような複数ウィンドウは生成されないことを確認した。
- 左ペインが実際の`SourceList`(QML側サイドバーと同一データ)をリアルタイムに反映することを実機確認した(Measurement 4件+Stored「r2」1件が、QML側の一覧と一致する色・チェック状態で表示された)。中央チャートはRTAで実データが描画され、Magnitude/Phaseは信号発生器未起動のため無信号(想定通りの挙動、Phase 6の回帰ではない)。
- 実装はプロンプトから2点改善されている: (1) `SourceTreeBridge`が`preItemRemoved`ではなく`postItemRemoved`(実際の削除完了後に発火)を購読するようにし、削除直前の古いツリーを送ってしまう潜在バグを回避した。(2) `SourceTreeBridge::requestTree()`(Q_INVOKABLE)を新設し、JS側がWebChannel接続直後に明示的に呼び出すことで、コンストラクタ内で(JS未接続のうちに)発火してしまう初期`treeChanged`を取りこぼす問題を解消した。
- `web/index.html`自体の構造変更は不要だった(`#app`のDOM構築を`main.ts`側で行う既存方針のまま、CSS Gridで3ペイン化)。
- `src/main.cpp`は無変更で動作した(`JsFrontendManager`のコンストラクタ引数シグネチャを変えていないため)。

---

## Phase 7: マルチソース重ね描画 + アクティブ切替

**目的**: `DataBridge`をマルチソース対応に拡張し、Smaart流の「1チャートに複数ソースを重ね描き」を実現する。

**対象ファイル**: `src/chart/databridge.h/.cpp`(`QMap<QUuid, サンプラー一式>`へ拡張、ソース追加/削除に追従、`sourceRemoved(QString uuid)`シグナル追加)、`src/chart/seriessampler.cpp`(5種すべてのJSON生成箇所に`"uuid"`フィールド追加)、`web/src/charts.ts`(新規、`main.ts`からチャート描画部を分離。チャート種別ごとに`Map<uuid,payload>`キャッシュを持ち、更新の都度そのuuid分だけ差し替えて全キャッシュを再描画)、`web/src/sourceTree.ts`(activeチェックボックス、行クリックによるJSローカル選択)。`SourceTreeBridge::setActive(QString,bool)`はPhase 6で前倒し実装済みのため、本Phaseでは変更しない

**タスク**:
- [x] `DataBridge`: `SourceList::postItemAppended`/`preItemRemoved`(トップレベルのみ)を購読し、Measurement追加時にサンプラー一式を生成して`readyRead`接続、削除時に切断+`sourceRemoved`emit
- [x] サンプラーJSONに`uuid`追加(既存`sourceName`/`color`は維持)
- [x] JS側: chart種別ごとの`Map<uuid,payload>`実装。`sourceRemoved`受信でMapから該当uuidを削除して再描画
- [x] Spectrogramは選択中uuid1件のみ表示(2Dスクロールヒートマップは複数ソース重ね描画に意味がないため)。ツリー行クリックによるJSローカル選択でバッファをクリアし、次回データから描き直す。`SourceList::selectedChanged`とのアプリ全体での同期はPhase 8で`SettingsBridge`と一緒に導入する
- [x] ツリーのactiveチェックボックスは`Abstract::Source::active`(=`SourceTreeBridge::setActive`)をそのまま流用。非activeは描画キャッシュから除外

**完了条件・検証方法**: 複数Measurementを同時に起動すると、Magnitude/Phase/Coherence/RTAへ全ソースの線が該当ソース色で重ね描画される。activeトグルで即座に表示/非表示が切り替わる。ソース削除で残留線が消える。Spectrogramは選択中ソースのみ表示される。

**依存Phase**: Phase 6完了後

**完了メモ(実施結果)**:
- `DataBridge`はトップレベルMeasurementごとに5種のサンプラーを保持し、追加・削除へ動的に追従するようになった。削除時は`readyRead`接続を明示的に解除してからサンプラーを破棄し、同じソースを移動・再追加した場合の重複通知も防止する。
- `web/src/charts.ts`へ描画処理を分離し、Magnitude/Phase/Coherence/RTAはuuid単位の最新payloadをキャッシュして全アクティブ系列を共通canvasへ重ね描画する。各チャートにはソース色と名前の凡例を表示し、active変更・ソース削除時は新しい測定データを待たず即時再描画する。
- Spectrogramの選択はPhase 7ではツリー行クリックによるJSローカル状態とし、切替時にcanvasをクリアする。初回未選択時のみ、最初に受信したソースを暫定選択する。
- `web`の`npm run build`(TypeScript型チェック+Vite本番ビルド)と、Qt 5.15.2 x64/OpenGLのシャドウビルド(`qmake`+`make`)が成功した。
- **レビュー時に実施したGUI回帰確認**: `QTWEBENGINE_REMOTE_DEBUGGING`のCDP経由(Node.js組み込み`WebSocket`で直接操作)で、実データに対して(1)4つのMeasurementをアクティブにし、RTAチャートに4色の重ね描画+凡例が表示されること、(2)いずれかのactiveチェックボックスをOFFにすると該当系列が凡例ごと即座に消えること(4件→3件)、(3)別のツリー行をクリックすると選択ハイライトが移動し、Spectrogramのバッファがクリアされて新しいソースのデータに切り替わること、をそれぞれ確認した。コンソールエラーは発生しなかった。`OSM_JS_FRONTEND`未設定の通常起動への影響もなし。

---

## Phase 8: 設定パネル(選択ソース連動、読み取り+書き込み)

**目的**: 右ペインを実際の`Measurement`設定に接続する。

**対象ファイル**: (新規)`src/chart/settingsbridge.h/.cpp`、`src/main.cpp`(登録)、(新規)`web/src/settingsPanel.ts`

**設計**:
```cpp
class SettingsBridge : public QObject {
    Q_OBJECT
public:
    explicit SettingsBridge(SourceList *root, QObject *parent = nullptr);
signals:
    void settingsChanged(const QString &json); // 選択変更時・setProperty成功時に選択中ソースの全プロパティを再送
    void meterUpdated(const QString &json);    // level/referenceLevel/measurementPeak/referencePeak、readyRead契機
public:
    Q_INVOKABLE void setProperty(const QString &uuid, const QString &name, const QVariant &value);
    Q_INVOKABLE void resetAverage(const QString &uuid);
    Q_INVOKABLE void store(const QString &uuid);
    Q_INVOKABLE void applyAutoGain(const QString &uuid, float reference);
};
```
選択状態は既存の`SourceList::selectedChanged`/`selectedUuid()`をそのまま利用する(独自の選択管理を持たない。QML側の選択とJS側の選択が同じ状態を共有する)。

**タスク**:
- [ ] `SettingsBridge`を`SourceList::selectedChanged`に接続し、選択がMeasurementなら全Q_PROPERTY(averageType/average/filtersFrequency/gain/offset/delay/mode/tfcReferenceTime/inputFilter/dataChanel/referenceChanel/deviceId/calibration/calibrationLoaded/color/name/active/level/referenceLevel/measurementPeak/referencePeak/estimated)をJSONで`settingsChanged`配信。Group/Stored等の選択時は`{"uuid","type","editable":false}`程度の最小JSON
- [ ] `setProperty`は`QObject::setProperty(name, value)`(Qtメタオブジェクトの汎用書き込み)を使用。成功後に`settingsChanged`を再emitしてクランプ等の副作用をJSへ反映
- [ ] `meterUpdated`は選択中ソースの`readyRead`にフックし、軽量JSON(4フィールドのみ)で高頻度更新を`settingsChanged`と分離
- [ ] JS側フォーム: gain/delay/mode/averageType/inputFilter等の入力欄。**値確定時(blur/change)のみ**`setProperty`送信(キー入力毎の送信は避ける = デバウンス)
- [ ] `average`(averageType===FIFOのときのみ)/`filtersFrequency`(LPFのときのみ)/`tfcReferenceTime`(mode===TFCのときのみ)の条件表示を、既存`qml/source/MeasurementProperties.qml`の可視条件に倣ってJS側に再現

**完了条件・検証方法**: ツリーでMeasurementを選択すると右ペインに実値(gain/delay/mode等)が表示され、値を編集すると実際の測定に反映される(QML版の同じパネルで同時に値が変化することで確認)。Group/Stored選択時にクラッシュせず簡易表示になる。

**依存Phase**: Phase 6完了後(選択機構)。Phase 7と並行着手可

---

## Phase 9: 信号発生器パネル

**目的**: 右ペイン下部にGenerator操作を追加する。既存の単一`Generator`インスタンスを直接登録する簡素な構成とする。

**対象ファイル**: `src/generator/generator.h/.cpp`(`channelsList`変換プロパティ追加のみ、既存`channels()`/`setChannels(QList<QVariant>)`のラップ)、`src/main.cpp`(`channel->registerObject("generator", generator.get())`)、(新規)`web/src/generatorPanel.ts`

**タスク**:
- [ ] `Generator`に`Q_PROPERTY(QVariantList channelsList READ channelsList WRITE setChannelsListVariant NOTIFY channelsChangedQList)`を追加
- [ ] `generator`を直接`registerObject`(新規ブリッジクラスは作らない)
- [ ] JS側: `enabled`/`type`(`types`定数からドロップダウン)/`frequency`/`startFrequency`/`endFrequency`/`gain`/`duration`/`deviceId`/`evenPolarity`/`channelsList`を、qwebchannel.jsの自動プロパティバインディング(get/set/NOTIFY)でそのまま双方向接続する(手動JSON不要)

**完了条件・検証方法**: JS側で`enabled`をONにすると実際に音が出る。QML版のGenerator画面と同一インスタンスを操作しているため、片方の変更がもう片方にもプロパティNOTIFY経由で反映されることを確認する。

**依存Phase**: Phase 6完了後のみ(Phase 7・8とは独立、並行着手可)

---

## Phase 10(任意・低優先): グループのツリー再帰対応

**目的**: 左ペイン・チャート重ね描画を`Source::Group`のネストまで対応させる(`Chart::SeriesesItem::connectSources`と同じ再帰パターン)。個人開発の観点で優先度は低く、Phase 6〜9完了後に必要性を見て着手判断する。

**対象ファイル**: `src/chart/sourcetreebridge.h/.cpp`(Group検出時に子`sourceList()`へ再帰接続、`depth`/`parentUuid`をJSONに追加)、`src/chart/databridge.h/.cpp`(Group配下のMeasurementもサンプラー管理対象に含める)、`web/src/sourceTree.ts`(インデント描画、開閉状態)

**完了条件**: Groupを作りMeasurementを移動すると、ツリーにネスト表示され、かつそのMeasurementもチャートに重ね描画される。

**依存Phase**: Phase 6, 7完了後

---

## Phase 11(任意・低優先): 左ペインの操作(追加/Store/移動/削除)

**目的**: 左ペインを完全な読み書きパネルにする。

**対象ファイル**: `src/chart/sourcetreebridge.h/.cpp`(`storeItem(QUuid)`は既にPhase 6〜7で用意済み。`addMeasurement`/`addGroup`/`removeItem`/`moveToGroup`/`moveItem`は`sourceList`オブジェクトを直接呼べば足りるため新規実装は不要)、`web/src/sourceTree.ts`(追加/Store/削除ボタン、ドラッグ&ドロップは任意)

**完了条件**: JS左ペインだけで、Measurement追加→Store(スナップショット化)→Groupへ移動→削除、が一通り行える。

**依存Phase**: Phase 6完了後、Phase 10(Group移動を含む場合)

---

## Phase 12: JS版をデフォルトUIへ昇格 + QML版の扱い

**目的**: Phase 6〜9で3ペインUIが実用レベルに達した段階で、JS版を`OSM_JS_FRONTEND`環境変数なしでも起動するデフォルトUIへ切り替える。QML版は即時全削除ではなく、まず「デフォルトでは使わない」状態にし、実運用で問題が出ないことを確認してから削除を検討する。

**対象ファイル**: `src/main.cpp`(起動条件の反転)、`customizations.md`(判断結果の記録)、本ファイル(Phase 5完了メモの過去判断の更新)

**タスク**:
- [ ] `src/main.cpp`の起動分岐を反転し、JS版を既定の起動経路にする
- [ ] QMLウィンドウは当面残すが、明示的なオプトイン(環境変数等)でのみ起動する形にする、もしくは完全に起動経路から外す(実装時にユーザーと相談して決定)
- [ ] `customizations.md`・本ファイルに方針転換の経緯と結果を記録
- [ ] JS版で不足している機能がないか一通り洗い出し、QML側コード(`qml/`, 関連C++の一部)の削除タイミングを判断する

**完了条件・検証方法**: 環境変数なしでアプリを起動した際にJS版3ペインUIが開くこと。CLAUDE.mdの「終了→ビルド→起動→確認」手順で最終確認する。

**依存Phase**: Phase 6〜9完了後

**明示的にスコープ外とする項目(Phase 6〜12共通)**: `.osm`セッションの新規UI(既存`sourceList.save/load`をそのまま呼ぶだけなので専用UIは作らない)、CSVエクスポート、キャリブレーションファイルUI、TFC windowの詳細設定、`remote::Server/Client`連携、チャートのpointsPerOctave等の表示設定(Measurement設定ではなくChart/Plot設定のため対象外)。
