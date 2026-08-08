#include "seriessampler.h"

#include "abstract/source.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

namespace Chart {

MagnitudeSeriesSampler::MagnitudeSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void MagnitudeSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &MagnitudeSeriesSampler::source() const
{
    return m_source;
}

QString MagnitudeSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active() || !m_source->frequencyDomainSize()) {
        return QString();
    }

    QJsonArray frequency, magnitudeDb;
    float value = 0.f;

    auto accumulate = [this, &value](const unsigned int &i) {
        auto m = m_source->magnitudeRaw(i);
        value += m * m;
    };

    auto collected = [&value, &frequency, &magnitudeDb](const float &bandStart, const float &bandEnd,
                                                        const unsigned int &count) {
        frequency.append((bandStart + bandEnd) / 2.0);
        magnitudeDb.append(10.0 * std::log10(value / count));
        value = 0.f;
    };

    iterate(pointsPerOctave, accumulate, collected);

    QJsonObject payload;
    payload["sourceName"] = m_source->name();
    payload["color"] = m_source->color().name();
    payload["frequency"] = frequency;
    payload["magnitudeDb"] = magnitudeDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

} // namespace Chart
