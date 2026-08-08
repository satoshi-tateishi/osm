# 修正プロンプト: Phase 2 — 無信号時にPhaseが偽の0度を返す不具合の解消

Phase 2(Phase・Coherenceチャート追加)の実装をレビューし、修正が必要な問題が1件見つかった。Phase 3に進む前にここで直す。

## 前提

実機ビルド・起動・CDP経由での検証を行い、Magnitude/Coherenceの2チャートはPhase 1の修正パターン(ロック・null処理)を正しく踏襲できていることを確認した。しかし**Phaseチャートだけ、無信号時の扱いが正しくない**ことが判明した。

## 問題: 無信号(リファレンス未接続等)でもPhaseが有限の`0`度を返し、`null`にならない

**再現**: リファレンスチャンネルに信号が来ていない状態(この検証環境で実際に発生した状態。`referenceLevel = -inf`)でCDP経由の実データを確認したところ、以下のようになっていた(同一フレームでの比較):

```
magnitude: finiteCount=0   (119点すべてnull)  ← 正しい(Phase 1の修正通り)
coherence: finiteCount=0   (119点すべてnull)  ← 正しい
phase:     finiteCount=119 (119点すべて 0)    ← 誤り。データが無いのに「完全に同位相(0度)」と表示される
```

**原因**: `Measurement::averaging()`(`src/source/measurement.cpp` 606〜613行目)は、Magnitude計算(`calibratedA / calibratedB`)がNaN/Infになった場合に明示的に`magnitude = 0.f`へクランプしているが、`p.polar(m_dataFT.bf(i), m_dataFT.af(i));`(619行目、Phaseの計算)には対応するガードが無い。`Complex::polar(const Complex&, const Complex&)`(`src/math/complex.cpp`)は内部で`x.imag / x.real`のようなタンジェント計算をしており、理論上はリファレンス側が0のとき0/0(NaN)になり得るはずだが、実機ではこの経路が(フィルタ処理等の影響で)有限の`0`に収束しており、`PhaseSeriesSampler`の`std::isfinite(degrees)`チェックをすり抜けてしまう。

`Measurement`側(既存のDSPコード)を修正するのは今回のJSフロントエンド化の範囲を超える(かつ動作確認範囲が本体アプリの計算ロジックに及ぶため、今回のレビュー方針であるJS側への集中から外れる)。そのため、**JS側のサンプラー層で「Magnitudeが無効な帯域はPhaseも無効として扱う」という防御的な対処をする**。同じ伝達関数(データ/リファレンスの複素比)から導出された値である以上、Magnitudeが無意味ならPhaseも無意味という判定は理にかなっている。

## 修正方法: `PhaseSeriesSampler`にMagnitude相当のバリデーションを追加

`src/chart/seriessampler.cpp`の`PhaseSeriesSampler::sampleJson()`を以下に置き換える。`MagnitudeSeriesSampler`と同じ「パワー加算→dB変換」を並行して行い、そのdBが非有限になる帯域はPhaseもnullにする。

```cpp
QString PhaseSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, phaseDeg;
    Complex value(0);
    float magnitudePower = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value, &magnitudePower](const unsigned int &i) {
            value += m_source->phase(i);
            auto m = m_source->magnitudeRaw(i);
            magnitudePower += m * m;
        };

        auto collected = [&value, &magnitudePower, &frequency, &phaseDeg](const float &bandStart, const float &bandEnd,
        const unsigned int &count) {
            auto avg = value / static_cast<float>(count);
            auto degrees = std::atan2(avg.imag, avg.real) * 180.0 / M_PI;
            // 同じ帯域のMagnitudeが無効(無音/未接続でNaN・Infになる)場合、Phase自体の
            // 生値がたまたま有限(0度)に見えても意味のあるデータではないため、あわせてnullにする。
            auto magnitudeDb = 10.0 * std::log10(magnitudePower / count);
            bool valid = std::isfinite(degrees) && std::isfinite(magnitudeDb);

            frequency.append((bandStart + bandEnd) / 2.0);
            phaseDeg.append(valid ? QJsonValue(degrees) : QJsonValue());

            value = Complex(0);
            magnitudePower = 0.f;
        };

        iterate(pointsPerOctave, accumulate, collected);
    }
    m_source->unlock();

    if (!hasData) {
        return QString();
    }

    QJsonObject payload;
    payload["sourceName"] = m_source->name();
    payload["color"] = m_source->color().name();
    payload["frequency"] = frequency;
    payload["phaseDeg"] = phaseDeg;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}
```

`MagnitudeSeriesSampler::sampleJson()`・`CoherenceSeriesSampler::sampleJson()`は変更不要(このレビューでは問題なしと確認済み)。

## 検証方法

1. CLAUDE.mdの手順でビルドする。
2. `cd web && npm run dev`を起動しておき、`OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する。
3. リファレンス未接続/無音状態(この検証環境で再現できた状態)で、PhaseチャートもMagnitude/Coherenceと同様にグリッドのみが残り、0度への偽の直線が出ないことを確認する(Chrome DevTools Protocol経由で`phaseDeg`配列の値をログ出力し、`null`になっていることを直接確認するのが確実)。
4. 実オーディオ入力(データ・リファレンスとも有効)がある状態で、Phaseチャートが以前通り正しい角度で描画されることを確認する(この修正でMagnitudeが有効な帯域まで巻き込んでnullにしていないか)。
5. `npm run build`(tscの型チェック含む)が通ることを確認する。
6. 実オーディオ入力を数分間接続したまま動作させ、クラッシュ・フリーズが起きないことを確認する。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 2の完了メモに、この修正内容(Phaseの無信号時null化にMagnitudeの妥当性を流用したこと、根本原因は`Measurement::averaging()`のPhase計算にNaN/Infガードが無いことに起因する可能性が高いが、DSP本体側の修正は今回のスコープ外としたこと)を追記する。
- [dev-docs/customizations.md](customizations.md)のPhase 2エントリに、この修正を追記する。
