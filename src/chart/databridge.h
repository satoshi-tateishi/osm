#ifndef CHART_DATABRIDGE_H
#define CHART_DATABRIDGE_H

#include <QMap>
#include <QObject>
#include <QUuid>

#include "seriessampler.h"
#include "shared/source_shared.h"

class SourceList;

namespace Chart {

class GlobalSmoothing;
class GlobalAverage;

// トップレベルのMeasurement全件についてサンプラー一式を保持し、各ソースの
// readyRead()のたびに該当ソース分のJSONを配信する(複数ウィンドウではなく
// 単一のchartDataオブジェクトが全ソース分を多重化して流す設計)。
class DataBridge : public QObject
{
    Q_OBJECT
public:
    explicit DataBridge(SourceList *sourceList, GlobalSmoothing *globalSmoothing, GlobalAverage *globalAverage,
                        QObject *parent = nullptr);
    ~DataBridge() override;

signals:
    void magnitudeUpdated(const QString &json);
    void phaseUpdated(const QString &json);
    void coherenceUpdated(const QString &json);
    void rtaUpdated(const QString &json);
    void spectrogramRowUpdated(const QString &json);
    void levelUpdated(const QString &json);
    void sourceRemoved(const QString &uuid);

private slots:
    void onItemAppended(const Shared::Source &item);
    void onItemRemoved(QUuid uuid);
    void onReadyRead();
    void onGlobalPointsPerOctaveChanged(unsigned int pointsPerOctave);
    void onGlobalAverageSecondsChanged(unsigned int seconds);

private:
    struct SamplerSet {
        MagnitudeSeriesSampler magnitude;
        PhaseSeriesSampler phase;
        CoherenceSeriesSampler coherence;
        RTASeriesSampler rta;
        SpectrogramSeriesSampler spectrogram;
    };

    void emitCurves(SamplerSet *samplers, unsigned int pointsPerOctave);
    void applyGlobalAverage(const Shared::Source &item, unsigned int seconds);

    SourceList *m_sourceList;
    GlobalSmoothing *m_globalSmoothing;
    GlobalAverage *m_globalAverage;
    QMap<QUuid, SamplerSet *> m_samplers;
};

} // namespace Chart

#endif // CHART_DATABRIDGE_H
