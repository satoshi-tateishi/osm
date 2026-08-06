# 修正プロンプト: TFC Window — Phase 4のレイアウト不具合修正 + reference frequencyの固定化

このファイルは、実装済みのPhase 4(QML UI)に対する2件の修正指示。ユーザーによる実機確認で見つかった不具合1件と、設計方針の変更1件を含む。

## 前提

Phase 1〜4のコードは動作としては成立している(実機起動・TFCモード選択・チャート表示まで確認済み)。今回の修正は「動かないバグ」ではなく、UIの見た目の不具合と、UI設計そのものの簡素化。

## 修正1: reference time/frequencyスピンボックスのインジケータ(+/-ボタン)が入力欄と重なる

**現象(ユーザー提供のスクリーンショットで確認)**: `qml/source/MeasurementProperties.qml`に追加した`tfcReferenceTimeSpinBox`/`tfcReferenceFrequencySpinBox`(2つとも`Layout.preferredWidth: elementWidth`、`indicators`未指定=デフォルト`true`)は、幅が狭いため増減インジケータボタンが数値テキストと重なって表示される。

**原因**: 同ファイル内の`offsetSpinBox`/`gainSpinBox`(222-250行目)は同じ`FloatSpinBox`コンポーネントを使いながら`indicators: false`を明示しており、増減ボタンを出さずテキスト入力のみにすることで、狭い幅でも重ならないようにしている。今回追加した2つのスピンボックスにはこの指定が漏れていた。

**修正方法**: `tfcReferenceTimeSpinBox`(修正2でreference frequency側は削除するため、実質こちらのみ残る)に`indicators: false`を追加する。`offsetSpinBox`/`gainSpinBox`と同じ見た目・操作感に揃える。

## 修正2: reference frequencyをユーザー調整不可にし、1000Hz固定にする

**背景**: `dev-docs/systune-rtd.md`の調査メモ(ProSoundWebのSysTune技術記事の要約)によれば、「ユーザーが操作するのは基準周波数(例: 1kHz)における窓長という**1つのスケールパラメータのみ**」とされており、SysTune本家でも基準周波数自体はユーザー操作対象ではなく固定値(1kHz)である可能性が高いと判断した(AFMGの一次資料までは確認できていないが、1kHzは音響測定における標準的な基準周波数でもあり、妥当な設計判断)。数式`C = T_ref[s] × f_ref`は`f_ref`を固定しても`T_ref`だけで実用上必要な表現力を保てる。

この判断に基づき、**reference frequencyをユーザーが調整できるプロパティとして持つ設計をやめ、1000Hz固定の内部定数にする**。中途半端に「値は保持するがUIだけ隠す」のではなく、以降のコードに残る混乱を避けるため、Phase 1(`FourierTransform`)を除く上位層から`tfcReferenceFrequency`関連のプロパティ・シグナル・永続化コードを削除する。

### 変更しないもの

- `src/math/fouriertransform.h`/`.cpp`: `setTfcReferenceFrequency(float hz)`/`tfcReferenceFrequency() const`はそのまま残す(Phase 1で確立済みの、より汎用的なAPI。上位層からは常に`1000.f`を渡すだけにする)。

### 変更するもの

#### `src/meta/metameasurement.h`/`.cpp`

- `tfcReferenceFrequency()`/`setTfcReferenceFrequency(float)`のpublic宣言、`virtual void tfcReferenceFrequencyChanged(float) = 0;`、`std::atomic<float> m_tfcReferenceFrequency;`メンバを削除。
- コンストラクタ初期化リストの`m_tfcReferenceFrequency(1000.f)`部分を削除(`m_tfcReferenceTime(10.f)`は残す)。
- `tfcReferenceFrequency()`/`setTfcReferenceFrequency()`の実装(108-131行目付近、`tfcReferenceTime()`と対になっている片方)を削除。

#### `src/source/measurement.h`/`.cpp`

- `Q_PROPERTY(float tfcReferenceFrequency READ tfcReferenceFrequency WRITE setTfcReferenceFrequency NOTIFY tfcReferenceFrequencyChanged)`を削除。
- `void tfcReferenceFrequencyChanged(float) override;`(signals節)を削除。
- `m_currentTfcReferenceFrequency`メンバを削除。
- `updateFftPower()`の`tfcParamsChanged`判定から`tfcReferenceFrequency`比較を外し、`tfcReferenceTime`のみで判定するようにする。`case Mode::TFC:`内の`m_dataFT.setTfcReferenceFrequency(m_currentTfcReferenceFrequency);`を`m_dataFT.setTfcReferenceFrequency(1000.f);`(固定値。マジックナンバーを避けたい場合は`static constexpr float TFC_REFERENCE_FREQUENCY_HZ = 1000.f;`のような定数を導入してもよい)に変更する。
- `toJSON()`の`data["tfc.referenceFrequency"] = tfcReferenceFrequency();`を削除。`fromJSON()`の対応する`setTfcReferenceFrequency(...)`呼び出しも削除(**過去に保存されたプロジェクトファイルに`tfc.referenceFrequency`キーが残っていても、単に無視されるだけで問題ないことを確認**)。
- `clone()`の`cloned->setTfcReferenceFrequency(tfcReferenceFrequency());`を削除。
- `store()`内の`modeNote`(706-720行目付近)の`case TFC:`が`QString("FT TFC window %1ms @ %2Hz").arg(tfcReferenceTime()).arg(tfcReferenceFrequency())`のように`tfcReferenceFrequency()`を参照している場合、`%2Hz`部分を固定文字列`"1kHz"`に変更するか、`%1ms`のみの表記に簡略化する。

#### `src/remote/items/measurementitem.h`

- `Q_PROPERTY(float tfcReferenceFrequency ...)`と`void tfcReferenceFrequencyChanged(float) override;`を削除。

#### `qml/source/MeasurementProperties.qml`

- `tfcReferenceFrequencySpinBox`ブロック全体を削除する。
- `tfcReferenceTimeSpinBox`には修正1の`indicators: false`を追加する。

## 検証方法

1. CLAUDE.mdの手順(アプリ終了→ビルド→起動→ユーザー確認)でビルド・起動する。
2. Transform modeを`TFC`に切り替え、reference timeのスピンボックスのみが表示され、インジケータの重なりが解消されていることを確認する(ユーザー提供のスクリーンショットの不具合が再現しないこと)。
3. reference timeの値を変えると、Magnitude/Phase/Coherenceチャートの見た目が変化することを確認する(Phase 2で実装した「モード不変でもreference time変更を検知してprepareLog()を再実行する」経路がreference frequency抜きでも正しく動くこと)。
4. プロジェクトファイルを保存→読み込みし直し、reference timeの値が保持されることを確認する(`tfc.referenceFrequency`キーが無くなっても壊れないこと)。
5. `tfc.referenceFrequency`キーを含む(修正前に保存された)古いプロジェクトファイルがあれば、それを読み込んでもクラッシュ・エラーが出ないことを確認する(未知キーは単に無視される想定)。
6. ビルドが警告なく通ること(未使用になった`tfcReferenceFrequency`関連の参照が他に残っていないか、`grep -rn tfcReferenceFrequency src/ qml/`で確認する)。

## 完了後の作業

- [dev-docs/customizations.md](dev-docs/customizations.md)に、reference frequencyを1000Hz固定にした理由(SysTuneの調査メモに基づく判断)を追記する。
- [dev-docs/tfc-window-implementation-plan.md](dev-docs/tfc-window-implementation-plan.md) 3.2節・3.6節の「reference frequency」に関する記述を、固定値である旨に更新する。
- [dev-docs/tfc-window-phases.md](dev-docs/tfc-window-phases.md) Phase 2・Phase 4のタスク一覧・完了条件の記述からreference frequencyのUI/プロパティに関する言及を削除・修正する(既に「完了」表記のPhase自体の状態は変更不要)。
- [dev-docs/measurement-types.md](dev-docs/measurement-types.md)のTransform modeの説明(34行目)を、「基準周波数は1000Hz固定、ユーザーはreference time(基準窓時間)のみ調整する」という実態に合わせて更新する。
