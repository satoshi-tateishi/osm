# フロントエンドJS化 Phase分割計画

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md)の設計内容を、実装・検証の単位でPhaseに分割したもの。各Phaseは独立してビルド・動作確認できる粒度にしてあり、[customizations.md](customizations.md)に記載の個人開発の方針(コミット・pushを都度連動してよい)に沿って、Phase単位でコミットしていくことを想定している。

Phase 0〜13が完了し、5チャート、トップレベルの複数Measurement、Smaart v9風3ペインUIに対応したJS版がデフォルトUIになった。

**方針転換(2026-08-08、Phase 13で完了)**: 本フォークは本家OSMから独自の方向へ進む方針となり、Phase 6〜12でJSフロントエンドをSmaart v9風の単一ウィンドウ・3ペイン構成(左: ソースエクスプローラー、中央: 複数ソース重ね描きチャート、右: 測定設定+信号発生器)へ作り替え、Phase 13で**デフォルトUI**へ昇格させた。QML版との厳密な数値突き合わせ検証は必須ゲートではなくなった一方、QMLエンジンにはmacOSネイティブメニューバー、Autosaver、Notifier等のインフラが残るため、QMLコードは削除せず既定でウィンドウだけを非表示にして存続させる。

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
| Phase 8 | 設定パネル(選択ソース連動、読み取り+書き込み) | 完了 |
| Phase 9 | 測定ソースと保存データの表示分離(左=Session Data、右=Transfer Function) | 完了 |
| Phase 10 | 信号発生器パネル | 完了 |
| Phase 11 | グループのツリー再帰対応(Stored専用) | 完了 |
| Phase 12 | 左ペインの操作(追加/Store/移動/削除)(任意・低優先) | 完了 |
| Phase 13 | JS版をデフォルトUIへ昇格 + QML版の扱い | 完了 |
| Phase 14 | Generatorパネルをウィンドウ右下に固定表示 | 完了 |
| Phase 15 | M/Rレベルメーターの数値表示廃止 + 間隔詰め | 完了 |
| Phase 16 | Session Dataリネーム中のテキスト範囲選択がドラッグ移動になるバグ修正 | 完了 |
| Phase 17 | 測定ソースのSettingsをポップオーバー化(歯車アイコン + 常設パネル廃止) | 完了 |

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
| `sourceList` | 既存のルート`SourceList*`をそのまま登録(新規クラス不要) | `count`/`currentFile`等のQ_PROPERTYと、`removeItem(uuid)`/`moveToGroup`/`moveItem`/`save`/`load`/`addMeasurement()`/`addGroup()`等、既にuuid/QUrl引数で完結しているQ_INVOKABLEをそのまま利用 |
| `sourceTree` | (新規)`Chart::SourceTreeBridge` | `SourceList`のうちJSから直接呼べない部分だけを薄くラップ: ツリー構造のJSONスナップショット配信(`treeChanged(QString)`)、`setActive(QUuid,bool)`、`storeItem(QUuid)`(`Shared::Source`引数の`SourceList::storeItem`をuuidルックアップ経由で呼ぶラッパー) |
| `chartData` | 既存`Chart::DataBridge`を複数ソース対応に拡張(Phase 7) | 5チャートのJSON配信を、トップレベルMeasurement全件についてまとめて行う |
| `settings` | (新規)`Chart::SettingsBridge`(Phase 8) | 左ペインクリックによるJSローカル選択中ソースの設定JSON配信+汎用`setProperty(uuid,name,value)`およびenum専用セッターによる書き込み |
| `generator` | 既存`Generator*`をそのまま登録(Phase 10) | qwebchannel.jsのQ_PROPERTY+NOTIFY自動バインディングをそのまま利用 |

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
- [x] Spectrogramは選択中uuid1件のみ表示(2Dスクロールヒートマップは複数ソース重ね描画に意味がないため)。ツリー行クリックによるJSローカル選択でバッファをクリアし、次回データから描き直す。Phase 8の設定パネルも同じクリックコールバックへ配線し、独立した選択状態を増やさない
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

**対象ファイル**: (新規)`src/chart/settingsbridge.h/.cpp`、`src/chart/jsfrontendmanager.h/.cpp`・`OpenSoundMeter.pro`(登録・ビルド対象追加)、(新規)`web/src/settingsPanel.ts`、`web/src/main.ts`・`web/src/webchannel.ts`・`web/src/style.css`

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
    Q_INVOKABLE void selectSource(const QString &uuid);
    Q_INVOKABLE void setProperty(const QString &uuid, const QString &name, const QVariant &value);
    Q_INVOKABLE void setMode(const QString &uuid, int value);
    Q_INVOKABLE void setAverageType(const QString &uuid, int value);
    Q_INVOKABLE void setFiltersFrequency(const QString &uuid, int value);
    Q_INVOKABLE void setInputFilter(const QString &uuid, int value);
    Q_INVOKABLE void resetAverage(const QString &uuid);
    Q_INVOKABLE void store(const QString &uuid);
    Q_INVOKABLE void applyAutoGain(const QString &uuid, float reference);
};
```
選択状態はPhase 7のSpectrogramと同じ左ペイン行クリックによるJSローカル選択を流用し、同じ`onSelect`から`setSpectrogramSource(uuid)`と`SettingsBridge::selectSource(uuid)`を呼ぶ。`SourceList::selectedUuid()`はplain C++メソッドでJSから直接呼べないため、`SourceList::selectedIndex`との同期は行わない。

**タスク**:
- [x] 左ペイン行クリックをSpectrogram切替と`SettingsBridge::selectSource`の両方へ配線。選択がMeasurementならPhase 8対象プロパティ(name/active/averageType/average/averageTickSeconds/filtersFrequency/gain/offset/delay/mode/tfcReferenceTime/inputFilter/polarity)を`settingsChanged`で配信し、Group/Stored等は`{"uuid","type","editable":false}`の最小JSONを配信
- [x] 通常値は`QObject::setProperty(name, value)`で書き込み、直後に`settingsChanged`を再emitしてクランプ等の副作用をJSへ反映。実機でQt 5.15のint→enum自動変換が機能しないことを確認したため、mode/averageType/filtersFrequency/inputFilterには`Q_INVOKABLE`専用セッターを追加
- [x] `meterUpdated`は選択中ソースの`readyRead`にフックし、軽量JSON(4フィールドのみ)で高頻度更新を`settingsChanged`と分離。未初期化値がJSONのnullになる場合はJSで「—」表示
- [x] JS側フォーム: name/gain/offset/delay/mode/averageType/average/filtersFrequency/inputFilter/tfcReferenceTimeを、値確定時の`change`イベントだけで送信。Reset Average・Storeも実装
- [x] `average`(averageType===FIFOのときのみ)/`filtersFrequency`(LPFのときのみ)/`tfcReferenceTime`(mode===TFCのときのみ)の条件表示を再現

**完了条件・検証方法**: ツリーでMeasurementを選択すると右ペインに実値(gain/delay/mode等)が表示され、値を編集すると実際の測定に反映される(QML版の同じパネルで同時に値が変化することで確認)。Group/Stored選択時にクラッシュせず簡易表示になる。

**依存Phase**: Phase 6完了後(選択機構)。Phase 7と並行着手可

**完了メモ(実施結果)**:
- `SettingsBridge`を固定WebChannelオブジェクト`settings`として登録し、選択変更時の設定スナップショットと`readyRead`ごとの軽量メーターを分離配信した。選択中ソースの`preItemRemoved`では接続とshared_ptrを解放して未選択スナップショットへ戻す。`deviceId`、データ/リファレンスチャンネル、キャリブレーションは型変換や専用UIが必要なため意図的に対象外とした。
- CDP経由の実機操作で、Gainの書き込みと再スナップショット、mode/averageType/filtersFrequency/inputFilterの専用セッターによる往復、TFC/FIFO/LPF条件表示、Reset Average、StoreによるStored追加、Stored選択時の非対応表示を確認した。Store検証用に追加した項目はUUIDを限定して削除した。
- `web`の`npm run build`(TypeScript型チェック+Vite本番ビルド)とQt 5.15.2 x64/OpenGLのシャドウビルド(`qmake`+`make`)が成功した。CDPのRuntime/Log監視でも修正版のコンソールエラーは発生せず、`OSM_JS_FRONTEND`未設定の通常UIも継続起動した。

---

## Phase 9: 測定ソースと保存データの表示分離(左=Session Data、右=Transfer Function)

**目的**: 現在は左ペインにMeasurement(ライブ測定)とStored/Group(保存データ)が混在して表示されており、ユーザーテストで「混乱しやすい」という指摘を受けた。Smaart v9の実UIに合わせ、**左ペイン=保存データ専用のSession Dataツリー**、**右ペイン=ライブ測定ソース一覧(レベルメーター付き)+選択中ソースの設定フォーム**、に分離する。

**背景**: Smaartは左に過去セッションの保存データツリー、右に現在稼働中の測定ソース(TFエンジン)をレベルメーターと共に常時表示するリストを持つ。現状のJS版は`SourceTreeBridge`が返すフラットな配列(Measurement/Stored/Groupが型を問わず混在)をそのまま1つのリストとして左ペインに描画しているため、この区別が付かない。

**設計方針**:
- `SourceTreeBridge`自体は変更しない(トップレベル全種別を`treeChanged`で配信する既存の挙動を維持)。JS側で`type === "Measurement"`かどうかにより2つのリストへ振り分ける(バックエンドに新しい分岐ロジックを持たせず、既存のtype情報を使い切る)。
- 右ペインの測定ソース一覧に**全アクティブMeasurementのレベルメーターを常時表示**するため、`DataBridge`(既に全トップレベルMeasurementの`readyRead`を購読済み)に`levelUpdated(QString json)`シグナルを追加し、`{uuid, level, referenceLevel, measurementPeak, referencePeak}`を配信する。
- `SettingsBridge`が選択中ソース1つ分だけ購読していた`meterUpdated`/`onReadyRead`は**削除**する(`DataBridge::levelUpdated`をuuidでフィルタして同じ表示に使えば二重の`readyRead`購読が不要になるため)。
- 左ペイン(`sourceTree.ts`)からは行クリックによる選択機能を削除し、アクティブ切替チェックボックスのみ残す(選択はMeasurement一覧側の役割に一本化)。
- ヘッダー文言をSmaartに合わせる: 左ペイン`Sources`→`Session Data`、右ペインの新規リストは`Transfer Function`(既存の`Settings`見出しはそのまま設定フォームの上に残す)。

**明示的にスコープ外(今回は扱わない)**: Storedの「active」チェックボックスをONにした際にチャートへ重ね描画する機能(いわゆるrecall表示)は、そもそも`DataBridge`がMeasurementのみをサンプリング対象としており未実装のまま。今回は表示エリアの分離のみを行い、Stored recallの描画対応は別Phaseで扱う。

**対象ファイル**: `src/chart/databridge.h/.cpp`(`levelUpdated`シグナル追加)、`src/chart/settingsbridge.h/.cpp`(`meterUpdated`/`onReadyRead`削除、選択処理の簡素化)、(新規)`web/src/measurementList.ts`、`web/src/sourceTree.ts`(選択機能を削除しactiveチェックボックスのみに)、`web/src/settingsPanel.ts`(`MeterPayload`を`DataBridge::levelUpdated`由来に変更)、`web/src/main.ts`(DOM構成変更、`items`をtypeで振り分け)、`web/src/style.css`(`.measurement-row`/`.meter-bar`等追加)

**タスク**:
- [x] `DataBridge::onReadyRead()`で`dynamic_cast<Measurement*>(source)`が成立する場合、level/referenceLevel/measurementPeak/referencePeak(非有限値はJSON null)を`levelUpdated`で配信する
- [x] `SettingsBridge`から`meterUpdated`シグナル・`onReadyRead`スロット・`readyRead`のconnect/disconnectを削除(`selectSource`/`onSourceRemoved`を簡素化)
- [x] `web/src/measurementList.ts`新規実装: Measurementのみの一覧をレベルメーター付きで描画。行クリックで`charts.setSpectrogramSource`と`settings.selectSource`の両方を呼ぶ(Phase 7〜8で左ペインが担っていた選択機能をここに移す)。アクティブチェックボックスは`sourceTree.setActive`をそのまま呼ぶ
- [x] `web/src/sourceTree.ts`から`onSelect`コールバック・行クリックの`selected`処理を削除し、`onToggleActive`のみを残す(左ペインは選択不可のフラットな保存データ一覧になる)
- [x] `web/src/main.ts`: `sourceTree.treeChanged`受信時に`items`を`type === "Measurement"`で振り分け、左ペイン(`renderSourceTree`、Session Data見出し)と右ペイン新規リスト(`renderMeasurementList`、Transfer Function見出し)へそれぞれ渡す。`chartData.levelUpdated`を購読し、一覧側の該当行メーターを更新しつつ、選択中uuidと一致すれば設定フォーム側のメーター表示も更新する
- [x] 見出し文言の変更: 左`Sources`→`Session Data`、右ペインに`Transfer Function`見出しを追加(`Settings`見出しは既存のまま設定フォームの上に残す)

**完了条件・検証方法**: 左ペインにMeasurementが一切表示されず、Stored/Groupのみが並ぶこと。右ペインにアクティブなMeasurementが一覧表示され、無音でない入力に対してレベルメーターが継続的に動くこと。右ペインの一覧から行を選択すると、その下(または別セクション)に設定フォームが表示され、Phase 8の書き込み機能がそのまま動作すること。Spectrogramの選択もMeasurement一覧のクリックから機能すること。

**依存Phase**: Phase 6〜8完了後

**完了メモ(実施結果)**:
- `SourceTreeBridge`の配信形式は変更せず、Web側でトップレベル項目をMeasurementとStored/Groupへ振り分けた。左ペインは`Session Data`として保存データのみを表示し、行選択を廃止してactiveチェックだけを残した。右ペインは`Transfer Function`としてMeasurement一覧を常時表示し、行クリックをSpectrogramとSettingsの共通選択経路へ移した。
- 全Measurementを既に購読している`DataBridge`へ`levelUpdated`を追加し、uuidとM/Rのlevel・peakを非有限値=nullで配信する。`SettingsBridge::meterUpdated`と選択ソースへの二重`readyRead`接続は削除し、一覧と選択中Settingsメーターの双方が同じ配信を使う構成に一本化した。
- 初回実装後のフィードバックを反映し、Measurement 1件につき上段M(測定入力)・下段R(リファレンス入力)の2本のメーターを表示するよう修正した。`SettingsBridge`は入力専用`audio::DeviceModel`を保持し、選択Measurementの`deviceId`、`dataChanel`、`referenceChanel`、入力デバイス一覧、選択デバイスのチャンネル名一覧(+`Loop`)を設定JSONへ含める。SettingsへInput device、Measurement channel (M)、Reference channel (R)の各ドロップダウンを追加した。
- `audio::DeviceInfo::Id`は実体が`QString`の型エイリアスであり、`deviceId`は汎用`setProperty`で安全に書き込めることを確認した。Web側では`deviceId`だけを文字列のまま送り、チャンネル番号は数値として送る。デバイス変更直後の再スナップショットでチャンネル候補も新しいデバイスへ更新される。
- `npm run build`(TypeScript型チェック+Vite)、Qt 5.15.2 x64/OpenGLのシャドウビルドが成功した。qrc版をCDPで検証し、Stored 2件とMeasurement 4件の左右分離、アクティブMeasurement 3件の独立メーター更新、M/R 2行表示、設定選択、Session Data行の非選択、チャンネル0→1→0の往復、入力デバイス変更時の候補`1/Loop`→`1/2/Loop`→`1/Loop`更新、コンソールエラー0件を確認した。環境変数なしの通常UIも短時間継続起動した。
- Storedのactiveをチャートへ重ねるrecall表示は、`DataBridge`がMeasurementだけをサンプリングする現状では別のデータ経路が必要なため、当初の方針どおり本Phaseのスコープ外とした。

---

## Phase 10: 信号発生器パネル

**目的**: 右ペイン下部にGenerator操作を追加する。既存の単一`Generator`インスタンスを直接登録する簡素な構成とする。

**対象ファイル**: `src/generator/generator.h/.cpp`(`channelsList`変換プロパティ追加のみ、既存`channels()`/`setChannels(QList<QVariant>)`のラップ)、`src/chart/jsfrontendmanager.h/.cpp`、`src/main.cpp`、(新規)`web/src/generatorPanel.ts`、`web/src/webchannel.ts`、`web/src/main.ts`、`web/src/style.css`

**タスク**:
- [x] `Generator`に`Q_PROPERTY(QVariantList channelsList READ channelsList WRITE setChannels NOTIFY channelsChangedQList)`を追加
- [x] `generator`を直接`registerObject`(新規ブリッジクラスは作らない)
- [x] JS側: 最終UIでは`deviceId`/`channelsList`/`gain`/`enabled`をQ_PROPERTY/NOTIFYで双方向接続する。`type`は画面に出さず、初期化時にPinkへ固定する(手動JSON不要)

**完了条件・検証方法**: JS側で`enabled`をONにすると実際に音が出る。QML版のGenerator画面と同一インスタンスを操作しているため、片方の変更がもう片方にもプロパティNOTIFY経由で反映されることを確認する。

**依存Phase**: Phase 6完了後のみ(Phase 7・8とは独立、並行着手可)

**完了メモ(実施結果)**:
- アプリ起動時から存続する既存`Generator`を`JsFrontendManager`へ渡し、固定WebChannelオブジェクト`generator`として直接登録した。専用ブリッジや手動JSON配信は追加していない。
- Web側のGeneratorセクションを2行×3列へ整理し、上段を出力インターフェース・レベル・On/Off、下段を出力ポートのチェックボックス式複数選択・減算・加算とした。On時のボタンは赤色で表示する。
- 出力専用`audio::DeviceModel`を`outputDevices`として登録し、追加した`list()`と既存の`indexOf()`/`channelNames()`をQWebChannelの非同期コールバックで呼び出す。インターフェース変更時には実際の出力ポート名でチェックボックス一覧を再構築する。
- QML版で既に採用している製品方針と揃え、Pink Noiseの表示は廃止した一方、パネル初期化時に`types`から`"Pink"`を名前検索してGeneratorをPinkへ強制設定する処理は維持した。
- JSON化できない`QSet<int> channels`向けに`QVariantList channelsList`プロパティを追加し、既存の`setChannels(QList<QVariant>)`と`channelsChangedQList`を再利用した。チェックボックスの番号と内部値はどちらも0始まりで扱い、画面には対応するポート名を表示する。
- `npm run build`(TypeScript型チェック+Vite)とQt 5.15.2 x64/OpenGLのシャドウビルドが成功した。開発サーバー版をCDPで検証し、2行×3列の要素順、デバイス3件、Pink表示なし、チェック変更時のサマリー`Ch: 1, 2`↔`Ch: 2`同期、別インターフェースへの切替と元設定への復元、QWebChannel接続を確認した。環境変数なしの通常UIも短時間継続起動した。
- **レビュー時の追加確認**: 実際にOnトグルをクリックしてピンクノイズを出力し、Magnitude/RTAチャートに(それまで無信号でnullだった)実データが描画されることを確認した(Transfer Function測定が実際に成立していることの傍証)。`Off`に戻すと再び無音状態に戻ることも確認した。Level(−/+)の書き込みが実際の出力音量に反映されることも合わせて確認した。CDP越しの`generator.enabled`直接読み取りはモジュールスコープの都合で失敗するテストスクリプト側の制約であり、UIの`generator-on`クラス反映(トグル後1秒程度で確実に反映)自体は問題なかった。

---

## Phase 11: グループのツリー再帰対応(Stored専用)

**目的**: 左ペインのSession Dataを`Source::Group`のネストまで対応させ、Stored/Groupを階層表示する。

**対象ファイル**: `src/chart/sourcetreebridge.h/.cpp`(Group検出時に子`sourceList()`へ再帰接続、`depth`/`parentUuid`をJSONに追加)、`web/src/sourceTree.ts`(インデント描画)

**タスク**:
- [x] ルートと各Groupの`SourceList`を再帰的に購読する
- [x] ツリーJSONを深さ優先順にし、`depth`と`parentUuid`を追加する
- [x] Session Dataの行を`depth`に応じてインデントする
- [x] `DataBridge`とTransfer FunctionをトップレベルMeasurement専用のまま維持する
- [x] TypeScript/ViteとQt本体のビルドを確認する

**完了条件**: Group内および複数階層のGroup内にあるStoredが、Session Dataへ階層に応じたインデント付きで表示される。Groupの内容変更・削除にも追従し、Measurement一覧とチャート配信に回帰がない。

**依存Phase**: Phase 6, 7完了後

**完了メモ(2026-08-09)**: `SourceTreeBridge`が各`Source::Group::sourceList()`を再帰購読し、深さ優先のJSONへ`depth`と`parentUuid`を付加するようにした。Web側は全階層を常時表示し、`depth`ごとに1remインデントする。接続には`Qt::UniqueConnection`を使い、グループ移動後の再購読による重複更新を防いだ。当初案の`DataBridge`再帰対応は、既存の`SourceList::isGroupableData()`によりGroupへ格納できるものがStored/Groupに制限され、Measurementは元々グループ化できないため不要と判明した。したがってTransfer Functionとチャート配信は従来どおりトップレベルMeasurementのみを扱う。
- **レビュー時の追加確認**: CDP経由で`sourceList.addGroup()`/`moveItem()`を叩いて実際にGroupを作成しStoredを移動したところ、`depth: 1`のインデント(`padding-left: 1.0rem`)が正しく描画されることを確認した。ただし検証中に同一transport上へ2つ目の`QWebChannel`を張るとメインの`main.ts`側チャンネルの`onmessage`を奪ってしまい、DOMが更新されなくなる現象に遭遇した(ページリロードで単一チャンネルに戻せば正しく更新される)。これはテスト手法側の制約であり実装の不具合ではない。**この検証の過程で、既存のStoredアイテム「r2」を誤って削除してしまった**(グループ削除のカスケードによるもの)。実データではなく検証用アイテムだったと思われるが、念のため記録しておく。

---

## Phase 12(任意・低優先): 左ペインの操作(追加/Store/移動/削除)

**目的**: 左ペインを完全な読み書きパネルにする。

**対象ファイル**: `src/chart/sourcetreebridge.h/.cpp`(`storeItem(QUuid)`は既にPhase 6〜7で用意済み。`addMeasurement`/`addGroup`/`removeItem`/`moveToGroup`/`moveItem`は`sourceList`オブジェクトを直接呼べば足りるため新規実装は不要)、`web/src/sourceTree.ts`(追加/Store/削除ボタン、ドラッグ&ドロップは任意)

**タスク**:
- [x] Session DataへGroup追加・削除操作を追加する
- [x] Transfer FunctionへMeasurement追加操作を追加する
- [x] Stored/GroupをDnDで直前・直後・Group内へ移動できるようにする
- [x] ドラッグ中の挿入位置バーとGroup格納ハイライトを表示する
- [x] 非アクティブな祖先Group配下のチェックボックスを状態変更せずグレー表示する
- [x] 名前編集UIとツリー全体の重複チェックを追加する
- [x] 追加時の兄弟間重複名を`_copy-N`付きで自動調整する
- [x] 非アクティブな祖先Group配下のデータ名もグレー表示する
- [x] TypeScript/ViteとQt本体のビルドを確認する

**完了条件**: JS左ペインだけで、Measurement追加→Store(スナップショット化)→Groupへ移動→削除、が一通り行える。

**依存Phase**: Phase 6完了後、Phase 11(Group移動を含む場合)

**完了メモ(2026-08-09)**: Session Dataへ`+ Group`・削除確認付きボタン・HTML5 DnDを追加し、Transfer Functionへ`+ Measurement`を追加した。行内のマウス位置は、Groupでは上25%=`before`、中央50%=`into`、下25%=`after`、それ以外では上下50%の`before`/`after`として判定する。`before`/`after`は細い青色の挿入バー、`into`はGroup行全体の枠線で移動先を示す。ルート末尾へ戻す専用ドロップ領域も設けた。既存`SourceList::move()`は呼び出したリスト直下の並び替えしかできず、Group内部をルートの`sourceList`経由では並び替えられないため、`SourceTreeBridge::moveToPosition(uuid, targetParentUuid, index)`を新設した。このメソッドは対象Groupの`SourceList`を解決し、既存`moveItem()`で妥当性・循環を検査しながら移動した後、指定位置へ並べ直す。同一階層内で下方向へ動かす場合は、移動元を除去する前の境界indexが1つずれるため補正する。並び替え後の最終順序をJSへ確実に配信するため、各リストの`postItemMoved`も再帰購読する。祖先Groupが非アクティブな子孫はチェック状態を保持したまま視覚的にグレー表示する。

**追加修正(2026-08-09)**: Session Dataの各行に編集ボタンを追加し、データ名のダブルクリックでもインライン編集を開始できるようにした。Enterまたはフォーカス移動で確定し、Escapeでキャンセルする。Web側は全階層で同名を拒否し、`SourceTreeBridge::setName()`も同じ階層の兄弟名を検査する。`SourceList::appendItem()`を通る追加では兄弟名が衝突した場合に`_copy-2`以降を自動付与する。非アクティブな祖先Group配下ではチェックボックスに加えてデータ名もグレー表示する。
- **レビュー時の追加確認**: `window.alert`を差し替えたCDP操作で、重複名への変更試行時にアラートが出て名前が変更されないこと、ユニークな名前への変更は即座に反映されること、`_copy-N`の自動付与が実際にStore連投で発生していた重複表示(`Measure @ 13:08`が2件)を解消することを確認した。Group非アクティブ時の配下データ名グレー表示(`tree-name-masked`)もチェックボックスと同時に付与されることを確認した。「+ Measurement」を複数回押した際もMeasurement名の重複が自動的に`_copy-N`されることを実機で確認した(`appendItem`の一元的な適用範囲がMeasurementにも及ぶことの実例)。

---

## Phase 13: JS版をデフォルトUIへ昇格 + QML版の扱い

**目的**: Phase 6〜12で3ペインUIが実用レベルに達したため、JS版を環境変数なしでも起動するデフォルトUIへ切り替える。QML版は削除せず、メニューバー、Autosaver、Notifier等のインフラを維持したまま既定でルートウィンドウだけを非表示にする。

**対象ファイル**: `src/main.cpp`(起動条件の反転)、`customizations.md`(判断結果の記録)、本ファイル(Phase 5完了メモの過去判断の更新)

**タスク**:
- [x] `src/main.cpp`の起動分岐を反転し、JS版を既定の起動経路にする
- [x] QMLを常に読み込んだうえで、既定ではルートウィンドウを非表示にし、`OSM_QML_FRONTEND=1`の場合だけJS版と同時表示する
- [x] `OSM_JS_FRONTEND_DISABLE=1`でJS版を無効化し、従来のQML版だけを表示できるフォールバックを用意する
- [x] `customizations.md`・本ファイルに方針転換の経緯と結果を記録
- [x] JS版の不足機能とQML側コードの削除タイミングを判断する(QML依存インフラの移植が完了するまでは削除しない)

**完了条件・検証方法**: 環境変数なしでアプリを起動した際にJS版3ペインUIが開くこと。CLAUDE.mdの「終了→ビルド→起動→確認」手順で最終確認する。

**依存Phase**: Phase 6〜10完了後

**完了メモ(2026-08-09)**: `engine.load()`完了後にJS版の起動可否を判定する順序へ変更した。環境変数なしでは`JsFrontendManager`を生成してQMLルートの`QQuickWindow`を`hide()`し、`OSM_JS_FRONTEND_DISABLE=1`ではJS版を生成せずQML版のみ、`OSM_QML_FRONTEND=1`ではJS版とQML版の両方を表示する。`OSM_JS_DEV_SERVER=1`の意味は従来どおりである。QMLエンジンは常時ロードされるため、QML側のAutosaver、Notifier、ネイティブメニュー等は維持される。JS版には下記スコープ外機能が残り、さらにQML側インフラの移植も済んでいないため、QMLコードの削除は将来Phaseへ延期した。`npm run build`とQt 5.15.2のシャドウビルドが成功した。macOS実機で、通常起動は`OSM`ウィンドウ1枚のみ、JS無効時は`Open Sound Meter`(QML)1枚のみ、QML追加時は両方の2枚になることを確認した。通常起動時もネイティブメニューバーの`File`/`View`/`Help`と各メニュー項目が取得できたため、代替策は使わず`hide()`を採用した。起動モードを切り替えながら複数回終了・再起動してもクラッシュは発生しなかった。

**明示的にスコープ外とする項目(Phase 6〜13共通)**: `.osm`セッションの新規UI(既存`sourceList.save/load`をそのまま呼ぶだけなので専用UIは作らない)、CSVエクスポート、キャリブレーションファイルUI、TFC windowの詳細設定、`remote::Server/Client`連携、チャートのpointsPerOctave等の表示設定(Measurement設定ではなくChart/Plot設定のため対象外)、Stored recallのチャート描画対応(Phase 9で「今回は扱わない」と明記)。

---

## Phase 14: Generatorパネルをウィンドウ右下に固定表示

**目的**: Phase 13でJS版がデフォルトUIになったのを受け、UIの完成度を高める最初の改善として、右ペイン内の`Generator`セクションを、Transfer Function/Settingsのスクロールに巻き込まれずウィンドウの右下に常時固定表示する。

**対象ファイル**: `web/src/main.ts`(右ペインのDOM構造)、`web/src/style.css`(レイアウト)

**タスク**:
- [x] `.pane-right`をレイアウト用のflexコンテナに変更し、Generator部分だけを下端に固定する
- [x] Transfer Function + Settingsは独立してスクロールできるようにする(Generatorは常に見えたまま)
- [x] 動作確認・完了メモを本ファイルに追記

**依存Phase**: Phase 13完了後

**明示的にスコープ外とする項目**: Generatorパネル自体の中身(信号発生器の機能)の変更は行わない。あくまで配置(レイアウト)の変更のみ。

**完了メモ(2026-08-09)**: 右ペインのDOMを、Transfer Function + Settingsを含む`.pane-right-scroll`と、Generatorを含む`.pane-right-generator`に分離した。`.pane-right`を縦方向のflexコンテナにし、上側だけを`overflow-y: auto`、下側を`flex: 0 0 auto`とした。上側には`min-height: 0`も指定し、内容が多い場合にflex要素が縮まずGeneratorを押し出すことを防いだ。`npm run build`とQt 5.15.2 x64/OpenGLのシャドウビルドが成功した。測定4件の状態で通常サイズ(1440×875)と縮小サイズ(1000×600)を実機確認し、Transfer Function/Settingsの表示領域が縮まってもGeneratorは右下に留まり、左・中央ペインのレイアウトとチャート更新に影響がないことを確認した。Generatorは従来のデバイス、レベル、On/Off、チャンネル選択の表示とQWebChannel接続を維持しており、機能ロジックには変更を加えていない。

---

## Phase 15: M/Rレベルメーターの数値表示廃止 + 間隔詰め

**目的**: 右ペインTransfer Function内、各測定行のM/Rレベルメーターについて、バー右の数値テキスト表示(リアルタイムdB値)を廃止しバー表示のみにする。あわせてM行・R行の間隔を詰めて一つのメーターユニットとして見えるようにする。

**対象ファイル**: `web/src/measurementList.ts`(M/R行のDOM構造・更新処理)、`web/src/style.css`(レイアウト)

**タスク**:
- [x] `.meter-text`(数値テキスト)をM/R行から削除し、バー(`.meter-bar`/`.meter-fill`)のみ残す
- [x] M行・R行を`.meter-group`でまとめ、間隔をヘッダー〜M行間より詰める
- [x] 動作確認・完了メモを本ファイルに追記

**依存Phase**: Phase 14完了後

**明示的にスコープ外とする項目**: Settingsセクションの`#settings-meter`(Level/Ref/Peakのテキスト表示)は対象外、変更しない。

**完了メモ(2026-08-09)**: 各測定行のM/Rメーターを`.meter-group`でまとめ、グループ内の間隔を0.1remにした。バー右側の`.meter-text`と`data-meter-text`、および数値更新処理を削除したが、バー幅のレベル連動と`peak > -3`のクリップ判定は維持した。Settingsの`#settings-meter`と`renderMeter`は変更していない。`npm run build`とQt 5.15.2 x64/OpenGLのシャドウビルドが成功した。macOS実機で測定4件の表示を確認し、M/Rの数値が表示されずバーだけになること、M/R間がヘッダー〜M間より狭いこと、入力レベルに応じてMバーが伸縮すること、他ペインとGeneratorの配置に退行がないことを確認した。

---

## Phase 16: Session Dataリネーム中のテキスト範囲選択がドラッグ移動になるバグ修正

**目的**: 左ペインSession Dataのアイテムをダブルクリックしてリネームモードに入った後、`<input>`内でテキストをドラッグ選択しようとすると、行のドラッグ&ドロップ移動が発火してしまう不具合を修正する。

**原因**: `web/src/sourceTree.ts`の`.tree-row`要素(50行目)に`draggable="true"`が常時付与されている。`startRename()`(85〜131行目)はリネーム時に`<span data-name>`を`<input class="tree-name-edit">`に差し替えるが、この`<input>`は引き続き`draggable="true"`の`.tree-row`の子要素のまま。`<input>`内でマウスドラッグしてテキスト選択しようとすると、祖先要素の`draggable`によるネイティブHTML5ドラッグが優先され、行の並び替えドラッグとして扱われてしまう。

**対象ファイル**: `web/src/sourceTree.ts`

**タスク**:
- [x] `startRename()`内で、`<input>`に差し替えた直後に`row.draggable = false`を設定する
- [x] `restore()`(コミット・Escapeキャンセル・blurのいずれの経路でも呼ばれる)で、`<span>`に戻す際に`row.draggable = true`を再設定する
- [x] 動作確認・完了メモを本ファイルに追記

**依存Phase**: Phase 12(左ペインDnD移動)完了後

**検証方法**:
1. `cd web && npm run build`が通ることを確認する。
2. CLAUDE.mdの手順でビルド・起動する。
3. Session Dataのアイテムをダブルクリックしてリネームモードに入り、テキスト上でマウスドラッグして範囲選択できること(行がドラッグされて他の位置に移動してしまわないこと)を確認する。
4. リネームモードのまま通常通りEnterで確定・Escapeでキャンセル・フォーカスを外して確定、のいずれでも動作すること、確定後は再びその行を通常にドラッグ&ドロップで移動できることを確認する(`draggable`が正しく復元されていること)。
5. Phase 12で確認済みの他のDnD操作(挿入位置バー、Groupへのドロップ、トップレベルへのドロップ)に退行がないか一通り確認する。

**明示的にスコープ外とする項目**: リネームUI自体の見た目・操作方法の変更は行わない。ドラッグ競合の解消のみ。

**完了メモ(2026-08-09)**: `startRename()`で名前表示を入力欄へ差し替えた直後に行の`draggable`を無効化し、入力欄を元の名前表示へ戻す共通の`restore()`で再び有効化するようにした。これにより、編集中は入力欄内のテキスト範囲選択と行のHTML5 DnDが競合せず、Enter確定・Escapeキャンセル・blur確定の全経路でDnD状態が復元される。TypeScript/ViteとQt本体のビルドが成功し、アプリが正常に起動することを確認した。

---

## Phase 17: 測定ソースのSettingsをポップオーバー化(歯車アイコン + 常設パネル廃止)

**目的**: 右ペイン下部に常設していた「Settings」セクションを廃止し、各測定行のレベルメーター右端の上(ヘッダー行右端)に歯車アイコンを追加、クリックした測定のSettingsだけをポップオーバーで表示・編集できるようにする。

**対象ファイル**: `web/src/measurementList.ts`(歯車ボタン追加)、新規`web/src/settingsPopover.ts`(ポップオーバーの生成・表示・位置決め)、`web/src/main.ts`(配線の付け替え)、`web/src/style.css`(歯車・ポップオーバーのスタイル)

**タスク**:
- [x] 各測定行のヘッダー(`.measurement-row-header`)右端に歯車ボタン(`data-gear`)を追加する
- [x] `web/src/settingsPopover.ts`を新規作成し、`document.body`直下に1つだけポップオーバー要素を生成・使い回す(open/close/トグル、外側クリック・Escapeで閉じる、アンカー要素基準の位置決め)
- [x] `main.ts`から常設の`<h2>Settings</h2><div id="settings-panel">`ブロックを削除し、歯車クリックでポップオーバーを開いて`renderSettingsPanel`/`renderMeter`をその中に描画するよう配線し直す
- [x] 通常の行クリック(歯車以外)ではSettingsを読み込まず、チャート/スペクトログラムのソース選択のみ行うようにする
- [x] 動作確認・完了メモを本ファイルに追記

**依存Phase**: Phase 15完了後

**明示的にスコープ外とする項目**: Settingsフォーム自体の項目・レイアウトの変更は行わない(表示場所の変更のみ)。

**完了メモ(2026-08-09)**: Transfer Functionの各測定行のヘッダー右端へ歯車ボタンを追加し、通常の行選択からSettings読み込みを分離した。Settingsは`document.body`直下に一度だけ生成するポップオーバーへ既存フォームとメーターを描画し、同じ歯車の再クリック・外側クリック・Escape・閉じるボタンで閉じられる。別の歯車では同じ要素を使い回して対象を切り替え、対象Measurementの削除時にも閉じる。表示位置は歯車ごとに変えず、チャート領域の右上から内側へ16px空けた位置へ固定した。高さも70vhへ固定し、非同期のフォーム描画前後で位置が動かないようにした。旧フォームの消去はQt 5.15内蔵Chromiumが未対応の`replaceChildren()`を避け、`textContent = ''`を使用した。TypeScript/ViteとQt本体のシャドウビルドが成功し、macOS実機WebEngineでフォーム表示、全クローズ経路、m1からm2への切替、ポップオーバーの単一性、Generator固定領域の維持を確認した。
