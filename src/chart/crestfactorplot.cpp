/**
 *  OSM
 *  Copyright (C) 2021  Pavel Smokotnin

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
#include "crestfactorplot.h"

namespace Chart {

CrestFactorPlot::CrestFactorPlot(Settings *settings, QQuickItem *parent) : FrequencyBasedPlot(settings, parent)
{
    m_y.configure(AxisType::Linear, 0.f, 60.f, 10);
    m_y.setCentralLabel(m_y.min() - 1.f);
    m_y.setReset(-0.f, 20.f);
    m_y.reset();
    m_y.setUnit("dB");
    setFlag(QQuickItem::ItemHasContents);
}

void CrestFactorPlot::setSettings(Settings *settings) noexcept
{
    if (settings && (settings->value("type") == "CrestFactor")) {
        XYPlot::setSettings(settings);

        setUseGlobalPPO(m_settings->reactValue<CrestFactorPlot, bool>(
                             "useGlobalPPO", this,
                             &FrequencyBasedPlot::useGlobalPPOChanged, true).toBool());
        if (useGlobalPPO()) {
            setPointsPerOctave(GlobalSmoothing::instance()->pointsPerOctave());
        } else {
            setPointsPerOctave(m_settings->reactValue<CrestFactorPlot, unsigned int>(
                                   "pointsPerOctave", this,
                                   &FrequencyBasedPlot::pointsPerOctaveChanged,
                                   m_pointsPerOctave).toUInt());
        }
    }
}

void CrestFactorPlot::storeSettings() noexcept
{
    if (!m_settings)
        return;

    XYPlot::storeSettings();
    m_settings->setValue("pointsPerOctave", m_pointsPerOctave);
    m_settings->setValue("useGlobalPPO", m_useGlobalPPO);
}

} // namespace chart
