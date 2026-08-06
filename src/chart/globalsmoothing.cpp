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
#include "globalsmoothing.h"

using namespace Chart;

GlobalSmoothing *GlobalSmoothing::s_instance = nullptr;

GlobalSmoothing::GlobalSmoothing(Settings *settings) : QObject(settings)
{
    s_instance = this;
}

GlobalSmoothing *GlobalSmoothing::instance()
{
    return s_instance;
}

Settings *GlobalSmoothing::settings() const
{
    return qobject_cast<Settings *>(parent());
}

unsigned int GlobalSmoothing::pointsPerOctave() const noexcept
{
    return settings()->value("globalSmoothing", 6).toUInt();
}

void GlobalSmoothing::setPointsPerOctave(unsigned int p) noexcept
{
    if (p == pointsPerOctave()) {
        return;
    }
    settings()->setValue("globalSmoothing", p);
    emit pointsPerOctaveChanged(p);
}
