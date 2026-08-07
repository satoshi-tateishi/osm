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
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.3

/**
 * SourceColumn
 *
 * One column of the sidebar's source list: a StackView that shows a
 * SourceLayout filtered to a single columnFilter ("data" or "measurement"),
 * with its own independent Group/Equalizer drill-down navigation.
 */
StackView {
    id: columnStack
    property string columnFilter: "all"
    property bool showBulkHeader: true
    property var rootSources: sourceList

    initialItem: sourceLayoutComponent

    function openGroup(group) {
        columnStack.push(sourceLayoutComponent, { group: group });
    }

    Component {
        id: sourceLayoutComponent

        ColumnLayout {
            property var group : null
            property alias sources : sourcesLayout.sources
            spacing: 0

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 50
                visible: columnStack.depth > 1
                color: "transparent"
                border.color: group && group.data ? group.data.color : "transparent"

                RowLayout {
                    height: 50
                    width: parent.width

                    Label {
                        Layout.preferredWidth: 28+16
                        font.family: "Osm"
                        text: ""
                        horizontalAlignment: Qt.AlignHCenter
                    }

                    Label {
                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignVCenter
                        text: group && group.data ? group.data.name : ""
                        font.bold: true
                    }

                }
                TapHandler {
                    onDoubleTapped: columnStack.pop();
                    onTapped: {
                        if (group && group.data) {
                            switch (group.data.objectName) {
                                case "Group":
                                    applicationWindow.properiesbar.open(group, "qrc:/source/GroupProperties.qml");
                                    break;
                                case "Equalizer":
                                    applicationWindow.properiesbar.open(group, "qrc:/source/EqualizerProperties.qml");
                                break;
                            }
                        }
                    }
                }

                DropArea {
                    anchors { fill: parent; margins: 0 }
                    onDropped: {
                        var parentItemInStack = columnStack.get(columnStack.index - 1, StackView.DontLoad);
                        var parentSources = parentItemInStack.sources;
                        var target = drag.source.source;

                        if (!sources || !group || !target) {
                            return;
                        }
                        var source = group.data.pop(target.uuid, false);
                        if (source) {
                            parentSources.takeItem(source);
                        }
                    }
                }
            }

            SourceLayout {
                id: sourcesLayout
                Layout.fillHeight: true
                Layout.fillWidth: true
                sources: group ? group.data.sourceList : columnStack.rootSources
                columnFilter: columnStack.columnFilter
                showBulkHeader: columnStack.showBulkHeader
                hostStack: columnStack
            }
        }
    }
}
