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

## TFC Window Phase 2（Measurement/Meta層）の実装

`src/meta/metameasurement.h` / `.cpp`、`src/source/measurement.h` / `.cpp`、`src/remote/items/measurementitem.h`

- 測定モード列挙体の末尾に`TFC`を追加し、既存モードの整数値と保存済みJSONの互換性を維持。基準窓時間（既定10ms）と基準周波数（既定1kHz）をatomicなメタプロパティとして追加した。
- `Measurement::updateFftPower()`でTFCモードを既存Log変換へ接続。TFC→LTW切替時はTFCフラグを明示的に解除する。TFCモード中の基準値変更も80msタイマー上で検出し、モード切替なしで窓テンプレートを再生成する。
- 基準値だけを変えた場合は周波数グリッドやインパルス応答のサイズが変わらないため、周波数領域配列の再確保とデコンボリューション平均のリセットを省略し、調整操作による無関係なImpulse/Step平均への影響を避けた。
- TFC基準値をプロジェクトJSONに保存・復元し、Measurementのcloneにもコピーする。`Meta::Measurement`を継承するリモート同期用`MeasurementItem`にも対応プロパティ・シグナルを追加した。QMLの設定UIはPhase 4で追加する。
- Measurementとモード一覧を共有しているFilter・Equalizer・StandardLineはTFC計算に未対応のため、各一覧からTFCを除外し、選択時にデータが空になる項目が既存UIへ露出しないようにした。

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
- JS版のGeneratorパネル(`web/src/generatorPanel.ts`)にも同じ制約を実装した。信号タイプは画面に表示せず、初期化時に`generator.types.indexOf("Pink")`で求めたインデックスを`generator.type`へ設定する。

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

## TFC Windowのreference time / frequency調整UIの追加

`qml/source/MeasurementProperties.qml`

- Transform modeが`TFC`のとき、ドロップダウンの表示を誤解を招く`"Power:TFC"`から`"TFC"`に変更。Fast FFTの`10`〜`16`には従来通り幅に応じて`"Power:"`接頭辞を表示し、`LTW`の表示も変更しない。
- `TFC`選択中だけreference time(1〜200ms)の`FloatSpinBox`を表示。狭幅で数値と増減ボタンが重なるため`indicators: false`とし、テキスト入力のみにした。
- reference timeの初期化中書き戻し防止ガード、変更シグナルの`Connections`、完了時の再同期を追加。
- SysTuneの調査メモでユーザーが操作するのは1つのスケールパラメータと読み取れるため、reference frequencyを1kHz固定とした。`FourierTransform`の汎用APIは残し、上位層の調整プロパティ・リモート同期・JSON永続化・複製処理は削除。旧プロジェクトの`tfc.referenceFrequency`キーは読み込み時に無視される。
- Hann窓固定方針を維持し、window function選択はTFC時も非表示のまま。

## STOREデータ管理: グループ間移動・複数選択・一括CSVダウンロード

`src/sourcelist.h` / `.cpp`、`qml/SourceLayout.qml`、`qml/source/StoredProperties.qml`

- **グループ間移動の導線追加**: 既存の`Source::Group`(フォルダ相当)はドラッグ&ドロップでしかアイテムを格納できず、「あるグループから別のグループへ直接移動する」「ルート(最上位)へ戻す」手段が分かりにくかった。各行に新しい「移動」ボタン(``アイコン)を追加し、`Qt.labs.platform.Menu`で「Move to top level」+ 全グループ一覧(ネストを考慮したインデント付き)を表示、選択したアイテムを直接そこへ移動できるようにした。
  - C++側に`SourceList::moveItem(QUuid itemId, QUuid targetGroupId)`(木全体を再帰的に辿って現在の格納場所から取り除き、指定先へ追加)、`SourceList::groupList()`(木全体の`Group`一覧を`{uuid, name, depth}`で返す)、private再帰ヘルパー`removeItemFromTree()`を追加。既存の`moveToGroup()`(ドラッグ&ドロップ用、同一階層内でしか機能しない)はそのまま残し、置き換えていない。
  - 常にルートの`sourceList`(QMLのcontext property)から呼ぶ前提(`getByUUid`/`removeItemFromTree`が木全体を辿るため、現在表示中の階層が root でもグループ内でも正しく機能する)。
- **複数選択(Shift/⌘・Ctrl+クリック)**: `SourceLayout.qml`のサイドバー一覧はこれまで`ListView.currentIndex`による単一選択のみだった。Shiftクリックで範囲選択、⌘(macOS)/Ctrl(Windows/Linux)クリックでトグル選択できるようにした。対象は全ソース種別(Measurement/Stored/Group等、共通コンポーネントのため)。
  - C++側に`SourceList`の新しい選択状態(既存の`m_checked`とは別物。`m_checked`は入力ソース選択コンボボックス用の無関係な機能のため流用せず分離): `m_multiSelected`、`setMultiSelected()`/`isMultiSelected()`/`clearMultiSelected()`、および`multiSelectedCount`/`multiSelectedStoredCount`/`multiSelectedUuids`の`Q_PROPERTY`(`multiSelectedChanged`シグナルでQML側は自動的にリアクティブ)。
  - 修飾キー付きクリック時はプロパティパネルの自動オープンを抑止(`dragArea.suppressOpen`)。
- **一括CSVダウンロード**: 複数選択時、`ListView.header`に選択件数バーと「Download CSV」ボタンを表示(選択中に`Stored`が1件も無ければ無効)。クリックすると`Qt.labs.platform.FileDialog`(`SaveFile`モード)を**保存先フォルダの命名ダイアログとして流用**して開く(初期ディレクトリ=デスクトップ、初期名=`OSM_yyyyMMdd_HHmmss`)。確定すると指定パスをフォルダとして作成し、そこへCSVを書き出す。
  - **Groupを選択した場合はその中の`Stored`データ全てを対象に含める**(`collectStoredTargets()`で`Group`を再帰的に展開)。
  - **選択操作を行った階層を基準にディレクトリ構造を維持する**: `findGroupPath()`で対象アイテムの祖先グループ名チェーンを求め、`<出力先>/<Group名>/.../<測定名>.csv`という構造で書き出す(`exportSelectedCSV()`)。ファイル名・フォルダ名はファイルシステムで使えない文字を`_`に置換し、同名衝突時は連番を付与する。
- **単体ダウンロードのデフォルト値修正**: `StoredProperties.qml`の「Save data as」ドロップダウンは`osm/cal/txt/csv/frd/wav`の6形式があったが、**csvのみ**に絞った(他形式のコード自体は`switch`文に残置、実質到達しない)。保存ダイアログを`QtQuick.Dialogs 1.2`の`FileDialog`から`Qt.labs.platform.FileDialog`に置き換え、初期ディレクトリ=デスクトップ(`Labs.StandardPaths.writableLocation(Labs.StandardPaths.DesktopLocation)`)、初期ファイル名=測定名を設定した。
  - 従来の`folder: (typeof shortcuts !== 'undefined' ? shortcuts.home : Filesystem.StandardFolder.Home)`という束縛は、デスクトップビルドでは`shortcuts`も独自型`Filesystem`もQML側に登録されておらず(`src/main.cpp`で`Q_OS_IOS`時のみ登録)評価に失敗し、実質OS標準のフォールバック(ホーム相当)になっていた。これが「保存先の既定がホーム」「ファイル名が空欄」の直接原因。同じパターンが`main.qml`や`Plot/*Properties.qml`等の他のFileDialogにも残っているが、今回はSTOREのダウンロード関連のみ修正し、他は対象外とした。

### 動作確認後の修正(UI調整)

`qml/SourceLayout.qml`

- 一括ダウンロードバーのボタン文言「Download CSV」がサイドバーの幅に対して長すぎ、「N selected」ラベルと重なって表示が崩れていた。「STORE」に短縮し、ヘッダー`Item`の高さを`bulkBar.implicitHeight`依存(循環参照気味で不安定だった)から固定`50`に変更してレイアウト崩れを解消。
- **Groupを単独選択(Shift/Ctrlを使わない通常クリック)した場合にダウンロードする導線が無い問題を修正**: 従来はバー自体を`sources.multiSelectedCount > 0`の時だけ表示していたため、通常クリックによる単一選択(`currentIndex`/`selectedIndex`側の仕組みで、複数選択用の`m_multiSelected`とは別系統)では何も表示されなかった。バーを常時表示に変更し、「STORE」「Cancel」ボタンは既定でグレーアウト、複数選択されたデータ(またはGroup)がある、もしくは単一選択中のアイテムが`Stored`/`Group`である場合にのみ有効化する(`hasExportableSelection`)。「STORE」クリック時、複数選択が空で単一選択のみの場合はその1件を`setMultiSelected()`で複数選択側に取り込んでからエクスポート処理(`exportSelectedCSV`)を呼ぶことで、単一選択・複数選択どちらの経路でも同じダウンロード処理を再利用している。
- **バグ修正**: 「Cancel」ボタンで単一選択(Group単独選択など)を解除する際、`sideList.currentIndex = -1`を経由して`sources.selectedIndex`に反映させようとしていたが(`onCurrentIndexChanged`ハンドラでの間接同期)、`currentIndex`と`sources.selectedIndex`が既に食い違っている状況(既存プロジェクトのJSON復元で`selectedIndex`だけが復元され`currentIndex`側のシグナルが発火しないケースなど)では変更が伝播せず選択が解除されないことがあった。`sources.selectedIndex = -1`をボタンハンドラから直接設定するように修正し、間接同期に依存しない形にした。
- 「N selected」の選択件数ラベルを削除(ユーザー要望)。`bulkSelectionCount`プロパティも不要になったため削除し、ラベルがあった位置は`Layout.fillWidth`の空`Item`に置き換えてボタンを右寄せのまま維持。
- **「測定」(Measurement/Union/Filter/Windowing/Equalizer等)と「測定データ」(Stored/Group)の間に区切り線を追加**(ユーザー要望)。各行の`dragArea`に`showTypeSeparator`プロパティを追加し、「自分がStored/Groupで、リスト上の直前のアイテムがStored/Groupではない」場合にのみ、行の上端に1pxの`Rectangle`(`Material.dividerColor`)を表示する。`index`に依存する束縛のため、ドラッグ&ドロップによる並び替えやグループ移動で順序が変わった際も自動的に再評価される。直前アイテムの参照は`sources.get(index - 1)`(Q_INVOKABLE、非リアクティブ)を使うが、`index`自体の変化がバインディング全体の再評価トリガーになるため実用上問題ない。

## サイドバーの3カラム化(チャート | データ | 測定)と関連バグ修正

`qml/main.qml`、`qml/SideBar.qml`、`qml/SourceColumn.qml`(新規)、`qml/SourceLayout.qml`、`src/sourcelist.h`/`.cpp`

- **3カラムレイアウト化**(ユーザー要望): サイドバーを「データ」列(Stored/Group、STORE/CANCELバー付き)と「測定」列(Measurement/Union/Filter/Windowing/Equalizer/StandardLine)に横分割。全体の並びは`チャート | データ | 測定`。
  - `SourceLayout.qml`に`columnFilter`("all"/"data"/"measurement")プロパティを追加。各行の`isDataType`(Stored/Group/RemoteStored/RemoteGroup判定)と組み合わせ、非該当行を`visible:false`・`height:0`にして列ごとに絞り込む(実データは1つの共有`SourceList`のまま、表示だけをQML側で間引く方式。C++側の一覧フィルタリング機構は新設していない)。
  - 従来1つだった`StackView`+グループ階層ナビゲーションのブロックを`qml/SourceColumn.qml`に切り出し、`columnFilter`/`showBulkHeader`/`rootSources`をパラメータ化して2列分インスタンス化(`SideBar.qml`)。各列が独立したGroup/Equalizerのドリルダウン階層を持つ。
  - `SourceLayout.qml`の`onDoubleClicked`によるグループ展開は、従来`applicationWindow.dataSourceList.list.openGroup(...)`という単一StackView前提の参照だったが、列ごとに`hostStack`プロパティで自分がぶら下がる`SourceColumn`(StackView)を直接参照する形に変更(2列化に伴い「the」StackViewが存在しなくなったため)。
  - サイドバー幅を200→400、ウィンドウ`minimumWidth`を768→968に拡大。
  - 「測定」列(`showBulkHeader: false`)にはSTORE/CANCELバーを表示せず、「移動」ボタンもStored/Groupの行にのみ表示するよう変更(Groupにはデータしか入れられなくなったため、測定側で出す意味がない)。
- **Groupの中身をSTOREデータのみに制限**(ユーザー要望、3カラム化に伴う整合性のため): `SourceList::isGroupableData()`(新設、`Stored`/`Group`のみtrue)を`moveToGroup()`(ドラッグ&ドロップ)・`moveItem()`(移動メニュー)・`addGroup()`(新規グループ作成時の自動格納)の3箇所すべてに適用し、測定(Measurement等)がグループに入らないようにした。
- **バグ修正: 測定をルートへ戻すと一番下(データの下)に来てしまう問題**: `moveItem()`でルートへ戻す際に`appendItem()`で末尾追加していたため、既存のデータ項目より下に来ていた。移動対象が「測定」側の場合は、追加後に`move()`で最初のデータ項目の直前まで引き上げるようにし、常に「測定が上・データが下」の並びを維持するようにした。
- **バグ修正(重要): ドラッグ&ドロップによる並び替え・グループへの格納が機能しなくなっていた**: 各行の`content`(ドラッグ中に表示される実体)は、保持(hold)開始時に`ParentChange`で`applicationWindow.dataSourceList`(サイドバー全体)へ親を差し替える実装になっていたが、`AnchorChanges`で`horizontalCenter`/`verticalCenter`しか解除しておらず、`left`/`right`/`top`のアンカー(新しい親を指す形で再評価される)が残ったままだった。その結果、ドラッグ中の`content`が新しい親(サイドバー全体)の左上に強制的に貼り付き、マウス追従が効かず、他の行の`DropArea`に一切入らない状態になっていた。`AnchorChanges`で`left`/`right`/`top`も明示的に解除し、かつ`content`にアンカーに依存しない明示的な`width: dragArea.width`を追加(アンカー解除後も幅を維持するため)して解消。この不具合は3カラム化以前から存在していた可能性が高い(既存コードのバグで、今回の作業中に検証して発見・修正した)。
- **バグ修正: ドラッグ開始条件が「静止したまま長押し」(`onPressAndHold`)前提になっており、マウス/トラックパッドで押してすぐ動かす一般的な操作では並び替えが開始できなかった**: 押下位置からの縦方向の移動量が横方向の移動量より大きく、かつ一定量(10px)を超えた時点でも`held`を立てるようにし、静止長押しを待たずにドラッグを開始できるようにした(`onPressAndHold`自体は残しており、タッチ操作等での従来動作にも影響しない)。横方向優位の移動は従来通りスワイプ削除として扱われる。
- **バグ修正: Groupからデータを取り出しても、Group行に表示される色ドットが更新されず取り出した項目の色が残り続けていた**: `SourceList::removeItem(const Shared::Source&, bool)`が`preItemRemoved`/`postItemRemoved`は発行するものの`countChanged()`を発行していなかったため(`appendItem()`側は発行していた、非対称なバグ)、`Group.qml`のドット表示`Repeater`(`sharedGroup.sourceList.count`にバインド)が項目削除時に再評価されず、古い個数のまま表示され続けていた。`removeItem()`に`emit countChanged();`を追加して解消。
- **バグ修正(根本原因): 「Group関連の移動はできるが、Stored単体同士の並び替えができない」問題**: 上記2つの修正後も、複数行をまたぐ並び替え(例: 一番下の項目を一番上まで運ぶ)が安定して機能しなかった。原因は`ListView`(`Flickable`)自身の「ドラッグでスクロール」が、行の並び替え用ドラッグと同じ「押して縦に動かす」ジェスチャーを奪い合っていたため。`ListView`のマウスドラッグによるスクロールを`interactive: false`で無効化し、`WheelHandler`でホイールスクロールのみ有効にすることで解消。あわせて、`MouseArea.onReleased`は`content.Drag`/`DropArea`によるドラッグが完了すると(内部でマウスグラブが奪われるため)確実には発火しないことが判明したため、`onCanceled`でも`held`をリセットするようにした(そうしないと行のドラッグ状態が`true`のまま固定されてしまう)。並び替え自体は`DropArea.onEntered`(確実に発火する)で行う方式を維持している。
- **バグ修正: Groupが先頭にあるとき、単体データをGroupより上へ移動できない**: `DropArea.onEntered`が、ホバー対象がGroupの場合に並び替え処理そのものをスキップ(`return`)していたため、Groupの上を通過すること自体ができず、Groupが一番上にある場合は「その上に出す」手段が無かった。Group上をホバーしても通常の行と同様に`sources.move()`で並び替えを行うようにし、実際にGroupの上へ「格納」する動作は release 時の`DropArea.onDropped`(`moveToGroup`)のみに限定した。これにより、Groupの直前直後へ普通に並び替えられ、実際にGroup内へ格納したい場合はGroupの上で指を離す(ドロップする)操作で区別する。
- **バグ修正: 各チャート(Magnitude/Phase等)プロパティの「show only selected sources」ドロップダウンに、データ列(Stored/Group)の値まで表示されてしまう**: 3カラム化以前は気づきにくかったが、この一覧(`qml/elements/Select.qml`)は`unrollGroups: true`でルートの`sourceList`をそのまま辿るため、Group内にネストされた`Stored`もすべて平坦化されて選択肢に混ざっていた(グループ化に伴い顕在化)。この一覧はチャートに表示する「測定」を選ぶためのものであり、`Stored`/`Group`/`RemoteStored`/`RemoteGroup`(データ列の型)は対象外とすべきなので、`SourceModel`に`excludeData`プロパティ(新設)を追加し、`Select.qml`側で`true`に設定。C++側は`SourceList::clone()`/`appendItemsFrom()`に`excludeData`引数を追加し、新設の`SourceList::isDataSource()`(objectNameが`Stored`/`Group`/`RemoteStored`/`RemoteGroup`のいずれかを判定、`qml/SourceLayout.qml`の`isDataType`判定と同じ基準)に該当する項目を一覧生成時にスキップするようにした。`UnionProperties.qml`等、他の箇所で使われる`SourceModel`(Union/Windowingのソース選択など、Storedも選択対象に含めたいケース)は`excludeData`を指定していないため影響なし。
  - `Plot/SpectrogramProperties.qml`の「show only this source」は共通の`Select.qml`要素を使わず`SourceModel`を直接インスタンス化していたため、上記修正だけでは漏れていた。こちらにも同様に`excludeData: true`を追加。
- **UI調整: top level(ルート)にあるデータの「移動」メニューに「Move to top level」が表示されていた問題を修正**: `SourceLayout.qml`の各行は`sources`プロパティで現在表示中の階層(ルートの場合は`sourceList`、Group内をドリルダウン中はそのGroup自身の`sourceList`)を保持しているため、`Labs.MenuItem`(「Move to top level」)に`visible: sources !== sourceList`を追加し、既にルート直下にある項目では無意味な選択肢を出さないようにした(この後さらに大きくUI刷新したため、下記のインライン展開化で「move」メニュー自体を廃止済み)。

## データカラムUI刷新: Groupのインライン展開・移動のDnD一本化・右クリック削除(ユーザー要望)

`qml/SourceLayout.qml`、`qml/source/Group.qml`、`src/sourcelist.h`/`.cpp`

対象は**データカラム(Stored/Group)のみ**。測定カラム(Measurement/Union/Filter/Equalizer/Windowing/StandardLine)とEqualizerの既存ドリルダウン(StackView)、およびリモート由来の項目(RemoteGroup/RemoteStored。このフォークでは未使用)は変更していない。

- **Groupのドリルダウンをインライン展開に変更**: 従来Groupをダブルクリックすると`StackView`で別ページへ「ドリルダウン」していたが、`Group.qml`の見出し行左端に`▶`/`▼`の開閉アイコンを追加し、クリックでその場に子要素をインデント表示するようにした(`expanded`はセッション内のみのUI状態で、JSONには保存しない)。
  - `Group.qml`は展開時、**自分自身と同じ`SourceLayout.qml`を再帰的にロードして**子リスト(`sharedGroup.sourceList`)を表示する。ただし`SourceLayout.qml`自身が行コンポーネントとして`qml/source/`(`Group.qml`を含む)をディレクトリインポートしているため、`Group.qml`から`SourceLayout`型を直接参照するとQMLが循環インポートとしてロードを拒否する(`Cyclic dependency detected between "qrc:/SourceLayout.qml" and "qrc:/source/Group.qml"`)。これを避けるため`Loader { source: "qrc:/SourceLayout.qml" }`というURL経由の動的ロードにし、`onLoaded`内で`Qt.binding()`を使って`sources`/`depth`/`parentGroupUuid`/`multiSelectScope`等のプロパティを後付けで結線している(型としての静的インポートを発生させないため)。
  - `SourceLayout.qml`に`depth`(ネスト段数、インデント幅の計算に使用)、`parentGroupUuid`(自分を直接含むGroupのUUID、ルート直下なら空文字)、`multiSelectScope`(後述)を追加し、`groupDelegate`のインスタンス化時に`sideList.depth`/`sideList.multiSelectScope`をそのままGroup行へ渡し、`Group.qml`が自分の子の`SourceLayout`へさらに`+1`して伝播することで、何階層ネストしても同じ仕組みで動く。
  - Group行自身の高さは`ヘッダー50px + (展開時のみ)ネストしたSourceLayoutのcontentHeight`とし、既存の`Behavior on height`(200ms)がそのまま展開/格納アニメーションになる。
  - `onDoubleClicked`の分岐から`"Group"`を除去(`RemoteGroup`/`Equalizer`は引き続き`hostStack.openGroup()`でドリルダウン)。
- **「move to group」ボタン(``アイコン+グループ一覧メニュー)を廃止し、移動はDrag&Dropのみに一本化**: `moveButton`とその中の`Labs.Menu`(グループ一覧を動的生成していた`Instantiator`含む)を削除し、専用だった`SourceList::groupList()`(C++)も削除した(他に呼び出し元がないことを確認済み)。
  - 複数階層が同時に画面上に見えるようになったため、`DropArea`のロジックを「同一リスト内の並び替え」と「階層をまたぐ格納/取り出し」で分離: ホバー中(`onEntered`)はドラッグ元と同じ`sources`(`dragArea.rowSources`という新設プロパティで比較)の場合のみ位置入れ替え(`sources.move()`)を行い、異なる階層をホバーしているだけでは何もしない(実際の格納/取り出しは必ず明示的なドロップで行う、という既存方針の踏襲)。
  - ドロップ確定時(`onDropped`)、ドロップ先がGroupの見出し行なら: ドラッグ元が**まさにそのGroup自身の子**なら「一段上の階層へ出す」(`sourceList.moveItem(uuid, sideList.parentGroupUuid)`)、そうでなければ「そのGroupへ格納する」(`sourceList.moveItem(uuid, dragArea.source.data.uuid)`)という一貫したルールにした。ルートの`sourceList`から呼ぶ前提の既存`moveItem()`(ツリー全体を再帰的に辿る)を使うことで、深さの異なる階層間の移動も正しく処理できる。深い階層から一気にルートへ戻すショートカットは提供しない(1階層ずつドラッグする)。
- **ゴミ箱アイコンを廃止し、右クリックのコンテキストメニューに「Delete」を配置**: `deleteButton`に`visible: !dragArea.isDataType`を追加してデータ行では非表示にし(測定カラムは従来通りボタン表示)、データ行の右クリックで`Labs.Menu`(`contextMenu`)を`open()`するようにした。削除確認ダイアログ(`applicationWindow.dialog`)は既存の単体削除と同じ流用パターン。
  - 動作確認時、`contextMenu.popup()`ではメニューが表示されなかった(このコードベースの他箇所で実績のある`open()`と違い、`Qt.labs.platform.Menu`で期待通りに動作しなかった)。`open()`に修正して解消。
- **複数選択(既存のShift/Ctrlクリック)からの右クリック一括削除に対応**: インライン展開で複数階層が同時に見えるようになったことに合わせ、複数選択の状態管理を`SourceLayout.qml`の新設プロパティ`multiSelectScope`(既定値は自分自身の`sources`、Group行の子孫へは常にルートの`sourceList`まで同じ値が伝播する)に切り出し、データカラムに限りツリー全体で1つの選択集合として扱われるようにした(測定カラム・Equalizerドリルダウンは`multiSelectScope`が既定値のままなので挙動は変わらない)。
  - 右クリックしたときそれが現在の複数選択に含まれていなければ単独選択に切り替え(一般的なファイルマネージャーと同様)、含まれていれば複数選択を維持したままコンテキストメニューを開く。
  - 複数選択中(`multiSelectScope.multiSelectedCount > 1`)は「Delete N items」を表示し、`SourceList`に新設した`Q_INVOKABLE void removeMultiSelected()`を呼ぶ。これは選択中の各UUIDを`getByUUid()`(既存・ツリー全体を再帰的に検索)で解決し、`removeItemFromTree()`(既存、`moveItem()`が「取り除くだけで削除しない」用途で使っていたヘルパー)に`deleteItem`引数を追加して実際に削除できるようにしたものを使う。どの階層にある項目が混ざっていても正しく削除できる。

### 動作確認後の修正

- **バグ修正: Groupを展開しても中身が表示されない**: `Group.qml`の子リストは循環インポート回避のため`Loader { source: "qrc:/SourceLayout.qml" }`でURL経由ロードしているが、`item.height`を明示的に結線し忘れていた。`ListView`は無指定だと`height`が0のままレイアウトされる(`contentHeight`自体は正しく計算されていても、実際の表示領域がゼロになるため何も見えない)。`onLoaded`内で`item.height = Qt.binding(() => item.contentHeight)`を追加して解消。
- **バグ修正: データをGroupの上にDrag&Dropしようとすると、格納より先に並び替えが発動して格納できない**: `DropArea.onEntered`(ホバー中の並び替え)は改修前から「Groupを含めて常に並び替える、格納は実際のドロップ(`onDropped`)のみで行う」という設計だったが、ホバーのたびにGroup自身の表示位置がずれてカーソルの下から逃げてしまい、`onDropped`が発火する前にホバー対象が別の行に変わってしまうため、実質的にGroupへドロップし切ることができなかった。`onEntered`の並び替え条件に`dragArea.source.objectName !== "Group"`を追加し、**Groupの上をホバーしている間は並び替えを行わない**(Groupの行が動かず静止するので、そのままドロップして格納できる)ようにした。Groupのすぐ上/下に並び替えたい場合はGroups自身ではなく隣接する行の上でドロップすればよい。
- **バグ修正: Group内のデータを外へ出すDnDが、Groupの上側(見出し行)へは出せるが下側へは出せない**: 展開中のGroupから子を取り出す処理(`onDropped`)は「ドロップ先がGroupの見出し行そのもの」の場合しか一段上へ出すロジックが無かった。Groupの一番下の子より下(=Group自身の外、親リストの次の兄弟行)へドラッグした場合、そこはGroupではないただの行なので該当条件に入らず、何も起きなかった。`onDropped`に「ドロップ先が(Groupではない)通常行で、かつドラッグ元の所属リストがドロップ先の所属リストと異なる場合は、ドロップ先の所属リストへ合流する」という分岐を追加し、Group見出しへのドロップに限らずGroup外のどの行へドロップしても正しく取り出せるようにした(結果的に、よそのGroupの子行へ直接ドロップして格納することも可能になった)。
- **UI追加→再設計: ドラッグ中、ドロップ先候補を半透明でプレビュー表示**(ユーザー要望、移動先の視認性向上): 当初は各行の`DropArea`にドラッグ元の色で塗った半透明`Rectangle`を重ねるだけの実装にしたが、動作確認で以下3件の不具合が見つかったため、DnDのヒットテスト自体を「ホバー中は何も動かさず、ドロップ時に一度だけ確定させる」方式に設計し直した:
  1. Groupがデータカラムの先頭にあるとき、その上に並び替えできない(Groupへの格納ハイライトしか出ない)。
  2. Group直下(親リスト)に単体データが1件あるとき、Groupから取り出した項目をその単体データの上に置けず、必ず下に置かれる。
  3. Groupがデータカラムに1つだけ(かつ展開中)のとき、中の子を「Groupの下」へ出そうとしてもプレビューが出ず移動できない。
  - 根本原因は、「Group行=格納先、それ以外の行=並び替え先」という行単位の二択しかなく、かつGroup行に対しては(前々回の修正で)ホバー中の並び替えを完全に無効化していたため、**Groupが先頭/末尾/唯一の行のとき、その上や下に置くための「隣の行」自体が存在しない**ケースを表現できなかったこと。
  - `SourceLayout.qml`の`rowDropArea`(旧`onEntered`での即時`sources.move()`)を廃止し、`onPositionChanged`で`drag.y`(行内の縦位置)に応じて`dropZone`("before"/"into"/"after")を継続的に判定するようにした: Group行は上下25%ずつが「before」「after」(単純な並び替え/一段外への移動)、中央50%が「into」(格納/一段上に出す)。Group以外の行は上半分/下半分で「before」/「after」のみ。**実際の移動は`onDropped`一度きり**で、直前の`dropZone`に基づいて`sources.move()`(同一リスト内)または`sourceList.moveItem()`+`sources.move()`(別リストへ合流後、ドロップ位置に正確に並べ直す)を行う。これにより(1)(2)が解消: Group行の上端/下端が独立した並び替えターゲットになり、また別リストへ合流したあとも`moveItem()`の末尾追加(append)だけで終わらせず、ドロップ位置のインデックスへ`move()`し直すようにした。
  - プレビュー表示も「into」は行全体の半透明塗り、「before」/「after」は該当する上端/下端に薄い挿入線、という2種類に変更(いずれもドラッグ元の色で着色)。
  - (3)は上記だけでは解決しない: 展開中のGroupが唯一の最上位行だと、子を一番下まで運んでもその外側(=Group自身の兄弟レベル)に対応する行が物理的に存在せず、ドロップ先を用意できない。`Group.qml`にネストした子リストの直後だけに存在する高さ10pxの専用`DropArea`(`trailingDrop`、展開中のみ有効)を追加し、「このGroupの直後(=Groupを含んでいる側のリスト)に挿入する」動作を明示的に提供した。これに伴い`Group.qml`へ`containingList`(このGroup自身を含む親リスト)・`containingParentGroupUuid`(そのリストの、さらに親であるGroupのUUID)を新設し、`SourceLayout.qml`の`groupDelegate`から`sideList.sources`/`sideList.parentGroupUuid`をそのまま渡すようにした。
- **UI調整(ユーザー要望): 階層のインデント幅を拡大、Groupはデフォルト展開**
  - インデント幅(`SourceLayout.qml`の`content`の`leftMargin`/`width`調整に使う`sideList.depth`の係数)を16pxから32pxに拡大。Group自身の行には見出し左端に開閉三角(`disclosure`、幅16px)があるため、旧16px幅だと子(depth+1)のチェックボックスがGroup自身のチェックボックスとほぼ同じX位置に来てしまい(三角の分だけGroup側が右にずれるため相殺されてしまう)、親子関係が視覚的に分かりにくかった。32pxに広げることで、子のチェックボックスが常にGroup自身のチェックボックスより明確に右側に来るようにした。
  - `Group.qml`の`expanded`の初期値を`false`から`true`に変更(デフォルトで展開表示、折りたたみは引き続き開閉三角から可能)。
  - **Group外の単体データのチェックボックス位置をGroupのチェックボックスに揃える**(ユーザー要望): `Stored.qml`はGroupの開閉三角に相当するものを持たないため、同じ階層でGroupと並ぶとチェックボックスの位置が三角の幅(16px)分だけ左にずれて見えていた。`Stored.qml`のチェックボックスの手前に同じ幅(`Layout.preferredWidth: 16`)の透明な`Item`を追加し、Groupの有無に関わらずチェックボックスの位置が揃うようにした。
### Groupの移動が不安定な問題への対応(SortableJS的な挙動を目指して再設計)

動作確認で、Groupの移動(単体データの移動は問題なし)に3つの不具合が報告された:
1. データカラム最下部の単体データの下へGroupを移動しようとしても、最下部ではなく別の場所に移動してしまう。
2. データカラム最上部の単体データの上へGroupを移動しようとしても、挿入位置バーが出ず、その単体データ行がハイライトされるだけになる。
3. Group内に複数のデータがある場合、Group内での並び替えができず、Group外にデータが移動してしまう。

原因は2つ複合していた:

- **原因A(1・2の主因): `Drag.hotSpot.y: height / 2`が、ドラッグ中のGroup自身の高さに依存していた**。展開中のGroupの`content`の高さは「ヘッダー50px + 子要素の高さ」であり、子を多く持つほど非常に大きくなる。ドラッグ判定に使われる実際の基準点(`Drag.hotSpot`)がその高さの半分の位置になるため、Groupをドラッグすると実際のマウスカーソル位置と判定基準点が大きくズレてしまい(子が多いほどズレも大きい)、カーソルを最下部/最上部に持っていっても正しい行のドロップ判定に届かなかった。`Drag.hotSpot.y`を`height / 2`から固定値`25`(通常行の半分の高さ)に変更し、行の高さに関わらず基準点がカーソル位置に一致するようにした。
- **原因B(3の原因): Group行自身の`DropArea`が`anchors.fill: parent`で、展開時はGroup全体(ヘッダー+全子要素)を覆う大きさになっていた**。子要素は別途ネストした`SourceLayout`が自前の`DropArea`を持っているにも関わらず、外側のGroup行の`DropArea`がヘッダーだけでなく子要素の領域まで覆ってしまうため、子同士を並び替えようとホバーしても「Group自身への出し入れ」(`dropZone === "into"`)と誤判定され、並び替えの代わりに「このGroupから出す」処理が発動していた。Group行自身の`DropArea`をヘッダー相当の50px(`height: Math.min(parent.height, 50)`)に制限し、それより下の子要素の領域は完全に子自身の`DropArea`に委ねるようにした(挿入位置バー自体は`content`基準で表示するため、展開中のGroupでも「after」は子要素も含めた全体の下端に正しく表示される)。

あわせて、ユーザーから「SortableJSのような滑らかな挙動にしたい」「Group内での並び替えも実現したい」との要望を受け、DnDのヒットテスト方式を以下のように整理した:
- 各行のホバー判定を`drag.y`に応じて`before`/`into`/`after`の3ゾーンに分割(Group行は上下25%が`before`/`after`、中央50%が`into`。Group以外の行は上半分/下半分で`before`/`after`のみ)。
- **同一リスト内の`before`/`after`は、ホバー中に即座に(`onPositionChanged`でゾーンが変わるたびに)`sources.move()`で並び替える**(SortableJS的な、動かしながらその場で入れ替わっていく感覚を復元)。ズームせず、ゾーンが変化した時だけ動かす(`dropZone`が前回と同じ値なら何もしない)ことで、無駄な再計算・ちらつきを避けている。
- **別リストへの移動(Groupへの格納/取り出し)と`into`は、従来通りドロップ時(`onDropped`)にのみ確定する**(ホバー中は動かさない)。ドラッグ中の行を別リストへライブで付け替えるとその場でデリゲートが破棄・再生成されてしまいドラッグ操作自体が中断するため、これは今回も変えていない。
  - **バグ修正: 上記の導入直後、DnDでGroupへ格納すること自体が完全にできなくなった**: `onDropped`に追加した「同一リスト内の`before`/`after`は`updateZone()`で処理済みなので早期return」というガードが、`drag.source.rowSources === sources`(同じリストに属するか)だけを見て`dropZone`の値を見ていなかったため、**同じ階層にある単体データをGroupへ格納しようとするケース(`dropZone === "into"`だが、ドラッグ元とGroupが同じ親リストに属する)まで早期returnで無視してしまっていた**。ガード条件に`dropZone !== "into"`を追加し、`into`のときは同一リストかどうかに関わらず必ず格納/取り出し処理へ進むように修正した。

- **UI追加(ユーザー要望): Groupのチェックボックスを外すと、中のデータのチェックボックスの色をチェック状態は変えずグレーにする**: `SourceLayout.qml`/`Stored.qml`/`Group.qml`に`dimmed`プロパティ(既定`false`)を新設し、`storedDelegate`/`groupDelegate`経由で`sideList.dimmed`をそのまま子へ渡すリレー方式にした(`depth`/`multiSelectScope`と同じパターン)。`Group.qml`はネストした子リストへ`item.dimmed`を`group.dimmed || !sharedGroup.active`(自分がすでにdimmedされているか、自分自身のチェックボックスがOFFか)としてバインドすることで、祖先のいずれかが非アクティブなら子孫すべてが連鎖してグレーになる。`Stored.qml`/`Group.qml`双方の`checkedColor`を`dimmed ? "grey" : 本来の色`に変更(チェック状態自体を左右する`active`/`checked`は一切変更していない)。`onColorChanged`時に`checkedColor`を直接上書きしていた既存の`Connections`ハンドラも同様に`dimmed`を考慮するよう修正(そうしないと色変更のたびにグレー表示が本来の色で上書きされてしまうため)。

## フロントエンドJS化 Phase 0(環境構築)の実施

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md)・[js-frontend-phases.md](js-frontend-phases.md)参照。QMLチャートをJS(QtWebEngine+QWebChannel)へ置き換える移行の第一段階として、開発基盤を整備した。

- `~/Qt/5.15.2/clang_64`に`aqtinstall`で`qtwebengine`モジュールを追加導入(`aqt install-qt mac desktop 5.15.2 clang_64 -m qtwebengine --outputdir ~/Qt`)。`--outputdir`を指定しないとカレントディレクトリ配下に別のQtツリーが新規作成されてしまう点に注意(実際に一度誤って`~/5.15.2`へ作成してしまい、削除してやり直した)。導入されたChromiumバージョンは83.0.4103.122。
- `OpenSoundMeter.pro`の`QT +=`に`webenginewidgets webchannel`を追加。既存ソースは未変更のままシャドウビルドでリンクが通ることを確認済み(`otool -L`で`QtWebEngineWidgets`/`QtWebEngineCore`/`QtWebChannel`のリンクを確認)。
- リポジトリ直下に`web/`(Vite + TypeScript、vanillaテンプレート)を新規追加。デモ用のロゴ・カウンター等は削除し、疎通確認用の最小限の内容に置き換えた。`vite.config.ts`で`base: './'`(qrc同梱時の相対パス解決用)と、ビルド成果物のファイル名からキャッシュバスティング用ハッシュを除去する設定(`.qrc`を固定内容にできるようにするため)を行った。
- `web/web.qrc`にqrc同梱用のテンプレートを作成したが、`web/dist/`(`npm run build`の出力)は`npm run build`実行後にしか存在しないため、**`OpenSoundMeter.pro`の`RESOURCES`にはまだ追加していない**(追加すると`npm run build`未実行時に`make`が失敗するため)。`QWebEngineView`の実アプリへの組み込みはPhase 1で行う。
- `QWebEngineView`↔Vite dev server(`localhost:5173`)の疎通・ホットリロード、`QTWEBENGINE_REMOTE_DEBUGGING`によるChrome DevTools Protocol接続(`/json/version`・`/json`の応答を確認)、`qrc:/`同梱ビルドでの読み込みは、いずれも本体`src/main.cpp`を変更せずスクラッチ領域の最小Qt Widgetsプロジェクトで検証した(Phase 1で設計する`DataBridge`+QWebChannel登録を先取りしないため)。

## フロントエンドJS化 Phase 1(Magnitude単体疎通)の実施

[js-frontend-phases.md](js-frontend-phases.md) Phase 1参照。既存QML UIを残したまま、Magnitude 1チャート・Measurement 1ソースの最小構成でC++の測定データからJS Canvasまでの垂直スライスを追加した。

- 新規`src/chart/seriessampler.h`/`.cpp`: `FrequencyBasedSeriesHelper::iterate()`を流用し、既存MagnitudeレンダラーのdBモードと同じパワー加算→`10 * log10(value / count)`で、スプライン適用前のバンド中心周波数とMagnitude値をJSON化する。
- 新規`src/chart/databridge.h`/`.cpp`: Measurementの`readyRead()`を受けてサンプリングし、QWebChannel公開シグナル`magnitudeUpdated(QString)`でJSへpushする。Phase 1では意図的に1ソース固定とし、複数パネル/複数ソースのライフサイクル設計はPhase 5へ残した。
- `src/main.cpp`: `OSM_JS_FRONTEND`が設定された場合だけ`QWebEngineView`、`QWebChannel`、`DataBridge`を生成する。未設定時は従来どおりQML UIだけを起動するため既存ユーザーへの挙動変更はない。`OSM_JS_DEV_SERVER`も設定されていれば`http://localhost:5173/`、なければ`qrc:/web/index.html`を読む。
- `OpenSoundMeter.pro`: 新規C++ファイルを追加し、`web/dist/index.html`が存在する場合だけ`web/web.qrc`をリソースへ含める。これにより`npm run build`前でも通常のqmake/makeを壊さない。
- `web/index.html`/`web/src/main.ts`/`web/src/style.css`: Qt内蔵の`qrc:///qtwebchannel/qwebchannel.js`を読み、`dataBridge.magnitudeUpdated`を購読して対数周波数軸のCanvasへ描画する。Qt内蔵スクリプトはVite dev serverとqrc同梱版の両方で動作確認できたため、npmパッケージ追加は不要だった。
- ダークモード配色は`src/chart/palette.cpp`に合わせ、背景`#000000`、グリッド/枠線`rgba(255,255,255,0.157)`(`QColor(255,255,255,40)`相当)、文字`rgba(255,255,255,255)`、Magnitude線はソース色とした。
- **レビュー修正: Measurementデータ読取時の競合を解消**: `Measurement::transform()`はワーカースレッドで周波数領域データを書き換えるため、`MagnitudeSeriesSampler::sampleJson()`の`frequencyDomainSize()`確認から`iterate()`完了までを`m_source->lock()`/`unlock()`で保護した。`readyRead()`がGUIスレッドへキュー配送された後に次の測定周期と重なっても、書換中の`m_ftdata`を読まない。
- **レビュー修正: 無音帯域を0dBとして描画しない**: パワーが0の帯域で生じる非有限dBをC++側でJSONの`null`へ明示変換し、JS側の型を`(number | null)[]`へ変更した。Y軸範囲は有限値だけから計算し、`null`区間ではCanvasのパスを分断するため、無音/未接続帯域が0dBへスパイクしない。

## フロントエンドJS化 Phase 2(Phase・Coherence追加)の実施

[js-frontend-phases.md](js-frontend-phases.md) Phase 2参照。Phase 1のMagnitudeパイプラインをPhase/Coherenceへ拡張し、実験的JSウィンドウを3チャート構成にした。

- `src/chart/seriessampler.h`/`.cpp`: `PhaseSeriesSampler`と`CoherenceSeriesSampler`を追加した。Phase payloadは`{"sourceName", "color", "frequency": [...], "phaseDeg": [...]}`、Coherence payloadは`{"sourceName", "color", "frequency": [...], "coherenceValue": [...]}`。非有限値はMagnitudeと同様に`null`とし、両サンプラーとも読取区間をソースの`lock()`/`unlock()`で保護する。
- `src/chart/databridge.h`/`.cpp`: 同じMeasurementの`readyRead()`を契機に3サンプラーを実行し、QWebChannelシグナル`phaseUpdated(QString)`と`coherenceUpdated(QString)`を追加した。
- `web/src/main.ts`: Magnitude/Phase/CoherenceのCanvasを縦積みにし、対数周波数グリッドと系列線を共通の`drawSeries()`で描画する。Phaseは-180〜180度固定で、隣接値の差が180度を超える箇所のパスを分断する。Coherenceは0〜1固定レンジで描画する。
- `web/src/style.css`: 単一Canvas用の`#chart`を3面共通の`.chart`へ変更し、各チャートの見出しスタイルを追加した。
- 本Phaseの意図的な簡略化として、Phaseのスプライン後アンラップはパス分断で代替し、`PhasePlot::rotate`は0度固定、Coherenceは`Type::Normal`固定とした。Magnitude/Phase線のcoherence連動透明度も見送った。
- **レビュー修正: 無信号時の偽0度を描画しない**: リファレンス未接続/無信号時、Phaseの生値が有限の0度となって`std::isfinite(degrees)`だけでは無効と判定できないケースがあった。`PhaseSeriesSampler`で同じ帯域のMagnitudeパワーも並行集計し、そのdB値が非有限ならPhaseをJSONの`null`へ変換する。根本原因は`Measurement::averaging()`のPhase計算にMagnitude側と同等のNaN/Infガードがないことに起因する可能性が高いが、DSP本体の変更は今回のJSフロントエンド化のスコープ外とした。
- 修正後のqrc同梱版を無信号状態で実機確認し、Chrome DevTools ProtocolからPhase Canvasのソース色画素が0件(グリッドのみ)であることを確認した。

## フロントエンドJS化 Phase 3(RTA/Spectrum追加)の実施

[js-frontend-phases.md](js-frontend-phases.md) Phase 3参照。Phase 1・2の測定データ配信パイプラインへRTAを追加し、実験的JSウィンドウを4チャート構成にした。

- `src/chart/seriessampler.h`/`.cpp`: `RTASeriesSampler`を追加した。payloadは`{"sourceName", "color", "frequency": [...], "levelDb": [...]}`で、非有限値は他のサンプラーと同様に`null`へ変換する。読取区間はソースの`lock()`/`unlock()`で保護する。
- 既存`RTASeriesRenderer::renderPPOLine()`と同じく、リファレンス不要の`module(i)`を用い、DC成分を除外してバンド内の二乗値を加算し、カウント数で割らずに`10 * log10(value)`へ変換する。既定の6 points/octaveでスプライン適用前のバンド中心値を送る。
- `src/chart/databridge.h`/`.cpp`: 同じMeasurementの`readyRead()`を契機にRTAもサンプリングし、QWebChannelシグナル`rtaUpdated(QString)`でJSへpushする。
- `web/src/main.ts`: `levelDb`を受け取るRTA Canvasを追加し、有限値から動的レンジを算出して共通の対数周波数軸・系列描画処理で表示する。
- Phase 3ではRTAPlotの既定状態に合わせ、`Mode::Line`・`Scale::DBfs`・ピーク表示なしに固定した。`Scale::SPL`/`Phon`、Bars/Lines、ピーク表示とそれらのUIコントロールは対象外。
- TypeScript/ViteとQt本体のビルド後、qrc同梱版を実機起動してChrome DevTools ProtocolからRTA Canvasを検査した。ソース色の曲線が描画され、3秒後に画素数とチェックサムが変化したため、実オーディオデータによるリアルタイム更新まで確認できた。
- **レビュー修正: Magnitude/RTAのデータなし表示を統一**: 全点が`null`の場合に`finiteRange()`から早期returnしていたため、両Canvasだけ背景・グリッド・ラベルも描かれない問題があった。表示レンジ`-1..1`へフォールバックして共通`drawSeries()`を必ず呼ぶようにし、Phase/Coherenceと同じ「グリッドとラベルは表示し、無効な系列線だけを描かない」状態へ統一した。実データがある場合の動的レンジは変更していない。

## フロントエンドJS化 Phase 4(Spectrogram追加)の実施

[js-frontend-phases.md](js-frontend-phases.md) Phase 4参照。Phase 1〜3の測定データ配信パイプラインへSpectrogramを追加し、実験的JSウィンドウを5チャート構成にした。

- `src/chart/seriessampler.h`/`.cpp`: `SpectrogramSeriesSampler`を追加した。リファレンス不要の`module(i)`を使い、DC成分を除外してバンド内エネルギーを`10 * log10(value)`へ変換する。payloadは新規1行分の`{"sourceName", "frequency": [...], "levelDb": [...]}`のみで、C++側には履歴を保持しない。無音・非有限値・`-140dB`未満はQML版と同じく`-140dB`へクランプし、ヒートマップに欠損セルを作らない。
- `src/chart/databridge.h`/`.cpp`: Measurementの`readyRead()`ごとにSpectrogramの新規1行を採取し、QWebChannelシグナル`spectrogramRowUpdated(QString)`でJSへpushする。
- `web/src/main.ts`: Spectrogram Canvasを追加し、最大51行相当の履歴をCanvas自身に保持する。新規行を最上部へ描画する前に、既存ピクセルを`getImageData()`/`putImageData()`で1行分下へ移動するため、毎フレーム全履歴をC++から転送したり全メッシュを再構築したりしない。
- 色はQML/OpenGL版と同じ固定しきい値`lower=-70dB`・`upper=-10dB`を用い、青(`#2196F3`)→緑(`#8BC34A`)→黄(`#FFEB3B`)→赤(`#F44336`)の3区間線形補間とした。`lower`以下は透明の代わりに不透明な黒で塗り、ピクセルスクロール後に過去行が透けて残らないようにした。
- `canvas.width`/`height`を変更するとブラウザ仕様によりCanvas内容が消えるため、Phase 4ではウィンドウリサイズ時のSpectrogram履歴消失を許容する。リサイズ後は次の受信行から通常どおり描画を再開する。
- TypeScript/ViteとQt本体のビルド後、開発サーバー版を実機起動してChrome DevTools ProtocolからCanvasを検査した。8秒継続後に全高が更新済みで色付き画素が存在すること、リサイズ直後に履歴が消えること、3秒後に新規行の描画が再開することを確認した。環境変数なしの通常起動でもプロセスが継続動作することを確認した。

## フロントエンドJS化 Phase 5(複数ソースとライフサイクル)の実施

[js-frontend-phases.md](js-frontend-phases.md) Phase 5参照。実験的JSフロントエンドを、起動時の先頭Measurement 1つ固定から、ルート`SourceList`直下の全Measurementに動的対応する構成へ変更した。

- 新規`src/chart/jsfrontendmanager.h`/`.cpp`: `SourceList::postItemAppended`/`preItemRemoved`を購読し、Measurement 1つごとに`DataBridge`+`QWebChannel`+`QWebEngineView`を1組生成する。Group内のMeasurementはPhase 5のスコープ外で、トップレベルのみを管理する。
- 後片付けは`QWebEngineView::destroyed`シグナルに一本化した。ユーザーによるウィンドウクローズとソース削除のどちらも`QWebEngineView::close()`と`Qt::WA_DeleteOnClose`を通し、その後`m_panels`からの除去と`DataBridge`/`QWebChannel`の`deleteLater()`を同じ経路で行う。`closePanel()`側では解放せず、二重解放を避ける。
- `src/main.cpp`: 従来のbridge/channel/view直接生成を`std::unique_ptr<Chart::JsFrontendManager>`に置き換えた。`OSM_JS_FRONTEND`未設定時の通常起動は変更していない。`OpenSoundMeter.pro`に新規2ファイルを追加した。
- 実機でMeasurement 5個に対応する5つのWebEngineページを確認し、ソース削除と再追加で対応するページIDが消滅・新規生成されることを確認した。5パネルで約5分間クラッシュなし。本体プロセスのサンプルは約495 MiB RSS/CPU約128%であり、5枚は動作確認済みの目安とするが、リソース消費上、無制限の常用を保証する値とはしない。
- **QML版は併存を継続する**。JS版にはpoints-per-octaveやモード/スケール/しきい値のコントロール、coherence連動透過度、QMLパネルレイアウト統合がなく、環境変数が必要な実験機能のままである。JS版が実用機能を備えた時点で改めてQML版の削除を検討する。

## 方針転換: JSフロントエンドをデフォルトUIへ(QML版は廃止可)

`dev-docs/js-frontend-phases.md`(Phase 6〜)

- **2026-08-08、本フォークの方向性を「本家OSMからの独自派生」として明確化した**。それに伴い、上記「STOREデータ管理」節までの本家追従を前提とした改修方針から一歩進め、Phase 5完了メモに記録していた「QML版併存を継続する」判断を撤回し、**QML版は廃止してよい**方針に変更した。
- ユーザー提示のリファレンス(Smaart v9のUI)を踏まえ、JSフロントエンドを単一ウィンドウ・3ペイン構成(左: ソースエクスプローラー、中央: 複数ソース重ね描きチャート、右: 測定設定+信号発生器)へ作り替え、段階的に**デフォルトUI**へ昇格させる方針とした(詳細は`dev-docs/js-frontend-phases.md`のPhase 6〜12を参照)。
- これに伴い、バックエンド(`src/`)もJS版が使いやすくなるよう必要に応じて自由に改良してよいことにした。従来Phase 1〜5で重視していた「QML版との厳密な数値突き合わせ検証」は必須ゲートではなくなった(開発時の健全性チェックとしては引き続き有用なので任意で行う)。
- **アーキテクチャ上の重要な制約**: Qt 5.15系の`qwebchannel.js`はチャンネル接続時の`init`メッセージ1回だけで`channel.objects`を構築するため、接続済みチャンネルへ新規`QObject`を動的に`registerObject()`しても既存クライアントには反映されないことを確認した。そのため単一永続ウィンドウ化にあたっては、ソースの増減に追従してQWebChannelへオブジェクトを動的登録する設計を避け、起動時に1回だけ登録する少数の固定オブジェクト(`sourceList`本体をそのまま登録、新規`SourceTreeBridge`/`SettingsBridge`、既存`Generator`本体をそのまま登録)でソースの増減をJSON文字列シグナルとして表現する設計とした。

### Phase 6完了(単一ウィンドウ化 + 左ペイン読み取り専用ツリー)

`src/chart/jsfrontendmanager.h/.cpp`(全面書き換え)、(新規)`src/chart/sourcetreebridge.h/.cpp`、`OpenSoundMeter.pro`、(新規)`web/src/webchannel.ts`、(新規)`web/src/sourceTree.ts`、`web/src/main.ts`、`web/src/style.css`

- `JsFrontendManager`を「測定ソース1つにつき別ウィンドウ」方式から単一永続ウィンドウ方式へ書き換えた。起動時に`sourceList`本体・新規`SourceTreeBridge`(チャンネル名`sourceTree`)・既存`DataBridge`(チャンネル名を`dataBridge`から`chartData`に変更)の3つを1回だけ`QWebChannel`へ登録する。中央チャートはPhase 6時点では引き続き先頭のトップレベルMeasurement1つのみを表示する(複数ソース重ね描画はPhase 7)。
- `SourceTreeBridge`はトップレベルの`SourceList`を読み取り専用のJSON配列として`treeChanged`シグナルで配信する(uuid/type/name/color/active)。`type`は`SourceList::toJSON()`が使うのと同じ`QObject::objectName()`をそのまま利用した。左ペインが実際の`SourceList`(QML側と同一データ)にリアルタイムに追従することを実機確認済み。
- 実装時に当初のプロンプトから2点改善した: `preItemRemoved`ではなく`postItemRemoved`(削除完了後)を購読して削除直前の古いツリーを送る潜在バグを回避したこと、`SourceTreeBridge::requestTree()`(Q_INVOKABLE)を追加してJS接続直後に明示リクエストすることで、コンストラクタ内で(JS未接続のうちに)発火する初期`treeChanged`の取りこぼしを解消したこと。
- `web/index.html`・`src/main.cpp`は無変更。3ペインはCSS Grid(`#app`の`grid-template-columns: 260px minmax(0, 1fr) 320px`)で実現し、DOM構築は既存方針通り`main.ts`側で行う。

### Phase 7完了(マルチソース重ね描画 + アクティブ切替)

`src/chart/databridge.h/.cpp`、`src/chart/seriessampler.cpp`、`src/chart/jsfrontendmanager.cpp`、(新規)`web/src/charts.ts`、`web/src/main.ts`、`web/src/sourceTree.ts`、`web/src/style.css`

- `DataBridge`を先頭Measurement 1件への固定バインドから、トップレベルMeasurement全件を自己管理する方式へ変更した。`SourceList::postItemAppended`/`preItemRemoved`を購読し、ソースごとのMagnitude/Phase/Coherence/RTA/Spectrogramサンプラーを動的に生成・破棄する。削除時は`readyRead`接続も明示的に解除し、`sourceRemoved(uuid)`をJSへ送る。
- 5種のサンプラーpayloadへ`uuid`を追加した。JS側は新規`charts.ts`で線グラフ種別ごとに`Map<uuid, payload>`を保持し、Magnitude/RTA/Phase/Coherenceを同じcanvasへソース色で重ね描画する。凡例には各ソースの色と名前を表示し、active変更やソース削除時はキャッシュを使って即時に再描画する。
- 左ペインへactiveチェックボックスを追加し、Phase 6で前倒し実装済みの`SourceTreeBridge::setActive(QString,bool)`へ接続した。ツリー更新からactiveなuuid集合を作るため、非active化した系列は次の`readyRead`を待たずに消える。
- Spectrogramは複数系列を重ねず、ツリー行クリックで選んだ1ソースだけを表示する。選択はJSローカル状態とし、切替時にスクロール履歴をクリアする。Phase 8の設定パネルも同じクリックコールバックを流用するため、Spectrogramと設定パネルで別々の選択状態は持たない。
- `npm run build`(TypeScript型チェックを含む)とQtのシャドウビルドが成功した。GUI上での複数ソース操作と長時間安定性は実機回帰確認項目として残る。

### Phase 8完了(選択ソース連動の設定パネル)

`src/chart/settingsbridge.h/.cpp`、`src/chart/jsfrontendmanager.h/.cpp`、`OpenSoundMeter.pro`、(新規)`web/src/settingsPanel.ts`、`web/src/main.ts`、`web/src/webchannel.ts`、`web/src/style.css`

- 固定WebChannelオブジェクト`settings`として`Chart::SettingsBridge`を追加した。左ペインクリック時にPhase 7のSpectrogram切替と同じuuidを`selectSource()`へ渡し、選択中Measurementのname/active/平均/Gain/Offset/Delay/Mode/TFC/Input Filter/PolarityをJSONスナップショットで配信する。Stored/Group等は`editable:false`として安全に簡易表示し、選択中ソースの削除時は`preItemRemoved`で接続とshared_ptrを解放して未選択表示へ戻す。
- JSフォームからは値確定時の`change`だけを書き込み、書き込み直後の再スナップショットで実際の値へ同期する。通常プロパティは汎用`QObject::setProperty`を使う。Qt 5.15実機ではQVariantのintからenumへの自動変換が機能しなかったため、mode/averageType/filtersFrequency/inputFilterだけは`SettingsBridge`の専用Q_INVOKABLEセッターへフォールバックした。
- 選択中Measurementのlevel/referenceLevel/measurementPeak/referencePeakは`readyRead`契機の軽量`meterUpdated`へ分離した。未初期化・非有限値がJSONのnullになる場合はJS側で「—」を表示し、高頻度の`toFixed()`例外を防止する。
- Averaging Depth、Gain、Offset、Delay、Mode、TFC reference time、Average type、Filter frequency、Input filter、Reset Average、Storeを対象とした。`deviceId`はC++アクセサの独自型、dataChanel/referenceChanelはチャンネル一覧UI、calibrationはファイルダイアログが必要なため、このPhaseでは意図的に対象外とした。
- TypeScript/ViteとQt本体のビルド後、CDP経由で数値・enum書き込み、条件表示、メーター、Reset Average、Store、Stored選択を実機検証した。コンソールエラーは発生せず、`OSM_JS_FRONTEND`未設定の通常UIも継続起動した。

### Phase 9完了(測定ソースと保存データの表示分離 + 2ch入力表示)

`src/chart/databridge.h/.cpp`、`src/chart/settingsbridge.h/.cpp`、(新規)`web/src/measurementList.ts`、`web/src/sourceTree.ts`、`web/src/settingsPanel.ts`、`web/src/main.ts`、`web/src/style.css`

- 左ペインを`Session Data`へ改称してStored/Groupだけを表示し、右ペインにMeasurement専用の`Transfer Function`一覧を追加した。振り分けは`SourceTreeBridge`を変更せず、既存JSONの`type`をWeb側で判定する。保存データ側の行クリック選択は廃止し、Measurement行クリックへSpectrogramとSettingsの選択を移した。
- 全トップレベルMeasurementを購読済みの`DataBridge`へ`levelUpdated(uuid, M/R level・peakのJSON)`を追加した。選択中1件だけを購読していた`SettingsBridge::meterUpdated`は削除し、Measurement一覧と選択中Settingsメーターの更新元を`DataBridge`へ一本化して二重の`readyRead`接続を避けた。
- Transfer Functionの各Measurement行は、上段M(測定入力)・下段R(リファレンス入力)の2本のレベルメーターを持つ。どちらも対応levelとpeakを使い、非有限値は「—」、peakが-3dBを超える場合はクリップ色で表示する。
- `SettingsBridge`が入力専用の`audio::DeviceModel`を保持し、選択Measurementの入力デバイス一覧と現在デバイスのチャンネル名(+内部ループバック`Loop`)をJSON配信する。SettingsにInput device、Measurement channel (M)、Reference channel (R)を追加し、デバイス変更後の設定再配信でチャンネル候補を更新する。
- Phase 8で対象外理由としていたデバイスIDの型について再確認し、`audio::DeviceInfo::Id`は実際には`QString`の型エイリアスで、`Measurement::deviceId`のQ_PROPERTY宣言と一致することが分かった。そのため専用セッターは不要で、汎用`QObject::setProperty`を使用する。Web側は`deviceId`を文字列のまま、`dataChanel`/`referenceChanel`を数値として送る。
- Storedのactiveチェックをチャートへ反映するrecall表示は、Measurement用`DataBridge`とは別のデータ経路が必要なため本Phaseでは扱わない。

### Phase 10完了(信号発生器パネル)

`src/generator/generator.h/.cpp`、`src/chart/jsfrontendmanager.h/.cpp`、`src/main.cpp`、(新規)`web/src/generatorPanel.ts`、`web/src/webchannel.ts`、`web/src/main.ts`、`web/src/style.css`

- アプリ起動時に1回だけ生成される既存`Generator`インスタンスを、`JsFrontendManager`の固定WebChannelオブジェクト`generator`として直接登録した。Q_PROPERTYとNOTIFYをqwebchannel.jsの自動バインディングで利用できるため、専用ブリッジや手動JSONシグナルは設けていない。
- Web版の右ペイン下部にGeneratorパネルを追加した。最終的な2行×3列のフィールド構成は、上段が出力インターフェース選択・レベル・On/Off、下段が出力ポートのチェックボックス式複数選択・レベルの「−」・「+」である。On時のボタンは赤色で表示する。
- 出力専用`audio::DeviceModel`を固定WebChannelオブジェクト`outputDevices`として追加した。`list()`でインターフェースのID・名前を列挙し、既存の`indexOf()`と`channelNames()`で選択中インターフェースの実際のポート名を取得する。Q_INVOKABLE呼び出しはいずれも非同期コールバックとして扱い、デバイス変更時にチェックボックス一覧を更新する。
- `QSet<int>`はQWebChannelでJSON化できないため、既存の`setChannels(QList<QVariant>)`と`channelsChangedQList`を使う`QVariantList channelsList`プロパティを`Generator`へ追加した。
- Pink Noiseの固定表示は廃止したが、信号タイプは画面に出さず、パネル初期化時に内部の`generator.type`をPinkへ強制する既存方針を維持した。
- TypeScript/ViteとQt本体のビルド後、開発サーバー版をCDPで開き、2行×3列の要素順、出力インターフェース3件、Pink表示なし、チェック変更時のサマリー`Ch: 1, 2`↔`Ch: 2`同期、インターフェース切替時のポート一覧更新と元設定への復元、QWebChannel接続を確認した。安全のためGeneratorはOFFのままとし、実音出しとQML側からの逆方向同期は未確認。`OSM_JS_FRONTEND`未設定の通常UIも短時間継続起動した。

### Phase 11完了(Groupツリーの再帰表示、Stored専用)

`src/chart/sourcetreebridge.h/.cpp`、`web/src/sourceTree.ts`

- `SourceTreeBridge`がルートだけでなく各`Source::Group`内の`sourceList()`も再帰的に購読し、Group内での追加・削除や各アイテムのname/color/active変更をSession Dataへ反映するようにした。ツリーJSONは深さ優先順で、各項目に0始まりの`depth`と、直上Groupを示す`parentUuid`(トップレベルは`null`)を追加した。グループ移動に伴う再購読では`Qt::UniqueConnection`によりシグナル接続の重複を防ぐ。
- Web側は折りたたみを設けず全階層を常時表示し、`depth`ごとに1remずつ行をインデントする。
- 測定ソースは意図的にグループ化不可のままとする。測定ソースは通常4〜8個程度で増え続けない一方、STOREデータは継続的に増えるため、階層整理が必要なのはStored側のみである。既存の`SourceList::isGroupableData()`がGroupへ格納可能な型をStored/Groupに制限しているため、当初検討した`DataBridge`のGroup再帰対応は不要であり、Transfer Functionとチャート配信はトップレベルMeasurement専用のまま変更していない。

### Phase 12完了(JS版Session DataのDnD移動・挿入位置表示・追加/削除)

`src/chart/sourcetreebridge.h/.cpp`、`web/src/sourceTree.ts`、`web/src/measurementList.ts`、`web/src/main.ts`、`web/src/style.css`

- Session DataのStored/Group行をHTML5 DnD対応にした。Group行は上25%を「直前」、中央50%を「中へ」、下25%を「直後」とし、通常行は上半分/下半分を「直前」/「直後」とする3ゾーン設計である。「直前/直後」は行境界の細い青色バー、「中へ」はGroup行全体の青色枠でプレビューし、画面下部にはルート末尾へ戻す専用ドロップ領域を置いた。
- 既存`SourceList::move()`は、その`SourceList`直下のindexしか操作できず、ルートリストからGroup内部の順序を指定できない。このため`SourceTreeBridge::moveToPosition(uuid, targetParentUuid, index)`を新設し、`targetParentUuid`からGroup自身の`SourceList`を解決したうえで、既存`moveItem()`による型妥当性・循環チェック付き移動と、移動先リストでの`move()`を連続して行う。Web側のindexは移動元を除去する前の行境界なので、同一リスト内の下方向移動だけ1減算して挿入バーと実際の位置を一致させる。追加・削除通知だけでは最後の`move()`後の順序がWebへ届かないため、ルートと各Groupの`postItemMoved`も購読して最終ツリーを再配信する。
- Session Dataに`+ Group`と確認ダイアログ付き削除ボタン、Transfer Functionに`+ Measurement`を追加し、WebChannelへ公開済みのルート`sourceList`を呼び出す。Groupの祖先のいずれかが非アクティブなら、子孫のチェック状態自体は変えずチェックボックスだけをグレー表示する。
- Session Dataの各行へ名前編集ボタンを追加し、名前のダブルクリックでも編集できるようにした。Web側ではツリー全体の同名を拒否し、バックエンドの`SourceTreeBridge::setName()`でも同じ階層の兄弟間に重複がないことを防御的に検査する。祖先Groupが非アクティブな子孫は、チェックボックスに加えてデータ名もグレー表示する。
- `SourceList::appendItem()`で追加先リストの兄弟名を検査し、衝突時は元の名前へ`_copy-2`、`_copy-3`…を自動付与する。Store・複製だけでなく全追加経路に共通で適用されるため、既存セッションに同一階層の重複名が含まれる場合も、読み込み時に同じ規則で自動リネームされる。

### Phase 13完了(JS版をデフォルトUIへ昇格、QML版は裏方として存続)

`src/main.cpp`、`CLAUDE.md`、`dev-docs/js-frontend-phases.md`

- Phase 6〜12でSmaart v9風の3ペインUIが実用レベルに達したため、環境変数なしの通常起動でJS版を表示するよう起動条件を反転した。従来の`OSM_JS_FRONTEND`は不要になり、`OSM_JS_DEV_SERVER=1`は引き続きqrc同梱版の代わりにVite開発サーバーを読み込む。
- QMLコードは削除していない。QMLエンジンはmacOSネイティブメニューバー、Autosaver、Notifier等のアプリ全体のインフラを含んでおり、これらをJS/C++側へ移植する前に削除すると退行リスクが高いためである。QMLは常に読み込む一方、通常起動ではルート`QQuickWindow`を`hide()`し、JSウィンドウだけを表示する。
- `OSM_JS_FRONTEND_DISABLE=1`はJS版を生成せず従来のQML版だけを表示するフォールバック/デバッグ用、`OSM_QML_FRONTEND=1`はJS版に加えてQML版も表示する比較確認用である。両方を同時指定した場合はJS無効化が優先され、QML版だけが表示される。
- QML依存インフラの移植と、JS版で意図的にスコープ外としたセッション新規UI、CSVエクスポート、キャリブレーションUI、詳細チャート設定、Stored recall等の扱いが確定するまでは、QML側コードの削除を行わない。
- `web`のTypeScript/Vite本番ビルドとQt 5.15.2のシャドウビルドが成功した。macOS実機では、通常起動=`OSM`(JS)1枚、`OSM_JS_FRONTEND_DISABLE=1`=`Open Sound Meter`(QML)1枚、`OSM_QML_FRONTEND=1`=両方の2枚となることを確認した。通常起動でもネイティブメニューバーの`File`/`View`/`Help`と各項目が残り、複数回の起動モード切り替えでも安定していたため、QMLウィンドウの扱いは`showMinimized()`や画面外移動ではなく`hide()`を採用した。

### Phase 14完了(Generatorパネルを右下に固定)

`web/src/main.ts`、`web/src/style.css`

- 右ペインを「Transfer Function + Settingsのスクロール領域」と「Generatorの固定領域」に分離し、右ペイン自体を縦方向のflexコンテナに変更した。内容が増えてもGeneratorをTransfer Function/Settingsのスクロールに巻き込まず、ウィンドウ右下に常時表示するための変更である。
- 上側領域は`flex: 1 1 auto`、`min-height: 0`、`overflow-y: auto`、Generator領域は`flex: 0 0 auto`とした。`.pane-right`で既存の`.pane`のoverflowとpaddingを上書きし、それぞれの子領域へpaddingを移したため、左・中央ペインのレイアウトは変更していない。
- 通常サイズと縮小サイズでGeneratorが右下に留まること、測定4件のTransfer Function表示、Session Data、チャート更新、Generatorの従来の各コントロール表示とQWebChannel接続が維持されることをmacOS実機で確認した。

### Phase 15完了(M/Rレベルメーターの数値表示廃止と間隔調整)

`web/src/measurementList.ts`、`web/src/style.css`

- Transfer Functionの各測定行で、M/Rバー右側にあったリアルタイムdB数値を廃止した。複数の測定を並べたときの視覚的な情報量を減らし、レベルの概要はバーで素早く把握できる表示にするためである。数値DOMとその更新処理のみを削除し、バー幅のレベル連動とクリップ時の赤色表示は維持した。
- M/R行を`.meter-group`にまとめ、グループ内の間隔を0.1remに設定した。測定ヘッダーからメーターまでの間隔0.25remは維持し、M/Rを一つのメーターユニットとして判別しやすくした。Settingsセクションの`Level`/`Ref`/`Peak`数値表示は別用途のため変更していない。
- TypeScript/ViteとQt本体のビルド後、macOS実機で測定4件を表示し、数値の消失、M/R間隔、入力に連動するバー伸縮、他ペインとGenerator配置の維持を確認した。

### Phase 16完了(Session Dataリネーム中のドラッグ競合修正)

`web/src/sourceTree.ts`

- Session Dataのリネーム中だけ対象行の`draggable`を無効化し、入力欄内のマウスドラッグをテキスト範囲選択として扱えるようにした。祖先行のHTML5 DnDが範囲選択より優先され、意図せず行が移動する不具合を防ぐためである。
- Enter確定・Escapeキャンセル・blur確定が共通して通る復元処理で`draggable`を再び有効化するため、編集終了後の行の並び替え操作は従来どおり利用できる。
