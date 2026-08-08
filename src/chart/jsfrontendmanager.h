#ifndef CHART_JSFRONTENDMANAGER_H
#define CHART_JSFRONTENDMANAGER_H

#include <QObject>

class QWebChannel;
class QWebEngineView;
class SourceList;

namespace Chart {

class DataBridge;
class SourceTreeBridge;
class SettingsBridge;

// Owns the single persistent JS frontend window and its fixed WebChannel
// object set. Dynamic source state is transported by bridge signals.
class JsFrontendManager : public QObject
{
    Q_OBJECT
public:
    explicit JsFrontendManager(SourceList *sourceList, bool useDevServer, QObject *parent = nullptr);
    ~JsFrontendManager() override;

private:
    SourceList *m_sourceList;
    QWebChannel *m_channel;
    QWebEngineView *m_view;
    DataBridge *m_dataBridge;
    SourceTreeBridge *m_sourceTreeBridge;
    SettingsBridge *m_settingsBridge;
};

} // namespace Chart

#endif // CHART_JSFRONTENDMANAGER_H
