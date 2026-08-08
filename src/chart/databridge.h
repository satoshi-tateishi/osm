#ifndef CHART_DATABRIDGE_H
#define CHART_DATABRIDGE_H

#include <QObject>

#include "abstract/source.h"
#include "seriessampler.h"

namespace Chart {

// 1インスタンスは1ソースのデータを配信する。複数ソース時の生成・破棄は
// JsFrontendManagerがJSウィンドウのライフサイクルに合わせて管理する。
class DataBridge : public QObject
{
    Q_OBJECT
public:
    explicit DataBridge(QObject *parent = nullptr);

    void setSource(const Shared::Source &source);

signals:
    void magnitudeUpdated(const QString &json);
    void phaseUpdated(const QString &json);
    void coherenceUpdated(const QString &json);
    void rtaUpdated(const QString &json);
    void spectrogramRowUpdated(const QString &json);

private slots:
    void onReadyRead();

private:
    Shared::Source m_source;
    MagnitudeSeriesSampler m_magnitudeSampler;
    PhaseSeriesSampler m_phaseSampler;
    CoherenceSeriesSampler m_coherenceSampler;
    RTASeriesSampler m_rtaSampler;
    SpectrogramSeriesSampler m_spectrogramSampler;
};

} // namespace Chart

#endif // CHART_DATABRIDGE_H
