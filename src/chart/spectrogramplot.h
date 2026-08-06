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
#ifndef SPECTROGRAMPLOT_H
#define SPECTROGRAMPLOT_H

#include "frequencybasedplot.h"

namespace Chart {
class SpectrogramPlot : public FrequencyBasedPlot
{
    Q_OBJECT
    Q_PROPERTY(int lower READ lower WRITE setLower NOTIFY lowerChanged)
    Q_PROPERTY(int upper READ upper WRITE setUpper NOTIFY upperChanged)
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)

public:
    SpectrogramPlot(Settings *settings, QQuickItem *parent = Q_NULLPTR);
    void setSettings(Settings *settings) noexcept override;
    void storeSettings() noexcept override;

    Q_INVOKABLE void resetAxis() override;

    int lower() const;
    void setLower(int lower);

    int upper() const;
    void setUpper(int upper);

    bool active() const;
    void setActive(bool active);

signals:
    void lowerChanged(int);
    void upperChanged(int);
    void activeChanged(bool);

protected:
    virtual SeriesItem *createSeriesFromSource(const Shared::Source &source) override;

    int m_lower, m_upper;
    bool m_active;
};
}
#endif // SPECTROGRAMPLOT_H
