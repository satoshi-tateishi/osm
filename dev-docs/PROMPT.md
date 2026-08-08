# 修正プロンプト: Phase 1 — データ競合の解消と無音時のnull処理

Phase 1(Magnitude単体疎通)の実装をレビューし、修正が必要な問題が2件見つかった。Phase 2に進む前にここで直しておく(Phase 2のPhase/Coherence用サンプラーも同じパターンを複製するため、放置すると同じ不具合が増殖する)。

## 前提

レビューは実機ビルド・起動・CDP経由でのCanvas描画確認まで行い、パイプライン自体(QWebChannel接続・`magnitudeUpdated`受信・Canvas描画)は正しく動作していることを確認済み(ユーザー指示により、QML版との突き合わせ検証はここでは行っていない)。以下はコードレビューで見つかった、実行時に問題を起こしうる箇所。

## 修正1(重要): `MagnitudeSeriesSampler::sampleJson()`がソースデータをロックせずに読んでいる

**問題**: `src/chart/seriessampler.cpp`の`sampleJson()`は`m_source->magnitudeRaw(i)`・`frequencyDomainSize()`等を、`m_source->lock()`を取得せずに読んでいる。

**根拠**: `src/chart/opengl/seriesrenderer.cpp`(211〜213行目)は同じデータを読む`renderSeries()`の呼び出しを必ず`m_source->lock(); renderSeries(); m_source->unlock();`で挟んでいる。`Measurement::transform()`(`src/source/measurement.cpp`)は専用スレッド`m_timerThread`上で動作し、`lock(); …(m_ftdataの更新)…; unlock(); emit readyRead();`という順序でデータを更新してからシグナルを出す。`DataBridge::onReadyRead()`はデフォルトの`Qt::AutoConnection`によりGUIスレッドでキュー経由実行されるため、`emit`された時点から実際にスロットが実行されるまでにタイムラグがあり、その間に次の80ms周期の`transform()`が既に`m_ftdata`の書き換えを始めている可能性がある。ロックなしで`std::vector`(`Abstract::Data::m_ftdata`)を読むと、書き換え中の読み取りという未定義動作(最悪クラッシュ)になりうる。`Data::lock()`/`unlock()`は`std::mutex m_dataMutex`(`src/abstract/data.h`)を介しており、`setFrequencyDomainData()`自体はロックを取らず、呼び出し側(`Measurement::transform()`)の`lock()`/`unlock()`に依存する設計になっている。

**修正方法**: `src/chart/seriessampler.cpp`の`sampleJson()`で、`frequencyDomainSize()`のチェックから`iterate()`呼び出しまでを`m_source->lock()`/`m_source->unlock()`で囲む(`seriesrenderer.cpp`と同じパターン)。`active()`は`std::atomic<bool>`(`src/abstract/source.h`)なのでロック不要、この判定だけロックの外に残してよい。

```cpp
QString MagnitudeSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, magnitudeDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            auto m = m_source->magnitudeRaw(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &magnitudeDb](const float &bandStart, const float &bandEnd,
        const unsigned int &count) {
            auto db = 10.0 * std::log10(value / count);
            frequency.append((bandStart + bandEnd) / 2.0);
            // magnitudeRaw==0(無音/未接続)の帯域は-Infinityになる。QJsonValueは非有限doubleを
            // 自動的にnullへ変換するので、JS側でnullを「データなし」として扱う前提でそのまま渡す。
            magnitudeDb.append(std::isfinite(db) ? QJsonValue(db) : QJsonValue());
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
    payload["magnitudeDb"] = magnitudeDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}
```

`#include <QJsonValue>`は`<QJsonArray>`経由で既に利用可能(明示追加は不要だが、気になる場合は追加してよい)。`<cmath>`の`std::isfinite`は既存の`#include <cmath>`で足りる。

## 修正2(軽微): JS側で無音(null)を0として描画してしまう

**問題**: `web/src/main.ts`の`drawMagnitude()`は`payload.magnitudeDb`(number配列)を前提に`Math.min(...)`/`Math.max(...)`やY座標計算をしているが、修正1で`null`が混ざりうることが明確になった。JS上で`null`は数値コンテキストで`0`に暗黙変換されるため、無音区間があると波形が0dB付近へ不自然にスパイクする。

**修正方法**: `MagnitudePayload`の型を`magnitudeDb: (number | null)[]`に変更し、`drawMagnitude()`で以下のように対応する。

```typescript
interface MagnitudePayload {
  sourceName: string
  color: string
  frequency: number[]
  magnitudeDb: (number | null)[]
}
```

```typescript
function drawMagnitude(payload: MagnitudePayload) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width / devicePixelRatio
  const ch = canvas.height / devicePixelRatio
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)

  ctx.strokeStyle = 'rgba(255,255,255,0.157)'
  ctx.lineWidth = 1
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const x = xForFreq(f, cw)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }

  const finiteDb = payload.magnitudeDb.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!finiteDb.length) {
    ctx.restore()
    return
  }

  const magMin = Math.min(...finiteDb)
  const magMax = Math.max(...finiteDb)
  const pad = (magMax - magMin) * 0.1 || 1
  const yMin = magMin - pad
  const yMax = magMax + pad
  const yForDb = (db: number) => ch - (db - yMin) / (yMax - yMin) * ch

  ctx.strokeStyle = payload.color || '#3F51B5'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  let penDown = false
  payload.frequency.forEach((f, idx) => {
    const db = payload.magnitudeDb[idx]
    if (db === null || !Number.isFinite(db)) {
      penDown = false // 無音区間はギャップにする(0へスパイクさせない)
      return
    }
    const x = xForFreq(f, cw)
    const y = yForDb(db)
    if (!penDown) {
      ctx.moveTo(x, y)
      penDown = true
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,255)'
  ctx.font = '11px sans-serif'
  ctx.fillText(`${payload.sourceName}  ${yMax.toFixed(1)} .. ${yMin.toFixed(1)} dB`, 8, 14)

  ctx.restore()
}
```

他の箇所(`connectWebChannel`等)は変更不要。

## 検証方法

1. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
2. `cd web && npm run dev`を起動しておき、`OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する(通常の`open`では環境変数が渡らない点に注意)。
3. 実オーディオ入力を数分間接続したまま動かし、クラッシュ・フリーズが起きないことを確認する(修正1がロック漏れの解消になっているかの実質的な確認。データ競合はタイミング依存で毎回再現するとは限らないため、長めに動かす)。
4. 入力デバイスを未接続/ミュートにするなどしてMagnitudeが無音に近い状態を作り、波形が0dB付近へスパイクせず、該当区間が途切れる(またはグラフに描画されない)ことを確認する。
5. 通常の音声入力に戻し、Phase 1で確認済みの描画(ダークモード配色・曲線描画)が引き続き問題ないことを確認する。
6. `npm run build`(`tsc`の型チェック含む)が通ることを確認する。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 1の完了メモに、レビューで見つかった上記2件の修正を追記する。
- [dev-docs/customizations.md](customizations.md)のPhase 1エントリに、この修正の内容を追記するか、同エントリを更新する。
