#ifndef CHART_SERIESSAMPLER_H
#define CHART_SERIESSAMPLER_H

#include <QString>

#include "frequencybasedserieshelper.h"
#include "shared/source_shared.h"

namespace Chart {

// Phase 1: Magnitude(dBモード固定)専用の最小実装。
// pointsPerOctaveはFrequencyBasedPlotの既定値(12)に固定し、コントロールは持たない。
class MagnitudeSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit MagnitudeSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"uuid","sourceName","color","frequency":[...],"magnitudeDb":[...]} のJSON文字列。
    // ソースが無効/データ無しの場合は空文字列を返す。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

class PhaseSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit PhaseSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"uuid","sourceName","color","frequency":[...],"phaseDeg":[...]} のJSON文字列。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

class CoherenceSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit CoherenceSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"uuid","sourceName","color","frequency":[...],"coherenceValue":[...]} のJSON文字列。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

class RTASeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit RTASeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"uuid","sourceName","color","frequency":[...],"levelDb":[...]} のJSON文字列。
    // RTAPlotの既定値(pointsPerOctave=6、Mode::Line、Scale::DBfs)に固定。
    QString sampleJson(unsigned int pointsPerOctave = 6);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

class SpectrogramSeriesSampler : private FrequencyBasedSeriesHelper
{
public:
    explicit SpectrogramSeriesSampler();

    void setSource(const Shared::Source &source);

    // 戻り値: {"uuid","sourceName","frequency":[...],"levelDb":[...]} の1行分のJSON文字列。
    // 無音/未接続の帯域はnullにせず-140dB(フロア)へクランプする(ヒートマップは全セルに色が必要なため)。
    QString sampleJson(unsigned int pointsPerOctave = 12);

protected:
    const Shared::Source &source() const override;

private:
    Shared::Source m_source;
};

} // namespace Chart

#endif // CHART_SERIESSAMPLER_H
