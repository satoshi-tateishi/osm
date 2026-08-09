#ifndef CHART_SOURCETREEBRIDGE_H
#define CHART_SOURCETREEBRIDGE_H

#include <QObject>
#include <QJsonArray>
#include <QString>
#include <QUuid>

#include "shared/source_shared.h"

class SourceList;

namespace Chart {

// Read-only snapshot bridge for the source explorer, including nested groups.
class SourceTreeBridge : public QObject
{
    Q_OBJECT
public:
    explicit SourceTreeBridge(SourceList *sourceList, QObject *parent = nullptr);

    Q_INVOKABLE void setActive(const QString &uuid, bool active);
    Q_INVOKABLE void storeItem(const QString &uuid);
    Q_INVOKABLE void requestTree();
    Q_INVOKABLE bool setName(const QString &uuid, const QString &name);
    Q_INVOKABLE void moveToPosition(const QString &uuid,
                                    const QString &targetParentUuid,
                                    int index);

signals:
    void treeChanged(const QString &json);

private slots:
    void onItemAppended(const Shared::Source &item);
    void emitTree();

private:
    void watchList(SourceList *list);
    void appendItemsJson(SourceList *list, const QUuid &parentUuid,
                         int depth, QJsonArray &array);
    SourceList *resolveList(const QString &parentUuidString) const;

    SourceList *m_sourceList;
};

} // namespace Chart

#endif // CHART_SOURCETREEBRIDGE_H
