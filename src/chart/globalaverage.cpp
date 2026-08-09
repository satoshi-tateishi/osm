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
#include "globalaverage.h"

#include <algorithm>

using namespace Chart;

GlobalAverage *GlobalAverage::s_instance = nullptr;

GlobalAverage::GlobalAverage(Settings *settings) : QObject(settings)
{
    s_instance = this;
}

GlobalAverage *GlobalAverage::instance()
{
    return s_instance;
}

Settings *GlobalAverage::settings() const
{
    return qobject_cast<Settings *>(parent());
}

unsigned int GlobalAverage::seconds() const noexcept
{
    return settings()->value("globalAverage", 2).toUInt();
}

void GlobalAverage::setSeconds(unsigned int s) noexcept
{
    s = std::clamp(s, 1u, 4u);
    if (s == seconds()) {
        return;
    }
    settings()->setValue("globalAverage", s);
    emit secondsChanged(s);
}
