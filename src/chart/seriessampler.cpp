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
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, magnitudeDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            auto m = m_source->magnitudeRaw(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &magnitudeDb](const float &bandStart, const float &bandEnd,
                                                            const unsigned int &count) {
            auto db = 10.0 * std::log10(value / count);
            frequency.append((bandStart + bandEnd) / 2.0);
            // magnitudeRaw==0(無音/未接続)の帯域は-Infinityになる。JSONではnullにして、
            // JS側で「データなし」として扱う。
            magnitudeDb.append(std::isfinite(db) ? QJsonValue(db) : QJsonValue());
            value = 0.f;
        };

        iterate(pointsPerOctave, accumulate, collected);
    }
    m_source->unlock();

    if (!hasData) {
        return QString();
    }

    QJsonObject payload;
    payload["sourceName"] = m_source->name();
    payload["color"] = m_source->color().name();
    payload["frequency"] = frequency;
    payload["magnitudeDb"] = magnitudeDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

} // namespace Chart
