# TFC Window実装 Phase分割計画

[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md)の設計内容を、実装・検証の単位でPhaseに分割したもの。各Phaseは独立してビルド・動作確認できる粒度にしてあり、[customizations.md](customizations.md)に記載の個人開発の方針(コミット・pushを都度連動してよい)に沿って、Phase単位でコミットしていくことを想定している。

Phase 4のQML UI実装まで完了済み。Phase 5の結合・負荷検証は未着手。

## 進捗状況

| Phase | 内容 | 状態 |
|---|---|---|
| Phase 1 | `FourierTransform`層の拡張(コア計算ロジック) | 完了 |
| Phase 2 | `Measurement`/`Meta::Measurement`層の配線 | 完了 |
| Phase 3 | ドキュメント更新(インパルス応答側の非対称性の明文化) | 完了 |
| Phase 4 | QML UI実装 | 完了 |
| Phase 5 | 結合・負荷検証 | 未着手 |

実装を進めるたびに、この表の「状態」列(未着手/着手中/完了)を更新すること。

---

## Phase 1: `FourierTransform`層の拡張(コア計算ロジック)

**目的**: TFCの核心である「周波数に反比例した窓長決定」を`FourierTransform`単体に実装する。`Measurement`層・UIとは独立して実装・検証できる、最もリスクが高い部分を最初に固める。

**対象ファイル**: `src/math/fouriertransform.h`、`src/math/fouriertransform.cpp`

**タスク**:
- [x] `m_tfcEnabled` / `m_tfcReferenceTime` / `m_tfcReferenceFrequency`メンバ追加
- [x] `setTfcEnabled(bool)` / `setTfcReferenceTime(float ms)` / `setTfcReferenceFrequency(float hz)`のsetter・getter追加
- [x] `prepareLog()`の計算順序変更: `frequency_i`(対数グリッド)を先に計算し、その後で窓長`N_i`を決定する形に入れ替える([tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.1節)
- [x] TFC有効時の`N_i`算出式実装: `C = (T_ref[ms]/1000) * f_ref[Hz]`、`N_i = round(C / frequency_i)`(同3.2節)。無効時は既存の`N = startWindow * pow(wFactor, i) / m_logWindowDenominator`のまま
- [x] バッファサイズの動的計算: 全ビンの`frequency_i`から`N_max`を求め、`setSize(std::max(startWindow, N_max))`(同3.3節)
- [x] 上限クランプ(2秒相当)・下限クランプ(8サンプル)の実装

**完了条件・検証方法**:
- reference time/frequencyを変えて`m_logBasis[i].N`をログ出力し、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.2節の検算例(`T_ref=10ms@1kHz`で8kHz→1.25ms、125Hz→80ms)と一致することを確認
- 44.1kHz/48kHz/96kHzなど異なるサンプルレートでも数式通りにスケールすることを確認
- TFC無効時(`m_tfcEnabled=false`)の既存Log(LTW)の挙動が一切変化していないことを回帰確認(既存の`Windowing`ソースのLTW1/2/3が今まで通り動くこと)

**依存Phase**: なし(最上流)

**注意点**: [tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 5.1節(計算負荷)・5.2節(後方互換性)を参照。数式の誤りは後続の全Phaseに波及するため、単体検証を丁寧に行うこと。

---

## Phase 2: `Measurement` / `Meta::Measurement`層の配線

**目的**: Phase 1で実装したTFCロジックを、実際の測定パイプライン(`Measurement`)から利用できるようにする。

**対象ファイル**: `src/meta/metameasurement.h`、`src/meta/metameasurement.cpp`、`src/source/measurement.h`、`src/source/measurement.cpp`

**タスク**:
- [x] `Meta::Measurement::Mode`に`TFC`を追加(`enum Mode {FFT10..FFT16, LFT, TFC};`)
- [x] `m_modeMap`に`{Measurement::TFC, "TFC"}`を追加(`m_FFTsizes`には追加しない、`LFT`と同様)
- [x] `tfcReferenceTime`の`Q_PROPERTY`・シグナル追加。reference frequencyは1kHz固定
- [x] `updateFftPower()`に`case Mode::TFC:`追加(reference timeと1000Hzを伝搬)
- [x] TFCモード中のreference time変更時に`prepareLog()`を再実行
- [x] `toJSON()`/`fromJSON()`に`tfc.referenceTime`を追加
- [x] `clone()`に対応するプロパティのコピーを追加

**完了条件・検証方法**:
- Transform modeをTFCに切り替え、Magnitude/Phase/Coherenceチャートが破綻なく表示されること
- モードをTFC⇄LFT⇄Fast(FFT10等)で往復させ、`m_tfcEnabled`のフラグ残留がないこと(LFTに戻したときTFCの窓長計算式が使われていないこと)
- プロジェクトファイルの保存・読み込みで`tfcReferenceTime`が保持され、旧`tfc.referenceFrequency`キーは無視されること

**依存Phase**: Phase 1完了後

---

## Phase 3: ドキュメント更新(インパルス応答側の非対称性の明文化)

**目的**: コード変更は行わず、`dev-docs/measurement-types.md`の記述をTFC実装後の実態に合わせて更新する。

**対象ファイル**: `dev-docs/measurement-types.md`

**タスク**:
- [x] LTWモードの説明(「対数軸の変換、内部的に4096点相当」)を、Magnitude側とインパルス応答側で非対称であることが分かる表現に修正
- [x] TFCモードの説明を追加し、インパルス応答/Stepチャートは引き続き固定長(4096点)Fast FFTのままであることを明記([tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.5節を要約)

**完了条件・検証方法**: 記述がPhase 1・Phase 2で実装した実際の挙動と一致していること

**依存Phase**: Phase 2完了後(実装が固まってから記述する。Phase 1と並行して下書きに着手してもよい)

---

## Phase 4: QML UI実装

**目的**: `MeasurementProperties.qml`にTFCモードの選択肢と、1kHzでのreference timeを設定するUIを追加する。

**対象ファイル**: `qml/source/MeasurementProperties.qml`

**タスク**:
- [x] Transform modeドロップダウンに"TFC"表示を追加(`Measurement.TFC`選択時の`displayText`分岐)
- [x] reference time用`FloatSpinBox`追加(`WindowingProperties.qml`の`wideSpinBox`パターンを踏襲、単位ms)
- [x] reference frequencyは1kHz固定とし、調整UIを設けない
- [x] reference timeスピンボックスにTFC時の条件表示と`indicators: false`を設定
- [x] reference timeの外部変更・初期値を再同期
- [x] `windowSelect`(window function選択)は既存通り非表示のまま据え置く([customizations.md](customizations.md)のHann固定方針を維持)

**完了条件・検証方法**:
- モード切替でスピンボックスの表示/非表示が正しく切り替わること
- 起動直後・プロジェクトファイル読み込み直後に、スピンボックスの表示値が実際の設定値と一致していること
- スピンボックスをドラッグ操作した際にUIがフリーズしないこと

**依存Phase**: Phase 2完了後

---

## Phase 5: 結合・負荷検証

**目的**: 実機・実オーディオ入力での動作確認とパフォーマンス検証。コード変更は基本的に発生しない想定(検証中に見つかった不具合の修正のみ)。

**対象ファイル**: なし(検証のみ)

**タスク**:
- [ ] 実オーディオ入力を繋いだ状態で、reference timeを下限・上限付近にしてリアルタイム更新(80ms周期)が破綻しない(処理落ち・UIフリーズがない)ことを確認([tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 5.1節)
- [ ] CLAUDE.md記載の動作確認手順(アプリ終了→ビルド→起動→ユーザー確認)に従って確認
- [ ] 1/3 oct・1/6 octなどのオクターブスムージングとの併用が問題なく動作すること([tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 7節)
- [ ] 既存のFast FFTモード・LTW(LFT)モード・`Windowing`ソース(LTW1/2/3)に副作用が出ていないことの回帰確認

**完了条件**: ユーザーによる動作確認完了

**依存Phase**: Phase 1〜4完了後
