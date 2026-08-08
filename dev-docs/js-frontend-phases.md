# フロントエンドJS化 Phase分割計画

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md)の設計内容を、実装・検証の単位でPhaseに分割したもの。各Phaseは独立してビルド・動作確認できる粒度にしてあり、[customizations.md](customizations.md)に記載の個人開発の方針(コミット・pushを都度連動してよい)に沿って、Phase単位でコミットしていくことを想定している。

Phase 2(Phase・Coherence追加)まで完了。

## 進捗状況

| Phase | 内容 | 状態 |
|---|---|---|
| Phase 0 | 環境構築 | 完了 |
| Phase 1 | Magnitude単体疎通(最小の垂直スライス) | 完了 |
| Phase 2 | Phase・Coherenceを追加 | 完了 |
| Phase 3 | RTA(Spectrum)を追加 | 未着手 |
| Phase 4 | Spectrogramを追加 | 未着手 |
| Phase 5 | 結合検証・DataBridgeライフサイクル確定・QML版の扱い判断 | 未着手 |

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
- [ ] RTA用`SeriesSampler`実装(`module(i)`のみ使用、リファレンスチャンネル不使用)
- [ ] JS側Canvas描画(単一系列)
- [ ] 新旧表示値の突き合わせ検証

**完了条件・検証方法**: RTAチャートがJS側で正しく描画され、QML版と数値・見た目が一致すること

**依存Phase**: Phase 1完了後(Phase 2と並行着手可)

---

## Phase 4: Spectrogramを追加

**目的**: 51行の履歴バッファ/スクロール描画という、他4チャートと異なる設計([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.2節・3.3節)が必要なため最後に着手する。

**対象ファイル**: `src/chart/opengl/spectrogramseriesrenderer.cpp`/`.h`(移植元)、`src/chart/seriessampler.h`/`.cpp`(拡張)、`src/chart/databridge.h`/`.cpp`(1行pushへの変更)、JS側(ImageDataスクロールバッファ)

**タスク**:
- [ ] Spectrogram用`SeriesSampler`実装(`module(i)`のみ、1行分のデータを返す)
- [ ] `DataBridge`: 全履歴ではなく新規1行のみをpushするシグナルに変更
- [ ] JS側: 51行のスクロールバッファ実装(オフスクリーン`ImageData`に対する`putImageData`/`drawImage`での1行スクロール+1行追記)
- [ ] 新旧表示値の突き合わせ検証(該当行のみの比較でよい)

**完了条件・検証方法**: SpectrogramチャートがJS側で正しく描画され、QML版と数値・見た目(色マッピング含む)が一致すること

**依存Phase**: Phase 1完了後

**注意点**: [js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 2.3節の通り、既存QML版は毎フレーム全メッシュを再構築する方式だが、JS版は1行スクロール方式にするため描画方式そのものが異なる。見た目上の一致確認の際はこの違いを踏まえること。

---

## Phase 5: 結合検証・DataBridgeライフサイクル確定・QML版の扱い判断

**目的**: 5チャート全てが揃った状態で、複数パネル・複数ソースを同時に開いた場合の挙動を検証し、`DataBridge`のインスタンス管理(登録/解除タイミング、上限)を正式に設計する。あわせてQML版チャートコードを削除するかどうかを判断する。Phase 1〜4は1パネル・1ソースの素朴な実装に留めており、複数パネル対応の一般設計は本Phaseで初めて確定させる方針とした([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 5節の未決事項に対応)。

**対象ファイル**: `src/chart/databridge.h`/`.cpp`(一般化)、その他統合に伴う修正、`customizations.md`(判断結果の記録)

**タスク**:
- [ ] 複数チャートパネル・複数ソースを同時に開いた場合の`DataBridge`ライフサイクル設計(パネル追加/削除時の`registerObject`/`deregisterObject`連動、既存QMLの`Loader`/`Repeater`パターンとの対応)
- [ ] `DataBridge`インスタンス数の実用上の上限確認(実機でのパフォーマンス測定)
- [ ] 5チャート全てでQML版との表示値検証が完了していることの最終確認
- [ ] QML側の対応チャートコードを削除するか、しばらく両方残すかを判断し、結果を`customizations.md`に記録
- [ ] CLAUDE.md記載の動作確認手順(アプリ終了→ビルド→起動→ユーザー確認)に従って最終確認

**完了条件**: ユーザーによる動作確認完了、`DataBridge`ライフサイクル設計がドキュメント化されていること

**依存Phase**: Phase 1〜4完了後
