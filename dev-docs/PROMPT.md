# 実装プロンプト: TFC Window — Phase 4 (QML UI実装)

このファイルは、[tfc-window-phases.md](tfc-window-phases.md)のPhase 4を実装するための、そのまま実行に使えるプロンプト。新しいセッションでこのプロンプトを渡せば、以降のタスクに着手できるよう、必要な背景情報を全てこのファイル内に含めている。

## 前提: Phase 1〜3は完了・レビュー済み

- Phase 1(`src/math/fouriertransform.h`/`.cpp`): TFCの窓長計算ロジック実装済み。
- Phase 2(`src/meta/metameasurement.h`/`.cpp`、`src/source/measurement.h`/`.cpp`、`src/remote/items/measurementitem.h`): `Meta::Measurement::Mode`に`TFC`追加、`tfcReferenceTime`/`tfcReferenceFrequency`のQ_PROPERTY・JSON永続化・`clone()`対応まで配線済み。
- Phase 3(`dev-docs/measurement-types.md`): ドキュメント更新のみ。

**重要な前提**: `Measurement`クラスの`modes`プロパティ(`Q_PROPERTY(QVariant modes READ getAvailableModes CONSTANT)`)はオーバーライドされておらず、基底クラス`Meta::Measurement::getAvailableModes()`(`m_modeMap`を単純に走査するだけ)をそのまま使っている。そのため**Phase 2の時点で、QMLに一切手を入れていなくても、`qml/source/MeasurementProperties.qml`のTransform modeドロップダウン(`modeSelect`)には既に"TFC"が選択肢として現れ、選択できる**(実機で確認済み)。つまりPhase 4のゴールは「TFCを選択可能にすること」ではなく、**選択中にreference time/frequencyを調整するUIを追加すること**、および**選択時の表示(displayText)を適切にすること**の2点。

## 背景

Open Sound Meter (OSM) に、AFMG SysTuneの「TFC Window™」相当の機能を実装するプロジェクトの一部。設計の全体像は以下を参照。

- [tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) — 設計方針(特に3.6節がUI設計)
- [tfc-window-phases.md](tfc-window-phases.md) — Phase分割の全体像

**今回のタスクはPhase 4のみ。`src/`以下のC++コードには一切手を入れないこと**(Phase 1〜2で完結済み)。

## 対象ファイル

- `qml/source/MeasurementProperties.qml`

## 現状のコード(変更前、確認済み)

### Transform modeドロップダウン(307-316行目)

```qml
DropDown {
    id: modeSelect
    model: dataObjectData.modes
    currentIndex: dataObjectData.mode
    displayText: (dataObjectData.mode === Measurement.LFT ? "LTW" : (modeSelect.width > 120 ? "Power:" : "") + currentText)
    ToolTip.visible: hovered
    ToolTip.text: qsTr("Transfrom mode")
    onCurrentIndexChanged: dataObjectData.mode = currentIndex;
    Layout.preferredWidth: elementWidth
}
```

`model`(=`dataObjectData.modes`)には既に`"10"`〜`"16"`・`"LTW"`・`"TFC"`が全て含まれている。`currentText`は選択中の生の文字列なので、TFCを選んだ場合`currentText`は`"TFC"`になる。しかし`displayText`の分岐は`LFT`(LTW)専用で、それ以外は全て`"Power:" + currentText`という「FFTサイズ系のモードである」ことを前提にした接頭辞が付く。TFCを選ぶと`"Power:TFC"`という誤解を招く表示になってしまう(実機で確認済み)。

直後に`windowSelect`(318-334行目、`visible: false`で常時非表示、このフォークのHann固定方針)が続く。

### 参考パターン1: `wideSpinBox`(`qml/source/WindowingProperties.qml` 49-71行目)

外部変更の再同期(`Connections`)・初期値反映(`Component.onCompleted`)・モード依存の表示切替(`visible:`)を組み合わせたFloatSpinBoxの標準パターン:

```qml
FloatSpinBox {
    id: wideSpinBox
    from: 0.1
    to: 10000
    units: "ms"
    value: dataObjectData.wide
    property bool completed: false
    onValueChanged: {if (completed) { dataObjectData.wide = value; } }
    tooltiptext: qsTr("Wide of Tukey window, ms")
    visible: dataObjectData.domain === 0
    Connections {
        target: dataObjectData
        function onWideChanged() { wideSpinBox.value = dataObjectData.wide; }
    }
    Component.onCompleted: { completed = true; wideSpinBox.value = dataObjectData.wide; }
}
```

`completed`ガードが必要な理由(`FloatSpinBox.qml`のコメントに明記): コンポーネント初期化中に`from`/`to`の範囲制約を適用する過程で`value`が変化するイベントが飛ぶため、初期化完了前にその変化を`dataObjectData`へ書き戻さないようにする。

### 参考パターン2: 同ファイル内、`averageType`依存の条件表示(`MeasurementProperties.qml` 53-93行目)

`MeasurementProperties.qml`自身にも、`dataObjectData.averageType`の値に応じて`elementWidth`幅のアイテム(`SelectableSpinBox`や`DropDown`)を出し分けている既存パターンがある(53-88行目)。TFC用の2つのFloatSpinBoxをどのRowLayout・どの位置に置くかは、この既存パターンとレイアウト崩れの有無を見ながら判断すること(下記「レイアウト上の注意」参照)。

## 実装する変更

### 1. `modeSelect`の`displayText`にTFC分岐を追加

`Measurement.LFT`のときの`"LTW"`と同様に、`Measurement.TFC`のときは`"Power:"`接頭辞を付けずそのまま`"TFC"`と表示する分岐を追加する(例: 三項演算子をLFT/TFC/それ以外の3分岐にする、またはif式に書き換える。書き方はドラフトのコピーでなく実装者の判断でよい)。

### 2. reference time / reference frequency用のFloatSpinBoxを2つ追加

`modeSelect`の直後(`windowSelect`の前後、または上記「参考パターン2」に倣ってレイアウトが崩れない位置)に追加する。

- **reference time**: `dataObjectData.tfcReferenceTime`にバインド、単位`"ms"`。
- **reference frequency**: `dataObjectData.tfcReferenceFrequency`にバインド、単位`"Hz"`。
- どちらも`wideSpinBox`と同じパターン(`completed`ガード付き`onValueChanged`、`Connections`での`onTfcReferenceTimeChanged`/`onTfcReferenceFrequencyChanged`購読、`Component.onCompleted`での初期値反映)を使うこと。**この`Connections`が無いと、プロジェクトファイル読み込み直後やソースの複製(`clone()`)直後に、C++側の実際の値とスピンボックスの表示値がずれる**(`tfcReferenceTime`/`tfcReferenceFrequency`はJSON復元・`clone()`両方に対応済みなので、UIが追従しないとその努力が無駄になる)。
- `visible: dataObjectData.mode === Measurement.TFC`を両方に設定する。
- `from`/`to`の値は、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.3節の「上限クランプ(2秒相当)・下限クランプ(8サンプル)」を踏まえ、実用上意味のある範囲に設定すること(例: reference timeは1ms〜200ms程度、reference frequencyは20Hz〜20000Hz程度)。**実際のクランプはFourierTransform側で常に効くため、ここでのfrom/toは主にUI操作性のためのガイドであり、この範囲を外れたら壊れるという意味ではない**。具体的な数値は実装者が判断してよいが、[tfc-window-implementation-plan.md](tfc-window-implementation-plan.md) 3.2節の検算例(`T_ref=10ms@1kHz`)が範囲内に収まることは確認すること。

### 3. `windowSelect`は変更しない

タスク一覧には含まれるが、既存通り`visible: false`のまま据え置く(このフォークはHann窓固定方針、[customizations.md](customizations.md)参照)。TFCモードでも窓関数選択は不要。

## レイアウト上の注意

`MeasurementProperties.qml`の2つ目の`RowLayout`(304行目〜)は、`modeSelect`・`windowSelect`(非表示)・`inputFilterSelect`・`measurementChannel`・`referenceChannel`・`deviceSelect`(`Layout.fillWidth: true`)・`Store`ボタンが既に並んでいる。ここに`elementWidth`幅のFloatSpinBoxを2つ追加すると、狭いウィンドウ幅で他の要素(特に`deviceSelect`)が窮屈になる可能性がある。実機でウィンドウ幅を変えながら崩れがないか確認すること(下記検証方法参照)。

## 検証方法

1. CLAUDE.mdの手順(アプリ終了→ビルド→起動→ユーザー確認)でビルド・起動する。
2. Measurementソースの設定行で、Transform modeを`TFC`に切り替える。表示が`"Power:TFC"`ではなく`"TFC"`になること、reference time/frequencyのスピンボックスが表示されることを確認する。
3. 他のモード(`10`〜`16`、`LTW`)に切り替えると、2つのスピンボックスが非表示になることを確認する。
4. reference time/frequencyの値をスピンボックスで変更し、Magnitude/Phase/Coherenceチャートの見た目(低域・高域の分解能)が実際に変化することを確認する(Phase 2で実装した「モード不変でもパラメータ変更を検知してprepareLog()を再実行する」経路が正しく動いていることの実質的な確認)。
5. スピンボックスの+/-ボタンを連打・キー長押しした際にUIがフリーズしないこと(`updateFftPower()`の再計算はタイマースレッド上で80ms周期に間引かれるため、通常は問題ないはずだが、実機で確認すること)。
6. プロジェクトファイルを保存→読み込みし直し、起動直後にスピンボックスの表示値が実際の設定値(JSON復元後の値)と一致していること(`Connections`/`Component.onCompleted`の疎通確認)。同様に、既存のMeasurementソースを複製(`Store`とは別の複製機能があれば、それ)した際も値が引き継がれていることを確認する。
7. ウィンドウ幅を変えて、Transform modeの行のレイアウトが崩れないこと(上記「レイアウト上の注意」)を確認する。
8. 既存のFast FFT(`10`〜`16`)・`LTW`モードの操作性に変化がないことを確認する(回帰なし)。

## やらないこと(スコープ外)

- `src/`以下のC++コード変更(Phase 1・2で完結済み)
- `dev-docs/measurement-types.md`の変更(Phase 3で完結済み。ただしPhase 4でUIの見た目が確定した結果、Phase 3の記述(「調整UIはPhase 4で追加予定」)が古くなるので、完了後の作業として更新すること)
- `Filter`/`Equalizer`/`StandardLine`側のUI(これらはPhase 2で自分のモード一覧からTFCを除外済みで、そもそもTFCを選べないため対象外)

## 完了後の作業

- [tfc-window-phases.md](tfc-window-phases.md)の進捗状況テーブルで、Phase 4を「完了」に更新する。
- [dev-docs/customizations.md](dev-docs/customizations.md)に変更内容と理由を追記する。
- [dev-docs/measurement-types.md](dev-docs/measurement-types.md) 34行目(Transform modeの行)の「調整UIはまだなく」「Phase 4で追加予定」という記述を、実装後の実態(reference time/frequencyのスピンボックスが使えるようになったこと)に合わせて更新する。
