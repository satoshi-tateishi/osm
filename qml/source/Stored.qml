/**
 *  OSM
 *  Copyright (C) 2018  Pavel Smokotnin

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
import QtQuick 2.7
import QtQuick.Controls 2.1
import QtQuick.Layouts 1.3
import "qrc:/"

Item {
    id: store

    property var dataModel : [];
    property var dataModelData : dataModel.data
    property bool chartable : true;
    property bool highlight : false;
    property string propertiesQml: "qrc:/source/StoredProperties.qml"
    //true when an enclosing Group's own checkbox is off: greys out the checkbox color below
    //without touching this item's own checked state, so it's visually clear it belongs to a
    //currently-inactive Group
    property bool dimmed: false
    height: 50
    width: parent.width

    RowLayout {
        width: parent.width

        //keeps this checkbox aligned with a sibling Group's checkbox, which is pushed right by
        //its disclosure arrow (see Group.qml) -- this row has no arrow of its own, so it reserves
        //the same width instead
        Item {
            Layout.preferredWidth: 16
        }

        MulticolorCheckBox {
            id: checkbox
            Layout.alignment: Qt.AlignVCenter

            checkedColor: dimmed ? "grey" : (dataModelData ? dataModelData.color : "")

            onCheckStateChanged: {
                dataModelData.active = checked
            }
            Component.onCompleted: {
                checked = dataModelData ? dataModelData.active : false
            }
        }

        ColumnLayout {
            Layout.fillWidth: true

            Label {
                Layout.fillWidth: true
                font.bold: highlight
                text:  (dataModelData ? dataModelData.name : "")
            }

        }

        Connections {
            target: dataModelData
            function onColorChanged() {
                checkbox.data.checkedColor = dimmed ? "grey" : dataModelData.color;
            }
        }
    }
}
