#ifndef CHART_SETTINGSBRIDGE_H
#define CHART_SETTINGSBRIDGE_H

#include <QObject>
#include <QString>
#include <QUuid>
#include <QVariant>

#include "audio/devicemodel.h"
#include "shared/source_shared.h"

class SourceList;

namespace Chart {

// JSソースツリーで選択中の設定を公開する。SourceList::selectedIndexとは連動せず、
// Spectrogramと同じJSローカル選択を使うことで、両パネルを同じクリックへ追従させる。
class SettingsBridge : public QObject
{
    Q_OBJECT
public:
    explicit SettingsBridge(SourceList *sourceList, QObject *parent = nullptr);

    Q_INVOKABLE void selectSource(const QString &uuid);
    Q_INVOKABLE void setProperty(const QString &uuid, const QString &name, const QVariant &value);
    Q_INVOKABLE void setMode(const QString &uuid, int value);
    Q_INVOKABLE void setAverageType(const QString &uuid, int value);
    Q_INVOKABLE void setFiltersFrequency(const QString &uuid, int value);
    Q_INVOKABLE void setInputFilter(const QString &uuid, int value);
    Q_INVOKABLE void resetAverage(const QString &uuid);
    Q_INVOKABLE void store(const QString &uuid);
    Q_INVOKABLE void applyAutoGain(const QString &uuid, float reference);

signals:
    void settingsChanged(const QString &json);

private slots:
    void onSourceRemoved(QUuid uuid);

private:
    void emitSettings();

    SourceList *m_sourceList;
    QUuid m_selectedUuid;
    Shared::Source m_selectedSource;
    audio::DeviceModel *m_deviceModel;
};

} // namespace Chart

#endif // CHART_SETTINGSBRIDGE_H
