# 実装プロンプト: フロントエンドJS化 Phase 4(Spectrogramを追加)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 4を実装するための指示書。Phase 1〜3(Magnitude/Phase/Coherence/RTA)は完了・レビュー済み。Phase 4はSpectrogramチャートを追加する。[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 3.2節・3.3節の通り、51行の履歴バッファ/スクロール描画という他4チャートと異なる設計が必要なため最後に着手する。

## 前提・スコープの確認

`src/chart/opengl/spectrogramseriesrenderer.cpp`・`src/chart/spectrogramplot.h`を調査した結果:

- Spectrogramも**`module(i)`(単一チャンネル)を使う**ため、RTAと同様**リファレンスチャンネル不要**。この検証環境ではリファレンス無信号でMagnitude/Phase/Coherenceがnullになる状態でも、RTAと同じく実データで確認できるはず。
- 値の算出は`10 * log10f(value)`(RTAと同じくcountで割らない、バンド内エネルギー合計)。DC成分(`i==0`)を除外する点もRTAと同じ。
- **無音時の扱いがMagnitude/RTAと異なる**: 非有限値やフロア(`-140dB`)未満は`std::isnormal`チェックで**フロア値(-140dB)にクランプ**する(`spectrogramseriesrenderer.cpp` 113〜115行目)。ヒートマップは全セルに色が必要なため、Magnitude/Phase/RTAのように`null`にする設計とは意図的に異なる。**Phase 4でもクランプ方式を踏襲し、nullは使わない。**
- 色は`lower`(既定-70dB)〜`upper`(既定-10dB)の閾値で**青→緑→黄→赤**の4段階グラデーション(`lower`未満は非表示、`upper`以上は赤固定)。既定値は`src/chart/spectrogramplot.cpp`の`DEFAULT_DB_LOWER = -70`・`DEFAULT_DB_UPPER = -10`で、Phase 4では固定値として扱う(「コントロールなし」の方針)。
- 履歴は最大51行の`std::deque`。**描画方式そのものをQML版から変える**([js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 2.3節の通り、QML版は毎フレーム全メッシュ再構築だが、JS版は`putImageData`/`drawImage`によるオフスクリーンImageDataの1行スクロール+1行追記にする、既にjs-frontend-phases.md Phase 4に記載の通り)。**C++側は51行分の履歴を保持しない**(既存の`history`相当のバッファはJS側だけが持つ)。DataBridgeは新規1行分のデータだけをpushする。

## 実装1: `src/chart/seriessampler.h` / `.cpp`に`SpectrogramSeriesSampler`を追加

`src/chart/seriessampler.h`の`RTASeriesSampler`の直後に追加:

```cpp
class SpectrogramSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit SpectrogramSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"sourceName","frequency":[...],"levelDb":[...]} の1行分のJSON文字列。
    // 無音/未接続の帯域はnullにせず-140dB(フロア)へクランプする(ヒートマップは全セルに色が必要なため)。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};
```

`src/chart/seriessampler.cpp`の末尾(`RTASeriesSampler`の実装の後、`} // namespace Chart`の前)に追加:

```cpp
SpectrogramSeriesSampler::SpectrogramSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void SpectrogramSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &SpectrogramSeriesSampler::source() const
{
    return m_source;
}

QString SpectrogramSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    constexpr float floor = -140.f;
    QJsonArray frequency, levelDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            if (i == 0) {
                return; // DC成分を除外(spectrogramseriesrenderer.cppと同じ)
            }
            auto m = m_source->module(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &levelDb](const float &bandStart, const float &bandEnd,
        const unsigned int &) {
            auto db = 10.0 * std::log10(value);
            // 無音/未接続でもnullにせずフロアへクランプする(Magnitude/Phase/RTAと異なり、
            // ヒートマップは全セルに色が必要なため。spectrogramseriesrenderer.cppと同じ方針)。
            if (!std::isfinite(db) || db < floor) {
                db = floor;
            }
            frequency.append((bandStart + bandEnd) / 2.0);
            levelDb.append(db);
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
    payload["frequency"] = frequency;
    payload["levelDb"] = levelDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}
```

## 実装2: `src/chart/databridge.h` / `.cpp`の拡張

`databridge.h`: `RTASeriesSampler m_rtaSampler;`の下に`SpectrogramSeriesSampler m_spectrogramSampler;`を追加、`signals:`に追加:

```cpp
    void spectrogramRowUpdated(const QString &json);
```

`databridge.cpp`の`setSource()`に、`m_rtaSampler.setSource(source);`の直後に追加:

```cpp
    m_spectrogramSampler.setSource(source);
```

`onReadyRead()`の末尾(`rtaUpdated`のemitの後)に追加:

```cpp
    auto spectrogramJson = m_spectrogramSampler.sampleJson();
    if (!spectrogramJson.isEmpty()) {
        emit spectrogramRowUpdated(spectrogramJson);
    }
```

`OpenSoundMeter.pro`の変更は不要。

## 実装3: `web/src/main.ts`にSpectrogramチャートを追加

型定義を追加(`color`フィールドは無し。値ごとの色分けのため単一のソース色は使わない):

```typescript
interface SpectrogramPayload {
  sourceName: string
  frequency: number[]
  levelDb: number[]
}
```

HTML(`#app`のinnerHTML)に追加(RTAの直後などに配置):

```html
  <h2>Spectrogram</h2>
  <canvas id="chart-spectrogram" class="chart"></canvas>
```

`canvases`に`spectrogram: document.querySelector<HTMLCanvasElement>('#chart-spectrogram')!,`を追加。`resizeAll()`に`resizeCanvas(canvases.spectrogram, 220)`を追加。**注意**: `canvas.width`/`height`を変更するとブラウザの仕様でCanvasの内容は消去される(スクロール履歴が失われる)。Phase 4ではウィンドウリサイズ時に履歴が消えることを許容する(この制約は完了メモに明記すること)。

Spectrogram専用の定数・色マップ・描画関数を追加(既存の`drawSeries`等とは独立した関数にする):

```typescript
const SPECTROGRAM_ROWS = 51
const SPEC_LOWER = -70
const SPEC_UPPER = -10
const COLOR_BLUE: [number, number, number] = [33, 150, 243]
const COLOR_GREEN: [number, number, number] = [139, 195, 74]
const COLOR_YELLOW: [number, number, number] = [255, 235, 59]
const COLOR_RED: [number, number, number] = [244, 67, 54]

function mixColor(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i] + k * (b[i] - a[i])) as [number, number, number]
}

// src/chart/opengl/spectrogramseriesrenderer.cppの配色ロジックを移植。
// lower未満は背景色(黒)に揃えて見えなくする(元のalpha=0相当。putImageDataでの
// スクロール時に透明ピクセルだと過去の行が透けて残ってしまうため、透明ではなく
// 不透明な黒で塗る)。
function spectrogramColor(db: number): string {
  if (db <= SPEC_LOWER) return 'rgb(0,0,0)'
  const seg = (SPEC_UPPER - SPEC_LOWER) / 3
  let rgb: [number, number, number]
  if (seg <= 0 || db >= SPEC_UPPER) {
    rgb = COLOR_RED
  } else if (db < SPEC_LOWER + seg) {
    rgb = mixColor(COLOR_BLUE, COLOR_GREEN, (db - SPEC_LOWER) / seg)
  } else if (db < SPEC_LOWER + 2 * seg) {
    rgb = mixColor(COLOR_GREEN, COLOR_YELLOW, (db - (SPEC_LOWER + seg)) / seg)
  } else {
    rgb = mixColor(COLOR_YELLOW, COLOR_RED, (db - (SPEC_LOWER + 2 * seg)) / seg)
  }
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`
}

// 新しい1行を最上部に追加し、既存の内容を1行分下へスクロールする。
// devicePixelRatioのscale変換はせず、Canvasの実ピクセル(canvas.width/height)を直接使う。
function drawSpectrogramRow(payload: SpectrogramPayload) {
  const canvas = canvases.spectrogram
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width
  const ch = canvas.height
  const rowHeight = Math.max(1, Math.floor(ch / SPECTROGRAM_ROWS))

  if (ch > rowHeight) {
    const img = ctx.getImageData(0, 0, cw, ch - rowHeight)
    ctx.putImageData(img, 0, rowHeight)
  }

  const n = payload.frequency.length
  for (let i = 0; i < n; i++) {
    const prevX = i > 0 ? xForFreq(payload.frequency[i - 1], cw) : 0
    const curX = xForFreq(payload.frequency[i], cw)
    const nextX = i < n - 1 ? xForFreq(payload.frequency[i + 1], cw) : cw
    const xStart = i > 0 ? (prevX + curX) / 2 : 0
    const xEnd = i < n - 1 ? (curX + nextX) / 2 : cw
    ctx.fillStyle = spectrogramColor(payload.levelDb[i])
    ctx.fillRect(xStart, 0, Math.max(1, xEnd - xStart), rowHeight)
  }
}
```

`connectWebChannel()`内に購読を追加:

```typescript
    dataBridge.spectrogramRowUpdated.connect((json: string) => {
      try {
        drawSpectrogramRow(JSON.parse(json) as SpectrogramPayload)
      } catch (e) {
        console.error('spectrogramRowUpdated parse error', e)
      }
    })
```

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する。
4. Spectrogramチャートが表示され、新しい行が上部に追加されながら過去の行が下へスクロールしていくことを確認する(RTAと同様、リファレンス不要なのでこの検証環境でも実データが見えるはず)。
5. 51行を超えて動作させ続けても(数分間)、描画が崩れず、クラッシュ・フリーズが起きないことを確認する(スクロール処理の累積誤差・メモリリークが無いか)。
6. 無音/低レベル帯域が背景色(黒)に近い色で、大きな信号がある帯域が青→緑→黄→赤のグラデーションで表示されることを確認する。
7. ウィンドウをリサイズし、履歴が消える(仕様として許容)ものの、クラッシュせず新しい行から正常に描画が再開されることを確認する。
8. `npm run build`(tscの型チェック含む)が通ることを確認する。
9. `OSM_JS_FRONTEND`を設定しない通常起動で、既存機能に変化がないことを確認する(回帰確認)。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 4のタスクチェックリスト・完了条件を更新し、進捗表を「完了」にする。QML版と描画方式が異なる点(毎フレーム全メッシュ再構築 vs 1行スクロール)、ウィンドウリサイズで履歴が消える制約を完了メモに明記する。
- [dev-docs/customizations.md](customizations.md)に、Phase 4で追加したファイル・JSON payloadの形状(`levelDb`、フロアクランプ方式)を追記する。
- Phase 4完了時点で5チャート全ての実装が揃うため、[js-frontend-phases.md](js-frontend-phases.md)の全体進捗サマリ文(冒頭)も更新すること。
