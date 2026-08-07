# TFC Window (Time-Frequency-Constant Window) をOSMに実装するための設計プラン

競合製品AFMG SysTuneの特許技術「TFC Window™」([systune-rtd.md](systune-rtd.md)参照)相当の機能を、Open Sound Meterに実装するための技術設計プラン。Phase 1の`FourierTransform`層は実装済みで、後続Phaseの設計も含む。

## 1. 概要

TFC Windowは、解析窓の時間長が周波数に反比例して連続的に変化する窓関数。基準周波数(例: 1kHz)における窓長(reference time、例: 10ms)を1つ指定すると、他の全周波数の窓長が「窓時間 × 周波数 = 一定値」という関係で自動スケールされる(8kHzでは1.25ms、125Hzでは80ms、という具合)。詳細な技術的背景・低域で反射音を排除しきれないことが実用上問題にならない理由([systune-rtd.md](systune-rtd.md)参照: 低域はスピーカーの指向性が低く、波長も部屋サイズに対して大きいため部屋のモードが支配的な拡散音場になり、そもそも直接音単体を切り出す意味が薄い)は調査済み。

OSMは既に伝達関数・インパルス応答測定を行うソフトであり、この節で述べる既存の`FourierTransform::Log`(いわゆるLTWモード)が、TFCと本質的に同じ「ビンごとに異なる窓長を持つ」仕組みを既に実装している。したがって本実装は、新しい変換アルゴリズムを書き起こすのではなく、**既存の仕組みにおける「窓長の決定式」を1つ差し替えるだけで実現できる**、という見通しに基づいている。

## 2. 既存コードベースの関連実装

### 2.1 窓関数: `src/math/windowfunction.h` / `.cpp`

`WindowFunction::pointGain(float i, unsigned int N) const`(51-94行目)は「サイズNの窓の中のi番目のゲイン」を数式ベースで都度計算する、状態を持たない純粋関数。**任意の可変長Nに既に対応している**ため、TFC実装で新たに窓関数側を変更する必要はない。

### 2.2 FFT/伝達関数: `src/math/fouriertransform.h` / `.cpp`

`enum Type { Fast, Log };`(fouriertransform.h 35行目)。通常FFT(`Fast`)は`m_size`(2^10〜2^16)固定・窓は1種類のみ。

**`Type::Log`が既にTFCと本質的に同じ考え方の実装になっている。**

```cpp
struct LogBasisVector {
    unsigned int N;              // このビンの解析窓長(サンプル数)
    float frequency;             // 正規化周波数
    std::vector<v4sf> w;         // 複素基底ベクトル(窓関数込み)
};
Container::array<LogBasisVector> m_logBasis;
```
(fouriertransform.h 132-137行目)

`prepareLog()`(fouriertransform.cpp 464-498行目、実ファイルで確認済み):
```cpp
const int ppo = 24, octaves = 11;
unsigned int startWindow = pow(2, 16), startOffset = 1'344'000 / sampleRate(); // 28 for 48k
float wFactor = powf(10.f, 1.f / (-octaves * ppo / 2.5));
float fFactor = powf(1000.f, 1.f / (ppo * octaves));
...
for (unsigned int i = 0; i < m_logBasis.size(); ++i) {
    N      = startWindow * pow(wFactor, i);
    offset = startOffset * pow(wFactor * fFactor, i);
    frequency = static_cast<float>(offset) / N;

    m_logBasis[i].N = N / m_logWindowDenominator;
    m_logBasis[i].frequency = frequency;
    ...
    for (j = 0; j < m_logBasis[i].N; ++j) {
        gain += m_window.pointGain(j, m_logBasis[i].N) / m_logBasis[i].N;
    }
    // 以降、複素正弦波 × 窓関数のテンプレートベクトルを生成
}
```

`log()`(426-463行目)は、各ビンについて直近`m_logBasis[i].N`個のリングバッファサンプルとテンプレートベクトルの内積を取るだけ(FFTではなく可変長のスライディング相関、Sliding Goertzel型)。

つまり264ビン(`ppo=24 × octaves=11`)それぞれが独自の窓長`N`を持つ設計は既に存在しており、`wFactor`(1ビン進むごとの窓長縮小率)がこれを担っている。ただし現状は`wFactor`/`startWindow`/`ppo`/`octaves`が全てハードコードされた定数であり、AFMGの「reference time」のような外部パラメータで調整する仕組みはない。

既存API `setLogWindowDenominator(unsigned int)`(fouriertransform.h 113行目)は、全ビンの窓長`N`を一律の整数で割ることで解像度/応答速度を調整する。`Windowing`ソース(`src/source/sourcewindowing.cpp`)がこれを使い、`LTW1`(denominator=1)/`LTW2`(denominator=10)/`LTW3`(denominator=25)という3段階プリセットを提供している。

### 2.3 インパルス応答: `src/math/deconvolution.h` / `.cpp`

`Deconvolution`クラスは、内部に別の`FourierTransform`インスタンス(`m_fft`、`m_ifft`)を持ち、**常に`Type::Fast`(通常FFT、サイズ=`Measurement::timeDomainSize()`)を使う**。`transform(const FourierTransform *forward)`は、`forward`が`Log`型(LTWモード)のときは自前で4096点の通常FFTを実行し直す。つまり**現状のLTW/Logモードでも、インパルス応答計算はLog変換の恩恵を受けず、固定長の通常FFTのまま**という非対称性が既に存在する。

### 2.4 Measurementのモード切替: `src/source/measurement.cpp` `updateFftPower()`(241-278行目、実ファイルで確認済み)

```cpp
void Measurement::updateFftPower()
{
    if (Q_LIKELY(m_mode == m_currentMode)) return;
    m_currentMode = m_mode;

    switch (m_currentMode) {
    case Mode::LFT:
        m_dataFT.setType(FourierTransform::Log);
        setTimeDomainSize(pow(2, m_FFTsizes.at(FFT12)));
        break;

    default:
        m_dataFT.setSize(pow(2, m_FFTsizes.at(m_currentMode)));
        m_dataFT.setType(FourierTransform::Fast);
        setTimeDomainSize(pow(2, m_FFTsizes.at(m_currentMode)));
    }
    ...
    // Deconvolution:
    m_deconvolution.setSize(timeDomainSize());
    ...
}
```

`default`分岐は`m_FFTsizes.at(m_currentMode)`に依存しており、`m_FFTsizes`マップは`FFT10`〜`FFT16`のみエントリを持つ(`LFT`のエントリは無い)。**このため新しいモード(`TFC`)を追加する場合、`default`に流れ込ませることはできず、`LFT`と同様に専用の`case`が必須**という制約を実コードで確認済み。

### 2.5 UI実装のテンプレート: `qml/source/WindowingProperties.qml`(49-71行目)

`Windowing`ソース(後処理用の別ソース種別、Tukey窓によるゲート処理)のUIに、以下のような「ms単位のFloatSpinBox、C++プロパティとの双方向バインディング、`Connections`経由の外部変更再同期」パターンが既にある。

```qml
FloatSpinBox {
    id: wideSpinBox
    from: 0.1
    to: 10000
    units: "ms"
    value: dataObjectData.wide
    property bool completed: false
    onValueChanged: {if (completed) { dataObjectData.wide = value; } }
    tooltiptext: qsTr("Wide of Tukey window, ms")
    visible: dataObjectData.domain === 0
    Connections {
        target: dataObjectData
        function onWideChanged() { wideSpinBox.value = dataObjectData.wide; }
    }
    Component.onCompleted: { completed = true; wideSpinBox.value = dataObjectData.wide; }
}
```

このパターンは、TFCの`reference time`スピンボックスにそのまま踏襲できるテンプレートになっている。

### 2.6 チャート描画層は変更不要

`MagnitudePlot`/`ImpulsePlot`とそのOpenGL/Metalレンダラーは、`Abstract::Data`(`src/abstract/data.h`)という抽象インターフェース(`frequency(i)`/`magnitude(i)`/`impulseValue(i)`等)を介してのみデータを取得しており、Measurement内部でFFT/TFCをどう計算しているかには一切関知しない。既存のLFT(LTW)モードも同じインターフェースだけで動作していることから、**TFC実装は`Measurement`クラスと`FourierTransform`クラスの改修だけで完結し、チャート描画側には変更不要**という見通しが立つ。

## 3. 設計方針(結論)

### 3.1 アーキテクチャ: 既存`Type::Log`を拡張する

新しい`FourierTransform::Type`を追加するのではなく、既存`Type::Log`/`prepareLog()`を拡張する。TFCと既存Logの違いは「窓長を決める式」だけであり、周波数グリッド生成・相関計算(`log()`本体)・正規化ロジックは完全に共有できる。`Type`を分岐させると、`log()`本体・`getFrequencies()`・`transform()`など複数箇所でswitch分岐が増殖し、再利用の意図が構造上ぼやける。

`prepareLog()`内で、まず従来通り`frequency_i`(対数グリッド)を計算し、その後TFCが有効なら窓長`N_i`をTFC式で、無効なら従来式で決定する(計算順序を「Nを先に決めてからfrequencyを出す」→「frequencyを先に決めてからNを出す」に入れ替える必要がある)。

### 3.2 パラメータ化: reference timeの数式

AFMGの定義: 基準周波数`f_ref`における窓時間`T_ref`を指定すると、任意の周波数`f`における窓時間は`T(f) = T_ref * (f_ref / f)`で決まる。両辺に`f`を掛けると`T(f) * f = T_ref * f_ref = C`(定数、無次元の「サイクル数」)。本実装ではSysTuneの調査メモに合わせて`f_ref = 1000Hz`に固定し、ユーザーは`T_ref`のみを調整する。

TFC用の窓長決定式:
```
C   = (T_ref[ms] / 1000) * 1000[Hz]       // f_refは1kHz固定
N_i = round(C / frequency_i)               // frequency_iは既存の対数グリッドをそのまま流用
```

**検算(48kHz、`T_ref=10ms @ f_ref=1000Hz` → `C=10`)**:
- 8kHz: `frequency_normalized = 8000/48000 = 0.16667` → `N = 10/0.16667 = 60samples = 1.25ms` ✓
- 125Hz: `frequency_normalized = 125/48000 = 0.002604` → `N = 10/0.002604 = 3840samples = 80ms` ✓

AFMGの公開数値例と一致することを確認済み。

参考: 既存の`prepareLog()`の`N_i * frequency_i`は`i`について定数ではなく(`wFactor * fFactor ≠ 1`のため指数的に変化する)、厳密なConstant-QでもTFCでもない独自のハイブリッド則になっている。TFCモードはこれを「真に`T*f=一定`」の式で置き換える。

### 3.3 バッファサイズとクランプ

低域ビンで`T_ref`を大きく(または`f_ref`を小さく)設定するほど、必要な`N`が際限なく増大しうる(例: `T_ref=30ms@1kHz`、最低周波数ビン≈20Hzで`N≈72000サンプル=1.5秒`となり、既存の`startWindow=65536`を超える)。

- `prepareLog()`内で全ビンの`frequency_i`を先に計算し、最低周波数ビンで必要な`N_max`を求めてから`setSize(std::max(startWindow, N_max))`を呼ぶ(現状は`setSize(startWindow)`を先頭で固定呼び出ししている点の変更が必要)。
- 上限クランプ(例: 2秒相当)と下限クランプ(例: 8サンプル、`pointGain`の正規化が破綻しない最小値)を導入し、`FloatSpinBox`の`to:`/`from:`と対応させる。

### 3.4 既存`setLogWindowDenominator()`(LTW1/2/3)との関係

TFCモードが有効な間は`m_logWindowDenominator`を常に`1`に固定する(TFCの数式で決まった`N`をそのまま使い、見えない倍率をかけない)。`Windowing`ソースのLTW1/2/3は今回のスコープ外とし、変更しない(コード上は`if (m_tfcEnabled) {...} else { N = ... / m_logWindowDenominator; }`という分岐で完全に独立させられるため、既存機能への影響はない)。将来的に`Windowing`側にもTFCプリセットを追加する余地は残すが、本プランのスコープには含めない。

Phase 1の実装では、従来式で整数化した`referenceN`と`offset`の比を周波数グリッドとして先に保存し、TFCの窓長だけをその周波数から逆算している。これにより、TFC無効時の周波数・窓長・`m_logBasis[i].w`の確保サイズは変更前と一致する。TFC有効時はdenominatorを適用せず、実際の窓長と基底ベクトルの確保サイズを一致させる。

### 3.5 インパルス応答(Deconvolution)は現状維持

TFCモードでもインパルス応答/Stepチャートは、現状通り固定長(4096点)のFast FFTのまま据え置く。理由:

1. TFCの主眼はMagnitude/Phase/Coherence表示にあり、AFMG SysTuneでもインパルス応答パネル自体は別のFFTサイズで見るのが一般的な使い方。
2. 「ビンごとに異なる時間分解能を持つ変換結果から、単一の時間軸を持つ実数インパルス応答へ逆変換する」のは数学的に自明でない問題(非一様間隔の逆変換、あるいはオーバーラップ加算合成)であり、既存`Deconvolution`の「複素除算→単一逆FFT」という単純な構造を再利用できず実装コストとバグリスクが大きい。
3. 既存のLTW/Logモードで既にこの非対称性を受け入れて運用されている実績がある。

`dev-docs/measurement-types.md`のLTWモードに関する記述(「対数軸の変換、内部的に4096点相当」という表現がインパルス応答側とMagnitude側の非対称性を正確に反映していない)は、TFC実装時に合わせて修正する。

### 3.6 UI設計: 独立モードとして追加

`Meta::Measurement::Mode`に新規`TFC`を追加する(既存`LFT`を流用してサブパラメータとして追加する案も検討したが、「基準周波数でreference timeを指定する」操作感はdenominatorプリセットとは別物であり、ユーザーに明示的に選ばせる方が混乱が少ないため独立モードを採用)。

- `src/meta/metameasurement.h`: `enum Mode {FFT10..FFT16, LFT, TFC};`と`tfcReferenceTime`のQ_PROPERTY相当の宣言。reference frequencyは上位層に公開せず1kHz固定。
- `src/meta/metameasurement.cpp`: `m_modeMap`に`{Measurement::TFC, "TFC"}`を追加(`m_FFTsizes`には追加しない、`LFT`と同様)。
- `src/source/measurement.h/.cpp`: `Q_PROPERTY(float tfcReferenceTime ...)` / `Q_PROPERTY(float tfcReferenceFrequency ...)`、`updateFftPower()`に`case Mode::TFC:`を追加(`m_dataFT.setTfcEnabled(true)`、reference time/frequencyをFourierTransformへ伝搬、`case Mode::LFT:`側では`setTfcEnabled(false)`を明示)。`toJSON()`/`fromJSON()`/`clone()`にも対応するプロパティを追加。TFCモード中は最後に適用したreference time/frequencyをタイマースレッド側で保持し、いずれかが変わればモードが同じでも`prepareLog()`を再実行する。周波数グリッドとインパルス応答の設定は変わらないため、このパラメータ変更経路では周波数領域配列の再確保や`m_deconvAvg`のリセットを行わない。
- `Meta::Measurement`の純粋仮想シグナル追加に合わせ、もう一つの派生クラス`remote::MeasurementItem`にもTFCプロパティと対応シグナルを追加し、リモート同期用オブジェクトを引き続き具象クラスとして生成できるようにする。
- `Meta::Measurement::getAvailableModes()`を共有するFilter・Equalizer・StandardLineはTFC計算に未対応のため、それぞれのモード一覧からTFCだけを除外する。列挙値ではTFCが末尾に追加されているため、既存モードの表示インデックスとの対応は変わらない。
- `qml/source/MeasurementProperties.qml`: TFC時だけreference time [ms]のFloatSpinBoxを表示する。reference frequencyはUIに出さず、狭幅で重なる増減インジケータも非表示にする。`windowSelect`は従来通り非表示。

## 4. 段階的な実装ステップ

1. **`FourierTransform`層**(最優先・最もリスクが高い部分): `m_tfcEnabled`/`m_tfcReferenceTime`/`m_tfcReferenceFrequency`のメンバとsetter追加 → `prepareLog()`の計算順序変更とTFC式によるN決定 → バッファサイズ動的化とクランプ実装 → 単体検証(reference time/frequencyを変えて`m_logBasis[i].N`をログ出力し、3.2の数値例と一致するか、44.1kHz/48kHz/96kHzでも数式通りスケールするか確認)。
2. **`Measurement`/`Meta::Measurement`層**: `Mode::TFC`追加、`updateFftPower()`分岐、プロパティ・JSON永続化・`clone()`対応 → Magnitude/Phaseチャートが破綻なく表示されるか確認(既存`Abstract::Data`経由なのでチャート層は無変更のはずだが、`frequencyDomainSize()`やリサイズ処理の境界条件を確認)。
3. **インパルス応答側の非対称性の明文化**: コード変更なし、`dev-docs/measurement-types.md`の記述更新のみ。
4. **QML UI**: `MeasurementProperties.qml`にモード追加とFloatSpinBox2つ追加 → モード切替時の表示/非表示、`Component.onCompleted`の初期値反映、JSON読み込み時の`Connections`経由の追従を確認。
5. **結合・負荷検証**: 実際にオーディオ入力を繋いだ状態で、reference timeを極端な値(下限・上限付近)にしてリアルタイム更新(80ms周期)が破綻しないか確認。

各ステップの完了後、CLAUDE.mdの手順([customizations.md](customizations.md)参照: アプリ終了→ビルド→起動→ユーザー確認)に従って動作確認する。

## 5. リスク・懸念点

### 5.1 リアルタイム性への計算負荷

`log()`の計算量は`Σ N_i`(全ビンの窓長合計)にほぼ比例する。TFCモードで`T_ref`を大きくすると低域ビンの`N`が増大し、80ms周期の`Measurement::transform()`(`timerThread`上で実行)内の処理時間が増加する。`FloatSpinBox`の上限値は実機での処理時間実測を踏まえて調整する必要があり、段階的な実装ステップの5(結合・負荷検証)は必須。`prepareLog()`自体(テンプレート生成)はパラメータ変更時のみ呼ばれるためリアルタイムパスへの影響は限定的だが、`std::mutex`(`m_dataMutex`)での保護と、スピンボックスドラッグ中の頻繁な呼び出しに対するデバウンスの要否を検討する。

### 5.2 既存機能への後方互換性

- `Mode` enumの末尾に`TFC`を追加する分には、既存の保存済みJSON(`mode`を整数値でシリアライズ)の互換性は保たれる。
- `m_tfcEnabled`のデフォルトはfalseとし、`case Mode::LFT:`側で明示的に`setTfcEnabled(false)`を呼ぶことで、モード往復時のフラグ残留を防ぐ。既存の`LFT`モード・`Windowing`ソースのLTW1/2/3の挙動には影響を与えない設計とする。

### 5.3 特許を意識した独自実装上の注意点

AFMG社のTFC Windowは特許出願されている技術とされる([systune-rtd.md](systune-rtd.md)参照)。本設計は「時間窓と周波数が反比例する」という物理的に一般的な考え方(Constant-Q分析の一種)を、OSM既存のアーキテクチャ(`prepareLog()`のビンごと可変長窓)に対して数式を変えるだけで実装するものであり、AFMG固有のアルゴリズム実装(特定の窓形状の組み合わせ方、遷移帯域の平滑化手法、特許請求項に記載の具体的な実装詳細)をそのまま模倣するものではない。ただし、AFMGの特許が「基準周波数における基準時間を1パラメータとして与え、他の周波数の窓時間を自動計算する」という操作性・UI設計そのものに及ぶ請求項を含む可能性もあるため、**実装に着手する前に、AFMGの特許明細書(公開されていれば)を確認し、請求項の範囲を法務観点で確認することを推奨する**。本ドキュメントは技術設計に留め、特許非侵害性の法的判断は別途行うべき事項とする。

なお、OSMは窓関数をHann固定(UIから他窓を隠している)としており、スライディング相関ベース(FFTではなくリングバッファへの直接相関)という実装方式自体がAFMG(おそらくSTFTベース)とは異なるアプローチである点も、独自実装としての差別化材料になりうる。

## 6. 期待できる効果と限界(聴感との一致度について)

残響の長いホールでは、Smaartなど従来のデュアルチャンネルFFT測定で聴感と一致しない結果が出やすく、コヒーレンスも大きく低下することが実務上よく経験される。TFC Windowがこの問題をどこまで改善しうるかを整理する。

### 6.1 TFCが効くと考えられる部分

- **高域**: 窓が短くなることで、(1) 後から到達する反射音・残響音の影響を早期にカットできる。これは先行音効果(precedence effect)により耳がそもそも重視しない後続反射音を、測定側でも自然に除外することに相当する。(2) 窓が短い分、測定中の空気の揺らぎ・温度勾配による音速変化(位相ドリフト)の影響を受ける時間も短くなるため、**長い固定窓よりコヒーレンスが上がりやすい**。
- **低域**: 窓を長く保つことで、短い窓では残響の減衰が終わる前に打ち切られてしまう(リーケージ・ノイズフロア上昇)問題を回避できる。低域はモード(定在波)が支配的な拡散音場であり、耳も積算的なトータル応答として聴いているため、窓を長くして残響を含めて拾うこと自体が聴感に近い。

### 6.2 TFCでは解決しない部分

- **非定常ノイズ由来のコヒーレンス低下**(客入り、空調、風、人の動きなど)はTFCの管轄外。これは窓の長さの問題ではなく「測定中に基準信号と無相関な外乱がどれだけ混入したか」の問題であり、SSA Filter™([systune-rtd.md](systune-rtd.md)参照、突発ノイズ・外乱を測定データから除外するフィルター)のような別の技術が対応する領域。TFC単体では直接効かない。
- **拡散音場そのものの位相の暴れ**: 残響の多いホールでは直接音+多数の反射音が周波数ごとにランダムに近い位相関係で足し合わさるため、コヒーレンスが高くても伝達関数の位相・振幅は本質的に細かく暴れる(測定の不備ではなく実際の音響現象)。耳はこれをクリティカルバンド単位・時間積分で聴いているため、生の伝達関数トレースほど「暴れて」は聴こえない。TFCは高域の窓を短くすることでこの暴れの一部(late reflectionsとの干渉)を減らせるが、**「位相コヒーレントな足し算」という測定手法自体の性質は変わらない**ため、聴感と完全には一致しない。

### 6.3 実務的な見立て

TFCは「Smaartでよく見られるギザギザ・コヒーレンス低下」を**幾分マイルドにする**方向には働くが、それだけで聴感に一致する測定になるとは考えない方がよい。複数マイク位置での空間平均、C50/C80/D50のような積分系の明瞭度指標、RT/STI([systune-rtd.md](systune-rtd.md)参照)などと組み合わせて初めて、聴感に近い評価に近づく、というのが現実的な期待値。

## 7. オクターブスムージングとの併用

### 7.1 併用に追加実装は不要

OSMの周波数軸スムージングは、`qml/Plot/MagnitudeProperties.qml`(156-159行目)の`smoothing`コンボ(`["Global", "1/1 oct", "1/3 oct", "1/6 oct", "1/12 oct", "1/24 oct", "1/48 oct"]`)で選択し、実処理は`src/chart/opengl/magnitudeseriesrenderer.cpp`の`iterateForSpline<float, float>(m_pointsPerOctave, ...)`(158行目)がチャート描画側で行っている。この処理は2.6節で述べた通り`Abstract::Data`経由で取得した既計算済みのmagnitude/coherenceを平滑化するだけで、**Measurement側がFast FFT/LTW/TFCのどれで計算したデータかを一切問わない**。したがって、**TFCモードと1/3 oct・1/6 ocなどのスムージングは追加実装なしでそのまま併用できる**(TFC実装後、Transform modeをTFCにしてsmoothingコンボで好きな分解能を選ぶだけ)。

### 7.2 EQ処理の参考にしやすくなるか

結論として、**併用は理にかなっている**。TFCと平滑化は同じ「測定を聴感/実用に近づける」という目的に対し、異なる軸(時間領域 vs 周波数領域)からアプローチする補完関係にある。

- TFC(時間領域): 高域で後続反射音を早期に除外し、干渉由来の深いノッチ・暴れを**計算の元から**減らす。
- オクターブスムージング(周波数領域): TFCで軽減しきれず残る細かいリップル(近接反射・回折・マイク自己ノイズ等)を、周波数軸方向にさらに平均化して滑らかにする。

パラメトリックEQの1バンドが持つ実効帯域幅は、一般に1/3〜1/6 oct相当のQに近いことが多く、この分解能でスムージングした曲線は「1つのEQバンドで対処できる粒度の凹凸」だけを残す形になり、EQ判断の参考として扱いやすい。

### 7.3 注意点

- **平滑化しすぎると、直す価値のある本物の共振も隠れる**。スピーカー自体の駆動系共振や、低域の実在するルームモードは、干渉による見かけ上のノッチとは異なり、実際にEQで対処する意味がある狭帯域の凹凸である。TFC・スムージングはどちらも「望ましくない細かい変動を減らす」技術であり、それが干渉由来なのか実在する共振なのかを区別してくれるわけではない。
- 実務では、**低域は細かめ(1/12〜1/24 oct、あるいはスムージング無し)、高域は粗め(1/3〜1/6 oct)**、という周波数依存のスムージング設定が好まれることが多い。これは実質的にTFC自体が採用している「低域は精細に、高域は割り切る」という考え方と同じ発想であり、TFC(時間軸での可変windowing)とスムージング(周波数軸での平均化)を、同じ設計思想のもとで両輪として使うのが合理的と言える。現状OSMのスムージング設定は全帯域一律の1段階選択(コンボで1つ選ぶだけ)なので、周波数依存のスムージング(帯域ごとに異なる分解能)は将来的な拡張候補として記録しておく(本プランのスコープ外)。

## 8. 参照ファイル一覧

- `src/math/fouriertransform.h` / `.cpp`(核心: `prepareLog()` 464-498行目、`log()` 426-463行目)
- `src/math/windowfunction.h` / `.cpp`(`pointGain(i, N)` 51-94行目)
- `src/math/deconvolution.h` / `.cpp`
- `src/source/measurement.cpp`(`updateFftPower()` 241-278行目)
- `src/meta/metameasurement.h` / `.cpp`
- `src/source/sourcewindowing.cpp`、`qml/source/WindowingProperties.qml`(UIパターンの参照元)
- `qml/source/MeasurementProperties.qml`(変更箇所)
- `qml/Plot/MagnitudeProperties.qml`(156-159行目、既存のオクターブスムージング選択UI、TFCと併用可能)
- `src/chart/opengl/magnitudeseriesrenderer.cpp`(158行目、`iterateForSpline`によるスムージング実処理、Measurement側のFFTモードに非依存)
