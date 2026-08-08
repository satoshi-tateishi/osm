#include "settingsbridge.h"

#include <QJsonDocument>
#include <QJsonObject>

#include "abstract/source.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

namespace Chart {

SettingsBridge::SettingsBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    connect(m_sourceList, &SourceList::preItemRemoved,
            this, &SettingsBridge::onSourceRemoved);
}

void SettingsBridge::selectSource(const QString &uuidString)
{
    if (m_selectedSource) {
        disconnect(m_selectedSource.get(), &Abstract::Source::readyRead,
                   this, &SettingsBridge::onReadyRead);
    }

    m_selectedUuid = QUuid(uuidString);
    m_selectedSource = m_sourceList->getByUUid(m_selectedUuid);

    if (m_selectedSource) {
        connect(m_selectedSource.get(), &Abstract::Source::readyRead,
                this, &SettingsBridge::onReadyRead);
    }
    emitSettings();
}

void SettingsBridge::setProperty(const QString &uuidString, const QString &name, const QVariant &value)
{
    if (QUuid(uuidString) != m_selectedUuid || !m_selectedSource) {
        return;
    }
    m_selectedSource->setProperty(name.toUtf8().constData(), value);
    emitSettings();
}

void SettingsBridge::setMode(const QString &uuidString, int value)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->setMode(QVariant(value));
        emitSettings();
    }
}

void SettingsBridge::setAverageType(const QString &uuidString, int value)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->setAverageType(QVariant(value));
        emitSettings();
    }
}

void SettingsBridge::setFiltersFrequency(const QString &uuidString, int value)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->setFiltersFrequency(QVariant(value));
        emitSettings();
    }
}

void SettingsBridge::setInputFilter(const QString &uuidString, int value)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->setInputFilter(QVariant(value));
        emitSettings();
    }
}

void SettingsBridge::resetAverage(const QString &uuidString)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->resetAverage();
    }
}

void SettingsBridge::store(const QString &uuidString)
{
    if (QUuid(uuidString) != m_selectedUuid || !m_selectedSource) {
        return;
    }
    m_sourceList->storeItem(m_selectedSource);
}

void SettingsBridge::applyAutoGain(const QString &uuidString, float reference)
{
    if (QUuid(uuidString) != m_selectedUuid) {
        return;
    }
    if (auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get())) {
        measurement->applyAutoGain(reference);
    }
    emitSettings();
}

void SettingsBridge::onReadyRead()
{
    auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get());
    if (!measurement) {
        return;
    }
    QJsonObject payload;
    payload["level"] = measurement->level();
    payload["referenceLevel"] = measurement->referenceLevel();
    payload["measurementPeak"] = measurement->measurementPeak();
    payload["referencePeak"] = measurement->referencePeak();
    emit meterUpdated(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
}

void SettingsBridge::onSourceRemoved(QUuid uuid)
{
    if (uuid != m_selectedUuid) {
        return;
    }
    disconnect(m_selectedSource.get(), &Abstract::Source::readyRead,
               this, &SettingsBridge::onReadyRead);
    m_selectedUuid = QUuid();
    m_selectedSource.reset();
    emitSettings();
}

void SettingsBridge::emitSettings()
{
    QJsonObject payload;

    if (!m_selectedSource) {
        payload["uuid"] = QJsonValue();
        emit settingsChanged(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
        return;
    }

    payload["uuid"] = m_selectedUuid.toString();
    payload["type"] = m_selectedSource->objectName();

    auto *measurement = dynamic_cast<Measurement *>(m_selectedSource.get());
    payload["editable"] = measurement != nullptr;
    if (measurement) {
        payload["name"] = measurement->name();
        payload["active"] = measurement->active();
        payload["averageType"] = static_cast<int>(measurement->averageType());
        payload["average"] = static_cast<int>(measurement->average());
        payload["averageTickSeconds"] = measurement->averageTickSeconds();
        payload["filtersFrequency"] = static_cast<int>(measurement->filtersFrequency());
        payload["gain"] = measurement->gain();
        payload["offset"] = measurement->offset();
        payload["delay"] = measurement->delay();
        payload["mode"] = static_cast<int>(measurement->mode());
        payload["tfcReferenceTime"] = measurement->tfcReferenceTime();
        payload["inputFilter"] = static_cast<int>(measurement->inputFilter());
        payload["polarity"] = measurement->polarity();
    }

    emit settingsChanged(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
}

} // namespace Chart
