/**
 *  OSM
 *  Copyright (C) 2019  Pavel Smokotnin

 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.

 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.

 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
#include "frequencybasedplot.h"
using namespace Chart;

namespace {
constexpr float FIXED_X_MIN = 20.f;
constexpr float FIXED_X_MAX = 20'000.f;
}

FrequencyBasedPlot::FrequencyBasedPlot(Settings *settings, QQuickItem *parent): XYPlot(settings,
                                                                                           parent),
    m_pointsPerOctave(12), m_useGlobalPPO(true), m_coherenceThreshold(0.7f), m_coherence(true)
{
    configureXAxis();
    connect(GlobalSmoothing::instance(), &GlobalSmoothing::pointsPerOctaveChanged, this,
            &FrequencyBasedPlot::applyGlobalPPO);
}
void FrequencyBasedPlot::setCoherenceThreshold(float coherenceThreshold) noexcept
{
    if (!qFuzzyCompare(m_coherenceThreshold, coherenceThreshold)) {
        m_coherenceThreshold = coherenceThreshold;
        emit coherenceThresholdChanged(m_coherenceThreshold);
        update();
    }
}

void FrequencyBasedPlot::configureXAxis()
{
    m_x.configure(AxisType::Logarithmic, 12.f, 96000.f);
    m_x.setUnit("Hz");
    m_x.setReset(20.f, 20'000.f);
    m_x.setISOLabels();
    m_x.reset();
}

bool FrequencyBasedPlot::isPointsPerOctaveValid(unsigned int &value) const
{
    return value >= 1 && value <= 48;
}

void FrequencyBasedPlot::setPointsPerOctave(unsigned int p) noexcept
{
    if (m_pointsPerOctave == p)
        return;

    if (isPointsPerOctaveValid(p)) {
        m_pointsPerOctave = p;
        emit pointsPerOctaveChanged(m_pointsPerOctave);
        update();
    }
}

void FrequencyBasedPlot::applyGlobalPPO(unsigned int p)
{
    if (m_useGlobalPPO) {
        setPointsPerOctave(p);
    }
}

bool FrequencyBasedPlot::useGlobalPPO() const noexcept
{
    return m_useGlobalPPO;
}

void FrequencyBasedPlot::setUseGlobalPPO(bool use) noexcept
{
    if (m_useGlobalPPO == use)
        return;

    m_useGlobalPPO = use;
    emit useGlobalPPOChanged(m_useGlobalPPO);

    if (m_useGlobalPPO) {
        setPointsPerOctave(GlobalSmoothing::instance()->pointsPerOctave());
    }
}

bool FrequencyBasedPlot::coherence() const noexcept
{
    return  m_coherence;
}
void FrequencyBasedPlot::setCoherence(bool coherence) noexcept
{
    if (m_coherence == coherence)
        return;

    m_coherence = coherence;
    emit coherenceChanged(m_coherence);
    update();
}

float FrequencyBasedPlot::coherenceThreshold() const noexcept
{
    return m_coherenceThreshold;
}
void FrequencyBasedPlot::setSettings(Settings *settings) noexcept
{
    XYPlot::setSettings(settings);

    // x from/x to (frequency axis) is fixed and not user-adjustable, regardless of stored settings
    m_x.setMin(FIXED_X_MIN);
    m_x.setMax(FIXED_X_MAX);

    setCoherence(
        m_settings->reactValue<FrequencyBasedPlot, bool>("coherence", this,
                                                         &FrequencyBasedPlot::coherenceChanged, m_coherence).toBool());
    setCoherenceThreshold(
        m_settings->reactValue<FrequencyBasedPlot, float>("coherenceThreshold", this,
                                                          &FrequencyBasedPlot::coherenceThresholdChanged, m_coherenceThreshold).toFloat());
    setUseGlobalPPO(
        m_settings->reactValue<FrequencyBasedPlot, bool>("useGlobalPPO", this,
                                                          &FrequencyBasedPlot::useGlobalPPOChanged, true).toBool());
    if (m_useGlobalPPO) {
        setPointsPerOctave(GlobalSmoothing::instance()->pointsPerOctave());
    } else {
        setPointsPerOctave(
            m_settings->reactValue<FrequencyBasedPlot, unsigned int>("ppo", this,
                                                                     &FrequencyBasedPlot::pointsPerOctaveChanged, m_pointsPerOctave).toUInt());
    }
}
void FrequencyBasedPlot::storeSettings() noexcept
{
    if (!m_settings)
        return;

    XYPlot::storeSettings();
    m_settings->setValue("coherence", m_coherence);
    m_settings->setValue("coherenceThreshold", m_coherenceThreshold);
    m_settings->setValue("ppo", m_pointsPerOctave);
    m_settings->setValue("useGlobalPPO", m_useGlobalPPO);
}

unsigned int FrequencyBasedPlot::pointsPerOctave() const noexcept
{
    return m_pointsPerOctave;
}
