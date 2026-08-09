# 実装プロンプト: フロントエンドJS化 Phase 13(JS版をデフォルトUIへ昇格 + QML版の扱い)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 13を実装するための指示書。Phase 12(左ペインDnD移動・挿入位置バー・階層的な表示/非表示・リネーム・重複防止)は完了・実機確認済み。Phase 6〜12でSmaart風3ペインUI(Session Data/チャート/Transfer Function+Settings+Generator)が実用レベルに達したため、JS版を`OSM_JS_FRONTEND`環境変数なしでも起動する既定のUIへ切り替える。

## 現状(Phase 12完了時点)

`src/main.cpp`の末尾付近は概ね以下の形になっている:

```cpp
    std::unique_ptr<Chart::JsFrontendManager> jsFrontendManager;
    if (qEnvironmentVariableIsSet("OSM_JS_FRONTEND")) {
        jsFrontendManager = std::make_unique<Chart::JsFrontendManager>(
            sourceList.get(), generator.get(), qEnvironmentVariableIsSet("OSM_JS_DEV_SERVER"), &app);
    }

    engine.load(QUrl(QStringLiteral("qrc:/main.qml")));

    if (engine.rootObjects().isEmpty())
        return -1;

    return QApplication::exec();
```

QMLエンジンは、メニューバー(`qml/menu/Top.qml`等、macOSのネイティブメニュー)、Autosaver、Notifier等、アプリ全体で使われるインフラを含んでいる。**この段階でQML側のコード自体を削除するのはリスクが高い**(メニューバーの動作確認・移植が別途必要になる)ため、今回は「QMLは引き続き読み込む(裏方のインフラとして生かす)が、既定では非表示にし、JS側のウィンドウだけを前面に出す」という設計にする。

## Phase 13のスコープ

1. 環境変数の意味を以下のように反転・整理する:
   - **環境変数なし(既定)**: JS版のみが見える状態で起動する(QMLは裏で読み込まれるが非表示)。
   - `OSM_JS_FRONTEND_DISABLE=1`: JS版を起動せず、QML版のみ表示する(従来の既定動作、フォールバック/デバッグ用)。
   - `OSM_QML_FRONTEND=1`: JS版に加えてQML版のウィンドウも表示する(移行期間中の比較確認用)。
   - `OSM_JS_DEV_SERVER=1`: (変更なし)JS側をqrc同梱版ではなくViteの開発サーバーから読み込む。
2. QMLのルートウィンドウを、既定では`hide()`して非表示にする(削除はしない)。
3. `customizations.md`・`js-frontend-phases.md`にこの判断を記録する。

**注意点(重要・必ず実機確認すること)**: QMLのルートウィンドウを`hide()`した状態で、macOSのネイティブメニューバー(File/View/Help)が正しく機能し続けるかは事前に断定できない。Qtのメニューバーは通常「アクティブなウィンドウ」に紐づくため、QMLウィンドウを完全に非表示にするとメニューが空になる、あるいはJS側のQWebEngineViewウィンドウにメニューが出ない、といった不具合が起きる可能性がある。**もしメニューバーが機能しなくなった場合は、`hide()`ではなく`showMinimized()`(Dockに畳む)を使う、またはQMLウィンドウを画面外に移動する(`window->setPosition(-10000, -10000)`)等の代替策を試すこと。** どの方式が良いかは実機での見た目・メニュー動作を見て判断してよい。

## 実装1: `src/main.cpp`の変更

`#include <QQuickWindow>`を追加(未追加であれば)。

末尾の起動シーケンスを以下に変更:

```cpp
    engine.load(QUrl(QStringLiteral("qrc:/main.qml")));

    if (engine.rootObjects().isEmpty())
        return -1;

    const bool qmlFrontendRequested = qEnvironmentVariableIsSet("OSM_QML_FRONTEND");
    const bool jsFrontendDisabled = qEnvironmentVariableIsSet("OSM_JS_FRONTEND_DISABLE");

    std::unique_ptr<Chart::JsFrontendManager> jsFrontendManager;
    if (!jsFrontendDisabled) {
        jsFrontendManager = std::make_unique<Chart::JsFrontendManager>(
            sourceList.get(), generator.get(), qEnvironmentVariableIsSet("OSM_JS_DEV_SERVER"), &app);

        if (!qmlFrontendRequested) {
            if (auto *qmlWindow = qobject_cast<QQuickWindow *>(engine.rootObjects().first())) {
                qmlWindow->hide();
            }
        }
    }

    return QApplication::exec();
```

`engine.load(...)`を先頭に移動している点に注意(従来は`jsFrontendManager`生成の後にあった)。QMLのルートウィンドウを取得するには`engine.load()`が完了している必要があるため。

## 実装2: `dev-docs/js-frontend-phases.md`の変更

Phase 13のタスクにチェックを入れ、完了メモを追記し、進捗表を「完了」に更新する。

冒頭のサマリ文(「Phase 0〜5が完了し...」で始まる段落、および「方針転換」段落)を、Phase 6〜13が完了しJS版がデフォルトUIになったことを踏まえて更新する。

## 実装3: `dev-docs/customizations.md`の変更

該当節(または新規節)に以下を記録する:
- JS版がデフォルトUIになった経緯(Phase 6〜12でSmaart風3ペインUIが実用レベルに達したこと)。
- QML版は削除せず、既定では非表示のまま裏方インフラ(メニューバー等)として存続させる判断とその理由。
- 環境変数`OSM_JS_FRONTEND_DISABLE`/`OSM_QML_FRONTEND`の意味。
- メニューバーの動作確認結果(問題なければその旨、問題があれば採用した代替策)。

## 検証方法

1. CLAUDE.mdの手順(終了→ビルド→起動)でビルドする。
2. 環境変数なしで起動し(`./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`、または`open build/OpenSoundMeter.app`)、JS版のウィンドウ(3ペインUI)だけが表示され、QML版のウィンドウが見えないことを確認する。
3. **メニューバー(File/View/Help)が正しく機能することを確認する**(前述の注意点)。機能しない場合は代替策を試し、結果を完了メモに記録する。
4. `OSM_JS_FRONTEND_DISABLE=1`で起動すると、従来通りQML版のみが表示されることを確認する。
5. `OSM_QML_FRONTEND=1`で起動すると、JS版とQML版の両方のウィンドウが表示されることを確認する。
6. JS版を通常に操作し(測定・チャート表示・設定変更・Generator・Session Dataの操作)、Phase 6〜12で確認済みの機能が全て問題なく動作することを確認する(退行がないこと)。
7. `cd web && npm run build`が通ること。
8. アプリを終了・再起動しても問題なく同じ挙動になることを確認する(複数回の起動サイクルで安定していること)。

## 完了後の作業

- [js-frontend-phases.md](js-frontend-phases.md)のPhase 13のタスクチェックリストにチェックを入れ、完了メモ(メニューバーの動作確認結果を含む)を追記し、進捗表を「完了」に更新する。冒頭のサマリ文も更新する。
- [customizations.md](customizations.md)に、JS版デフォルト化の経緯と環境変数の意味を記録する。
- QML側コード自体の削除は**このPhaseでは行わない**(スコープ外、将来の判断に委ねる)。
