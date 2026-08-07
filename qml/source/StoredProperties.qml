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
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.13
import QtQuick.Controls.Material 2.12
import Qt.labs.platform 1.1 as Labs

import OpenSoundMeter 1.0
import "qrc:/elements"

Item {
    property var dataObject
    property var dataObjectData : dataObject.data
    property string saveas: "osm"

    RowLayout
    {
        anchors.fill: parent

        ColumnLayout {
            Layout.fillHeight: true
            Layout.fillWidth: true

            RowLayout {
                FloatSpinBox {
                    id: gainSpinBox
                    implicitWidth: 170
                    value: dataObjectData.gain
                    from: -30
                    to: 30
                    units: "dB"
                    onValueChanged: dataObjectData.gain = value
                    tooltiptext: qsTr("adjust gain")
                    Layout.alignment: Qt.AlignVCenter
                }

                FloatSpinBox {
                    id: delaySpinBox
                    implicitWidth: 170
                    value: dataObjectData.delay
                    from: -100
                    to: 100
                    units: "ms"
                    onValueChanged: dataObjectData.delay = value
                    tooltiptext: qsTr("adjust delay")
                    Layout.alignment: Qt.AlignVCenter
                }

                ColorPicker {
                    id: colorPicker

                    Layout.preferredWidth: 25
                    Layout.preferredHeight: 25
                    Layout.margins: 5

                    onColorChanged: {
                        dataObjectData.color = color
                    }
                    Component.onCompleted: {
                        colorPicker.color = dataObjectData.color
                    }
                }

                NameField {
                    Layout.preferredWidth: 130
                    target: dataObject
                    Layout.alignment: Qt.AlignVCenter
                }
            }
            RowLayout {

                Button {
                    text: "flip"
                    checkable: true
                    checked: dataObjectData.inverse
                    onCheckedChanged: dataObjectData.inverse = checked

                    Material.background: parent.Material.background

                    ToolTip.visible: hovered
                    ToolTip.text: qsTr("inverse magnitude data")
                }

                Button {
                    text: "+/–"
                    checkable: true
                    checked: dataObjectData.polarity
                    onCheckedChanged: dataObjectData.polarity = checked

                    Material.background: parent.Material.background

                    ToolTip.visible: hovered
                    ToolTip.text: qsTr("inverse polarity")
                }

                Button {
                    text: "100%"
                    checkable: true
                    checked: dataObjectData.ignoreCoherence
                    onCheckedChanged: dataObjectData.ignoreCoherence = checked

                    Material.background: parent.Material.background

                    ToolTip.visible: hovered
                    ToolTip.text: qsTr("ignore coherence")
                }

                DropDown {
                    displayText: qsTr("Save data as");

                    implicitWidth: 170
                    model: ["csv"]

                    onActivated: function() {
                        saveas = currentText;
                        var safeName = (dataObjectData.name || "untitled").replace(/[\\/:*?"<>|]/g, "_");
                        fileDialog.currentFile = fileDialog.folder + "/" + safeName + "." + saveas;
                        fileDialog.open();
                    }

                    ToolTip.visible: hovered
                    ToolTip.text: qsTr("export data")

                    enabled: dataObjectData.objectName === "Stored"
                    visible: dataObjectData.objectName === "Stored"
                }
            }
        }

        ScrollView {
            id: scrollTextArea
            Layout.fillWidth: true
            Layout.fillHeight: true
            ScrollBar.vertical.policy: ScrollBar.AlwaysOn
            ScrollBar.vertical.interactive: false

            TextArea {
                id:ta
                padding: 5
                placeholderText: qsTr("notes")
                text: dataObjectData.notes;
                onTextChanged: dataObjectData.notes = text;
                font.italic: true
                wrapMode: TextEdit.WrapAnywhere
                selectByMouse: true
                background: Rectangle{
                    height: scrollTextArea.height
                    width:  scrollTextArea.width
                    border.color: ta.activeFocus ? ta.Material.accentColor : ta.Material.hintTextColor
                    border.width: ta.activeFocus ? 2 : 1
                    color: "transparent"
                }
                Keys.onEscapePressed: {
                    focus = false;
                }
            }
        }
    }

    Labs.FileDialog {
        id: fileDialog
        fileMode: Labs.FileDialog.SaveFile
        title: qsTr("Please choose a file's name")
        folder: Labs.StandardPaths.writableLocation(Labs.StandardPaths.DesktopLocation)
        nameFilters: ["CSV files (*.csv)"]
        defaultSuffix: saveas
        onAccepted: {
            switch (saveas) {
                case "osm":
                    dataObjectData.save(fileDialog.file);
                    break;
                case "cal":
                    dataObjectData.saveCal(fileDialog.file);
                    break;
                case "txt":
                    dataObjectData.saveTXT(fileDialog.file);
                    break;
                case "csv":
                    dataObjectData.saveCSV(fileDialog.file);
                    break;
                case "frd":
                    dataObjectData.saveFRD(fileDialog.file);
                    break;
                case "wav":
                    dataObjectData.saveWAV(fileDialog.file);
                    break;
            }
        }
    }
}

/*##^##
Designer {
    D{i:0;autoSize:true;height:480;width:640}
}
##^##*/
