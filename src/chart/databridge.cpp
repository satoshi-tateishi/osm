#include "databridge.h"

namespace Chart {

DataBridge::DataBridge(QObject *parent) : QObject(parent)
{
}

void DataBridge::setSource(const Shared::Source &source)
{
    if (m_source) {
        disconnect(m_source.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
    }
    m_source = source;
    m_magnitudeSampler.setSource(source);
    m_phaseSampler.setSource(source);
    m_coherenceSampler.setSource(source);
    m_rtaSampler.setSource(source);
    m_spectrogramSampler.setSource(source);
    if (m_source) {
        connect(m_source.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
    }
}

void DataBridge::onReadyRead()
{
    auto magnitudeJson = m_magnitudeSampler.sampleJson();
    if (!magnitudeJson.isEmpty()) {
        emit magnitudeUpdated(magnitudeJson);
    }

    auto phaseJson = m_phaseSampler.sampleJson();
    if (!phaseJson.isEmpty()) {
        emit phaseUpdated(phaseJson);
    }

    auto coherenceJson = m_coherenceSampler.sampleJson();
    if (!coherenceJson.isEmpty()) {
        emit coherenceUpdated(coherenceJson);
    }

    auto rtaJson = m_rtaSampler.sampleJson();
    if (!rtaJson.isEmpty()) {
        emit rtaUpdated(rtaJson);
    }

    auto spectrogramJson = m_spectrogramSampler.sampleJson();
    if (!spectrogramJson.isEmpty()) {
        emit spectrogramRowUpdated(spectrogramJson);
    }
}

} // namespace Chart
