#include "sourcetreebridge.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUuid>

#include "abstract/source.h"
#include "src/sourcelist.h"

namespace Chart {

SourceTreeBridge::SourceTreeBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    connect(m_sourceList, &SourceList::postItemAppended,
            this, &SourceTreeBridge::onItemAppended);
    connect(m_sourceList, &SourceList::postItemRemoved,
            this, &SourceTreeBridge::emitTree);

    for (const auto &item : m_sourceList->items()) {
        onItemAppended(item);
    }
}

void SourceTreeBridge::onItemAppended(const Shared::Source &item)
{
    connect(item.get(), &Abstract::Source::nameChanged,
            this, &SourceTreeBridge::emitTree);
    connect(item.get(), &Abstract::Source::colorChanged,
            this, &SourceTreeBridge::emitTree);
    connect(item.get(), &Abstract::Source::activeChanged,
            this, &SourceTreeBridge::emitTree);
    emitTree();
}

void SourceTreeBridge::emitTree()
{
    QJsonArray array;
    for (const auto &item : m_sourceList->items()) {
        QJsonObject object;
        object["uuid"] = item->uuid().toString();
        object["type"] = item->objectName();
        object["name"] = item->name();
        object["color"] = item->color().name();
        object["active"] = item->active();
        array.append(object);
    }
    emit treeChanged(QString::fromUtf8(
        QJsonDocument(array).toJson(QJsonDocument::Compact)));
}

void SourceTreeBridge::requestTree()
{
    emitTree();
}

void SourceTreeBridge::setActive(const QString &uuid, bool active)
{
    auto source = m_sourceList->getByUUid(QUuid(uuid));
    if (source) {
        source->setActive(active);
    }
}

void SourceTreeBridge::storeItem(const QString &uuid)
{
    auto source = m_sourceList->getByUUid(QUuid(uuid));
    if (source) {
        m_sourceList->storeItem(source);
    }
}

} // namespace Chart
