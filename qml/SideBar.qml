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
import QtQuick 2.15
import QtQuick.Controls 1.4
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.3
import QtQml 2.2
import QtQml.Models 2.3
import QtQuick.Controls.Material 2.12

import SourceModel 1.0
import OpenSoundMeter 1.0
import "elements"
import "source"

/**
 * SideBar
 *
 * There are all current active measurements, stores and sound sources
 * at the sidebar item.
 *
 * For detail settings the bottom bar is used.
 */
Item {
    property int colorIndex: 6;

    ColumnLayout {
        anchors.fill: parent
        spacing: 5

        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            DropDown {
                id: chartsCount
                Layout.alignment: Qt.AlignHCenter
                model: ["Single", "Double", "Three"]
                currentIndex: charts.count - 1
                onCurrentIndexChanged: {
                    applicationWindow.charts.count = currentIndex + 1
                }

                Shortcut {
                    sequence: "Ctrl+1"
                    onActivated: chartsCount.currentIndex = 0;
                }
                Shortcut {
                    sequence: "Ctrl+2"
                    onActivated: chartsCount.currentIndex = 1;
                }
                Shortcut {
                    sequence: "Ctrl+3"
                    onActivated: chartsCount.currentIndex = 2;
                }
                Shortcut {
                    sequence: "Ctrl+4"
                    onActivated: {
                        applicationWindow.charts.autoHeight();
                    }
                }
            }
            Button {
                font.family: "Osm"
                font.pixelSize: 30
                text: "\uf0C9"
                flat: true
                onClicked: applicationWindow.sideMenu.open();
                visible: applicationAppearance.showMenuBar ? false : true
            }
        }

        Generator {}

        RowLayout {
            Layout.fillWidth: true

            TitledCombo {
                title: qsTr("smoothing")
                tooltip: qsTr("global smoothing, used by measurements set to \"Global\"")
                Layout.fillWidth: true
                readonly property var ppoValues: [1, 3, 6, 12, 24, 48]
                model: ["1/1 oct", "1/3 oct", "1/6 oct", "1/12 oct", "1/24 oct", "1/48 oct"]
                currentIndex: ppoValues.indexOf(globalSmoothing.pointsPerOctave)
                onCurrentIndexChanged: globalSmoothing.pointsPerOctave = ppoValues[currentIndex]
            }
        }

        TargetTrace {
            visible: targetTraceModel.show
        }

        RowLayout {
            id: listColumns
            Layout.fillHeight: true
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            Layout.margins: 0
            spacing: 0

            SourceColumn {
                id: dataColumn
                Layout.fillHeight: true
                Layout.fillWidth: true
                columnFilter: "data"
                showBulkHeader: true
                rootSources: sourceList
            }

            Rectangle {
                Layout.fillHeight: true
                Layout.preferredWidth: 1
                color: Material.dividerColor
            }

            SourceColumn {
                id: measurementColumn
                Layout.fillHeight: true
                Layout.fillWidth: true
                columnFilter: "measurement"
                showBulkHeader: false
                rootSources: sourceList
            }
        }

        Shortcut {
            sequence: "Ctrl+X"
            context: Qt.ApplicationShortcut
            onActivated: {
                for (var i = 0; i < sourceList.count; i++) {
                    let source = sourceList.get(i).data;
                    if ( source && source.active ) {
                        var stored = source.store();
                        if (stored && stored.data) {
                            stored.data.autoName(source.name);
                            stored.data.active = true;
                            sourceList.appendItem(stored, true);
                        }
                    }
                }
            }
        }

        Shortcut {
            sequence: "Ctrl+R"
            context: Qt.ApplicationShortcut
            onActivated: {
                for (var i = 0; i < sourceList.count; i++) {
                    let source = sourceList.get(i).data;
                    if (source && source.objectName === "Measurement"){
                        source.resetAverage();
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.bottomMargin: 8

            MouseArea {
                visible: false
                Layout.alignment: Qt.AlignCenter
                Layout.preferredHeight: aboutButton.height + aboutButton.topPadding + aboutButton.bottomPadding
                Layout.fillWidth: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    aboutpopup.open();
                }

                RowLayout {
                    spacing: 0
                    anchors.fill: parent
                    Layout.alignment: Qt.AlignCenter
                    Item {
                        Layout.fillWidth: true
                    }

                    Image {
                        id: logoImage
                        source: "qrc:/images/icons/white80.png"
                        Layout.preferredHeight: 30
                        Layout.preferredWidth: 30
                        Layout.alignment: Qt.AlignCenter

                        RotationAnimation on rotation {
                            id: rotateImage
                            from: 0
                            to: 360
                            duration: 1200
                        }

                        Timer {
                            interval: 614657
                            running: true
                            repeat: true
                            onTriggered: rotateImage.start()
                        }
                    }

                    Label {
                        id:aboutButton
                        text: "ABOUT"
                        verticalAlignment: Text.AlignVCenter
                        rightPadding: 8
                        leftPadding: 8
                        bottomPadding: 8
                        topPadding: 8
                        font.pointSize: 11
                        Material.foreground: Material.Indigo
                        height: 48
                    }

                    Item {
                        Layout.fillWidth: true
                    }
                }
            }

            Button {
                visible: false
                font.family: "Osm"
                text: "\ue807"
                flat: true

                PropertiesOpener {
                   propertiesQml: "qrc:/RemoteProperties.qml"
                   onClicked: {
                       open();
                   }
                }
            }

            Item {
                Layout.preferredWidth: 0.1
            }
        }
    }
}
