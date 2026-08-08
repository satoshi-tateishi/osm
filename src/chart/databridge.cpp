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
    if (m_source) {
        connect(m_source.get(), &Abstract::Source::readyRead, this, &DataBridge::onReadyRead);
    }
}

void DataBridge::onReadyRead()
{
    auto json = m_magnitudeSampler.sampleJson();
    if (!json.isEmpty()) {
        emit magnitudeUpdated(json);
    }
}

} // namespace Chart
