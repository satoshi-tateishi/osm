#include "sourcetreebridge.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUuid>

#include "abstract/source.h"
#include "src/source/group.h"
#include "src/sourcelist.h"

namespace Chart {

SourceTreeBridge::SourceTreeBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    watchList(m_sourceList);
}

void SourceTreeBridge::watchList(SourceList *list)
{
    connect(list, &SourceList::postItemAppended,
            this, &SourceTreeBridge::onItemAppended, Qt::UniqueConnection);
    connect(list, &SourceList::postItemRemoved,
            this, &SourceTreeBridge::emitTree, Qt::UniqueConnection);
    connect(list, &SourceList::postItemMoved,
            this, &SourceTreeBridge::emitTree, Qt::UniqueConnection);

    for (const auto &item : list->items()) {
        onItemAppended(item);
    }
}

void SourceTreeBridge::onItemAppended(const Shared::Source &item)
{
    connect(item.get(), &Abstract::Source::nameChanged,
            this, &SourceTreeBridge::emitTree, Qt::UniqueConnection);
    connect(item.get(), &Abstract::Source::colorChanged,
            this, &SourceTreeBridge::emitTree, Qt::UniqueConnection);
    connect(item.get(), &Abstract::Source::activeChanged,
            this, &SourceTreeBridge::emitTree, Qt::UniqueConnection);

    // SourceList::isGroupableData() restricts group contents to Stored/Group,
    // so Measurement remains top-level and DataBridge needs no recursion.
    if (auto *group = dynamic_cast<Source::Group *>(item.get())) {
        watchList(group->sourceList());
    }

    emitTree();
}

void SourceTreeBridge::appendItemsJson(SourceList *list,
                                       const QUuid &parentUuid,
                                       int depth,
                                       QJsonArray &array)
{
    for (const auto &item : list->items()) {
        QJsonObject object;
        object["uuid"] = item->uuid().toString();
        object["type"] = item->objectName();
        object["name"] = item->name();
        object["color"] = item->color().name();
        object["active"] = item->active();
        object["depth"] = depth;
        object["parentUuid"] = parentUuid.isNull()
                ? QJsonValue()
                : QJsonValue(parentUuid.toString());
        array.append(object);

        if (auto *group = dynamic_cast<Source::Group *>(item.get())) {
            appendItemsJson(group->sourceList(), item->uuid(), depth + 1, array);
        }
    }
}

void SourceTreeBridge::emitTree()
{
    QJsonArray array;
    appendItemsJson(m_sourceList, QUuid(), 0, array);
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

SourceList *SourceTreeBridge::resolveList(const QString &parentUuidString) const
{
    if (parentUuidString.isEmpty()) {
        return m_sourceList;
    }

    auto parent = m_sourceList->getByUUid(QUuid(parentUuidString));
    auto *group = parent ? dynamic_cast<Source::Group *>(parent.get()) : nullptr;
    return group ? group->sourceList() : nullptr;
}

void SourceTreeBridge::moveToPosition(const QString &uuidString,
                                      const QString &targetParentUuidString,
                                      int index)
{
    auto *targetList = resolveList(targetParentUuidString);
    if (!targetList) {
        return;
    }

    auto uuid = QUuid(uuidString);
    // The web UI sends a boundary index from the list before the dragged item
    // is removed. Compensate when moving downward within that same list.
    auto originalIndex = targetList->indexOf(uuid);
    if (originalIndex >= 0 && originalIndex < index) {
        --index;
    }
    m_sourceList->moveItem(uuid, QUuid(targetParentUuidString));

    auto currentIndex = targetList->indexOf(uuid);
    if (currentIndex < 0) {
        return;
    }

    auto clampedIndex = qBound(0, index, targetList->count() - 1);
    if (clampedIndex != currentIndex) {
        targetList->move(currentIndex, clampedIndex);
    }
}

} // namespace Chart
