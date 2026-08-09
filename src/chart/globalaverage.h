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
#ifndef GLOBALAVERAGE_H
#define GLOBALAVERAGE_H

#include "settings.h"

namespace Chart {

// JSフロントエンド専用のグローバルAverage設定(秒単位、1〜4s)。GlobalSmoothingと同じ
// パターンのシングルトンで、QML版に対応する概念は存在しない(dev-docs/customizations.md参照)。
class GlobalAverage : public QObject
{
    Q_OBJECT
    Q_PROPERTY(unsigned int seconds READ seconds WRITE setSeconds NOTIFY secondsChanged)

public:
    explicit GlobalAverage(Settings *settings);
    static GlobalAverage *instance();

    unsigned int seconds() const noexcept;
    void setSeconds(unsigned int s) noexcept;

signals:
    void secondsChanged(unsigned int);

private:
    Settings *settings() const;
    static GlobalAverage *s_instance;
};

}
#endif // GLOBALAVERAGE_H
