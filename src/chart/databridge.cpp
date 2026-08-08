#include "databridge.h"

#include <cmath>
#include <QJsonDocument>
#include <QJsonObject>

#include "abstract/source.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

namespace Chart {

DataBridge::DataBridge(SourceList *sourceList, QObject *parent)
    : QObject(parent), m_sourceList(sourceList)
{
    connect(m_sourceList, &SourceList::postItemAppended, this, &DataBridge::onItemAppended);
    connect(m_sourceList, &SourceList::preItemRemoved, this, &DataBridge::onItemRemoved);

    for (const auto &item : m_sourceList->items()) {
        onItemAppended(item);
    }
}

DataBridge::~DataBridge()
{
    qDeleteAll(m_samplers);
}

void DataBridge::onItemAppended(const Shared::Source &item)
{
    if (!dynamic_cast<Measurement *>(item.get())) {
        return;
    }
    auto uuid = item->uuid();
    if (m_samplers.contains(uuid)) {
        return;
    }

    auto *samplers = new SamplerSet();
    samplers->magnitude.setSource(item);
    samplers->phase.setSource(item);
    samplers->coherence.setSource(item);
    samplers->rta.setSource(item);
    samplers->spectrogram.setSource(item);
    m_samplers.insert(uuid, samplers);

    connect(item.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
}

void DataBridge::onItemRemoved(QUuid uuid)
{
    // preItemRemoved(uuid)を使う(postItemRemovedは引数を持たないため、
    // どのソースのサンプラーを破棄すべきか特定できない)。SourceTreeBridgeが
    // ツリー再構築にpostItemRemovedを使っているのとは目的が異なる点に注意。
    auto it = m_samplers.find(uuid);
    if (it == m_samplers.end()) {
        return;
    }
    if (auto source = m_sourceList->getByUUid(uuid)) {
        disconnect(source.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
    }
    delete it.value();
    m_samplers.erase(it);
    emit sourceRemoved(uuid.toString());
}

void DataBridge::onReadyRead()
{
    auto *source = qobject_cast<Abstract::Source *>(sender());
    if (!source) {
        return;
    }
    auto it = m_samplers.find(source->uuid());
    if (it == m_samplers.end()) {
        return;
    }
    auto *samplers = it.value();

    auto magnitudeJson = samplers->magnitude.sampleJson();
    if (!magnitudeJson.isEmpty()) {
        emit magnitudeUpdated(magnitudeJson);
    }

    auto phaseJson = samplers->phase.sampleJson();
    if (!phaseJson.isEmpty()) {
        emit phaseUpdated(phaseJson);
    }

    auto coherenceJson = samplers->coherence.sampleJson();
    if (!coherenceJson.isEmpty()) {
        emit coherenceUpdated(coherenceJson);
    }

    auto rtaJson = samplers->rta.sampleJson();
    if (!rtaJson.isEmpty()) {
        emit rtaUpdated(rtaJson);
    }

    auto spectrogramJson = samplers->spectrogram.sampleJson();
    if (!spectrogramJson.isEmpty()) {
        emit spectrogramRowUpdated(spectrogramJson);
    }

    if (auto *measurement = dynamic_cast<Measurement *>(source)) {
        auto finiteOrNull = [](float value) {
            return std::isfinite(value) ? QJsonValue(value) : QJsonValue();
        };
        QJsonObject payload;
        payload["uuid"] = source->uuid().toString();
        payload["level"] = finiteOrNull(measurement->level());
        payload["referenceLevel"] = finiteOrNull(measurement->referenceLevel());
        payload["measurementPeak"] = finiteOrNull(measurement->measurementPeak());
        payload["referencePeak"] = finiteOrNull(measurement->referencePeak());
        emit levelUpdated(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
    }
}

} // namespace Chart
