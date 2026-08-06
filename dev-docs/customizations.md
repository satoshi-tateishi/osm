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

## TFC Window Phase 1（FourierTransform層）の実装

`src/math/fouriertransform.h` / `.cpp`

- 既存のLog変換に、TFC（Time-Frequency-Constant）窓長計算を有効化するフラグと、基準窓時間（既定10ms）・基準周波数（既定1kHz）の設定APIを追加。
- 既存の対数周波数グリッドを維持したまま、TFC有効時は`N = round((T_ref / 1000) * f_ref / frequency_normalized)`でビンごとの窓長を決定する。窓長は8サンプル以上、サンプルレートの2秒分以下に制限し、必要に応じて入力リングバッファを動的に拡張する。
- TFC無効時は従来のLTW1/2/3の窓長、周波数、基底ベクトル確保サイズを維持し、後方互換性を確保している。`Measurement`層やQML UIからTFCを選択する配線はPhase 2以降で行う。

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

`src/chart/phaseplot.cpp`、`qml/Plot/PhaseProperties.qml`

- **"ppo"を"smoothing"に、表示を"1/N oct"形式に変更**: Magnitudeと同様の対応(`TitledCombo`の`title`/`tooltip`を`"ppo"`/`"points per octave"`から空文字/`"smoothing"`に変更し、`model`を`["1/1 oct","1/3 oct",...,"1/48 oct"]`の表示用文字列配列に、実際のppo値は`ppoValues`プロパティで対応付け)。Phase・Magnitudeで見た目(表記・レイアウト幅)を統一するための対応。デフォルト値(`FrequencyBasedPlot`基底クラスの`12`)は変更していない。
- **`rotate`/`range`/`positivePeriod`(±180º/0..360º表示切替)を固定し、プロパティから非表示化**: `rotate`は`0°`、`range`は`360°`、`positivePeriod`は`false`(=`±180º`表示)に固定。いずれも既存のデフォルト値と一致していたため、`PhasePlot::setSettings()`で保存済み設定からの復元をやめ、`setRotate(0); setRange(360); setPositivePeriod(false);`を常に呼ぶよう変更(X軸固定と同じ考え方)。`qml/Plot/PhaseProperties.qml`側は該当する`SelectableSpinBox`(rotate/range)と`ComboBox`(positivePeriod)を`visible: false`で非表示化。
- **"use coherence"チェックボックスとしきい値スピンボックスの表示をMagnitudeと統一**: `coherence`の`CheckBox`から`Layout.fillWidth: true`を削除(Magnitudeと同じ既定サイズに)。`coherenceThreshold`の`FloatSpinBox`を`Layout.fillWidth: true`+`opacity: coherence.checked`+`enabled: coherence.checked`(チェック時は薄く表示されたまま場所を占有)から、`Layout.preferredWidth: 150`+`visible: coherence.checked`(チェックを外すと完全に非表示、Magnitudeと同じネガ+のスピンボックス幅・表示方式)に変更。

## Spectrum(RTA)測定のカスタマイズ

`src/chart/rtaplot.cpp`、`qml/Plot/RTAProperties.qml`

- **デフォルトのX軸範囲**: `20Hz〜20,000Hz` → 一時期`40Hz〜20,000Hz`にしていたが、`20Hz〜20,000Hz`に戻した(`RTAPlot`コンストラクタの`m_x.setReset(20.f, 20'000.f)`。Magnitude/Phaseと表示を揃えるため)。
- **デフォルトのY軸範囲(dBfsスケール)を変更**: `y from`を`-140dB`→`-100dB`→最終的に`-70dB`に変更(`RTAPlot::updateAxis()`のDBfsケースで`m_y.setMin(-70.f); m_y.setReset(-70.f, 0.f);`。`y to`は`0dB`のまま変更なし)。SPL/phonスケールの範囲は変更なし。
- **Y軸に5dB刻みの補助グリッドを追加**: `Chart::Axis`(`src/chart/axis.h`/`.cpp`)に`minorGridStep`(デフォルト`0`=無効)を追加。`paint()`内でメインのラベル付きグリッド線を描画する前に、`minorGridStep`刻みの補助線を`m_palette.lineColor()`のアルファ値を半分にした薄い色で描画する(メイン線と同じ位置に重なった場合は後から描画されるメイン線が上書きするため常に濃い色を維持)。`RTAPlot::updateAxis()`の末尾で`m_y.setMinorGridStep(5.f)`を呼び、DBfs/SPL/Phonいずれのスケールでも5dB(ph)刻みの補助グリッドを表示するようにした。他のチャート(`Axis`を使う全種別)には影響しない(デフォルト無効のため)。
- **バグ修正: Y軸のダブルクリックresetが初期表示と異なる値に戻っていた**: `Axis::configure()`は引数(この場合`-140〜40`)をそのまま`m_reset`に設定するが、`updateAxis()`はその直後に`setMin()`/`setMax()`で表示上の初期値(`-100〜0`)に上書きしていたため、`m_reset`だけが古い`-140〜40`のまま取り残されていた(`configure()`の`min`/`max`引数は「選択可能な範囲の上下限」を兼ねているため、表示初期値と一致させられない)。ダブルクリックでリセットすると意図しない`-140dB〜40dB`に戻ってしまう不具合があったため、`m_y.setReset(-100.f, 0.f);`を明示的に呼んで解消。SPL/Phonスケール(`60〜100`)にも同種の潜在バグがあったため、あわせて`m_y.setReset(60.f, 100.f);`を追加。
- **`x from`/`x to`のナッジ(上下の増減ボタン)を非表示化**: `SelectableSpinBox`(標準の`SpinBox`)に`down.indicator.width: 0`/`up.indicator.width: 0`を指定(`FloatSpinBox`の`indicators`相当をSpinBox側で直接指定)。
- **`x from`/`x to`の見た目調整**: 間に`" - "`区切りの`Label`を追加し、`implicitWidth`を`170`→`90`に縮小(`Layout.fillWidth: true`も削除)。Magnitudeと同様の対応。
- **`y from`/`y to`の幅調整**: ナッジ(+/-)は残したまま`implicitWidth`を`170`→`150`に調整(`Layout.fillWidth: true`は削除)。x軸グループとy軸グループの間に`Layout.preferredWidth: 15`の`Item`(スペーサー)を挿入。
- **"ppo"を"smoothing"に、表示を"1/N oct"形式に変更**: Magnitudeと同様の対応(`"off"`の選択肢のみ`ppoValues`に`0`として維持)。
- **smoothingのデフォルトを"1/6 oct"に変更**: `RTAPlot`コンストラクタで`m_pointsPerOctave = 0;`(off)だったのを`= 6;`に変更。
- (参考・変更なし) Spectrumの帯域平均は元々パワー(エネルギー)平均で実装済み(`RTASeriesRenderer::renderPPOLine()`/`renderBars()`で`module(i)^2`を積算してから`10*log10()`)だったため、Magnitudeのような修正は不要だった。

## Spectrogram測定のカスタマイズ

`src/chart/spectrogramplot.h`/`.cpp`、`src/chart/opengl/spectrogramseriesrenderer.h`/`.cpp`、`src/chart/metal/spectrogramseriesnode.h`/`.mm`、`qml/Plot/SpectrogramProperties.qml`、`qml/Plot/SpectrogramThresholds.qml`(新規)、`qml/Chart.qml`

- **デフォルトの`min dB`/`mid dB`/`max dB`を変更(過去の変更、その後下記でlower/upperに統合)**: `-90dB`/`-50dB`/`10dB` → `-100dB`/`-50dB`/`0dB`。
- **`min`/`mid`/`max`の3値方式を廃止し、`lower`(下限しきい値)/`upper`(上限しきい値)の2値+4色グラデーション方式に変更**: 劇場のスピーカーチューニング用途では、音が小さい部分に色が付いていると見づらいという要望に対応。
  - 色分けロジック(`SpectrogramSeriesRenderer::renderSeries()`、`SpectrogramSeriesNode::updateHistory()`の2箇所、元々重複実装)を変更: `lower`未満は**フェードなしで完全に透明**(旧実装は`floor(-140dB)`から`lower`にかけて青がフェードインしていたが、これを廃止)。`lower`〜`upper`の間を3等分し、青→緑→黄→赤の4色グラデーション。`upper`以上は赤で固定。黄色は`#FFEB3B`(Material Yellow 500、既存の青`#2196F3`/緑`#8BC34A`/赤`#F44336`と統一感のある選定)。
  - `SpectrogramPlot`のQ_PROPERTY・保存キーを`min`/`mid`/`max`(`dBMin`/`dBMid`/`dBMax`)から`lower`/`upper`(`dBLower`/`dBUpper`)に変更(後方互換は取らない、個人利用アプリのため許容)。デフォルト値は`lower=-70`, `upper=-10`(`DEFAULT_DB_LOWER`/`DEFAULT_DB_UPPER`)。
  - **バグ修正: チャート左側のドラッグスライダーの可動範囲が逆になっていた**: 画面Y座標は下に行くほど小さいdB値(quiet)に対応する(`valueToY()`は値の増加関数ではなく減少関数)。下限ハンドルの`drag.minimumY`/`drag.maximumY`にそれぞれ`valueToY(dbMax)`(本来は上限側の制約)と`valueToY(upper-minGap)`(本来は下限側の制約)を取り違えて割り当てており、上限ハンドルも同様に逆だったため、可動範囲がバーの上端付近の数ピクセルに押し込められ「少し動かしただけで上限の3dB下まで飛んで、それ以上下に動かせない」という不具合が発生していた。`drag.minimumY`=画面上で最も小さいYへの制約(dB上限側)、`drag.maximumY`=最も大きいYへの制約(dB下限側)となるよう対応関係を修正。
  - **チャート左側にドラッグ可能な▲(下限)/▼(上限)しきい値マーカーを新設**(`qml/Plot/SpectrogramThresholds.qml`)。Magnitude+Equalizerで使われている既存の`qml/EQPoints.qml`と同じ「QMLの`MouseArea`+`drag.target`で`Chart.qml`の`helper` Loaderにオーバーレイを重ねる」パターンを踏襲。表示dB範囲は`-140dB`〜`0dB`固定(レンダラー内の`floor`定数と一致)で、この範囲内をドラッグして`lower`/`upper`を直感的に調整できる。あわせて凡例のグラデーションバー(現在の色分けロジックをそのまま反映した縦長バー)も表示。プロパティパネル(`qml/Plot/SpectrogramProperties.qml`)側にも従来通り数値入力欄(`lower`/`upper`のスピンボックス)を残し、両方から調整可能にした。
  - `SpectrogramPlot::resetAxis()`(ダブルクリックでのリセット)も`lower`/`upper`のデフォルト値に戻すよう更新。
  - **バグ修正: 凡例バーで`lower`未満にも色が漏れて表示されていた**: QMLの`Gradient`は、同一`position`に2つの`GradientStop`(色が変わる境界=ハードエッジ)を置いても、どちらの色を採用するかの順序が保証されない(実装依存)。`lower`未満を透明にする境界に`posLower`を2回(青→透明)使っていたため、透明側が正しく採用されずに色が漏れていた。2つ目のストップ位置を`posLower + epsilon`(`epsilon = 1/バー高さ`、約1px相当)へごく僅かにずらし、確実にハードエッジとして機能するよう修正。
  - **▲▼ハンドルにホバー中のしきい値表示を追加**: `MouseArea`に`hoverEnabled: true`と`ToolTip.visible: containsMouse || drag.active`/`ToolTip.text`を追加し、カーソルを乗せている間・ドラッグ中に現在のdB値をツールチップ表示するようにした。表示は`Math.floor()`で小数点以下切り捨ての整数表示(`lower`/`upper`自体は元々int型のため実質的な丸め処理は発生しないが、表示形式の明示化として指定)。
  - **しきい値の設定範囲を`-140dB〜0dB`から`-80dB〜0dB`に変更**: `qml/Plot/SpectrogramThresholds.qml`の`dbMin`(凡例バー・ドラッグハンドルの表示範囲)、および`qml/Plot/SpectrogramProperties.qml`のスピンボックス範囲(`lower`の`from`を`-140`→`-80`、`upper`の`to`を`20`→`0`)を統一。レンダラー内の実測値クランプ用`floor`定数(`-140dB`、極端に静かなFFTビンの下限)は変更していない(UI上の設定可能範囲とは独立)。
- **X軸(周波数軸)のグリッド線を非表示化**: 色のグラデーション(パワースペクトルの濃淡)にグリッド線が重なって濃度を誤認しやすいための対応。`Chart::Axis`(`src/chart/axis.h`/`.cpp`)に`gridVisible`(デフォルト`true`)を追加し、`paint()`内のグリッド線描画(`painter->drawLine(p1, p2)`)のみをガード(周波数ラベルのテキスト描画は影響を受けず引き続き表示される)。X軸・Y軸は独立した`Axis`インスタンスのため、`SpectrogramPlot`のコンストラクタでのみ`m_x.setGridVisible(false)`を呼び、他の`FrequencyBasedPlot`派生クラス(RTA/Magnitude/Coherence等、X軸設定は共通の`configureXAxis()`を使用)には影響しない。
- **Y軸(時間軸)の`y from`/`y to`を`0s`/`4s`に固定し、プロパティパネルから非表示化**: `SpectrogramPlot::setSettings()`で、`XYPlot`由来の汎用的なymin/ymax永続化(`"ymin"`/`"ymax"`設定キー)を読み込んだ**直後に**`m_y.setMin(FIXED_Y_MIN)`/`setMax(FIXED_Y_MAX)`(`0.f`/`4.f`)で強制上書きするようにした。理由: 過去の操作で`y to`が誤って`0s`に変更・保存され、表示範囲がゼロになって波形が全く見えなくなる不具合が実際に発生したため(時間軸はSpectrogram表示上意味のある調整対象ではなく、常に直近4秒を表示する仕様に固定する方が安全と判断)。`qml/Plot/SpectrogramProperties.qml`の`y from`/`y to`スピンボックスは`visible: false`で非表示化(既存の"save chart as an image"ボタン等と同じパターン、機能自体は削除せず残置)。
  - 経緯: 当初`min`/`mid`/`max`のデフォルト値変更のみ行ったが、その検証中に「音が小さい時は無色にしたい」という要望が出たため、本節の設計に発展・置き換えた。

## X軸(周波数)を20Hz〜20,000Hzに固定・プロパティから非表示化(周波数軸を持つ全測定タイプ共通)

`src/chart/frequencybasedplot.cpp`、`src/chart/coherenceplot.cpp`、`src/chart/crestfactorplot.cpp`、`qml/Plot/RTAProperties.qml`/`MagnitudeProperties.qml`/`PhaseProperties.qml`/`CoherenceProperties.qml`/`SpectrogramProperties.qml`/`GroupDelayProperties.qml`/`PhaseDelayProperties.qml`/`CrestFactorProperties.qml`

- **`x from`/`x to`を`20Hz`/`20,000Hz`に固定し、ユーザーが変更できないようにした**: 周波数レンジは毎回この範囲を見れば十分なため。`FrequencyBasedPlot::setSettings()`で、保存済み設定から`xmin`/`xmax`を復元した直後に`m_x.setMin(20.f)`/`setMax(20'000.f)`で強制上書き(Spectrogramの`y from`/`y to`固定と同じ考え方)。これでRTA/Magnitude/Phase/GroupDelay/PhaseDelay/Spectrogramはカバーされるが、`CoherencePlot`/`CrestFactorPlot`は独自の`setSettings()`(基底クラスを呼ばない実装)を持つため、それぞれに同じ2行を個別追加。**Nyquist**は対象外(X軸が周波数(Hz)ではなく複素平面の実部のため)。
- 各測定タイプのプロパティパネルから`x from`/`x to`のスピンボックス(および間の`" - "`区切りラベルがある場合はそれも)を`visible: false`で非表示化。機能自体は削除せず残置。

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

## チャート上のジェスチャー操作の無効化(全測定タイプ共通)

`qml/Chart.qml`

- 全チャート表示エリア上での、トラックパッドのピンチイン/アウト(2本指ズーム)・2本指ドラッグ(パン)・マウスホイール/2本指スクロールによるズームを無効化した。当初はMagnitude/Spectrum/Phaseの3タイプのみ`type === "..."`の条件判定で対象を絞っていたが、最終的に全測定タイプに拡大したため、`touchArea.onGestureStarted`と`opener.onWheel`の先頭を条件無しの`return;`にした(型判定の条件式は削除)。
- 目的: 軸範囲(x from/x to/y from/y to)の変更を、誤操作を避けるためプロパティパネルからの入力のみに限定するため。
- ダブルクリックでの軸リセット(`chart.plot.resetAxis()`)と、右クリックでの計算機ポップアップ(`openCalculator`)は影響を受けず、従来通り動作する。
- `return;`より後ろのジェスチャー処理ロジック自体は削除せず残置(将来的に一部タイプだけ再度有効化したくなった場合に備えるため)。

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

## 測定タイプ選択肢の絞り込み(劇場スピーカーチューニング用途に不要なものを非表示化)

`qml/Chart.qml`、`qml/menu/Top.qml`、`qml/menu/Side.qml`

- チャート右上の測定タイプ選択`DropDown`(`qml/Chart.qml`)から、"Step"・"Group Delay"・"Phase Delay"・"Level"・"Numeric"・"Crest Factor"・"Nyquist"の7種類を削除し、選択肢を`["Spectrum", "Magnitude", "Phase", "Impulse", "Coherence", "Spectrogram"]`のみにした。理由: 劇場のスピーカーチューニング用途ではこれらの測定タイプは不要なため。
  - "Phase Delay"・"Crest Factor"・"Nyquist"はもともと`applicationAppearance.experimentFunctions`フラグがONの時だけ選択肢に出る実装だったため、実質的にデフォルトでは既に非表示だった。今回はこのフラグをONにしても出てこないよう、選択肢自体から完全に削除した。
  - 各測定タイプの実装(`src/chart/*.h`/`.cpp`、`qml/Plot/*.qml`)自体は削除していない。既に保存済みのプロジェクトファイル(過去にこれらの型で保存したもの)を開いた場合は、`VariableChart::initType()`が引き続き型名から復元するため問題なく表示される(選択肢から選べなくなるだけ)。
- 上記に伴い不要になった"Experiment functions"のON/OFF切り替えUIも非表示化: macOSメニューバー(`qml/menu/Top.qml`の"View"メニュー内`MenuItem`)は`visible: false`/`enabled: false`、ハンバーガーメニュー(`qml/menu/Side.qml`)は該当`ListElement`を削除(`ListModel`は項目単位の`visible`切り替えができないため。区切り線は直前の"Show target"項目に付け替えて維持)。`Appearance::experimentFunctions`プロパティ自体は削除していない(将来的に他の実験的機能で再利用される可能性があるため残置)。

測定タイプごとの設定項目の詳細は[measurement-types.md](measurement-types.md)を参照。
