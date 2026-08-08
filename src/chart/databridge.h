#ifndef CHART_DATABRIDGE_H
#define CHART_DATABRIDGE_H

#include <QObject>

#include "abstract/source.h"
#include "seriessampler.h"

namespace Chart {

// Phase 1: 1ソース固定。複数パネル/複数ソース時のライフサイクル一般設計はPhase 5で行う
// (dev-docs/js-frontend-phases.md Phase 5参照、意図的にここでは作り込まない)。
class DataBridge : public QObject
{
    Q_OBJECT
public:
    explicit DataBridge(QObject *parent = nullptr);

    void setSource(const Shared::Source &source);

signals:
    void magnitudeUpdated(const QString &json);

private slots:
    void onReadyRead();

private:
    Shared::Source m_source;
    MagnitudeSeriesSampler m_magnitudeSampler;
};

} // namespace Chart

#endif // CHART_DATABRIDGE_H
