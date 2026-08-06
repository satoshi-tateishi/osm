# 測定タイプと設定項目

Open Sound Meterでは、1つの「ソース」(マイク入力などの`Measurement`、または保存済みデータの`Stored`)に対して、複数の「チャート(測定タイプ)」を同時に表示できる。チャートタイプは`src/chart/type.h`の`Chart::Type`列挙体で定義されており、UI上の名称と実装は以下のように対応する。

| UI表示名 | enum (`Chart::Type`) | 実装 (C++) | 設定パネル (QML) |
|---|---|---|---|
| Spectrum | `RTA` | `src/chart/rtaplot.*` | `qml/Plot/RTAProperties.qml` |
| Magnitude | `Magnitude` | `src/chart/magnitudeplot.*` | `qml/Plot/MagnitudeProperties.qml` |
| Phase | `Phase` | `src/chart/phaseplot.*` | `qml/Plot/PhaseProperties.qml` |
| Impulse | `Impulse` | `src/chart/impulseplot.*` | `qml/Plot/ImplulseProperties.qml` |
| Step | `Step` | `src/chart/stepplot.*` | `qml/Plot/StepProperties.qml` |
| Coherence | `Coherence` | `src/chart/coherenceplot.*` | `qml/Plot/CoherenceProperties.qml` |
| Group Delay | `GroupDelay` | `src/chart/groupdelayplot.*` | `qml/Plot/GroupDelayProperties.qml` |
| Phase Delay | `PhaseDelay` | `src/chart/phasedelayplot.*` | `qml/Plot/PhaseDelayProperties.qml` |
| Spectrogram | `Spectrogram` | `src/chart/spectrogramplot.*` | `qml/Plot/SpectrogramProperties.qml` |
| Crest Factor | `CrestFactor` | `src/chart/crestfactorplot.*` | `qml/Plot/CrestFactorProperties.qml` |
| Nyquist | `Nyquist` | `src/chart/nyquistplot.*` | `qml/Plot/NyquistProperties.qml` |
| Level | `Level` | `src/chart/levelplot.*` | `qml/Plot/LevelProperties.qml` |
| Numeric | `SPL` | `src/chart/levelobject.*` 系 | 専用パネルなし(数値表示のみ) |
| (未使用) | `Scope` | - | UIの選択肢には出てこない |

チャートの種類を切り替えても、裏側で参照している`Measurement`ソースは1つなので、**FFT/収録に関する設定はどのチャートを見ていても共通**。チャートごとの設定パネル(下部の`PropetiesBar`に表示される)は、あくまで「その測定結果をどう表示するか(軸範囲・分解能・スケールなど)」を決めるもの。

> このフォークでは劇場のスピーカーチューニング用途に絞るため、`qml/Chart.qml`の測定タイプ選択`DropDown`から**Step・Group Delay・Phase Delay・Level・Numeric・Crest Factor・Nyquist**の7種類を削除している(選択肢は`Spectrum/Magnitude/Phase/Impulse/Coherence/Spectrogram`の6種類のみ)。実装自体は残っているため、以前保存したプロジェクトファイルにこれらの型が含まれていても表示上は問題ない。詳細は[customizations.md](customizations.md)を参照。

---

## 1. 測定ソース(Measurement)自体の設定 — 全チャート共通

`qml/source/MeasurementProperties.qml`(ソース一覧の各行を展開すると出てくる設定行)。実体は`src/source/measurement.h`・`src/meta/metameasurement.h`。

| 項目 | UI | 意味 |
|---|---|---|
| Transform mode | `10`〜`16` / `LTW` | FFTサイズを`2^N`サンプルで指定(`10`=1024〜`16`=65536)。値が大きいほど周波数分解能は上がるが時間分解能・応答速度は下がる。`LTW`(`Meta::Measurement::Mode::LFT`)はFFTではなく対数軸の変換(`FourierTransform::Log`、内部的に4096点相当)を使い、低域の分解能を保ちつつ応答を速くする特殊モード |
| window function | Rectangular / Hann / Hamming / FlatTop / BlackmanHarris / HFT223D / Exponential | FFT窓関数。`WindowFunction::Type`(`src/math/windowfunction.h`)。Hannが既定値 |
| apply filter on M入力 (inputFilter) | Z / A / C / Notch / BPF 100 / LPF 200 | 測定(M)チャンネルの信号に適用する重み付け/フィルタ。`Z`は無補正(フラット) |
| M: / R: (dataChanel / referenceChanel) | チャンネル番号 | 測定用(M)・基準用(R)として使うオーディオ入力チャンネル |
| audio input device | デバイス名 | 使用する入力デバイス。ローカル測定のみ変更可(`isLocal`) |
| average type | off / LPF / FIFO | 測定値の時間平均化方式。`off`=平均なし、`LPF`=ベッセルローパスフィルタによる指数移動平均、`FIFO`=直近N回分の単純移動平均 |
| average count | 1〜100 | `FIFO`選択時の平均回数。更新周期は固定80ms(`TIMER_INTERVAL`)なので、count=12〜13で約1秒、25で約2秒相当 |
| LPF frequency | 0.25Hz / 0.5Hz / 1Hz | `LPF`選択時のカットオフ周波数(`Filter::Frequency`, `src/math/bessellpf.h`)。値が小さいほど滑らかだが追従が遅い |
| +/- (polarity) | ON/OFF | 測定チャンネルの極性反転 |
| リセットボタン | - | 平均化バッファ・遅延推定などをリセット(`resetAverage()`) |
| calibrate | ON/OFF + ファイル選択 | マイク校正ファイル(周波数特性補正データ)の適用。ローカル測定のみ |
| offset (reference offset) | -90〜90 dB | 基準(R)チャンネルのレベルオフセット |
| gain | -90〜90 dB | 測定(M)チャンネルの入力ゲイン補正 |
| "94 dB"ボタン | - | 94dB SPLの校正音(ピストンフォン等)を鳴らした状態で押すと、現在のレベルから自動的にgainを逆算して適用(`applyAutoGain`) |

> このフォークではMeasurementソースの既定値を変更している: `average type`は`LPF`→`FIFO`・`average count`は`1`→`12`、`Transform mode`は`FFT14`→`LTW`。window functionは"Hann"に固定(他の選択肢はUIから削除)。
| delay (estimated delay delta) | サンプル数(ms表示) | 測定chとreference chの時間ずれ補正。右の"estimated"ボタンで自動推定値を適用可能 |

---

## 2. Spectrum(RTA)の設定項目

実体: `Chart::RTAPlot`(`src/chart/rtaplot.h`)。リアルタイムのオクターブバンド/ラインスペクトラム表示(いわゆるRTA: Real Time Analyzer)。**単一チャンネル(M)のレベルスペクトラム**を表示するもので、Magnitude以下と違って基準(R)チャンネルとの比較(伝達関数)は行わない。

| 項目 | 値の範囲/選択肢 | 意味 |
|---|---|---|
| x from / x to | Hz(`xLowLimit`〜`xHighLimit`) | 表示する周波数範囲 |
| y from / y to | dB | 表示するレベル範囲 |
| mode | line / bars / lines | 描画方式。`line`=折れ線、`bars`=オクターブバンドの棒グラフ、`lines`=生ライン(FFTビンそのまま、ppo指定不可) |
| smoothing(旧"ppo") | Global / 1/1 oct 〜 1/48 oct / off | フラクショナルオクターブ帯域平均によるスムージング。Smaartの"1/3 oct"等と同義(帯域内のパワーを積算して`10*log10()`でdB化する、エネルギー平均で実装済み)。`bars`モードでは`off`にできない(自動で1/12 octに補正される)。`Global`選択時はサイドバーのGlobal smoothing設定に追従する(後述) |
| スケール(無題のコンボ) | dBfs / SPL / phons | 縦軸の単位。`dBfs`=フルスケール比、`SPL`=校正済み音圧レベル、`phons`=等ラウドネス曲線補正後の値 |
| hold peaks | ON/OFF | ピークホールド表示。`line`モードでは非表示 |
| 表示ソース選択 | - | 複数ソースがあるとき、このチャートに表示するソースを絞り込む |

> このフォークではx from/x toのデフォルトを一時`40Hz`〜`20,000Hz`にしていたが、Magnitude/Phaseと表示を揃えるため`20Hz`〜`20,000Hz`(本家と同じ)に戻した。smoothingは全チャート共通の「Global smoothing」機能に対応し、デフォルトは`Global`(初期値`1/6 oct`)。

---

## 3. Magnitudeの設定項目

実体: `Chart::MagnitudePlot`(`src/chart/magnitudeplot.h`、`Chart::FrequencyBasedPlot`を継承)。**測定(M)と基準(R)の伝達関数**(周波数応答)を表示する、いわゆるTransfer Function測定。スピーカーやEQの周波数特性測定に使う中心的なチャート。

| 項目 | 値の範囲/選択肢 | 意味 |
|---|---|---|
| x from / x to | Hz | 表示する周波数範囲 |
| y from / y to | dB | 表示するレベル範囲 |
| invert | ON/OFF | Y軸を反転 |
| smoothing(旧"ppo") | Global / 1/1 oct 〜 1/48 oct | フラクショナルオクターブ帯域平均によるスムージング。Smaartの"1/3 oct"等と同義。dBモードは帯域内のパワーを積算して`10*log10()`でdB化するエネルギー平均(このフォークで修正済み。本家はdB値をそのまま算術平均していた)。`Global`選択時はサイドバーのGlobal smoothing設定に追従する(後述) |
| use coherence | ON/OFF | コヒーレンス値をアルファ(不透明度)チャンネルとして使い、信頼度の低い(ノイズの多い)周波数帯を薄く表示する |
| coherence threshold | 0.0〜1.0 | 上記を使う際のしきい値 |

> このフォークではY axis modeを`dB`固定にしている(`Linear`/`Impedance`モードとセンサー抵抗設定のUIは削除済み。`src/chart/magnitudeplot.cpp`の`setSettings()`で保存済み設定からの`mode`復元も行わない)。smoothingは全チャート共通の「Global smoothing」機能に対応し、デフォルトは`Global`(初期値`1/6 oct`)。
| 表示ソース選択 | - | 表示対象ソースの絞り込み |

---

## 4. その他の測定タイプの概要

いずれも`Chart::FrequencyBasedPlot`(周波数軸)または`Chart::XYPlot`(汎用XY)を継承しており、Magnitudeと同様に**測定(M)と基準(R)の関係**(伝達関数由来)を扱うものが多い。

- **Phase**(位相): 伝達関数の位相特性(度)。`rotate`(-360°〜360°、位相基準点の回転)、`range`(表示する角度レンジ)、`±180º / 0..360º`表示切替、smoothing(Global対応)、coherenceによるアルファ表示に対応。

- **Impulse**(インパルス応答): 測定/基準の相互相関(デコンボリューション)から求めた時間領域のインパルス応答。X軸はms。Y軸モードは`Linear`/`Log`、`normalize`で振幅を正規化表示。時間軸のウィンドウ処理やディレイ確認、後述のStepの元データになる。

- **Step**(ステップ応答): インパルス応答の積分(累積)。立ち上がり特性やスピーカーの過渡応答・極性確認に使う。`integration zero point`(ms)で積分の基準時刻を指定。

- **Coherence**(コヒーレンス): 測定/基準間の線形性・S/N的な信頼度を0〜1で示す指標。`type`は`normal`(通常)/`squared`(2乗値)/`SNR`(信号対雑音比換算)。しきい値を線として表示するhelp line機能あり。Magnitude等の「use coherence」で参照される値の元データ。smoothing(Global対応)にも対応。

- **Group Delay**(群遅延): 位相の周波数に対する微分(-dφ/dω)。周波数ごとの遅延時間(ms)を示し、マルチウェイスピーカーのユニット間タイムアライメント確認などに使う。smoothing(Global対応)、coherenceによるアルファ表示に対応。

- **Phase Delay**(位相遅延): 位相/周波数から算出される遅延(群遅延とは別の指標で、システムが純粋な遅延だった場合に相当する時間)。UI・設定項目はGroup Delayとほぼ同じ構成(smoothing(Global対応)含む)。

- **Spectrogram**(スペクトログラム): 横軸=周波数(Hz)、縦軸=時間(秒)、色=レベル(dB)の3次元表示(ウォーターフォール)。`min`/`mid`/`max`のdB値で色グラデーションの基準点を指定。smoothing(Global対応)にも対応。pauseボタンで更新を一時停止できる。共振や減衰特性の視覚的確認に向く。

- **Crest Factor**(クレストファクター): 周波数帯域(smoothing指定、Global対応)ごとのピーク/RMS比。アンプやドライバーに必要なヘッドルーム(ダイナミックレンジ)の目安になる。

- **Nyquist**(ナイキスト線図): 伝達関数を複素平面上(実部/虚部)にプロットしたもの。単位はなし。smoothing(Global対応)、coherenceによるアルファ表示に対応。共振点の位相回転などを視覚的に把握するのに使う(スピーカーのインピーダンス位相や電気系の安定性解析で使われる形式)。

- **Level**(レベル): 時間軸のレベルメーター(ストリップチャート)。`type`は`RMS`/`Leq`(等価騒音レベル)、`weighting`は音圧レベル重み付け`A`/`B`/`C`/`K`/`Z`(Zはフラット)、`time`は`Fast`/`Slow`(IEC規格の時定数)、`scale`は`dBFs`/`SPL`(RMS時のみ)。pauseで更新停止可能。

- **Numeric**(内部enum名`SPL`): 数値のみを大きく表示するタイプ。専用の設定パネル(QML)は無く、グラフではなく現在値の読み取りに特化している。

- **Scope**: `Chart::Type`には定義があるが、`Chart.qml`のUI選択肢一覧には含まれておらず、現行UIからは選択できない(内部/レガシー用途と思われる)。

---

## 5. Global smoothing機能(このフォークで追加)

RTA/Magnitude/Phase/Nyquist/Group Delay/Phase Delay/Coherence/Spectrogram/Crest Factorの9測定タイプ全てが持つsmoothing(ppo)設定は、個別の値に加えて`"Global"`という選択肢を持つ。実体は`Chart::FrequencyBasedPlot::useGlobalPPO`(bool、デフォルト`true`)。

サイドバーの`Generator`パネル直下(`qml/SideBar.qml`)に、Global smoothingの値を一括変更するコンボボックスがある(実体`Chart::GlobalSmoothing`、`src/chart/globalsmoothing.h`/`.cpp`、`Settings`ルートのキー`"globalSmoothing"`に永続化、初期値`6`=1/6 oct)。`"Global"`を選択している測定は、このサイドバーの値を変更すると即座に追従する。個別に`"Global"`以外の値(例: `"1/24 oct"`)を選ぶと、その測定だけはGlobal値の変更に追従しなくなる。

各測定の`useGlobalPPO`/手動選択値(`ppo`または一部旧来キーの`pointsPerOctave`)はチャート単位(`layout/charts/<N>/...`)で保存され、Global smoothingの値自体はアプリ全体で1つ(`Settings`ルート)。
