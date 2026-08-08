# 修正プロンプト: Phase 3 — データが無い時にMagnitude/RTAだけグリッドすら描画されない不一致を解消

Phase 3(RTA/Spectrumを追加)の実装をレビューし、修正が必要な問題が1件見つかった。Phase 4に進む前にここで直す。

## 前提

C++側(`RTASeriesSampler`のロックパターン・DC成分除外・count非除算のdB計算)はPhase 3プロンプト通り正確に実装されており、問題なし。実機ビルド・起動・CDP経由での検証まで行い、`RTASeriesSampler`が実データ(60点、リファレンス不要のため他3系列と異なり有効な値)を正しく返すことも確認した。60秒間の連続動作でクラッシュもない。

## 問題: データが無い時、チャートによって「空のグリッドが出る」/「何も描画されない」が不統一

**現象**: この検証環境ではリファレンス無信号のためMagnitude/Phase/Coherenceがすべて`null`だが、CDP経由でCanvasのピクセルを比較すると:

```
chart-magnitude: nonBlack=0     (背景・グリッドすら描画されていない)
chart-rta:       nonBlack=22617 (実データがあるので通常描画)
chart-phase:     nonBlack=13026 (背景・グリッドは描画されている、線だけが無い)
chart-coherence: nonBlack=10141 (同上)
```

**原因**: `web/src/main.ts`の`drawMagnitude()`/`drawRTA()`は`finiteRange()`が`null`(有効な値が1つも無い)を返すと`drawSeries()`を呼ばずに即`return`しており、背景の黒塗り・グリッド線・ラベルを含め一切描画しない。一方`drawPhase()`/`drawCoherence()`は固定レンジ(-180..180度、0..1)を使うため`finiteRange()`を呼ばず、データの有無にかかわらず常に`drawSeries()`を呼ぶ(結果、線は無くても背景・グリッド・ラベルは表示される)。

この不整合により、リファレンス未接続などでMagnitude/RTAにデータが来ていない間、ユーザーからは「その2チャートだけ表示が壊れている(真っ暗/透明)」ように見えてしまう。データが無いこと自体は(Phase 1・Phase 2の修正通り)正しい挙動だが、**見せ方をPhase/Coherenceと揃える**必要がある。

## 修正方法: `finiteRange()`が`null`のときもフォールバック値でグリッドだけは描画する

`web/src/main.ts`の`drawMagnitude()`・`drawRTA()`を以下に置き換える(`if (!range) return`を撤去し、フォールバックのレンジを使う。`drawSeries()`自体は値が`null`/非有限ならその点を単に描画しないので、フォールバックのyMin/yMaxを渡しても実害はない):

```typescript
function drawMagnitude(payload: MagnitudePayload) {
  const range = finiteRange(payload.magnitudeDb) ?? { min: -1, max: 1 }
  drawSeries(canvases.magnitude, payload.frequency, payload.magnitudeDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}
```

```typescript
function drawRTA(payload: RTAPayload) {
  const range = finiteRange(payload.levelDb) ?? { min: -1, max: 1 }
  drawSeries(canvases.rta, payload.frequency, payload.levelDb, payload.color, range.min, range.max,
    `${payload.sourceName} dB`)
}
```

`finiteRange()`関数自体(nullを返す実装)は変更不要。

## 検証方法

1. CLAUDE.mdの手順でビルドする。
2. `cd web && npm run dev`を起動しておき、`OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で実機確認する。
3. リファレンス未接続/無音状態(この検証環境で再現できた状態)で、Magnitude/RTAチャートも他2チャートと同様に背景・グリッド・ラベルが表示され(線だけが無い状態)、真っ黒/透明にならないことを確認する(CDP経由で各`<canvas>`の`getImageData`を取り、`nonBlack`が0にならないことを確認するのが確実)。
4. 実オーディオ入力(データ・リファレンスとも有効)がある状態で、Magnitude/RTAが以前通り正しい曲線で描画されることを確認する(この修正で表示自体が壊れていないか)。
5. `npm run build`(tscの型チェック含む)が通ることを確認する。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 3の完了メモに、この修正内容(Magnitude/RTAのグリッド未描画を解消し、データ有無に関わらず4チャートの見た目を統一したこと)を追記する。
- [dev-docs/customizations.md](customizations.md)のPhase 3エントリに、この修正を追記する。
