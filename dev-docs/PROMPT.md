# 実装プロンプト: フロントエンドJS化 Phase 2(Phase・Coherenceを追加)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 2を実装するための指示書。Phase 1(Magnitude単体疎通)は完了・レビュー済み(データ競合の修正、無音時のnull処理を含む)。Phase 2はPhase 1で確立した`SeriesSampler`→`DataBridge`→JS Canvasのパターンを、Phase(位相)・Coherenceチャートへ横展開する。

## 前提・スコープの確認

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.4節の通り、Phase・Coherenceは「Magnitudeとほぼ同じサンプラー構造でフィールドが異なるだけ」という位置づけ。既存レンダラー(`src/chart/opengl/phaseseriesrenderer.cpp`、`src/chart/opengl/coherenceseriesrenderer.cpp`)を調査した結果、以下の**意図的な簡略化**をPhase 2でも行う(Phase 1で`iterateForSpline()`を使わず`iterate()`のバンド中心値だけを送った方針と同じ考え方):

- **位相ラップ処理**: `phaseseriesrenderer.cpp`のOpenGL2フォールバック経路(139〜148行目)は、スプライン補間後の隣接点間で±180°を跨ぐ場合に角度を±360°補正して滑らかに繋ぐ「アンラップ」処理をしている。Phase 2ではこの補正は行わず、**JS側で隣接点の差が180°を超えたら線を繋がず区切る**(不連続として扱う)簡易処理にする。情報量は変わらない(角度自体はどちらの方式でも同じ)が、繋ぎ方が簡略化される。
- **rotateプロパティ**: `PhasePlot::rotate`(既定0度、ユーザー調整可)は無視し、常に無回転(0度)として扱う。
- **Coherenceのtype**: `CoherencePlot::Type`は`Normal`固定(`Squared`/`SNR`は対象外)。`CoherencePlot`の既定値も`Normal`(`coherenceplot.cpp`のコンストラクタで`setType(Type::Normal)`)なので、既定表示と一致する。
- **coherence連動の透明度**: `MagnitudeSeriesRenderer`/`PhaseSeriesRenderer`のOpenGL2経路にある「コヒーレンスが閾値未満の区間を薄く表示する」機能(`coherenceSpline()`)は、Magnitude/Phase**チャート自身の見た目の演出**であり、Coherenceチャート自体には無い。Phase 2では見送り、Coherenceチャートは他の系列と同様「値をそのまま線で描く」だけにする(将来Phase必要なら追加)。

## 実装1: `src/chart/seriessampler.h` / `.cpp` に2クラス追加

`MagnitudeSeriesSampler`と同じ構造で`PhaseSeriesSampler`・`CoherenceSeriesSampler`を追加する。

`src/chart/seriessampler.h`の`MagnitudeSeriesSampler`の直後に追加:

```cpp
class PhaseSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit PhaseSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"sourceName","color","frequency":[...],"phaseDeg":[...]} のJSON文字列。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

class CoherenceSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit CoherenceSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"sourceName","color","frequency":[...],"coherenceValue":[...]} のJSON文字列。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};
```

`src/chart/seriessampler.cpp`の末尾(`MagnitudeSeriesSampler`の実装の後、`} // namespace Chart`の前)に追加。`#include "math/complex.h"`を先頭のinclude群に追加すること。**Phase 1の修正で確立した`m_source->lock()`/`unlock()`パターンを最初から適用する**(Phase 1のようにレビューで指摘されるのを待たない):

```cpp
PhaseSeriesSampler::PhaseSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void PhaseSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &PhaseSeriesSampler::source() const
{
    return m_source;
}

QString PhaseSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, phaseDeg;
    Complex value(0);
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            value += m_source->phase(i);
        };

        auto collected = [&value, &frequency, &phaseDeg](const float &bandStart, const float &bandEnd,
        const unsigned int &count) {
            auto avg = value / static_cast<float>(count);
            auto degrees = std::atan2(avg.imag, avg.real) * 180.0 / M_PI;
            frequency.append((bandStart + bandEnd) / 2.0);
            phaseDeg.append(std::isfinite(degrees) ? QJsonValue(degrees) : QJsonValue());
            value = Complex(0);
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

CoherenceSeriesSampler::CoherenceSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void CoherenceSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &CoherenceSeriesSampler::source() const
{
    return m_source;
}

QString CoherenceSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, coherenceValue;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            value += m_source->coherence(i); // CoherencePlot::Type::Normal固定
        };

        auto collected = [&value, &frequency, &coherenceValue](const float &bandStart, const float &bandEnd,
        const unsigned int &count) {
            auto avg = value / count;
            frequency.append((bandStart + bandEnd) / 2.0);
            coherenceValue.append(std::isfinite(avg) ? QJsonValue(avg) : QJsonValue());
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
    payload["coherenceValue"] = coherenceValue;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}
```

## 実装2: `src/chart/databridge.h` / `.cpp`の拡張

`databridge.h`: `MagnitudeSeriesSampler m_magnitudeSampler;`の下に`PhaseSeriesSampler m_phaseSampler;`・`CoherenceSeriesSampler m_coherenceSampler;`を追加、`signals:`に以下を追加:

```cpp
    void phaseUpdated(const QString &json);
    void coherenceUpdated(const QString &json);
```

`databridge.cpp`の`setSource()`に、`m_magnitudeSampler.setSource(source);`の直後に追加:

```cpp
    m_phaseSampler.setSource(source);
    m_coherenceSampler.setSource(source);
```

`onReadyRead()`を以下に置き換え:

```cpp
void DataBridge::onReadyRead()
{
    auto magnitudeJson = m_magnitudeSampler.sampleJson();
    if (!magnitudeJson.isEmpty()) {
        emit magnitudeUpdated(magnitudeJson);
    }

    auto phaseJson = m_phaseSampler.sampleJson();
    if (!phaseJson.isEmpty()) {
        emit phaseUpdated(phaseJson);
    }

    auto coherenceJson = m_coherenceSampler.sampleJson();
    if (!coherenceJson.isEmpty()) {
        emit coherenceUpdated(coherenceJson);
    }
}
```

`OpenSoundMeter.pro`の変更は不要(既存の`seriessampler.cpp`/`databridge.cpp`に追記するだけで、新規ファイルは発生しない)。

## 実装3: `web/src/main.ts`(全面書き換え)とCanvas 3面化

Magnitude 1面だけだった構成を、Magnitude/Phase/Coherenceの3面(縦積み)に拡張し、共通の描画ロジックを`drawSeries()`に切り出す。

```typescript
import './style.css'

interface SeriesPayload {
  sourceName: string
  color: string
  frequency: number[]
}
interface MagnitudePayload extends SeriesPayload { magnitudeDb: (number | null)[] }
interface PhasePayload extends SeriesPayload { phaseDeg: (number | null)[] }
interface CoherencePayload extends SeriesPayload { coherenceValue: (number | null)[] }

declare const qt: any
declare const QWebChannel: any

const XMIN = 20
const XMAX = 20000
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>OSM JS Frontend — Phase 2</h1>
  <p id="status">QWebChannel接続待ち...</p>
  <h2>Magnitude</h2>
  <canvas id="chart-magnitude" class="chart"></canvas>
  <h2>Phase</h2>
  <canvas id="chart-phase" class="chart"></canvas>
  <h2>Coherence</h2>
  <canvas id="chart-coherence" class="chart"></canvas>
`
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const canvases = {
  magnitude: document.querySelector<HTMLCanvasElement>('#chart-magnitude')!,
  phase: document.querySelector<HTMLCanvasElement>('#chart-phase')!,
  coherence: document.querySelector<HTMLCanvasElement>('#chart-coherence')!,
}

function resizeCanvas(canvas: HTMLCanvasElement, height: number) {
  const width = Math.max(600, document.body.clientWidth - 48)
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}
function resizeAll() {
  resizeCanvas(canvases.magnitude, 300)
  resizeCanvas(canvases.phase, 220)
  resizeCanvas(canvases.coherence, 160)
}
window.addEventListener('resize', resizeAll)
resizeAll()

function xForFreq(f: number, width: number) {
  return (Math.log(f) - Math.log(XMIN)) / Math.log(XMAX / XMIN) * width
}

// 汎用描画: 対数周波数軸 + ダークモード配色。
// wrapThreshold: 隣接点の差がこれを超えたら線を繋がず区切る(Phaseの±180度ラップ対策。既定は無効)。
function drawSeries(
  canvas: HTMLCanvasElement,
  frequency: number[],
  values: (number | null)[],
  color: string,
  yMin: number,
  yMax: number,
  label: string,
  wrapThreshold = Infinity
) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)

  ctx.strokeStyle = 'rgba(255,255,255,0.157)'
  ctx.lineWidth = 1
  for (const f of GRID_FREQS) {
    const x = xForFreq(f, cw)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }

  const yForValue = (v: number) => ch - (v - yMin) / (yMax - yMin) * ch

  ctx.strokeStyle = color || '#3F51B5'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  let penDown = false
  let lastValue: number | null = null
  frequency.forEach((f, idx) => {
    const v = values[idx]
    if (v === null || !Number.isFinite(v)) {
      penDown = false
      lastValue = null
      return
    }
    if (lastValue !== null && Math.abs(v - lastValue) > wrapThreshold) {
      penDown = false
    }
    const x = xForFreq(f, cw)
    const y = yForValue(v)
    if (!penDown) {
      ctx.moveTo(x, y)
      penDown = true
    } else {
      ctx.lineTo(x, y)
    }
    lastValue = v
  })
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,255)'
  ctx.font = '11px sans-serif'
  ctx.fillText(`${label}  ${yMax.toFixed(1)} .. ${yMin.toFixed(1)}`, 8, 14)

  ctx.restore()
}

function finiteRange(values: (number | null)[], padRatio = 0.1, fallbackPad = 1) {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!finite.length) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * padRatio || fallbackPad
  return { min: min - pad, max: max + pad }
}

function drawMagnitude(payload: MagnitudePayload) {
  const range = finiteRange(payload.magnitudeDb)
  if (!range) return
  drawSeries(canvases.magnitude, payload.frequency, payload.magnitudeDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}

function drawPhase(payload: PhasePayload) {
  // 表示レンジは-180..180度で固定。±180度境界のラップは区切り線として扱う(wrapThreshold=180)。
  drawSeries(canvases.phase, payload.frequency, payload.phaseDeg, payload.color, -180, 180,
    `${payload.sourceName} deg`, 180)
}

function drawCoherence(payload: CoherencePayload) {
  drawSeries(canvases.coherence, payload.frequency, payload.coherenceValue, payload.color, 0, 1,
    `${payload.sourceName} coherence`)
}

function connectWebChannel() {
  if (typeof qt === 'undefined' || !qt.webChannelTransport) {
    statusEl.textContent = 'qt.webChannelTransportが見つかりません(QWebEngineView外で開いていないか確認)'
    return
  }
  new QWebChannel(qt.webChannelTransport, (channel: any) => {
    const dataBridge = channel.objects.dataBridge
    if (!dataBridge) {
      statusEl.textContent = 'dataBridgeオブジェクトが見つかりません'
      return
    }
    statusEl.textContent = 'QWebChannel接続済み。データ待ち...'

    dataBridge.magnitudeUpdated.connect((json: string) => {
      try {
        drawMagnitude(JSON.parse(json) as MagnitudePayload)
      } catch (e) {
        console.error('magnitudeUpdated parse error', e)
      }
    })
    dataBridge.phaseUpdated.connect((json: string) => {
      try {
        drawPhase(JSON.parse(json) as PhasePayload)
      } catch (e) {
        console.error('phaseUpdated parse error', e)
      }
    })
    dataBridge.coherenceUpdated.connect((json: string) => {
      try {
        drawCoherence(JSON.parse(json) as CoherencePayload)
      } catch (e) {
        console.error('coherenceUpdated parse error', e)
      }
    })
  })
}

connectWebChannel()
```

## 実装4: `web/src/style.css`の調整

`#chart`セレクタを`.chart`に置き換え、見出し用のスタイルを追加:

```css
.chart {
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.157);
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}

h2 {
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin: 1rem 0 0.25rem;
}
```

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する(`open`では環境変数が渡らない)。
4. Magnitude/Phase/Coherenceの3チャートが縦に並んで表示され、それぞれリアルタイム(80ms周期)で更新されることを確認する。
5. Phaseチャートで、位相が±180度付近を出入りする帯域があっても、画面を縦断する不自然な直線が出ず、区切れて描画されることを確認する(実際に信号を変化させて確認するのが望ましいが、目視できない場合は`npm run build`のtsc型チェックとコードレビューで代替してよい)。
6. Coherenceチャートが0〜1の範囲で描画され、値がその範囲に収まっていることを確認する。
7. 実オーディオ入力を数分間接続したまま動作させ、クラッシュ・フリーズが起きないこと(Phase 1の修正で導入した`lock()`/`unlock()`パターンを新規2クラスでも正しく適用できているかの確認)。
8. `npm run build`(`tsc`の型チェック含む)が通ることを確認する。
9. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 2のタスクチェックリスト・完了条件を更新し、進捗表を「完了」にする。実装時に見送った簡略化(位相アンラップの簡易化、rotate無視、Coherence Normal固定、coherence連動透明度の見送り)を完了メモに明記する。
- [dev-docs/customizations.md](customizations.md)に、Phase 2で追加したファイル・JSON payloadの形状(`phaseDeg`/`coherenceValue`)を追記する(Phase 0・Phase 1のエントリと同じ見出しパターン)。
