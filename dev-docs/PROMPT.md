# 実装プロンプト: TFC Window — Phase 2 (`Measurement`/`Meta::Measurement`層の配線)

このファイルは、[tfc-window-phases.md](tfc-window-phases.md)のPhase 2を実装するための、そのまま実行に使えるプロンプト。新しいセッションでこのプロンプトを渡せば、以降のタスクに着手できるよう、必要な背景情報を全てこのファイル内に含めている。

## 前提: Phase 1は完了・レビュー済み

`src/math/fouriertransform.h`/`.cpp`に、TFC(Time-Frequency-Constant Window)のコア計算ロジックが実装済み。

- `FourierTransform`に`setTfcEnabled(bool)`/`setTfcReferenceTime(float ms)`/`setTfcReferenceFrequency(float hz)`のsetter/getterを追加済み(値を保存するだけで、`prepareLog()`の再実行はしない)。
- `prepareLog()`は、既存の対数周波数グリッド(`frequency_i = offset/referenceN`、`referenceN = startWindow * pow(wFactor, i)`)を**TFC有効・無効に関わらず同じ式で**先に計算し、TFC有効時のみそのfrequencyから窓長`N_i = round(C / frequency_i)`(`C = (T_ref[ms]/1000) * f_ref[Hz]`)を逆算する設計になっている(8サンプル以上・サンプルレート2秒分以下にクランプ)。TFC無効時は`m_logBasis[i].N`・`frequency`・`w`の確保サイズとも変更前と完全に一致することを確認済み(回帰なし)。
- **`frequency_i`自体はreference time/frequencyの値に依存しない**(TFC有効時でも既存の対数グリッドをそのまま使う)。変わるのは`N_i`(窓長)だけ。この性質はPhase 2の設計に直接影響する(後述)。

Phase 1はこのプロンプトの対象外。`fouriertransform.h`/`.cpp`には触れないこと。

## 背景

Open Sound Meter (OSM) に、AFMG SysTuneの「TFC Window™」相当の機能を実装するプロジェクトの一部。設計の全体像は以下を参照。

- [tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) — 設計方針・数式導出・リスクの詳細(特に3.6節がPhase 2のUI/配線設計)
- [tfc-window-phases.md](tfc-window-phases.md) — Phase分割の全体像

**今回のタスクはPhase 2のみ。QML UI(`qml/source/MeasurementProperties.qml`)には一切手を入れないこと**(Phase 4で別途行う)。TFCモードをコード上(C++)で選択・設定・保存・複製できる状態にすることがゴールで、UIからの操作は次Phaseで繋ぐ。

## 対象ファイル

- `src/meta/metameasurement.h`
- `src/meta/metameasurement.cpp`
- `src/source/measurement.h`
- `src/source/measurement.cpp`

## 現状のコード(変更前、確認済み)

### `src/meta/metameasurement.h`(41行目)

```cpp
enum Mode {FFT10, FFT11, FFT12, FFT13, FFT14, FFT15, FFT16, LFT};
Q_ENUM(Mode)
```

`m_modeMap`/`m_FFTsizes`は`static const std::map`として同ファイル113-115行目で宣言。

### `src/meta/metameasurement.cpp`(22-48行目)

```cpp
const std::map<Measurement::Mode, QString>Measurement::m_modeMap = {
    {Measurement::FFT10, "10"},
    {Measurement::FFT11, "11"},
    {Measurement::FFT12, "12"},
    {Measurement::FFT13, "13"},
    {Measurement::FFT14, "14"},
    {Measurement::FFT15, "15"},
    {Measurement::FFT16, "16"},
    {Measurement::LFT,   "LTW"}
};
...
const std::map<Measurement::Mode, int>Measurement::m_FFTsizes = {
    {Measurement::FFT10, 10},
    ...
    {Measurement::FFT16, 16}
    // LFTのエントリなし
};
```

`getAvailableModes()`(109-116行目)は`m_modeMap`を走査してQML用の文字列リストを作るだけなので、`m_modeMap`に`TFC`を追加すれば自動的にドロップダウンの選択肢(表示は次Phase)に反映される。

`gain`プロパティの実装(81-93行目)がfloatプロパティの標準パターン: `if (!qFuzzyCompare(...)) { m_x = x; emit xChanged(m_x); }`。

### `src/source/measurement.h`(42-88行目、抜粋)

```cpp
class Measurement : public Abstract::Source, public Meta::Measurement
{
    Q_OBJECT
    Q_PROPERTY(bool polarity READ polarity WRITE setPolarity NOTIFY polarityChanged)
    Q_PROPERTY(float gain READ gain WRITE setGain NOTIFY gainChanged)
    ...
    Q_PROPERTY(Meta::Measurement::Mode mode READ mode WRITE setMode NOTIFY modeChanged)
    ...
```

signals節(217-228行目)に各プロパティの`...Changed(...) override;`が並ぶ。

### `src/source/measurement.cpp`の`updateFftPower()`(241-278行目、現状そのまま)

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
    m_dataFT.setSampleRate(sampleRate());
    m_levelMeters.setSampleRate(sampleRate());
    m_dataFT.prepare();
    calculateDataLength();

    m_moduleAvg.setSize(frequencyDomainSize());
    m_magnitudeAvg.setSize(frequencyDomainSize());
    m_pahseAvg.setSize(frequencyDomainSize());
    m_coherence.setSize(frequencyDomainSize());

    m_moduleLPFs.resize(frequencyDomainSize());
    m_magnitudeLPFs.resize(frequencyDomainSize());
    m_phaseLPFs.resize(frequencyDomainSize());
    m_meters.resize(frequencyDomainSize());

    // Deconvolution:
    m_deconvolution.setSize(timeDomainSize());
    m_deconvLPFs.resize(timeDomainSize());
    m_deconvAvg.setSize(timeDomainSize());
    m_deconvAvg.reset();
}
```

`updateFftPower()`は`Measurement::transform()`(519-525行目)から**タイマースレッド上で毎ティック(80ms)呼ばれ**、`m_mode == m_currentMode`なら即returnする(実際の再計算はモードが変わった次のティックでのみ走る、という遅延適用の設計)。`FourierTransform::prepare()`は`m_type`に応じて`prepareFast()`か`prepareLog()`を呼ぶディスパッチャ(`fouriertransform.cpp` 558-566行目)。

`toJSON()`(132-165行目)/`fromJSON()`(166-188行目)/`clone()`(706-733行目)はいずれも単純に「他の各プロパティと同じ書き方でキー・setterを1行追加する」形式。

## 実装する変更

### 1. `Mode`列挙体に`TFC`を追加(`metameasurement.h`)

```cpp
enum Mode {FFT10, FFT11, FFT12, FFT13, FFT14, FFT15, FFT16, LFT, TFC};
```

既存値の並びは変えず末尾に追加すること(保存済みJSONの`mode`は整数値のため、既存値の番号がずれると過去のプロジェクトファイルの互換性が壊れる)。

### 2. `m_modeMap`に`TFC`を追加(`metameasurement.cpp`)

```cpp
{Measurement::TFC, "TFC"}
```

`m_FFTsizes`には追加しない(`LFT`と同様、`updateFftPower()`の`default`分岐に流れ込ませないため)。

### 3. `tfcReferenceTime`/`tfcReferenceFrequency`のプロパティ追加

`Meta::Measurement`(`metameasurement.h`)に、`gain`/`offset`と同じパターンでgetter/setter宣言・純粋仮想signal・保護メンバを追加:

```cpp
// public:
float tfcReferenceTime() const;
void setTfcReferenceTime(float milliseconds);

float tfcReferenceFrequency() const;
void setTfcReferenceFrequency(float hz);

// virtual signals:
virtual void tfcReferenceTimeChanged(float) = 0;
virtual void tfcReferenceFrequencyChanged(float) = 0;

// protected:
std::atomic<float> m_tfcReferenceTime;
std::atomic<float> m_tfcReferenceFrequency;
```

`metameasurement.cpp`のコンストラクタ初期化リストに既定値を追加(`FourierTransform`側の既定値10.f/1000.fに合わせる)。getter/setterの実装は`gain()`/`setGain()`(81-93行目)と同じ形(`qFuzzyCompare`で変化検知、変化時のみ`emit`)。

`measurement.h`に`Q_PROPERTY`と対応する`...Changed(float) override;`シグナルを追加(既存の`Q_PROPERTY(float gain ...)`と同じ書式)。

### 4. `updateFftPower()`にTFCモードを追加、かつ「モード不変・パラメータ変更のみ」でも再計算が走るようにする

**ここが今回のPhase 2で唯一、既存ドキュメント([tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.6節・[tfc-window-phases.md](tfc-window-phases.md) Phase 2タスク一覧)に明記されていない設計上の注意点**なので、実装前に必ず理解すること。

`updateFftPower()`は`if (Q_LIKELY(m_mode == m_currentMode)) return;`で始まる。つまり**モードそのものが変わらない限り、`updateFftPower()`の本体(=`prepareLog()`の再実行を含む)は一切実行されない**。

TFCモードでは、モードを変えずに`tfcReferenceTime`/`tfcReferenceFrequency`だけをUIのスピンボックスでドラッグ操作するのが主な使い方になる(Phase 4で追加するUI)。しかし`FourierTransform::prepareLog()`は「窓長テンプレート(`m_logBasis[i].w`)と内部リングバッファサイズ(`m_size`)を、その時点の`m_tfcReferenceTime`/`m_tfcReferenceFrequency`の値をもとに一括生成する」処理であり、値を変えただけでは自動的に再生成されない(Phase 1のsetterは値を保存するだけで再計算しない設計だったことを思い出すこと)。つまり**現状のガード条件のままでは、reference time/frequencyスピンボックスを動かしても何も反映されない**。

対応方針: `m_currentMode`と同様に「最後に適用したTFCパラメータ」を保持するメンバ(例: `float m_currentTfcReferenceTime, m_currentTfcReferenceFrequency;`、`m_currentMode`と並べて`measurement.h`private節に追加)を用意し、ガード条件を「モードが変わった、または(TFCモードで)パラメータが変わった」に拡張する:

```cpp
void Measurement::updateFftPower()
{
    bool tfcParamsChanged = (m_mode == Mode::TFC) &&
        (!qFuzzyCompare(m_currentTfcReferenceTime, tfcReferenceTime()) ||
         !qFuzzyCompare(m_currentTfcReferenceFrequency, tfcReferenceFrequency()));

    if (Q_LIKELY(m_mode == m_currentMode && !tfcParamsChanged)) return;
    m_currentMode = m_mode;
    m_currentTfcReferenceTime = tfcReferenceTime();
    m_currentTfcReferenceFrequency = tfcReferenceFrequency();

    switch (m_currentMode) {
    case Mode::LFT:
        m_dataFT.setTfcEnabled(false);
        m_dataFT.setType(FourierTransform::Log);
        setTimeDomainSize(pow(2, m_FFTsizes.at(FFT12)));
        break;

    case Mode::TFC:
        m_dataFT.setTfcEnabled(true);
        m_dataFT.setTfcReferenceTime(m_currentTfcReferenceTime);
        m_dataFT.setTfcReferenceFrequency(m_currentTfcReferenceFrequency);
        m_dataFT.setType(FourierTransform::Log);
        setTimeDomainSize(pow(2, m_FFTsizes.at(FFT12)));
        break;

    default:
        m_dataFT.setSize(pow(2, m_FFTsizes.at(m_currentMode)));
        m_dataFT.setType(FourierTransform::Fast);
        setTimeDomainSize(pow(2, m_FFTsizes.at(m_currentMode)));
    }
    // 以下、既存のm_dataFT.setSampleRate()以降は変更不要
    ...
}
```

> 上記はドラフトであり、そのままコピーせず実装者が精査すること。特に以下を確認・判断すること。
> - `case Mode::LFT:`に`m_dataFT.setTfcEnabled(false)`を追加している点(モードをTFC→LFTへ切り替えた際のフラグ残留防止、[tfc-window-phases.md](tfc-window-phases.md) Phase 2タスク一覧に明記されている要件)。`default:`分岐(Fast FFT系)は元々`Type::Log`を使わないため`m_tfcEnabled`の値自体に意味がなく、対応不要と考えられるが要確認。
> - `m_currentTfcReferenceTime`/`m_currentTfcReferenceFrequency`の型(`std::atomic<float>`にすべきか)。`updateFftPower()`はタイマースレッド上で呼ばれる一方、`tfcReferenceTime()`はQMLスレッド(メインスレッド)からのプロパティ書き込みで更新されるため、`m_tfcReferenceTime`自体は`std::atomic<float>`にして単純read/writeの競合を防ぐ想定(上記3.の設計)。`m_currentTfcReferenceTime`はタイマースレッド内でのみ読み書きするローカル状態のため`atomic`である必要はないはずだが、既存の`m_currentMode`(非atomic)の扱いと平仄を合わせて判断すること。
> - `setTimeDomainSize()`や`calculateDataLength()`など、パラメータ変更時にも本当に必要な処理だけが走るか(不要な`m_deconvAvg.reset()`等でTFCパラメータ調整中に他のチャート(Impulse/Step)の平均がリセットされてしまわないか)を確認する。[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.5節の通りインパルス応答はTFCと無関係(常にFast FFT)なので、本来リセット不要のはずだが、既存コードが`case`分岐に関わらず共通で実行する処理になっている点に注意。
> - `qFuzzyCompare(0.f, 0.f)`は`false`を返す既知の挙動があるため、初期値の扱い(`m_currentTfcReferenceTime`の初期値をコンストラクタでどう設定するか)を確認すること。

### 5. `toJSON()`/`fromJSON()`への追加

`toJSON()`(132-165行目)に他プロパティと同じ書式で追加:
```cpp
data["tfc.referenceTime"]      = tfcReferenceTime();
data["tfc.referenceFrequency"] = tfcReferenceFrequency();
```
`fromJSON()`(166-188行目)に対応するsetter呼び出しを追加(欠損時は現在値をデフォルトにするパターンを踏襲)。

### 6. `clone()`への追加(706-733行目)

```cpp
cloned->setTfcReferenceTime(tfcReferenceTime());
cloned->setTfcReferenceFrequency(tfcReferenceFrequency());
```
他のプロパティ同様、`cloned->setMode(mode())`の近くに追加。

## 検証方法

QML UIがまだ無い(Phase 4)ため、一時的なテストコードで動作確認する。

1. `Measurement`コンストラクタ末尾などに一時的に`setMode(Measurement::TFC); setTfcReferenceTime(10.f); setTfcReferenceFrequency(1000.f);`を追加するか、あるいは一時的なQML(`Component.onCompleted`でJSプロパティ経由)からモードを`"TFC"`にして動作確認する。
2. アプリを起動し、Magnitude/Phase/Coherenceチャートが破綻なく表示されること(既存のLFT/Fastモードと比べて明らかに壊れた見た目でないこと)を確認する。
3. `tfcReferenceTime`を大きく変えて(例: 10ms→30ms)、チャートの見た目(特に低域の分解能・ノイズフロア)が変化すること(=パラメータ変更が実際に反映されていること。上記4.の対応が効いているかの実質的な確認)を確認する。
4. モードをTFC→LFT→FFT12→TFCのように往復させ、クラッシュ・フリーズがないこと、`m_dataFT.tfcEnabled()`のフラグ残留がないこと(LFTに戻したときTFCの窓長式が使われていないこと)を確認する。
5. プロジェクトファイルを保存→読み込みし直し、`tfcReferenceTime`/`tfcReferenceFrequency`の値が保持されることを確認する(`toJSON()`/`fromJSON()`の疎通確認)。
6. 確認が終わったら、一時的に追加したテストコードは必ず削除する。
7. CLAUDE.mdの動作確認手順(アプリ終了→ビルド→起動→ユーザー確認)に従う。この時点でもUIからのTFCモード選択手段はまだ無い(Phase 4)ため、既存のFast FFT/LTWモードが今まで通り動作することが確認できれば、Phase 2の最終確認としては十分。

## やらないこと(スコープ外)

- QML UI(`qml/source/MeasurementProperties.qml`)の変更(Phase 4)
- `dev-docs/measurement-types.md`の更新(Phase 3)
- `src/math/fouriertransform.h`/`.cpp`の変更(Phase 1で完了済み、今回は触らない)
- `src/math/deconvolution.h`/`.cpp`の変更(スコープ外、インパルス応答は現状維持)

## 完了後の作業

- [tfc-window-phases.md](tfc-window-phases.md)の進捗状況テーブルで、Phase 2を「完了」に更新する。
- 実装内容(特に上記4.のドラフトから変更した点)を踏まえて、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.6節を実態に合わせて更新する。
- [dev-docs/customizations.md](dev-docs/customizations.md)に変更内容と理由を追記する(CLAUDE.mdの記録ルールに従うこと)。
