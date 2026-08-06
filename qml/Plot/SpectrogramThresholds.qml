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
import QtQuick 2.15
import QtQuick.Controls 2.2

Item {
    id: control
    property var plot

    readonly property real dbMin: -80
    readonly property real dbMax: 0
    readonly property real barTop: 10
    readonly property real barBottom: height - 20
    readonly property real barHeight: barBottom - barTop
    readonly property real minGap: 3

    readonly property real lowerV: plot ? plot.lower : -100
    readonly property real upperV: plot ? plot.upper : 0
    readonly property real segV: Math.max(0.001, (upperV - lowerV) / 3)
    readonly property real mid1V: lowerV + segV
    readonly property real mid2V: upperV - segV

    function posOf(value) {
        var p = (dbMax - value) / (dbMax - dbMin);
        return Math.max(0, Math.min(1, p));
    }

    function valueToY(value) {
        return barBottom - barHeight * (value - dbMin) / (dbMax - dbMin);
    }

    function yToValue(y) {
        return dbMin + (dbMax - dbMin) * (barBottom - y) / barHeight;
    }

    Rectangle {
        id: bar
        x: 4
        y: control.barTop
        width: 10
        height: control.barHeight
        radius: 2
        border.width: 1
        border.color: "#888888"

        // QMLのGradientは同一position上に2つのGradientStopを置いても
        // ハードエッジの色順序が保証されないため、ごく僅かな位置差(epsilon)を設けている。
        readonly property real epsilon: 1.0 / Math.max(1, control.barHeight)
        readonly property real posUpper: control.posOf(control.upperV)
        readonly property real posMid2: Math.max(posUpper, control.posOf(control.mid2V))
        readonly property real posMid1: Math.max(posMid2, control.posOf(control.mid1V))
        readonly property real posLower: Math.max(posMid1, control.posOf(control.lowerV))
        readonly property real posLowerEdge: Math.min(1.0, posLower + epsilon)

        gradient: Gradient {
            orientation: Gradient.Vertical
            GradientStop { position: 0.0; color: "#F44336" }
            GradientStop { position: bar.posUpper; color: "#F44336" }
            GradientStop { position: bar.posMid2; color: "#FFEB3B" }
            GradientStop { position: bar.posMid1; color: "#8BC34A" }
            GradientStop { position: bar.posLower; color: "#2196F3" }
            GradientStop { position: bar.posLowerEdge; color: "transparent" }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }

    Item {
        id: lowerHandle
        width: 16
        height: 16
        x: bar.x + bar.width

        function updatePosition() {
            if (!mouseAreaLower.drag.active) {
                y = control.valueToY(control.lowerV) - height / 2;
            }
        }

        Component.onCompleted: updatePosition()
        Connections {
            target: control
            function onLowerVChanged() { lowerHandle.updatePosition(); }
            function onHeightChanged() { lowerHandle.updatePosition(); }
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "▲"
            color: "#2196F3"
            font.pixelSize: 14
        }

        MouseArea {
            id: mouseAreaLower
            anchors.fill: parent
            cursorShape: Qt.SizeVerCursor
            hoverEnabled: true
            drag.target: parent
            drag.axis: Drag.YAxis
            drag.minimumY: control.valueToY(control.upperV - control.minGap) - height / 2
            drag.maximumY: control.valueToY(control.dbMin) - height / 2

            ToolTip.visible: containsMouse || drag.active
            ToolTip.text: Math.floor(control.lowerV) + "dB"

            onPositionChanged: {
                var v = control.yToValue(lowerHandle.y + lowerHandle.height / 2);
                v = Math.max(control.dbMin, Math.min(control.upperV - control.minGap, v));
                if (control.plot) {
                    control.plot.lower = Math.round(v);
                }
            }
        }
    }

    Item {
        id: upperHandle
        width: 16
        height: 16
        x: bar.x + bar.width

        function updatePosition() {
            if (!mouseAreaUpper.drag.active) {
                y = control.valueToY(control.upperV) - height / 2;
            }
        }

        Component.onCompleted: updatePosition()
        Connections {
            target: control
            function onUpperVChanged() { upperHandle.updatePosition(); }
            function onHeightChanged() { upperHandle.updatePosition(); }
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "▼"
            color: "#F44336"
            font.pixelSize: 14
        }

        MouseArea {
            id: mouseAreaUpper
            anchors.fill: parent
            cursorShape: Qt.SizeVerCursor
            hoverEnabled: true
            drag.target: parent
            drag.axis: Drag.YAxis
            drag.minimumY: control.valueToY(control.dbMax) - height / 2
            drag.maximumY: control.valueToY(control.lowerV + control.minGap) - height / 2

            ToolTip.visible: containsMouse || drag.active
            ToolTip.text: Math.floor(control.upperV) + "dB"

            onPositionChanged: {
                var v = control.yToValue(upperHandle.y + upperHandle.height / 2);
                v = Math.max(control.lowerV + control.minGap, Math.min(control.dbMax, v));
                if (control.plot) {
                    control.plot.upper = Math.round(v);
                }
            }
        }
    }
}
