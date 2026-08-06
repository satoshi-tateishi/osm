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
  - X軸: `20Hz〜20,000Hz` → 一時期`40Hz〜20,000Hz`にしていたが、`20Hz〜20,000Hz`に戻した(`MagnitudePlot`コンストラクタの`m_x.setReset(20.f, 20'000.f)`。Spectrum/Phaseと表示を揃えるため)
  - Y軸(dBモード): `-18dB〜18dB` → `-12dB〜12dB`(`MagnitudePlot::setMode()`のdBケースで`m_y.setReset(-12.f, 12.f)`)
- **軸範囲入力欄の小数点表示を廃止**: `x from`/`x to`/`y from`/`y to`の`FloatSpinBox`に`decimals: 0`を指定し、整数表示に統一。
- **`x from`/`x to`のナッジ(上下の増減ボタン)を非表示化**: `FloatSpinBox`に`indicators: false`を指定。
- **`x from`/`x to`の見た目調整**: ナッジを消したことで2つの入力欄が視覚的に連結して見えていたため、間に`" - "`区切りの`Label`を追加。あわせて`implicitWidth`を`170`→`90`に縮小し(`Layout.fillWidth: true`も削除)、`20000`程度の桁数に収まる幅にした。
- **`y from`/`y to`の幅調整**: `y from`/`y to`はナッジ(+/-)を残す方針のため`x`と同じ90pxにはせず、`implicitWidth`を`170`→`150`に調整(`Layout.fillWidth: true`は削除)。ナッジ付きでも窮屈にならない幅として150pxを採用。x軸グループとy軸グループの間には`Layout.preferredWidth: 15`の`Item`(スペーサー)を挿入して間隔を空けた。
- **"use coherence"のしきい値入力欄も同じ幅に統一**: `coherenceThreshold`の`FloatSpinBox`の`Layout.preferredWidth`を`200`→`150`に変更し、`y from`/`y to`と幅を揃えた。
- **dBモードの帯域平均をパワー(エネルギー)平均に変更**: `src/chart/opengl/magnitudeseriesrenderer.cpp`。修正前は各FFTビンのdB値をそのまま算術平均していたが(log領域の平均)、修正後は線形振幅の2乗(パワー)を積算し、`10*log10(積算パワー/count)`でdB化してから帯域代表値とするようにした。`iterateForSpline`テンプレートの`beforeSpline`フックを使い、帯域代表値の生成部分だけを差し替える形で実装(スプライン補間・GPU描画コード・シェーダーは無変更)。Linear/Impedanceモードの平均方法は変更していない。
  - 理由: 聴感・IEC規格のオクターブバンド分析はエネルギー(パワー)平均が標準であり、dB値の算術平均は物理的な積分と異なる(静かな谷がピークを不当に引き下げる)ため。

## Measurementソースの既定値変更(全チャート共通)

`src/meta/metameasurement.cpp`(`Measurement`コンストラクタ)

- **average type**: `LPF` → `FIFO`、**average count**: `1` → `12`(約1秒相当、`TIMER_INTERVAL=80ms`換算)に変更。
- **Transform mode**: `FFT14` → `LTW`(`Mode::LFT`)に変更。
- 影響範囲は`Meta::Measurement`を継承する`Measurement`(実際の測定ソース)と`Remote::Items::MeasurementItem`(リモート同期用)の両方。チャート種別に関わらず、測定ソース自体の設定のため全測定タイプに影響する。

**バグ修正(既定値変更に伴い顕在化)**: `src/source/measurement.cpp`のコンストラクタで、`setAverage(...)`(起動時の設定復元)が`averageChanged`シグナルと`updateAverage()`(FIFOバッファの深さを実際に反映する処理)の`connect()`より先に実行されていたため、起動直後は「表示上はFIFO:12だが実際のバッファ深さは`Averaging`クラスの初期値である1のまま」という不具合があった。本家からある潜在バグだが、以前は`average`の既定値が`1`(かつ`averageType`既定値が`LPF`)だったため偶然表面化していなかった。`average`の既定値を`12`に変更したことで顕在化(スピンボックスをナッジすると`setAverage()`が再度呼ばれ`averageChanged`が発火し正しく反映されるため、症状が「操作すると直る」ように見えていた)。コンストラクタ内で`updateAverage()`を明示的に呼び出すよう修正して解消。
  - 注意: この修正はOpenGLバックエンドのみに適用。Metalバックエンド(`src/chart/metal/magnitudeseriesnode.mm`)は同様の修正をしておらず未検証(このビルドはOPENGLバックエンドのみコンパイルしているため)。

**バグ修正(既定値変更に伴い顕在化)**: Transform modeを`LTW`(`Mode::LFT`)にするとPhaseチャートが表示されなくなる不具合があった。原因は`src/math/averaging.cpp`の`Averaging<Complex>`(`checkDepth`/`append`)に、`Averaging<float>`側にはあるNaNガード(`!std::isnan(value)`)が無かったこと。LTWは解析ウィンドウが最大65536サンプル(≈1.37秒@48kHz)と長く、測定開始直後や`resetAverage()`直後にウィンドウが全ゼロのまま`Complex::polar()`(`src/math/complex.cpp`)が呼ばれると`0/0`除算でNaNが発生しうる。本フォークで`average type`の既定値を`LPF`→`FIFO`に変更した(前述)ことで、以前はNaN耐性のある`Filter::BesselLPF`(NaN入力時は直前値を保持)が吸収していたNaNが、ガードの無い`Averaging<Complex>`にそのまま加算されるようになり、IEEE754の仕様上その後どれだけ正常値が来ても平均値が恒久的にNaNのまま壊れ続けていた。`Averaging<Complex>::checkDepth`/`append`に`Averaging<float>`と同様の`!std::isnan(value.real) && !std::isnan(value.imag)`ガードを追加して解消。
- **"ppo"を"smoothing"に、表示を"1/N oct"形式に変更**: `TitledCombo`の`title`/`tooltip`を`"ppo"`/`"points per octave"`から空文字/`"smoothing"`に変更。`model`を生の数値配列(`[1,3,6,12,24,48]`)から表示用文字列配列(`["1/1 oct","1/3 oct",...,"1/48 oct"]`)に変更し、実際のppo値は`ppoValues`という別プロパティで対応付け。Smaartの"1/3 oct"等の表記に合わせた。
- **smoothingのデフォルトを"1/6 oct"に変更**: `MagnitudePlot`コンストラクタで`m_pointsPerOctave = 6;`を追加(基底クラス`FrequencyBasedPlot`の既定値`12`を上書き)。

## Phase測定のカスタマイズ

`qml/Plot/PhaseProperties.qml`

- **"ppo"を"smoothing"に、表示を"1/N oct"形式に変更**: Magnitudeと同様の対応(`TitledCombo`の`title`/`tooltip`を`"ppo"`/`"points per octave"`から空文字/`"smoothing"`に変更し、`model`を`["1/1 oct","1/3 oct",...,"1/48 oct"]`の表示用文字列配列に、実際のppo値は`ppoValues`プロパティで対応付け)。Phase・Magnitudeで見た目(表記・レイアウト幅)を統一するための対応。デフォルト値(`FrequencyBasedPlot`基底クラスの`12`)は変更していない。

## Spectrum(RTA)測定のカスタマイズ

`src/chart/rtaplot.cpp`、`qml/Plot/RTAProperties.qml`

- **デフォルトのX軸範囲**: `20Hz〜20,000Hz` → 一時期`40Hz〜20,000Hz`にしていたが、`20Hz〜20,000Hz`に戻した(`RTAPlot`コンストラクタの`m_x.setReset(20.f, 20'000.f)`。Magnitude/Phaseと表示を揃えるため)。Y軸範囲・小数点表示は変更なし。
- **`x from`/`x to`のナッジ(上下の増減ボタン)を非表示化**: `SelectableSpinBox`(標準の`SpinBox`)に`down.indicator.width: 0`/`up.indicator.width: 0`を指定(`FloatSpinBox`の`indicators`相当をSpinBox側で直接指定)。
- **`x from`/`x to`の見た目調整**: 間に`" - "`区切りの`Label`を追加し、`implicitWidth`を`170`→`90`に縮小(`Layout.fillWidth: true`も削除)。Magnitudeと同様の対応。
- **`y from`/`y to`の幅調整**: ナッジ(+/-)は残したまま`implicitWidth`を`170`→`150`に調整(`Layout.fillWidth: true`は削除)。x軸グループとy軸グループの間に`Layout.preferredWidth: 15`の`Item`(スペーサー)を挿入。
- **"ppo"を"smoothing"に、表示を"1/N oct"形式に変更**: Magnitudeと同様の対応(`"off"`の選択肢のみ`ppoValues`に`0`として維持)。
- **smoothingのデフォルトを"1/6 oct"に変更**: `RTAPlot`コンストラクタで`m_pointsPerOctave = 0;`(off)だったのを`= 6;`に変更。
- (参考・変更なし) Spectrumの帯域平均は元々パワー(エネルギー)平均で実装済み(`RTASeriesRenderer::renderPPOLine()`/`renderBars()`で`module(i)^2`を積算してから`10*log10()`)だったため、Magnitudeのような修正は不要だった。

## Global smoothing機能の追加・smoothing表示の全測定タイプ統一

`src/chart/globalsmoothing.h`/`.cpp`(新規)、`src/chart/frequencybasedplot.h`/`.cpp`、`src/chart/coherenceplot.h`/`.cpp`、`src/chart/crestfactorplot.h`/`.cpp`、`src/chart/nyquistplot.cpp`、`src/main.cpp`、`OpenSoundMeter.pro`、`qml/Plot/*.qml`(全9測定タイプ)、`qml/SideBar.qml`

- **smoothing表示を全9測定タイプ(RTA/Magnitude/Phaseに加え、Nyquist・GroupDelay・CrestFactor・Coherence・PhaseDelay・Spectrogram)で統一**: 旧来の`title: "ppo"`/`tooltip: "points per octave"`/生数値`model`を、既存のRTA/Magnitude/Phaseと同じ`title: ""`/`tooltip: "smoothing"`/`"1/N oct"`文字列表示に統一。`qml/ChartProperties.qml`はどこからも読み込まれないデッドコードと判明したため対象外(未変更)。
- **Global smoothing機能を追加**: 各測定タイプのsmoothingコンボボックスの先頭に`"Global"`を追加し、デフォルト選択を`"Global"`にした(`useGlobalPPO`プロパティ、デフォルト`true`)。サイドバーの`Generator`直下に、Global値を一括変更する新規コンボボックス(`qml/SideBar.qml`)を追加。"Global"を選択している測定は、この値の変更に追従する。
  - 新規クラス`Chart::GlobalSmoothing`(`GeneratorThread`と同様の静的シングルトンQObject、`Settings`ルートグループのキー`"globalSmoothing"`に永続化。デフォルト値`6`(1/6 oct)、`main.cpp`で1つだけ生成し`globalSmoothing`という名前でQMLに公開)。
  - `FrequencyBasedPlot`に`useGlobalPPO`(bool)プロパティを追加。コンストラクタで`GlobalSmoothing::pointsPerOctaveChanged`に接続し、`useGlobalPPO`が`true`の間は変更を`setPointsPerOctave()`へ反映する。`useGlobalPPO`は`"useGlobalPPO"`キーで永続化(既存の`"ppo"`キーは`useGlobalPPO=false`時の手動値として引き続き使用)。
- **副次的なバグ修正(Global機能の実装に伴い必須だったもの)**:
  - `CoherencePlot`/`CrestFactorPlot`は`pointsPerOctave`/`setPointsPerOctave`/`pointsPerOctaveChanged`を独自に再宣言し、基底クラス`FrequencyBasedPlot`の実装(および範囲チェック`isPointsPerOctaveValid`)を隠蔽していた。この隠蔽により、Global値の変更をQMLへ反応的に伝えられない(NOTIFYシグナルが別物になる)ため、両クラスの独自実装を削除し基底クラスの実装に一本化した。設定ファイルの保存キーは両クラスとも従来の`"pointsPerOctave"`のまま維持し、既存の保存値との後方互換を保っている。副次効果として、これまで範囲チェックが無かった(1〜48の外の値を設定可能だった)バグも解消された。
  - `NyquistPlot::setSettings`/`storeSettings`が`XYPlot::setSettings`/`storeSettings`を直接呼んでおり、`FrequencyBasedPlot`が持つ`ppo`/`coherence`/`coherenceThreshold`/`useGlobalPPO`が設定ファイルに保存・復元されていなかった(実行中は常にコンストラクタの既定値)。`FrequencyBasedPlot::setSettings`/`storeSettings`を呼ぶよう修正し、これらの値も他の測定タイプと同様に永続化されるようにした。
- **挙動変更の注意**: 上記の統一に伴い、Magnitude/Spectrum(1/6 oct)以外の測定タイプ(従来12、Spectrogramのみ48)も含め、初回起動時は全て"Global"(初期値1/6 oct)に従う見た目になる。個別のデフォルト値を保ちたい場合は、各測定のプロパティパネルでGlobal以外の値を手動選択する必要がある。

## チャート上のジェスチャー操作の無効化(Magnitude / Spectrum / Phase)

`qml/Chart.qml`

- Magnitude・Spectrum・Phaseのチャート表示エリア上での、トラックパッドのピンチイン/アウト(2本指ズーム)・2本指ドラッグ(パン)・マウスホイール/2本指スクロールによるズームを無効化した。`type === "Magnitude" || type === "Spectrum" || type === "Phase"`のときは`touchArea.onGestureStarted`と`opener.onWheel`の先頭で処理を`return`するようにしている。
- 目的: 軸範囲(x from/x to/y from/y to)の変更を、誤操作を避けるためプロパティパネルからの入力のみに限定するため。Phaseは当初対象外だったが、Magnitude/Spectrumと同様の理由で追加。
- ダブルクリックでの軸リセット(`chart.plot.resetAxis()`)と、右クリックでの計算機ポップアップ(`openCalculator`)は影響を受けず、従来通り動作する。
- 他の測定タイプ(Coherence, Group Delayなど)ではジェスチャー操作は無効化しておらず、従来通り。

## "save chart as an image"ボタンの非表示化(全測定タイプ共通)

`qml/Plot/*.qml`(全12ファイル: RTA, Magnitude, Phase, Impulse, Step, Coherence, GroupDelay, PhaseDelay, Spectrogram, CrestFactor, Nyquist, Levelの各Propertiesパネル)

- 各プロパティパネル右上のカメラアイコンボタン(チャートを画像として保存する機能)を`visible: false`にして非表示化。機能自体(`FileDialog`・`onClicked: fileDialog.open()`)は削除せず残置しているため、必要になれば`visible: false`を外すだけで復活できる。

## 右サイドバー下部の"ABOUT"・Wi-Fiリモートアイコンの非表示化

`qml/SideBar.qml`

- ロゴ+"ABOUT"表示(クリックでAboutポップアップを開く`MouseArea`)と、Wi-Fiリモート機能(`qrc:/RemoteProperties.qml`を開く`Button`)をそれぞれ`visible: false`にして非表示化。機能自体は削除していない。

## メニューの"About"・"Check for update"の非表示化

`qml/menu/Top.qml`、`qml/menu/Side.qml`

- macOSの通常メニューバー(`Top.qml`)の"Help"メニュー内`MenuItem`("About" / "Check for update")にそれぞれ`visible: false`と`enabled: false`を指定。
- あわせて割り当てられていたショートカット`F2`(About)・`F3`(Check for update)も削除し、キー操作からも呼び出せないようにした。
- 狭幅ウィンドウ時に表示されるハンバーガーメニュー(`Side.qml`)の`ListModel`には元々"About"項目はなく、"Check for update"の`ListElement`のみ存在したため、こちらは`ListElement`ごと削除(`ListModel`は`MenuItem`と違い項目単位の`visible`切り替えができないため)。

## ラベルの日本語化(部分的)

`qml/source/MeasurementProperties.qml`

- Measurementソース設定内の"apply estimated delay"ツールチップを"推定ディレイを適用"に、"estimated delay delta: ..."ツールチップを"推定ディレイとの差分: ..."に変更。他のラベルは英語のまま(全体の日本語化は行っていない、個別の要望に応じた部分対応)。

## window functionを"Hann"固定化

`qml/source/MeasurementProperties.qml`

- window function(窓関数)選択の`DropDown`を`visible: false`で非表示化し、`Component.onCompleted`で`dataObjectData.window`を"Hann"のインデックスに強制設定するようにした。保存済み設定/プロジェクトファイルに別の窓関数が記録されていても、パネル表示時に必ずHannへ上書きされる。
- 理由: 連続信号(音楽・ピンクノイズ)を扱う伝達関数測定ではHannが標準的で妥当なため、他の窓関数(Rectangular/FlatTopなど特殊用途向け)を選ばせる必要がないと判断。

## Measurementチャンネルの極性反転("inverse polarity at measurement chanel")の非表示化

`qml/source/MeasurementProperties.qml`

- "+/–"ボタン(`dataObjectData.polarity`)を`visible: false`で非表示化し、`Component.onCompleted`で`dataObjectData.polarity = false`を強制設定して正相に固定。既定値自体が`false`(`Meta::Measurement`コンストラクタ)なので実質的な動作変更はない。Measurementソース共通の設定のため、Magnitudeに限らず全チャートに影響する。

## FIFO平均のaverage countに実時間(秒)表示を追加

`src/source/measurement.h`、`qml/source/MeasurementProperties.qml`

- `Measurement`に`Q_PROPERTY(float averageTickSeconds READ averageTickSeconds CONSTANT)`を追加。`TIMER_INTERVAL(80ms)`をQML側から秒単位で参照できるようにした(`static float averageTickSeconds() { return TIMER_INTERVAL / 1000.f; }`)。
- `average count`の`SelectableSpinBox`を`ColumnLayout`で包み、上に小さな`Label`(`≈%1s`、`dataObjectData.average * dataObjectData.averageTickSeconds`)を追加。スピンボックス自体の編集・表示形式(整数値)は変更していないため、`valueFromText`のパース処理を複雑化させずに済んでいる。
- スペースの都合上、横ではなく上に小さく表示する形にした。

## Generatorの"Controlled generator"の非表示化

`qml/GeneratorProperties.qml`

- リモートのジェネレータを選択する`selectTarget`の`DropDown`("Controlled generator")を`visible: false`で非表示化。ABOUT/Wi-Fiリモートアイコンと同様、リモート機能系のUI。

## Generatorの"Signal Type"を"Pink"固定化

`qml/GeneratorProperties.qml`

- 信号タイプ選択の`DropDown`(id: `type`)を`visible: false`で非表示化し、`Component.onCompleted`で`control.currentGenerator.type`を`generatorModel.types`内の"Pink"のインデックスに強制設定。`GeneratorThread`のソースリスト順(`src/generator/generatorthread.cpp`)でPinkNoiseは先頭(index 0)だが、ハードコードせず`model.indexOf("Pink")`で検索している。

## Generatorの"even inv"(偶数チャンネル逆相)の非表示化

`qml/GeneratorProperties.qml`

- "inverse polarity at even channels"ツールチップの`Button`(id無し、text: "even inv")を`visible: false`で非表示化し、`Component.onCompleted`で`control.currentGenerator.evenPolarity = false`を強制設定して正相に固定。既定値自体が`false`(`GeneratorThread`コンストラクタ)なので実質的な動作変更はなく、UIから触れなくするための対応。

測定タイプごとの設定項目の詳細は[measurement-types.md](measurement-types.md)を参照。
