# フロントエンドJS化 移行計画

## 1. 背景・目的

サイドバーのデータカラム(Stored/Groupのインライン展開・Drag&Dropによる並び替え・Group出し入れ)をQMLの`MouseArea`+`Drag`/`DropArea`+`ListView`で実装する過程で、以下のような細かく再現しづらいバグを繰り返し踏んだ:

- ドラッグ中のGroup自身の高さ(展開時は子要素分だけ拡大)に`Drag.hotSpot`が連動し、ドロップ判定基準点が実際のカーソル位置から大きくズレる。
- Group行自身の`DropArea`が展開時の子要素領域まで覆ってしまい、子同士の並び替えが「Groupへの出し入れ」に誤判定される。
- ホバー中のライブ並び替え(`onPositionChanged`)を高頻度に呼んだ結果、直前の並び替えのアニメーション/モデル更新が収束する前に次の並び替えが走り、内部インデックスが破損(`move element from out the bounds`)して、その後の操作(Group外への移動)が丸ごと機能しなくなる。
- 循環インポート回避のため`SourceLayout.qml`の再帰埋め込みを`Loader { source: "qrc:/SourceLayout.qml" }`というURL経由ロードにせざるを得ない、など。

これらはQMLの`MouseArea`/`Drag`&`DropArea`が、ネストしたツリー構造上のライブD&Dのような複雑なインタラクションに対しては低レベルすぎる(インデックス管理・ゴースト表示・ネストしたドロップゾーンの扱いをすべて自前実装する必要がある)ことに起因すると考えられる。この経験を踏まえ、フロントエンドをJS/Webベースへ作り替える案をユーザーと検討し、以下の前提で合意した:

- **本家OSMとの互換性・追従は一切考慮しない**(このリポジトリは個人フォークのため)。
- **チャート描画自体のレイテンシは問題にならない**という判断(後述の通りブラウザのGPU合成はネイティブ同等の頻度で動くため)。唯一のレイテンシ要因はC++⇄JS間のデータ配信経路だが、数ms程度のオーバーヘッドは知覚できないため許容する。
- **第一目標**: "Spectrum"(=RTA)・"Magnitude"・"Phase"・"Coherence"・"Spectrogram"の5チャートをJSフロントエンドで表示できること。

本ドキュメントは、この移行の設計方針とロードマップをまとめたものである。**現時点ではまだ実装に着手していない**(コード変更・ビルド設定変更は本ドキュメント作成の対象外)。

## 2. 現状アーキテクチャの要点

### 2.1 C++/QML境界

`src/main.cpp`で以下がQML側に公開されている:

- `qmlRegisterType`/`qmlRegisterUncreatableType`: `DeviceModel`, `VariableChart`, `Measurement`, `Union`, `Stored`, `StandardLine`, `SourceModel`, `Settings`, `Appearance`, `Notifier`, `MeterPlot`, `SourceGroup`(+ uncreatableな`SourceList`, `Shared::Source`, `Filter`列挙体, iOS専用`FileDialog`)。
- `setContextProperty`: `appVersion`, `applicationSettings`, `applicationAppearance`, `globalSmoothing`, `sourceList`, `generatorModel`, `targetTraceModel`, `notifier`, `autoSaver`, `remoteServer`, `remoteClient`。

これら約23個の統合ポイントそれぞれが多数のQ_PROPERTY/Q_INVOKABLEを持ち、QML側から広く参照されている。

### 2.2 チャートのデータモデル

`Abstract::Source`/`Abstract::Data`(`src/abstract/`)が、ビンごとのアクセサを提供する:

- `frequency(i)`, `module(i)`: 生の振幅(RTA/Spectrumおよび Spectrogramが使用、単一チャンネル)。
- `magnitudeRaw(i)`, `phase(i)`, `coherence(i)`: データチャンネル対リファレンスチャンネルの複素比から算出(Magnitude/Phase/Coherenceが使用)。

`Measurement`(`src/source/measurement.cpp`)が専用タイマースレッドでFFT(既定4096サンプル、`FFT12`)を計算し、`TIMER_INTERVAL = 80ms`(約12.5Hz、コメントに"12.5 per sec"とある)ごとに`readyRead()`を発火する。この12.5Hzは音声コールバックのレートにも画面のvsyncにも依存しない、独立した「チャート更新レート」である。

チャート種別と設定文字列の対応(`Chart::*Plot::setSettings`の`type`判定より確定):

| UI表示名 | 実体クラス | `type`文字列 |
|---|---|---|
| Spectrum | `Chart::RTAPlot` | `"Spectrum"` |
| Magnitude | `Chart::MagnitudePlot` | `"Magnitude"` |
| Phase | `Chart::PhasePlot` | `"Phase"` |
| Coherence | `Chart::CoherencePlot` | `"Coherence"` |
| Spectrogram | `Chart::SpectrogramPlot` | `"Spectrogram"` |

いずれも共通基底`Chart::FrequencyBasedPlot`と`Measurement`のFFTを共有し、RTA/Spectrogramはリファレンスチャンネルを使わない(`module(i)`のみ)点が Magnitude/Phase/Coherenceと異なる。

### 2.3 データ点数とレンダリング方式

- 曲線はオクターブ平滑化済みで、1曲線あたり約60〜130点(`pointsPerOctave`既定6、20Hz〜20kHzの約10オクターブ)。生FFTの4096点そのままではない。
- Spectrogramは51行の履歴バッファ(`std::deque`、`if (history.size() > 51) pop_front()`)を保持し、各行約66〜130点、**毎フレーム全メッシュを再構築**して描画している(インクリメンタルなテクスチャスクロールではない)。
- 現状の描画は`QQuickFramebufferObject`(`src/chart/opengl/seriesfbo.cpp`)がホストする`Chart::SeriesRenderer`派生クラス内で、C++側が手動でOpenGL頂点バッファ(`std::vector<GLfloat>`、1頂点6floatのxy+rgba)を構築・アップロードしている。Qt Quick Scene Graphの自動ジオメトリ機構は使っていない。Metal版(`src/chart/metal/*.mm`)も同様にCPU側でジオメトリを構築する設計。
- **オクターブ平滑化ロジックは現状レンダラー内に埋め込まれている**(`src/chart/opengl/magnitudeseriesrenderer.cpp`, `frequencybasedseriesrenderer.cpp`, `spectrogramseriesrenderer.cpp`等)。GL頂点構築のコードと分離されておらず、「平滑化済み配列だけを返すAPI」は現状存在しない。

### 2.4 既存のリモート機能(`src/remote/`)は再利用しない

このフォークではリモート接続機能自体を使用しないため直接の影響はないが、参考として調査した結果:

- JSON over 独自長さプレフィックス付きTCP(zlib圧縮)+ UDPマルチキャスト(LAN上のディスカバリ/ハートビート用)。
- 1接続につき1リクエスト1レスポンスで即切断、かつ**全ソースの取得が単一のin-flightリクエストに直列化**されており(`m_onRequest`)、250ms間隔でポーリングする設計。
- `requestData`メッセージで周波数ビンごとの`{frequency, module, magnitudeRaw, phase, coherence}`とインパルス応答は送れるが、**Spectrogram/RTA用のデータは一切含まれていない**。

データ形状(mag/phase/coherence per bin)は参考になるが、トランスポート(直列化されたポーリング、spectrogram非対応、冗長なJSON数値)は複数チャート・複数ソースを12.5Hzで同時配信する用途には不向きであり、新設計では流用しない。

## 3. 推奨アーキテクチャ

### 3.1 ホスティング方式: QtWebEngine + QWebChannel(同一プロセス内)

**Tauri/Electron + 別プロセスWebSocketではなく、QtWebEngine + QWebChannelを採用する。**

理由:

- QWebChannelはQtのメタオブジェクトシステムを反映し、Q_PROPERTY/Q_INVOKABLE/シグナルを自動でJSプロキシ化する。既存の`SourceList`/`Settings`/`Measurement`等の公開面(2.1節)をほぼそのまま`QWebChannel::registerObject()`で公開でき、Tauri/Electron+WebSocket案のように全プロパティのシリアライズ/購読コードを手書きする必要がない。
- パッケージング面でも`.pro`に`QT += webenginewidgets webchannel`を1行加えるだけで済み、Node/Rustランタイムや別のビルド・リリースパイプラインを新設する必要がない。
- QtWebEngineはChrome DevTools Protocolによるリモートデバッグ(`QTWEBENGINE_REMOTE_DEBUGGING=<port>`)に対応しており、実際のChrome/Edgeを繋げば通常のWebアプリと同じデバッグ体験が得られる。
- 開発中のホットリロードは、`QWebEngineView`の読み込み先をVite開発サーバー(`http://localhost:5173`)に向けることで実現できる。リリースビルドでは`qrc:/`にバンドルした静的ファイルを読み込む。これにより「開発時の速さ」と「リリース時の単一バイナリ配布」を両立できる。

**この方式が向かないケース**(今回は非該当): JSフロントエンドを将来的にタブレット/スマホの実ブラウザからも使う主要UIにしたい場合や、フロントエンドのリリースサイクルをC++アプリと完全に分離したい場合はTauri/Electron+WebSocketの方が適している。QWebChannelのトランスポートは抽象化されており(`QWebChannelAbstractTransport`)、同じ登録済みQObjectを後から`QWebSocketServer`経由でLAN上の実ブラウザにも公開する拡張は可能なので、この選択肢は将来的にも閉じない。

### 3.2 データ配信層の新設

`Abstract::Data`の生アクセサ(`frequency(i)`等、ビンごとのメソッド)を直接QWebChannelのプロパティ/シグナルとして晒すのは避ける。QWebChannelはスカラー値のプロパティ/シグナル向けであり、60〜130点を個別invokable呼び出しで取得すると、`src/remote/`と同じ「スループットの直列化」問題を再現してしまう。

代わりに以下の新規レイヤーを設ける:

1. **`Chart::SeriesSampler`(仮称)**: チャート種別(RTA/Spectrum, Magnitude, Phase, Coherence, Spectrogram)ごとに1つ。現在各`*seriesrenderer.cpp`に埋め込まれているオクターブ平滑化ロジック(バケット集計・`pointsPerOctave`・`module()`/`magnitudeRaw()`/`phase()`/`coherence()`呼び出し)を**そのまま流用して抽出**し、GL頂点ではなくプレーンな`QVector<float>`(または周波数/振幅/位相/コヒーレンスを並列に持つ小さなPOD構造体)を返すようにする。既存のOpenGL/Metalレンダラーも将来的に同じサンプラー出力を消費する形に寄せられる副次効果がある。
2. **`Chart::DataBridge`**: 開いているチャートパネル+ソースの組ごとに1インスタンス。`Measurement::readyRead()`(既存の12.5Hzシグナル)を契機に対応する`SeriesSampler`を実行し、配列一式を1回のシグナルでpush配信する(例: `seriesUpdated(sourceId, freq[], mag[], ...)`)。JS側は表示しているパネル分だけQWebChannel経由で購読する。

この設計により、(a) 既存のQMLチャートを駆動しているのと同じシグナルを起点としたpush型になり、(b) パネル/ソースごとに独立して配信されるため、パネル数が増えても`src/remote/`のような直列化ボトルネックが生じない。Spectrogramは毎回全履歴を送らず、新規1行だけをpushし、JS側で51行のスクロールバッファ(`Array.push`/`shift`)を保持する。

### 3.3 JS側の描画方式: 素のCanvas 2D

1曲線60〜130点、パネルあたり最大5曲線、Spectrogram 51行×約130点、更新12.5Hzという規模は、`CanvasRenderingContext2D`にとって非常に軽い負荷である(全チャート合計でも毎秒15,000〜20,000点更新程度で、現代のブラウザエンジンなら60fpsで遥かに大きな描画を余裕でこなす)。したがってWebGLや汎用チャートライブラリ(Chart.js/uPlot/ECharts等)は不要と判断する。

- 対数周波数軸・coherence連動の線色/透明度・位相ラップなど、本アプリ固有の描画仕様を、汎用ライブラリの制約やプラグイン開発なしに直接実装できる。
- 軸描画・log-xマッピングを共通化した`CanvasChart`基底クラス(200〜300行程度を想定)を5種で共有する。既存の`Chart::XYPlot`/`FrequencyBasedPlot`の軸計算(log10マッピング、min/max)をそのまま移植できる。
- Spectrogramのみ、51×N行のイメージ的なグリッドを`putImageData`/`drawImage`でオフスクリーン`ImageData`に対して1行スクロール+1行追記する方式にする(この規模ならWebGL化は不要)。

### 3.4 移行方式

C++バックエンドは変更しないため、**既存のQML UIと並行稼働させながら新フロントエンドを構築する**(いきなり置き換えない)。同じ`Measurement`インスタンスをQMLとJS両方が読む構成にし、新旧の表示値を突き合わせて検証する。QMLのチャートコードは、JS側の正しさが確認できてから削除する。

**最小の垂直スライス**: 「Magnitudeチャート1つ・1ソース・コントロールなし」をエンドツーエンドで通すこと。これにより`SeriesSampler`抽出→`DataBridge`+QWebChannel登録→JS側の購読+Canvas描画ループ→開発サーバーのホットリロード配線、という新パイプライン全体を最小の面積で検証できる。これが安定したら:

1. Phase → Coherence(Magnitudeとほぼ同じサンプラー構造、フィールドが異なるだけ)
2. RTA/Spectrum(単一系列でcoherence着色もなく、むしろ単純)
3. Spectrogram(行履歴/スクロールバッファ設計が必要な分、最後に着手)

の順で横展開する。

### 3.5 明示しておくリスク・判断事項

- **QtWebEngine 5.15(Chromium ~87)はEOL**でセキュリティパッチが提供されていない。ローカル専用(自分がバンドル/localhost配信するコンテンツのみを読み込み、任意の外部URLを開かない)アプリとしてはリスクは低いが、明示的に許容する判断として記録しておく。リリースビルドではリモートデバッグポートを外部に開放しないこと。
- Apple SiliconではQtWebEngineもx86_64/Rosetta 2前提(本体アプリと同じ制約)。着手前に、この環境の`aqtinstall`でQtWebEngineコンポーネントが実際にインストールできるか確認する。
- デバイス選択・ジェネレーター操作・設定・ウィンドウ枠組みなどの非チャートUIは、当面QMLのまま残す。UI全体を一括で書き換えるのではなく、**対象をチャートパネルのみに限定する**(QMLシェル+WebEngineチャートという中間状態は、当面あるいは最終形として十分妥当)。
- オクターブ平滑化ロジックの抽出は、これまで単体テストされたことのないGLレンダラーからの切り出しになるため、**新旧の表示値を同一シグナル・同一ソース・同一フレームで突き合わせて検証する工程**を各チャート種別で明示的に設ける(本移行で最もバグが出やすい箇所と想定される)。

## 4. ロードマップ

| Phase | 内容 |
|---|---|
| Phase 0 | 環境構築: `aqtinstall`でQtWebEngineコンポーネントの導入確認、`.pro`への`webenginewidgets`/`webchannel`追加、Vite等によるJS側の雛形作成、開発サーバー⇔`QWebEngineView`の接続確認 |
| Phase 1 | Magnitude単体疎通: `Chart::SeriesSampler`(Magnitude用)を`frequencybasedseriesrenderer.cpp`等から抽出、`Chart::DataBridge`+QWebChannel登録、JS側でCanvas 2Dに1ソース分を描画。既存QML版と表示値を突き合わせて検証 |
| Phase 2 | Phase・Coherenceを同パターンで追加 |
| Phase 3 | RTA(Spectrum)を追加(単一系列、Magnitudeよりシンプル) |
| Phase 4 | Spectrogramを追加(行履歴/スクロールバッファ設計) |
| Phase 5 | 5チャート全てでQML版との表示値検証が完了した時点で、QML側の対応チャートコードを削除するかどうかを判断(残す場合は非チャートUIとの共存を継続) |

## 5. 未決事項

- QtWebEngineコンポーネントの実機インストール可否(Phase 0で確認)。
- 既存QML UIをどこまでの期間併存させるか(5チャート移行完了後すぐ削除するか、しばらく両方残すか)。
- 複数チャートパネル・複数ソースを同時に開いた場合の`DataBridge`インスタンス数の上限や、QWebChannelのオブジェクト登録/解除タイミング(パネルを閉じたときのクリーンアップ)の具体設計。
- 非チャートUI(デバイス選択・ジェネレーター等)を将来的にJS化するかどうか、するとして時期。
