/**
 *  OSM
 *  Copyright (C) 2026  Pavel Smokotnin

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
#ifndef GLOBALSMOOTHING_H
#define GLOBALSMOOTHING_H

#include "settings.h"

namespace Chart {

class GlobalSmoothing : public QObject
{
    Q_OBJECT
    Q_PROPERTY(unsigned int pointsPerOctave READ pointsPerOctave WRITE setPointsPerOctave NOTIFY
               pointsPerOctaveChanged)

public:
    explicit GlobalSmoothing(Settings *settings);
    static GlobalSmoothing *instance();

    unsigned int pointsPerOctave() const noexcept;
    void setPointsPerOctave(unsigned int p) noexcept;

signals:
    void pointsPerOctaveChanged(unsigned int);

private:
    Settings *settings() const;
    static GlobalSmoothing *s_instance;
};

}
#endif // GLOBALSMOOTHING_H
