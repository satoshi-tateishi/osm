# 実装プロンプト: TFC Window — Phase 1 (`FourierTransform`層の拡張)

このファイルは、[tfc-window-phases.md](tfc-window-phases.md)のPhase 1を実装するための、そのまま実行に使えるプロンプト。新しいセッションでこのプロンプトを渡せば、以降のタスクに着手できるよう、必要な背景情報を全てこのファイル内に含めている。

## 背景

Open Sound Meter (OSM) に、AFMG SysTuneの特許技術「TFC Window™(Time-Frequency-Constant Window)」相当の機能を実装したい。TFC Windowは、解析窓の時間長が周波数に反比例して連続的に変化する窓関数で、基準周波数`f_ref`における窓長(reference time)`T_ref`を1つ指定すると、他の全周波数の窓長`T(f)`が`T(f) * f = T_ref * f_ref`(一定)という関係で自動的にスケールされる。

設計の全体像は以下の既存ドキュメントに詳しいので、実装前に目を通すこと。

- [tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) — 設計方針・数式導出・リスクの詳細
- [tfc-window-phases.md](tfc-window-phases.md) — Phase分割の全体像(このPhase 1はその一部)
- [systune-rtd.md](systune-rtd.md) — TFC Windowそのものの技術調査メモ

**今回のタスクはPhase 1のみ。`Measurement`層・`Meta::Measurement`層・QML UIには一切手を入れないこと**(それらはPhase 2・Phase 4で別途行う)。`FourierTransform`クラス単体にTFCの計算ロジックを実装し、単体で動作検証できる状態にすることがゴール。

## 対象ファイル

- `src/math/fouriertransform.h`
- `src/math/fouriertransform.cpp`

## 現状のコード(変更前、確認済み)

`src/math/fouriertransform.h`(抜粋、35行目・113-137行目):
```cpp
enum Type { Fast, Log};
...
void setLogWindowDenominator(unsigned int newLogWindowDenominator);

private:
unsigned int m_size;
unsigned int m_pointer;
unsigned int m_sampleRate;
unsigned int m_logWindowDenominator;
...
struct LogBasisVector {
    unsigned int N;
    float frequency;
    std::vector<v4sf> w;
};
Container::array<LogBasisVector> m_logBasis;
```

`src/math/fouriertransform.cpp`の`prepareLog()`(464-498行目、現状そのまま):
```cpp
GNU_ALIGN void FourierTransform::prepareLog()
{
    Complex w;
    const int ppo = 24, octaves = 11;
    unsigned int startWindow = pow(2, 16), startOffset = 1'344'000 / sampleRate(); // 28 for 48k
    float wFactor = powf(10.f, 1.f / (-octaves * ppo / 2.5));
    float fFactor = powf(1000.f, 1.f / (ppo * octaves));
    unsigned int N, offset;
    float frequency;
    m_logBasis.resize(ppo * octaves);
    m_fastA.resize(ppo * octaves);
    m_fastB.resize(ppo * octaves);
    setSize(startWindow);

    for (unsigned int i = 0; i < m_logBasis.size(); ++i) {
        N      = startWindow * pow(wFactor, i);
        offset = startOffset * pow(wFactor * fFactor, i);
        frequency =  static_cast<float>(offset) / (N);

        m_logBasis[i].N = N / m_logWindowDenominator;
        m_logBasis[i].frequency = frequency;
        m_logBasis[i].w.resize(N);
        float gain(0);
        for (unsigned int j = 0; j < m_logBasis[i].N; ++j) {
            gain += m_window.pointGain(j, m_logBasis[i].N) / m_logBasis[i].N;
        }
        auto norm = (m_norm == Norm::Sqrt ? m_logBasis[i].N : float(1.f) );
        float phase = (m_align == Align::Center ? -(m_logBasis[i].N / 2.f) : 0);
        for (unsigned int j = 0; j < m_logBasis[i].N; ++j, ++phase) {
            w.polar(-2.f  * M_PI * phase * frequency);
            w *= m_window.pointGain(j, m_logBasis[i].N) / (norm * gain);
            m_logBasis[i].w[j] = _mm_set_ps(w.imag, w.real, w.imag, w.real);
        }
    }
}
```

`log()`(426-463行目)はこの`m_logBasis`を使ってスライディング相関を行うだけで、**今回は変更不要**。`m_logBasis[i].w.resize(N)`(`N`は変更前の値)であることに注意 — TFC適用後も「テンプレートベクトルの物理サイズ`N`」と「実際に使うサンプル数`m_logBasis[i].N`」の2つの変数が今まで通り区別されている点は維持すること(`m_logWindowDenominator`による縮小と同じ扱い方)。

## 実装する変更

### 1. メンバ・setter追加(`fouriertransform.h`)

```cpp
public:
    //! enable/disable TFC (Time-Frequency-Constant) window mode
    void setTfcEnabled(bool enabled);
    bool tfcEnabled() const;

    //! reference window time in milliseconds (e.g. 10.0 = 10ms at reference frequency)
    void setTfcReferenceTime(float milliseconds);
    float tfcReferenceTime() const;

    //! reference frequency in Hz (e.g. 1000.0 = 1kHz)
    void setTfcReferenceFrequency(float hz);
    float tfcReferenceFrequency() const;

private:
    bool m_tfcEnabled = false;
    float m_tfcReferenceTime = 10.f;        // ms
    float m_tfcReferenceFrequency = 1000.f; // Hz
```

setterは値を保存するだけでよい(`prepareLog()`の再実行は呼び出し側=Phase 2の`Measurement`側の責務。今回は呼ばない)。

### 2. `prepareLog()`の書き換え(`fouriertransform.cpp`)

**計算順序を「frequencyを先に決めてからNを決める」に入れ替える**。TFC無効時は既存の計算結果と完全に一致すること(回帰させない)。

```cpp
GNU_ALIGN void FourierTransform::prepareLog()
{
    Complex w;
    const int ppo = 24, octaves = 11;
    unsigned int startWindow = pow(2, 16), startOffset = 1'344'000 / sampleRate(); // 28 for 48k
    float wFactor = powf(10.f, 1.f / (-octaves * ppo / 2.5));
    float fFactor = powf(1000.f, 1.f / (ppo * octaves));
    unsigned int N, offset;
    float frequency;
    m_logBasis.resize(ppo * octaves);
    m_fastA.resize(ppo * octaves);
    m_fastB.resize(ppo * octaves);

    const float tfcCycles = (m_tfcReferenceTime / 1000.f) * m_tfcReferenceFrequency; // T_ref[s] * f_ref[Hz]
    constexpr unsigned int kTfcMinWindow = 8;
    unsigned int requiredSize = startWindow;

    if (m_tfcEnabled) {
        // 先に全ビンのfrequencyを求め、最低周波数ビンで必要な最大Nを見積もる
        offset = startOffset; // i=0 のoffset
        frequency = static_cast<float>(offset) / startWindow; // 最初のNは暫定値として使わず、offsetの比だけ流用
        // frequency自体はNに依存しないので、i=0のfrequencyを先に単独計算する
        float frequency0 = static_cast<float>(startOffset) / (startWindow * pow(wFactor, 0)); // 参考: 従来式のiでの分母は本来N_iだが、
        // frequencyの真の定義はoffset/N。TFCではNをfrequencyから逆算するため、
        // 「offsetの対数グリッド」と「基準となる周波数比」を使って直接frequencyを求める必要がある。
        // 実際には下のループ内でi毎にoffsetからfrequencyを直接算出するため、ここでの事前計算は
        // 最低周波数ビン(i = m_logBasis.size()-1)のfrequencyを求めるだけでよい。
        unsigned int lastIndex = static_cast<unsigned int>(m_logBasis.size()) - 1;
        float lastOffset = startOffset * pow(wFactor * fFactor, lastIndex);
        float lastFrequencyGuess = lastOffset / (startWindow * pow(wFactor, lastIndex)); // 概算(旧Nベース)
        unsigned int nMax = static_cast<unsigned int>(std::round(tfcCycles / lastFrequencyGuess));
        constexpr unsigned int kTfcMaxWindowSeconds = 2; // 上限クランプ(秒)
        unsigned int maxAllowed = kTfcMaxWindowSeconds * sampleRate();
        nMax = std::min(nMax, maxAllowed);
        requiredSize = std::max(startWindow, nMax);
    }
    setSize(requiredSize);

    for (unsigned int i = 0; i < m_logBasis.size(); ++i) {
        offset = startOffset * pow(wFactor * fFactor, i);

        if (m_tfcEnabled) {
            // frequencyは「offsetの対数グリッド」のみに依存させ、Nはfrequencyから逆算する
            float refN = startWindow * pow(wFactor, i); // 従来のNの対数グリッド(frequency算出用の分母として使う)
            frequency = offset / refN;
            N = static_cast<unsigned int>(std::round(tfcCycles / frequency));
            N = std::clamp(N, kTfcMinWindow, requiredSize);
        } else {
            N = startWindow * pow(wFactor, i);
            frequency = static_cast<float>(offset) / N;
        }

        m_logBasis[i].N = m_tfcEnabled ? N : (N / m_logWindowDenominator);
        m_logBasis[i].frequency = frequency;
        m_logBasis[i].w.resize(m_logBasis[i].N);
        float gain(0);
        for (unsigned int j = 0; j < m_logBasis[i].N; ++j) {
            gain += m_window.pointGain(j, m_logBasis[i].N) / m_logBasis[i].N;
        }
        auto norm = (m_norm == Norm::Sqrt ? m_logBasis[i].N : float(1.f) );
        float phase = (m_align == Align::Center ? -(m_logBasis[i].N / 2.f) : 0);
        for (unsigned int j = 0; j < m_logBasis[i].N; ++j, ++phase) {
            w.polar(-2.f  * M_PI * phase * frequency);
            w *= m_window.pointGain(j, m_logBasis[i].N) / (norm * gain);
            m_logBasis[i].w[j] = _mm_set_ps(w.imag, w.real, w.imag, w.real);
        }
    }
}
```

> **注記(重要)**: 上のコード案は設計意図を示すためのドラフトであり、そのままコピーせず実装者が精査すること。特に以下の点を必ず確認・修正すること。
> - 既存コードの`frequency = offset / N`は「Nの対数グリッド」と「offsetの対数グリッド」の比で決まる、ビンごとに一意な値である。TFC有効時に`frequency`の算出方法(=`refN`を使う経路)を変えてよいか、あるいは元の`N = startWindow * pow(wFactor, i)`をそのまま`frequency`計算専用に使い続けてよいか、実装時に既存の`getFrequencies()`など他の利用箇所との整合性を再確認すること。
> - `<algorithm>`(`std::clamp`, `std::min`, `std::max`)のインクルードが必要な場合は追加すること。
> - `m_logBasis[i].w.resize(N)`ではなく`resize(m_logBasis[i].N)`に変えている点(旧コードは`w.resize(N)`だが直後の全ループは`m_logBasis[i].N`回しか回さないため、旧コードのdenominator適用時は`w`が本来必要な数より大きめに確保される実装だった。TFCでは`N`と`m_logBasis[i].N`を一致させているため`resize(m_logBasis[i].N)`で問題ないはずだが、メモリ確保の意図に変化がないか確認すること)。
> - `setSize()`を呼ぶタイミング(ループの前)は現状維持。

### 3. 数式の検算(実装後に必ず一致させること)

`C = (T_ref[ms]/1000) * f_ref[Hz]`、`N = round(C / frequency_normalized)`(`frequency_normalized = f / sampleRate`)

48kHz、`T_ref=10ms @ f_ref=1000Hz`(`C=10`)の場合:
- 8kHz: `frequency_normalized = 8000/48000 = 0.16667` → `N = 10/0.16667 ≈ 60サンプル = 1.25ms`
- 125Hz: `frequency_normalized = 125/48000 = 0.002604` → `N = 10/0.002604 ≈ 3840サンプル = 80ms`

## 検証方法

このリポジトリには自動テストの仕組みがないため(`OpenSoundMeter.pro`は単一の`app`ターゲットのみ)、以下の手順で手動検証する。

1. `prepareLog()`の末尾に一時的な`qDebug()`を追加し、`m_tfcEnabled=true`・`m_tfcReferenceTime=10.f`・`m_tfcReferenceFrequency=1000.f`を(テスト用に)コンストラクタや一時的なコードでハードコードして、`m_logBasis[i].N`と`m_logBasis[i].frequency`を全ビンぶん出力する。
2. 上記「3. 数式の検算」の数値と一致するか(周波数が8kHz・125Hzに最も近いビンで)確認する。
3. サンプルレートを44.1kHz/96kHzに変えても、数式通りにスケールすることを確認する。
4. `m_tfcEnabled=false`のとき、変更前の`prepareLog()`と全く同じ`m_logBasis[i].N`/`frequency`になることを確認する(既存のLTW/`Windowing`ソースのLTW1/2/3への回帰がないことの確認)。
5. 確認が終わったら、テスト用にハードコードした値・一時的な`qDebug()`は必ず削除する。
6. CLAUDE.mdのビルド手順(`mkdir -p build && cd build && ~/Qt/5.15.2/clang_64/bin/qmake ../OpenSoundMeter.pro && make -j$(sysctl -n hw.ncpu)`)でビルドが通ることを確認する。この時点ではUIからTFCモードを選択する手段がまだ無い(Phase 2で追加)ため、アプリの見た目上の変化は無くてよい。既存のLTWモードが今まで通り動作することだけ確認できればPhase 1としては十分。

## やらないこと(スコープ外)

- `Meta::Measurement::Mode`への`TFC`追加(Phase 2)
- `Measurement`クラスの`updateFftPower()`等の変更(Phase 2)
- QML UIの変更(Phase 4)
- `src/math/deconvolution.h/.cpp`の変更(スコープ外、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.5節の通りインパルス応答は現状維持)

## 完了後の作業

- [tfc-window-phases.md](tfc-window-phases.md)の進捗状況テーブルで、Phase 1を「完了」に更新する。
- 実装内容(特に上記ドラフトから変更した点)を踏まえて、必要なら[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md)の該当箇所を実態に合わせて更新する。
