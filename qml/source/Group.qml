/**
 *  OSM
 *  Copyright (C) 2024  Pavel Smokotnin

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
    id: group

    property var dataModel : [];
    property var sharedGroup : dataModel.data
    property bool chartable : false;
    property bool highlight : false;
    property string propertiesQml: "qrc:/source/GroupProperties.qml"
    //children render inline below, no separate drill-down page. Defaults open; the user can
    //still collapse it via the disclosure arrow. Session-only, not persisted.
    property bool expanded: true
    //nesting depth (0 = top level), and the multi-select scope forwarded down from the
    //enclosing SourceLayout -- both simply passed straight through to our own children
    property int depth: 0
    property var multiSelectScope: null
    //the list that directly contains this Group itself (its siblings), and that list's own
    //parent Group uuid ("" at the top level) -- needed by trailingDrop below, which lands
    //*after* this Group in its own sibling list, not inside it
    property var containingList: null
    property string containingParentGroupUuid: ""
    //true when an enclosing (ancestor) Group's own checkbox is off: greys out this Group's own
    //checkbox color too (without touching its checked state), and is combined with this Group's
    //own active state below when forwarded to its children
    property bool dimmed: false

    width: parent.width
    height: header.height
            + (expanded && nestedListLoader.item ? nestedListLoader.item.contentHeight : 0)
            + trailingDrop.height

    Item {
        id: header
        width: parent.width
        height: 50

        RowLayout {
            width: parent.width

            Label {
                id: disclosure
                Layout.alignment: Qt.AlignVCenter
                Layout.preferredWidth: 16
                visible: sharedGroup && sharedGroup.sourceList.count > 0
                horizontalAlignment: Text.AlignHCenter
                text: group.expanded ? "\u25bc" : "\u25b6"
                font.pixelSize: 10

                MouseArea {
                    anchors.fill: parent
                    anchors.margins: -4
                    onClicked: group.expanded = !group.expanded
                }
            }

            MulticolorCheckBox {
                id: checkbox
                Layout.alignment: Qt.AlignVCenter

                checkedColor: dimmed ? "grey" : (sharedGroup ? sharedGroup.color : "")

                onCheckStateChanged: {
                    if (sharedGroup) {
                        sharedGroup.active = checked
                    }
                }
                Component.onCompleted: {
                    checked = sharedGroup ? sharedGroup.active : false
                }

                Connections {
                    target: sharedGroup
                    function onColorChanged() {
                        checkbox.data.checkedColor = dimmed ? "grey" : sharedGroup.color;
                    }
                    function onActiveChanged() {
                        checkbox.checked = sharedGroup ? sharedGroup.active : false;
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true

                RowLayout {
                    Label {
                        font.family: "Osm"
                        text: "\uf114"
                    }

                    Label {
                        Layout.fillWidth: true
                        font.bold: highlight
                        text:  (sharedGroup ? sharedGroup.name : "")
                    }
                }

                RowLayout {
                    Layout.maximumHeight: 7

                    Repeater {
                        model: sharedGroup ? sharedGroup.sourceList.count : 0

                        Rectangle {
                            property var source: sharedGroup ? sharedGroup.sourceList.get(index) : source
                            color: (source && source.data ? source.data.color : "transparent")
                            width: 7
                            height: 7
                            visible: (source ? true : false)
                        }
                    }
                }

            }
        }
    }

    //Loaded by URL (rather than used as a normal typed element) because SourceLayout.qml itself
    //imports this directory (for the Measurement/Stored/... row delegates), and a direct type
    //reference back to SourceLayout here would make QML report a cyclic import between the two.
    Loader {
        id: nestedListLoader
        anchors.top: header.bottom
        width: group.width
        active: !!sharedGroup
        visible: group.expanded
        source: "qrc:/SourceLayout.qml"
        onLoaded: {
            item.columnFilter = "data";
            item.showBulkHeader = false;
            item.sources = Qt.binding(function () { return sharedGroup ? sharedGroup.sourceList : null; });
            item.depth = Qt.binding(function () { return group.depth + 1; });
            item.parentGroupUuid = Qt.binding(function () { return sharedGroup ? sharedGroup.uuid.toString() : ""; });
            item.multiSelectScope = Qt.binding(function () { return group.multiSelectScope; });
            //children are dimmed if this Group is dimmed itself, or if this Group's own
            //checkbox is off -- either way, everything below it should read as "inactive"
            item.dimmed = Qt.binding(function () { return group.dimmed || !(sharedGroup && sharedGroup.active); });
            //a plain ListView defaults to height 0 when unconstrained; without this the nested
            //list never actually occupies any space even though contentHeight computes correctly
            item.height = Qt.binding(function () { return item.contentHeight; });
        }
    }

    //Landing strip for "insert right after this Group" when there is no sibling row below it to
    //drop on instead (the Group is the last, or only, row at its level) -- e.g. dragging one of
    //its own children past the bottom of the expanded list has nowhere else to go. Only needed
    //while expanded, since otherwise the header's own bottom edge already sits right next to
    //whatever comes next.
    DropArea {
        id: trailingDrop
        anchors.top: nestedListLoader.bottom
        width: group.width
        height: group.expanded ? 10 : 0
        property color previewColor: "transparent"

        onEntered: previewColor = (drag.source.source && drag.source.source.data) ? drag.source.source.data.color : "transparent";
        onExited: previewColor = "transparent";
        onDropped: {
            console.log("[DBG] trailingDrop onDropped containingList=" + containingList + " sharedGroup=" + sharedGroup);
            if (!containingList || !sharedGroup) {
                return;
            }
            var draggedUuid = drag.source.source.data.uuid;
            var targetIndex = containingList.indexOf(sharedGroup.uuid) + 1;
            if (drag.source.rowSources === containingList) {
                containingList.move(drag.source.DelegateModel.itemsIndex, targetIndex);
            } else {
                sourceList.moveItem(draggedUuid, containingParentGroupUuid);
                var newIndex = containingList.indexOf(draggedUuid);
                if (newIndex >= 0) {
                    containingList.move(newIndex, targetIndex);
                }
            }
            previewColor = "transparent";
        }

        Rectangle {
            anchors.fill: parent
            visible: trailingDrop.containsDrag
            color: trailingDrop.previewColor
            opacity: 0.8
        }
    }
}
