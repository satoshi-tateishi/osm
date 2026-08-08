# 実装プロンプト: フロントエンドJS化 Phase 5(結合検証・DataBridgeライフサイクル確定・QML版の扱い判断)

このファイルは[js-frontend-phases.md](js-frontend-phases.md) Phase 5を実装するための指示書。Phase 1〜4(Magnitude/Phase/Coherence/RTA/Spectrogram)は完了・レビュー済み。5チャート全ての実装が揃ったので、Phase 5では**複数チャートパネル・複数ソースを同時に開いた場合のDataBridgeライフサイクル**を正式に設計し、QML版の扱いを判断する。

## 前提・現状の課題

現在の`src/main.cpp`は、`OSM_JS_FRONTEND`環境変数が設定されているとき、**起動時に見つかった最初のMeasurementソース1つだけ**を対象に、`DataBridge`・`QWebChannel`・`QWebEngineView`を1組だけ生成する(129〜148行目相当)。これはPhase 1の「最小の垂直スライス」方針としては正しかったが、以下が未対応:

- 複数のMeasurementソースがある場合、2つ目以降は無視される。
- 実行中にMeasurementソースを追加/削除しても反映されない(起動時の状態に固定)。
- JSウィンドウをユーザーが閉じても、`DataBridge`は`readyRead()`に接続されたまま裏で動き続ける(無駄な計算)。

[js-frontend-rewrite-plan.md](js-frontend-rewrite-plan.md) 5節の未決事項として残されていた「複数パネル・複数ソース時のDataBridgeインスタンス管理」「QWebChannelの登録/解除タイミング(パネルを閉じたときのクリーンアップ)」をここで確定させる。

**スコープ**: `sourceList`直下(トップレベル)のMeasurementソースのみを対象とする。Group内にネストしたMeasurementへの対応は今回のスコープ外とする(既存のPhase 1〜4のハードコードされたロジックも同様にトップレベルのみを見ていたため、後退ではない)。

## 実装1(新規): `src/chart/jsfrontendmanager.h` / `.cpp`

`SourceList`の`postItemAppended`/`preItemRemoved`シグナルを購読し、Measurementソース1つにつきJSウィンドウ(`DataBridge`+`QWebChannel`+`QWebEngineView`)を1つ動的に開閉する。**実際のクリーンアップはウィンドウの`destroyed`シグナル1箇所に一本化し**(ユーザーがウィンドウを閉じた場合とソース削除で自動的に閉じた場合の両方でここを通る)、`closePanel()`は`QWebEngineView::close()`(`Qt::WA_DeleteOnClose`により非同期に破棄される)を呼ぶだけにすることで、二重解放を避ける。

```cpp
// src/chart/jsfrontendmanager.h
#ifndef CHART_JSFRONTENDMANAGER_H
#define CHART_JSFRONTENDMANAGER_H

#include <QObject>
#include <QMap>
#include <QUuid>

#include "shared/source_shared.h"

class SourceList;
class QWebEngineView;

namespace Chart {

// Phase 5: OSM_JS_FRONTEND有効時、sourceList直下のMeasurementソース1つにつき
// JSフロントエンドのウィンドウを1つ動的に開閉する。ソースの追加/削除、ユーザーによる
// ウィンドウの手動クローズのどちらの経路でも、後片付けはウィンドウのdestroyedシグナル
// 1箇所に一本化してある(二重解放を避けるため)。
class JsFrontendManager : public QObject
{
    Q_OBJECT
public:
    explicit JsFrontendManager(SourceList *sourceList, bool useDevServer, QObject *parent = nullptr);
    ~JsFrontendManager() override;

private slots:
    void onItemAppended(const Shared::Source &item);
    void onItemRemoved(QUuid uuid);

private:
    void openPanel(const Shared::Source &source);
    void closePanel(const QUuid &uuid);

    SourceList *m_sourceList;
    bool m_useDevServer;
    QMap<QUuid, QWebEngineView *> m_panels;
};

} // namespace Chart

#endif // CHART_JSFRONTENDMANAGER_H
```

```cpp
// src/chart/jsfrontendmanager.cpp
#include "jsfrontendmanager.h"

#include <QWebChannel>
#include <QWebEngineView>

#include "databridge.h"
#include "src/sourcelist.h"
#include "src/source/measurement.h"

namespace Chart {

JsFrontendManager::JsFrontendManager(SourceList *sourceList, bool useDevServer, QObject *parent)
    : QObject(parent), m_sourceList(sourceList), m_useDevServer(useDevServer)
{
    connect(m_sourceList, &SourceList::postItemAppended, this, &JsFrontendManager::onItemAppended);
    connect(m_sourceList, &SourceList::preItemRemoved, this, &JsFrontendManager::onItemRemoved);

    for (const auto &item : m_sourceList->items()) {
        if (dynamic_cast<Measurement *>(item.get())) {
            openPanel(item);
        }
    }
}

JsFrontendManager::~JsFrontendManager()
{
    // アプリ終了時の後片付け。close()はWA_DeleteOnCloseで非同期削除をスケジュールする
    // だけなので、イベントループが止まる終了シーケンス中は完了しないこともあるが、
    // プロセス終了時にOSが回収するため実害はない。
    const auto views = m_panels.values();
    for (auto *view : views) {
        view->close();
    }
}

void JsFrontendManager::onItemAppended(const Shared::Source &item)
{
    if (dynamic_cast<Measurement *>(item.get())) {
        openPanel(item);
    }
}

void JsFrontendManager::onItemRemoved(QUuid uuid)
{
    closePanel(uuid);
}

void JsFrontendManager::openPanel(const Shared::Source &source)
{
    auto uuid = source->uuid();
    if (m_panels.contains(uuid)) {
        return;
    }

    auto *bridge = new DataBridge();
    bridge->setSource(source);

    auto *channel = new QWebChannel();
    channel->registerObject(QStringLiteral("dataBridge"), bridge);

    auto *view = new QWebEngineView();
    view->page()->setWebChannel(channel);
    view->resize(900, 600);
    view->setWindowTitle(QStringLiteral("OSM JS Frontend — %1").arg(source->name()));
    view->load(m_useDevServer
               ? QUrl(QStringLiteral("http://localhost:5173/"))
               : QUrl(QStringLiteral("qrc:/web/index.html")));
    view->setAttribute(Qt::WA_DeleteOnClose);

    // ウィンドウが閉じられたとき(ユーザー操作・ソース削除どちらの経路でも)、
    // ここで一元的にDataBridge/QWebChannelを後片付けする。
    connect(view, &QObject::destroyed, this, [this, uuid, bridge, channel]() {
        m_panels.remove(uuid);
        bridge->deleteLater();
        channel->deleteLater();
    });

    view->show();
    m_panels.insert(uuid, view);
}

void JsFrontendManager::closePanel(const QUuid &uuid)
{
    auto it = m_panels.find(uuid);
    if (it == m_panels.end()) {
        return;
    }
    (*it)->close(); // 実際のm_panelsからの除去・DataBridge/QWebChannel破棄はdestroyedシグナル側で行う
}

} // namespace Chart
```

**注意**: ウィンドウのタイトルはパネル生成時の`source->name()`のみを反映する(生成後にソース名を変更しても追従しない)。ライブ追従が必要ならソースの`nameChanged`シグナルへの接続を追加すればよいが、Phase 5では見送る。

## 実装2: `OpenSoundMeter.pro`の変更

`SOURCES +=`ブロックの`src/chart/databridge.cpp \`の直後に追加:
```
    src/chart/jsfrontendmanager.cpp \
```

`HEADERS +=`ブロックの`src/chart/databridge.h \`の直後に追加:
```
    src/chart/jsfrontendmanager.h \
```

## 実装3: `src/main.cpp`の変更

`#include`群を変更。`#include <QWebChannel>`・`#include <QWebEngineView>`・`#include "src/chart/databridge.h"`を削除し、代わりに追加:

```cpp
#include "src/chart/jsfrontendmanager.h"
```

既存の以下のブロック(146〜177行目相当)を丸ごと置き換える:

```cpp
    Chart::DataBridge *jsDataBridge = nullptr;
    QWebChannel *jsWebChannel = nullptr;
    QWebEngineView *jsView = nullptr;

    if (qEnvironmentVariableIsSet("OSM_JS_FRONTEND")) {
        Shared::Source measurementSource;
        for (const auto &item : sourceList->items()) {
            if (dynamic_cast<Measurement *>(item.get())) {
                measurementSource = item;
                break;
            }
        }

        jsDataBridge = new Chart::DataBridge(&app);
        if (measurementSource) {
            jsDataBridge->setSource(measurementSource);
        } else {
            qWarning() << "OSM_JS_FRONTEND: Measurementソースが見つかりません";
        }

        jsWebChannel = new QWebChannel(&app);
        jsWebChannel->registerObject(QStringLiteral("dataBridge"), jsDataBridge);

        jsView = new QWebEngineView();
        jsView->page()->setWebChannel(jsWebChannel);
        jsView->resize(900, 600);
        jsView->setWindowTitle(QStringLiteral("OSM JS Frontend (Phase 1)"));
        jsView->load(qEnvironmentVariableIsSet("OSM_JS_DEV_SERVER")
                     ? QUrl(QStringLiteral("http://localhost:5173/"))
                     : QUrl(QStringLiteral("qrc:/web/index.html")));
        jsView->show();
    }
```

置き換え後:

```cpp
    std::unique_ptr<Chart::JsFrontendManager> jsFrontendManager;
    if (qEnvironmentVariableIsSet("OSM_JS_FRONTEND")) {
        jsFrontendManager = std::make_unique<Chart::JsFrontendManager>(
            sourceList.get(), qEnvironmentVariableIsSet("OSM_JS_DEV_SERVER"), &app);
    }
```

`<memory>`のインクルードが無ければ追加すること(`std::unique_ptr`/`std::make_unique`用)。

## 検証方法

1. `cd web && npm run dev`を起動しておく。
2. CLAUDE.mdの手順でビルドする。
3. `OSM_JS_FRONTEND=1 OSM_JS_DEV_SERVER=1 ./build/OpenSoundMeter.app/Contents/MacOS/OpenSoundMeter`で起動する。既存Measurementソース分のJSウィンドウが1つ開くこと(Phase 1〜4までの回帰確認)。
4. QML側のUIから新規Measurementを追加(`sourceList->addMeasurement()`相当の操作、通常は「+」ボタン等)し、**自動的に2つ目のJSウィンドウが開く**ことを確認する。2つのウィンドウがそれぞれ独立したデータ(別々の`sourceName`・別々の測定値)を表示すること(混線していないこと)。
5. QML側からMeasurementソースを1つ削除し、**対応するJSウィンドウが自動的に閉じる**ことを確認する(クラッシュしないこと)。
6. JSウィンドウをユーザー操作(ウィンドウの閉じるボタン)で手動クローズし、クラッシュしないこと・その後別のソースを追加/削除しても引き続き正しく動作することを確認する(内部の`m_panels`マップが不整合を起こしていないか)。
7. Measurementソースを3〜5個同時に開いた状態で数分間動作させ、クラッシュ・著しいCPU/メモリ増加が無いか確認する(Activity Monitor等で確認)。結果を完了メモに記録する(実用上の上限の目安として)。
8. `OSM_JS_FRONTEND`を設定しない通常起動で、JSウィンドウが一切開かず既存機能に変化がないことを確認する(回帰確認)。
9. `npm run build`(tscの型チェック含む)が通ること(Phase 5はC++側のみの変更のため影響は無いはずだが、念のため確認)。

## QML版の扱いについて(このPhaseでの判断)

現時点でJSフロントエンドは以下の点でQML版に見劣りする:
- コントロール類が一切無い(pointsPerOctave、Magnitude/RTAのモード・スケール切替、Spectrogramのlower/upper閾値など、Phase 1〜4で意図的に固定値にしてきたもの)。
- coherence連動の線の透明度演出([js-frontend-phases.md](js-frontend-phases.md) Phase 2で見送った機能)が無い。
- ウィンドウ管理・レイアウトがQMLのパネルシステムと統合されていない(独立した別ウィンドウ)。
- `OSM_JS_FRONTEND`環境変数を明示的に立てないと使えない実験的機能のまま。

これらを踏まえ、**QML側のチャートコードは削除せず、現状通りJSフロントエンドと併存させる**ことをこのPhaseの判断結果とする(Phase 5完了時点でJSが機能的に上回っている訳ではないため)。将来的にJS側がコントロール類も含めて実用レベルに達した時点で、改めてQML削除を検討する。この判断を完了後の作業でドキュメント化すること。

## 完了後の作業

- [dev-docs/js-frontend-phases.md](js-frontend-phases.md) Phase 5のタスクチェックリスト・完了条件を更新し、進捗表を「完了」にする。複数ソース/複数パネルでの動作確認結果(上限の目安等)、QML版を併存継続する判断とその理由を完了メモに明記する。
- [dev-docs/customizations.md](customizations.md)に、Phase 5で追加したファイル(`jsfrontendmanager.h`/`.cpp`)・ライフサイクル設計の要点(destroyedシグナルへの一本化)・QML併存継続の判断を追記する。
- 全5チャート+複数パネル対応が完了した時点として、[js-frontend-phases.md](js-frontend-phases.md)冒頭の全体進捗サマリ文を更新する。
