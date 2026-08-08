# 実装プロンプト: フロントエンドJS化 Phase 3(RTA/Spectrumを追加)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 3を実装するための指示書。Phase 1(Magnitude単体疎通)・Phase 2(Phase・Coherenceを追加)は完了・レビュー済み(Phase 1: データ競合・無音時null処理の修正、Phase 2: 無信号時にPhaseだけ偽の0度を返す不具合の修正、を含む)。Phase 3はRTA(Spectrum)チャートを追加する。[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.4節の通り、RTAは単一系列・リファレンスチャンネル不使用でMagnitude/Phase/Coherenceより単純。

## 前提・スコープの確認

`src/chart/opengl/rtaseriesrenderer.cpp`を調査した結果、以下の点を確認・スコープ決定した:

- RTAは`magnitudeRaw(i)`(データ/リファレンスの伝達関数)ではなく**`module(i)`(単一チャンネルの生振幅)を使う**([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 2.2節の通り)。そのため**リファレンスチャンネルの有無に影響されない**。この検証環境ではリファレンス側に信号が無く(Phase 1・Phase 2のレビューで確認済み)Magnitude/Phase/Coherenceが軒並みnullになっていたが、データ側(マイク等)には実際に信号があった(`level ≈ -58dB`)ことをPhase 1レビュー時の診断ログで確認済みなので、**RTAは実データで検証しやすいはず**。
- `RTAPlot`には`Mode`(Line/Bars/Lines)・`Scale`(DBfs/SPL/Phon)・`showPeaks`のプロパティがあるが、Phase 3では既定値である**`Mode::Line`・`Scale::DBfs`・ピーク表示なし**に固定する(「コントロールなし」の方針を踏襲)。`Scale::SPL`/`Phon`は`EqualLoudnessContour`による追加変換が必要でスコープ外。
- `renderPPOLine()`(200〜258行目)の集計式は**Magnitudeと異なり、バンド内のカウント数で割らない**(`10 * log10f(value)`であって`10 * log10f(value / count)`ではない)。RTAはバンド内エネルギーの「合計」を表示する設計。この違いを正確に再現すること。
- `accumulate`ラムダは`i == 0`(DC成分)を明示的にスキップしている(220〜225行目)。`FrequencyBasedSeriesHelper::iterate()`自体もループを`i = 1`から開始するため実質的に冗長だが、既存コードとの忠実な対応を優先しそのまま再現する。

## 実装1: `src/chart/seriessampler.h` / `.cpp`に`RTASeriesSampler`を追加

`src/chart/seriessampler.h`の`CoherenceSeriesSampler`の直後に追加:

```cpp
class RTASeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit RTASeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"sourceName","color","frequency":[...],"levelDb":[...]} のJSON文字列。
    // RTAPlotの既定値(pointsPerOctave=6、Mode::Line、Scale::DBfs)に固定。
    QString sampleJson(unsigned int pointsPerOctave = 6);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};
```

`src/chart/seriessampler.cpp`の末尾(`CoherenceSeriesSampler`の実装の後、`} // namespace Chart`の前)に追加:

```cpp
RTASeriesSampler::RTASeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void RTASeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &RTASeriesSampler::source() const
{
    return m_source;
}

QString RTASeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, levelDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            if (i == 0) {
                return; // DC成分を除外(rtaseriesrenderer.cppと同じ)
            }
            auto m = m_source->module(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &levelDb](const float &bandStart, const float &bandEnd,
        const unsigned int &) {
            // RTAはバンド内エネルギー合計を表示するため、Magnitudeと異なりcountで割らない
            // (rtaseriesrenderer.cpp renderPPOLine()と同じ式、Scale::DBfs固定でoffset=0)
            auto db = 10.0 * std::log10(value);
            frequency.append((bandStart + bandEnd) / 2.0);
            levelDb.append(std::isfinite(db) ? QJsonValue(db) : QJsonValue());
            value = 0.f;
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
    payload["levelDb"] = levelDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}
```

## 実装2: `src/chart/databridge.h` / `.cpp`の拡張

`databridge.h`: `CoherenceSeriesSampler m_coherenceSampler;`の下に`RTASeriesSampler m_rtaSampler;`を追加、`signals:`に追加:

```cpp
    void rtaUpdated(const QString &json);
```

`databridge.cpp`の`setSource()`に、`m_coherenceSampler.setSource(source);`の直後に追加:

```cpp
    m_rtaSampler.setSource(source);
```

`onReadyRead()`の末尾(`coherenceUpdated`のemitの後)に追加:

```cpp
    auto rtaJson = m_rtaSampler.sampleJson();
    if (!rtaJson.isEmpty()) {
        emit rtaUpdated(rtaJson);
    }
```

`OpenSoundMeter.pro`の変更は不要(既存ファイルへの追記のみ)。

## 実装3: `web/src/main.ts`の拡張(RTAチャートを追加)

`SeriesPayload`を継承する型を追加:

```typescript
interface RTAPayload extends SeriesPayload { levelDb: (number | null)[] }
```

`#app`のHTML(`document.querySelector<HTMLDivElement>('#app')!.innerHTML = ...`)に、Coherenceの前後どちらかに追加(例: Magnitudeの直後):

```html
  <h2>RTA</h2>
  <canvas id="chart-rta" class="chart"></canvas>
```

`canvases`オブジェクトに`rta: document.querySelector<HTMLCanvasElement>('#chart-rta')!,`を追加。`resizeAll()`に`resizeCanvas(canvases.rta, 220)`を追加(Magnitudeの直後など、Coherenceより前が見やすい)。

描画関数を追加(`drawCoherence`の直前などに配置):

```typescript
function drawRTA(payload: RTAPayload) {
  const range = finiteRange(payload.levelDb)
  if (!range) return
  drawSeries(canvases.rta, payload.frequency, payload.levelDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}
```

`connectWebChannel()`内、`dataBridge.coherenceUpdated.connect(...)`の直後に購読を追加:

```typescript
    dataBridge.rtaUpdated.connect((json: string) => {
      try {
        drawRTA(JSON.parse(json) as RTAPayload)
      } catch (e) {
        console.error('rtaUpdated parse error', e)
      }
    })
```

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する(`open`では環境変数が渡らない)。
4. RTAチャートが表示され、この検証環境の実データ(マイク等のデータチャンネル信号)でリアルタイムに変化する実際の曲線が描かれることを確認する(前提節の通り、リファレンス不要なのでMagnitude/Phase/Coherenceと違って実データが見えるはず。もし依然としてnullばかりなら、データチャンネル自体に信号が来ていない可能性があるため、DevTools Protocol経由で`levelDb`配列の値を直接確認して切り分けること)。
5. `npm run build`(tscの型チェック含む)が通ることを確認する。
6. 実オーディオ入力を数分間接続したまま動作させ、クラッシュ・フリーズが起きないこと(新規`RTASeriesSampler`のロックパターンが正しいかの確認)。
7. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 3のタスクチェックリスト・完了条件を更新し、進捗表を「完了」にする。`Mode::Line`/`Scale::DBfs`固定などのスコープ簡略化を完了メモに明記する。
- [dev-docs/customizations.md](customizations.md)に、Phase 3で追加したファイル・JSON payloadの形状(`levelDb`)を追記する(これまでのPhaseのエントリと同じ見出しパターン)。
