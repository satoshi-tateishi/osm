#include "jsfrontendmanager.h"

#include <QWebChannel>
#include <QWebEngineView>

#include "databridge.h"
#include "settingsbridge.h"
#include "sourcetreebridge.h"
#include "src/sourcelist.h"

namespace Chart {

JsFrontendManager::JsFrontendManager(SourceList *sourceList, bool useDevServer, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    m_dataBridge = new DataBridge(m_sourceList, this);
    m_sourceTreeBridge = new SourceTreeBridge(m_sourceList, this);
    m_settingsBridge = new SettingsBridge(m_sourceList, this);

    m_channel = new QWebChannel(this);
    m_channel->registerObject(QStringLiteral("sourceList"), m_sourceList);
    m_channel->registerObject(QStringLiteral("sourceTree"), m_sourceTreeBridge);
    m_channel->registerObject(QStringLiteral("chartData"), m_dataBridge);
    m_channel->registerObject(QStringLiteral("settings"), m_settingsBridge);

    m_view = new QWebEngineView();
    m_view->page()->setWebChannel(m_channel);
    m_view->resize(1440, 900);
    m_view->setWindowTitle(QStringLiteral("OSM"));
    m_view->load(useDevServer
                 ? QUrl(QStringLiteral("http://localhost:5173/"))
                 : QUrl(QStringLiteral("qrc:/web/index.html")));
    m_view->show();
}

JsFrontendManager::~JsFrontendManager()
{
    delete m_view;
}

} // namespace Chart
