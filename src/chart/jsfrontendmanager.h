#ifndef CHART_JSFRONTENDMANAGER_H
#define CHART_JSFRONTENDMANAGER_H

#include <QMap>
#include <QObject>
#include <QUuid>

#include "shared/source_shared.h"

class QWebEngineView;
class SourceList;

namespace Chart {

// OSM_JS_FRONTEND有効時、sourceList直下のMeasurementごとにJSウィンドウを管理する。
// ユーザー操作とソース削除のどちらで閉じても、後片付けはviewのdestroyedで行う。
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
