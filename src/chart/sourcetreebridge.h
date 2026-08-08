#ifndef CHART_SOURCETREEBRIDGE_H
#define CHART_SOURCETREEBRIDGE_H

#include <QObject>
#include <QString>

#include "shared/source_shared.h"

class SourceList;

namespace Chart {

// Read-only snapshot bridge for the top-level source explorer. Group contents
// remain collapsed until the recursive tree work in Phase 10.
class SourceTreeBridge : public QObject
{
    Q_OBJECT
public:
    explicit SourceTreeBridge(SourceList *sourceList, QObject *parent = nullptr);

    Q_INVOKABLE void setActive(const QString &uuid, bool active);
    Q_INVOKABLE void storeItem(const QString &uuid);
    Q_INVOKABLE void requestTree();

signals:
    void treeChanged(const QString &json);

private slots:
    void onItemAppended(const Shared::Source &item);
    void emitTree();

private:
    SourceList *m_sourceList;
};

} // namespace Chart

#endif // CHART_SOURCETREEBRIDGE_H
