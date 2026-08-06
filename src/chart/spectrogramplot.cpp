/**
 *  OSM
 *  Copyright (C) 2020  Pavel Smokotnin

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
#include "spectrogramplot.h"

using namespace Chart;

namespace {
constexpr int DEFAULT_DB_LOWER = -70;
constexpr int DEFAULT_DB_UPPER = -10;
constexpr float FIXED_Y_MIN = 0.f;
constexpr float FIXED_Y_MAX = 4.f;
}

SpectrogramPlot::SpectrogramPlot(Settings *settings, QQuickItem *parent): FrequencyBasedPlot(settings, parent),
    m_lower(DEFAULT_DB_LOWER), m_upper(DEFAULT_DB_UPPER), m_active(true)
{
    m_y.configure(AxisType::Linear, FIXED_Y_MIN, FIXED_Y_MAX,  4);
    m_x.setGridVisible(false);
    setPointsPerOctave(48);
    setFlag(QQuickItem::ItemHasContents);
    m_y.setCentralLabel(m_y.min() - 1.f);
    m_y.setUnit("s");
    connect(this, SIGNAL(pointsPerOctaveChanged(unsigned int)), this, SLOT(update()));
}

void SpectrogramPlot::resetAxis()
{
    setLower(DEFAULT_DB_LOWER);
    setUpper(DEFAULT_DB_UPPER);
    XYPlot::resetAxis();
}

void SpectrogramPlot::setSettings(Settings *settings) noexcept
{
    if (settings && (settings->value("type") == "Spectrogram")) {
        FrequencyBasedPlot::setSettings(settings);
    }

    // y from/y to (time axis) is fixed and not user-adjustable, regardless of stored settings
    m_y.setMin(FIXED_Y_MIN);
    m_y.setMax(FIXED_Y_MAX);

    setLower(m_settings->reactValue<SpectrogramPlot, int>("dBLower", this, &SpectrogramPlot::lowerChanged,
                                                          m_lower).toInt());
    setUpper(m_settings->reactValue<SpectrogramPlot, int>("dBUpper", this, &SpectrogramPlot::upperChanged,
                                                          m_upper).toInt());
}

void SpectrogramPlot::storeSettings() noexcept
{
    if (!m_settings)
        return;

    FrequencyBasedPlot::storeSettings();
    m_settings->setValue("type", "Spectrogram");
    m_settings->setValue("dBLower", m_lower);
    m_settings->setValue("dBUpper", m_upper);
}

int SpectrogramPlot::upper() const
{
    return m_upper;
}

void SpectrogramPlot::setUpper(int upper)
{
    if (m_upper != upper) {
        m_upper = upper;
        emit upperChanged(m_upper);
    }
}

bool SpectrogramPlot::active() const
{
    return m_active;
}

void SpectrogramPlot::setActive(bool active)
{
    if (m_active != active) {
        m_active = active;
        emit activeChanged(m_active);
    }
}

int SpectrogramPlot::lower() const
{
    return m_lower;
}

void SpectrogramPlot::setLower(int lower)
{
    if (m_lower != lower) {
        m_lower = lower;
        emit lowerChanged(m_lower);
    }
}
