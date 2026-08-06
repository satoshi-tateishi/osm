# 実装プロンプト: TFC Window — Phase 3 (ドキュメント更新: インパルス応答側の非対称性の明文化)

このファイルは、[tfc-window-phases.md](tfc-window-phases.md)のPhase 3を実装するための、そのまま実行に使えるプロンプト。新しいセッションでこのプロンプトを渡せば、以降のタスクに着手できるよう、必要な背景情報を全てこのファイル内に含めている。

## 前提: Phase 1・Phase 2は完了・レビュー済み

- Phase 1(`src/math/fouriertransform.h`/`.cpp`): `FourierTransform`にTFC(Time-Frequency-Constant Window)の窓長計算ロジックを実装済み。
- Phase 2(`src/meta/metameasurement.h`/`.cpp`、`src/source/measurement.h`/`.cpp`、`src/remote/items/measurementitem.h`): `Meta::Measurement::Mode`に`TFC`を追加し、`Measurement::updateFftPower()`から`FourierTransform`のTFC機能を呼び出せる状態(C++レベルでは完全に配線済み)。`tfcReferenceTime`/`tfcReferenceFrequency`のQ_PROPERTYもあり、プロジェクトJSONへの保存・復元・`clone()`にも対応済み。

**ただし、QML UI(`qml/source/MeasurementProperties.qml`)のTransform modeドロップダウンにはまだ"TFC"の選択肢が出てこない(Phase 4で追加予定)。** つまり現時点では、TFCは「エンジンとしては完全に動くが、通常の操作ではまだ選択できない」状態。このPhaseで書くドキュメントは、この状態を正確に反映すること(UIから使えるかのように書かない。かといって存在しないかのように省略もしない)。

## 今回のタスク: **コード変更は一切行わない**、ドキュメントのみの更新

**対象ファイル**: `dev-docs/measurement-types.md`

このファイルはOSMの測定タイプ・設定項目をUIの構成に沿って説明するリファレンスドキュメントで、Phase 1着手前に書かれたもの。TFC実装によって生じた実態との差分を埋めるのが目的。

## 現状の記述(該当箇所、確認済み)

### 1節の表内、Transform modeの行(34行目)

```
| Transform mode | `10`〜`16` / `LTW` | FFTサイズを`2^N`サンプルで指定(`10`=1024〜`16`=65536)。値が大きいほど周波数分解能は上がるが時間分解能・応答速度は下がる。`LTW`(`Meta::Measurement::Mode::LFT`)はFFTではなく対数軸の変換(`FourierTransform::Log`、内部的に4096点相当)を使い、低域の分解能を保ちつつ応答を速くする特殊モード |
```

「内部的に4096点相当」という表現が、**Magnitude/Phase/Coherence等の周波数領域の計算(実際には`FourierTransform::Log`のビンごと可変長窓、`ppo=24 × octaves=11`=264ビン、最大窓長は65536サンプル起点)と、インパルス応答/Stepチャート(常に固定4096点=`FFT12`のFast FFT)とで、全く別の変換が使われているという非対称性**を正確に反映していない(あたかも両方とも4096点相当であるかのように読める)。これは[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 2.3節・3.5節で調査済みの既存の仕様(TFC実装以前からLTWモードに存在する非対称性)。

### 4節、Impulse/Stepの説明(96行目・98行目)

```
- **Impulse**(インパルス応答): 測定/基準の相互相関(デコンボリューション)から求めた時間領域のインパルス応答。X軸はms。Y軸モードは`Linear`/`Log`、`normalize`で振幅を正規化表示。時間軸のウィンドウ処理やディレイ確認、後述のStepの元データになる。

- **Step**(ステップ応答): インパルス応答の積分(累積)。立ち上がり特性やスピーカーの過渡応答・極性確認に使う。`integration zero point`(ms)で積分の基準時刻を指定。
```

現状、LTW/TFCモードでもインパルス応答が別の変換を使っていることには一切触れていない。

## 実装する変更

### 1. Transform modeの行(34行目)を修正

「内部的に4096点相当」という表現をやめ、**Magnitude/Phase/Coherence側とインパルス応答側で使う変換が異なる**ことが一読して分かるように書き換える。あわせて`TFC`モードの説明も同じ行(または表の直後に注記として)追加する。

含めるべき内容(文面はそのままコピーせず、既存の文体・粒度に合わせて自然に書くこと):

- `LTW`: Magnitude/Phase/Coherence等の周波数領域計算では`FourierTransform::Log`(対数周波数グリッド、ビンごとに異なる窓長)を使う。窓長は`wFactor`/`fFactor`という固定係数で決まる、独自のハイブリッド則(厳密なConstant-QでもTFCでもない)。
- `TFC`(Time-Frequency-Constant Window): `LTW`と同じ`FourierTransform::Log`の仕組みを使うが、窓長の決定式だけが異なる。基準周波数`f_ref`における基準窓時間`T_ref`を指定すると、任意の周波数`f`の窓長が`T(f) = T_ref * (f_ref/f)`(`T(f)*f`が一定)という物理的に厳密な反比例関係で決まる、AFMG SysTuneの"TFC Window™"相当の機能。**現時点ではUIのTransform modeドロップダウンからは選択できない**(エンジン側の実装は完了しているが、UI配線はPhase 4で追加予定)。
- どちらのモードも、**インパルス応答/Stepチャートは対象外**であること(次項に誘導)。

### 2. Impulse/Stepの説明(96行目・98行目)に非対称性を明記

Impulseの説明冒頭あたりに、「Transform modeが`LTW`/`TFC`のいずれであっても、インパルス応答/Stepチャートの計算自体は常に固定長(4096点、`FFT12`)のFast FFTを使う(`FourierTransform::Log`の可変長窓の恩恵を受けない)」という趣旨の一文を追加する。

背景説明として、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.5節の理由(以下要約、必要なら参照する形でもよい)を踏まえるとよい:

1. TFCの主眼はMagnitude/Phase/Coherence表示にあり、インパルス応答は別のFFTサイズで見るのが一般的な使い方
2. ビンごとに時間分解能が異なる変換結果から単一の時間軸を持つ実数インパルス応答へ逆変換するのは数学的に非自明(既存`Deconvolution`の「複素除算→単一逆FFT」という単純な構造を再利用できない)
3. 既存のLTW/Logモードで既にこの非対称性を受け入れて運用されている実績がある

## 完了条件・検証方法

[tfc-window-phases.md](tfc-window-phases.md) Phase 3の完了条件: 「記述がPhase 1・Phase 2で実装した実際の挙動と一致していること」。具体的には以下を満たすこと。

- `measurement-types.md`を読んだだけで、「Magnitude/Phase/Coherence側の分解能はLTW/TFCで変わるが、インパルス応答/Stepは変わらない(常に4096点)」という非対称性が誤解なく伝わること。
- TFCモードの説明が、現時点でUIから選択できない(Phase 4待ち)ことを含めて実態と食い違っていないこと。
- コード(`src/`以下)への変更が一切ないこと(`git diff --stat`で`dev-docs/`以外に差分が出ないこと)。

## やらないこと(スコープ外)

- `src/`以下のコード変更(今回はドキュメントのみ)
- QML UIの変更(Phase 4)
- `Measurement`/`FourierTransform`層への追加変更(Phase 1・2で完了済み)

## 完了後の作業

- [tfc-window-phases.md](tfc-window-phases.md)の進捗状況テーブルで、Phase 3を「完了」に更新する。
- [dev-docs/customizations.md](dev-docs/customizations.md)への追記は必須ではない(今回はドキュメントの修正のみで、アプリの挙動変更ではないため)が、記述内容に実装解釈上の補足を加えた場合はそちらにも一言残すと親切。
