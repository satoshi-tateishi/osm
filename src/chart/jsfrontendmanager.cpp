#include "jsfrontendmanager.h"

#include <QWebChannel>
#include <QWebEngineView>

#include "databridge.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

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
    const auto uuid = source->uuid();
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
    const auto it = m_panels.find(uuid);
    if (it == m_panels.end()) {
        return;
    }
    (*it)->close();
}

} // namespace Chart
