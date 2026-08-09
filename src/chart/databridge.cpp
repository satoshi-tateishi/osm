#include "databridge.h"

#include <cmath>
#include <QJsonDocument>
#include <QJsonObject>

#include "abstract/source.h"
#include "globalaverage.h"
#include "globalsmoothing.h"
#include "src/source/measurement.h"
#include "src/sourcelist.h"

namespace Chart {

DataBridge::DataBridge(SourceList *sourceList, GlobalSmoothing *globalSmoothing, GlobalAverage *globalAverage,
                       QObject *parent)
    : QObject(parent), m_sourceList(sourceList), m_globalSmoothing(globalSmoothing), m_globalAverage(globalAverage)
{
    connect(m_sourceList, &SourceList::postItemAppended, this, &DataBridge::onItemAppended);
    connect(m_sourceList, &SourceList::preItemRemoved, this, &DataBridge::onItemRemoved);
    connect(m_globalSmoothing, &GlobalSmoothing::pointsPerOctaveChanged, this,
            &DataBridge::onGlobalPointsPerOctaveChanged);
    connect(m_globalAverage, &GlobalAverage::secondsChanged, this,
            &DataBridge::onGlobalAverageSecondsChanged);

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
    applyGlobalAverage(item, m_globalAverage->seconds());

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
    auto pointsPerOctave = m_globalSmoothing->pointsPerOctave();

    emitCurves(samplers, pointsPerOctave);

    // スペクトログラムは時系列に1行ずつ積み上げる表示のため、readyRead()の
    // タイミング(=新しい時間フレーム)でのみサンプリングする。globalSmoothing
    // 変更時の再サンプリングでは行を増やさない(emitCurvesに含めない理由)。
    auto spectrogramJson = samplers->spectrogram.sampleJson(pointsPerOctave);
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
        payload["delay"] = measurement->delay();
        payload["estimatedDelay"] = measurement->estimatedValid()
                ? QJsonValue(static_cast<double>(measurement->estimated()))
                : QJsonValue();
        payload["sampleRate"] = static_cast<double>(measurement->sampleRate());
        emit levelUpdated(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));
    }
}

void DataBridge::onGlobalPointsPerOctaveChanged(unsigned int pointsPerOctave)
{
    // Magnitude/Phase/Coherence/RTAは現在値を毎回全置換で描画する方式のため、
    // 保持中の最新ソース状態から再サンプリングして即座に再描画させる。
    // スペクトログラムは時系列の行積み上げ表示のためここでは再サンプリングしない。
    for (auto *samplers : qAsConst(m_samplers)) {
        emitCurves(samplers, pointsPerOctave);
    }
}

void DataBridge::onGlobalAverageSecondsChanged(unsigned int seconds)
{
    // 個別測定のAverage設定より常にグローバル値を優先する(Global Smoothingと同じ方針)。
    for (const auto &item : m_sourceList->items()) {
        applyGlobalAverage(item, seconds);
    }
}

void DataBridge::applyGlobalAverage(const Shared::Source &item, unsigned int seconds)
{
    auto *measurement = dynamic_cast<Measurement *>(item.get());
    if (!measurement) {
        return;
    }
    auto count = static_cast<unsigned int>(std::lround(seconds / Measurement::averageTickSeconds()));
    measurement->setAverageType(Meta::Measurement::AverageType::FIFO);
    measurement->setAverage(count);
}

void DataBridge::emitCurves(SamplerSet *samplers, unsigned int pointsPerOctave)
{
    auto magnitudeJson = samplers->magnitude.sampleJson(pointsPerOctave);
    if (!magnitudeJson.isEmpty()) {
        emit magnitudeUpdated(magnitudeJson);
    }

    auto phaseJson = samplers->phase.sampleJson(pointsPerOctave);
    if (!phaseJson.isEmpty()) {
        emit phaseUpdated(phaseJson);
    }

    auto coherenceJson = samplers->coherence.sampleJson(pointsPerOctave);
    if (!coherenceJson.isEmpty()) {
        emit coherenceUpdated(coherenceJson);
    }

    auto rtaJson = samplers->rta.sampleJson(pointsPerOctave);
    if (!rtaJson.isEmpty()) {
        emit rtaUpdated(rtaJson);
    }
}

} // namespace Chart
