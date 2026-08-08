#include "seriessampler.h"

#include "abstract/source.h"
#include "math/complex.h"

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

PhaseSeriesSampler::PhaseSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void PhaseSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &PhaseSeriesSampler::source() const
{
    return m_source;
}

QString PhaseSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, phaseDeg;
    Complex value(0);
    float magnitudePower = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value, &magnitudePower](const unsigned int &i) {
            value += m_source->phase(i);
            auto m = m_source->magnitudeRaw(i);
            magnitudePower += m * m;
        };

        auto collected = [&value, &magnitudePower, &frequency, &phaseDeg](const float &bandStart, const float &bandEnd,
                                                                          const unsigned int &count) {
            auto avg = value / static_cast<float>(count);
            auto degrees = std::atan2(avg.imag, avg.real) * 180.0 / M_PI;
            // 同じ帯域のMagnitudeが無効(無音/未接続でNaN・Infになる)場合、Phase自体の
            // 生値がたまたま有限(0度)に見えても意味のあるデータではないため、あわせてnullにする。
            auto magnitudeDb = 10.0 * std::log10(magnitudePower / count);
            bool valid = std::isfinite(degrees) && std::isfinite(magnitudeDb);

            frequency.append((bandStart + bandEnd) / 2.0);
            phaseDeg.append(valid ? QJsonValue(degrees) : QJsonValue());

            value = Complex(0);
            magnitudePower = 0.f;
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
    payload["phaseDeg"] = phaseDeg;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

CoherenceSeriesSampler::CoherenceSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void CoherenceSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &CoherenceSeriesSampler::source() const
{
    return m_source;
}

QString CoherenceSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, coherenceValue;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            value += m_source->coherence(i);
        };

        auto collected = [&value, &frequency, &coherenceValue](const float &bandStart, const float &bandEnd,
                                                                const unsigned int &count) {
            auto avg = value / count;
            frequency.append((bandStart + bandEnd) / 2.0);
            coherenceValue.append(std::isfinite(avg) ? QJsonValue(avg) : QJsonValue());
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
    payload["coherenceValue"] = coherenceValue;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

RTASeriesSampler::RTASeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void RTASeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &RTASeriesSampler::source() const
{
    return m_source;
}

QString RTASeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    QJsonArray frequency, levelDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            if (i == 0) {
                return; // DC成分を除外(rtaseriesrenderer.cppと同じ)
            }
            auto m = m_source->module(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &levelDb](const float &bandStart, const float &bandEnd,
                                                         const unsigned int &) {
            // RTAはバンド内エネルギー合計を表示するため、Magnitudeと異なりcountで割らない
            // (rtaseriesrenderer.cpp renderPPOLine()と同じ式、Scale::DBfs固定でoffset=0)
            auto db = 10.0 * std::log10(value);
            frequency.append((bandStart + bandEnd) / 2.0);
            levelDb.append(std::isfinite(db) ? QJsonValue(db) : QJsonValue());
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
    payload["levelDb"] = levelDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

SpectrogramSeriesSampler::SpectrogramSeriesSampler() : FrequencyBasedSeriesHelper()
{
}

void SpectrogramSeriesSampler::setSource(const Shared::Source &source)
{
    m_source = source;
}

const Shared::Source &SpectrogramSeriesSampler::source() const
{
    return m_source;
}

QString SpectrogramSeriesSampler::sampleJson(unsigned int pointsPerOctave)
{
    if (!m_source || !m_source->active()) {
        return QString();
    }

    constexpr float floor = -140.f;
    QJsonArray frequency, levelDb;
    float value = 0.f;
    bool hasData = false;

    m_source->lock();
    if (m_source->frequencyDomainSize()) {
        hasData = true;

        auto accumulate = [this, &value](const unsigned int &i) {
            if (i == 0) {
                return; // DC成分を除外(spectrogramseriesrenderer.cppと同じ)
            }
            auto m = m_source->module(i);
            value += m * m;
        };

        auto collected = [&value, &frequency, &levelDb](const float &bandStart, const float &bandEnd,
                                                          const unsigned int &) {
            auto db = 10.0 * std::log10(value);
            // 無音/未接続でもnullにせずフロアへクランプする(Magnitude/Phase/RTAと異なり、
            // ヒートマップは全セルに色が必要なため。spectrogramseriesrenderer.cppと同じ方針)。
            if (!std::isfinite(db) || db < floor) {
                db = floor;
            }
            frequency.append((bandStart + bandEnd) / 2.0);
            levelDb.append(db);
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
    payload["frequency"] = frequency;
    payload["levelDb"] = levelDb;

    return QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
}

} // namespace Chart
