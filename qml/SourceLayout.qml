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

import QtQuick 2.15
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.3
import QtQml 2.2
import QtQml.Models 2.3
import QtQuick.Controls.Material 2.12
import Qt.labs.platform 1.1 as Labs

import SourceModel 1.0
import OpenSoundMeter 1.0
import "elements"
import "source"

ListView {
    id: sideList
    property var sources : null;
    property int selectionAnchor: -1;
    //"all": show every source type; "data": Stored/Group only; "measurement": everything else
    property string columnFilter: "all";
    property bool showBulkHeader: true;
    //StackView hosting this list, used to push/pop when entering a Group/Equalizer
    property var hostStack: null;

    //A vertical mouse-drag on the list was being captured by the ListView's own Flickable
    //drag-to-scroll behavior, competing with (and usually winning over) the per-row drag used for
    //reordering below. Scrolling by dragging is disabled; the wheel still scrolls via WheelHandler.
    interactive: false
    WheelHandler {
        target: sideList
        onWheel: (event) => {
            sideList.contentY = Math.max(
                Math.min(sideList.contentY - event.angleDelta.y, sideList.contentHeight - sideList.height),
                0)
        }
    }

    Component {
        id: measurementDelegate
        Measurement {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: storedDelegate
        Stored {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: unionDelegate
        Union {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: standardLineDelegate
        StandardLine {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: filterDelegate
        Filter {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: equalizerDelegate
        Equalizer {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: windowingDelegate
        Windowing {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }
    Component {
        id: groupDelegate
        Group {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }

    Component {
        id: remoteItemDelegate
        RemoteItem {
            width: sideList.width
            dataModel: modelData
            highlight: modelHighlight
        }
    }

    spacing: 0
    reuseItems: false
    model: SourceModel {
        id: sourceModel
        unrollGroups: false
        list: sources
    }
    clip: true
    delegate: Component {
        id: delegateComponent

        MouseArea {
            id: dragArea
            property bool held: false
            property bool suppressOpen: false
            property int swipeStart: 0
            property int dragStartY: 0
            property var source: model.source

            //"data" sources (Stored/Group/RemoteStored/RemoteGroup) vs. everything else ("measurement")
            readonly property bool isDataType: model.name === "Stored" || model.name === "Group" ||
                                                model.name === "RemoteStored" || model.name === "RemoteGroup"
            readonly property bool matchesColumn: sideList.columnFilter === "all" ||
                                                   (sideList.columnFilter === "data" ? isDataType : !isDataType)

            acceptedButtons: Qt.LeftButton | Qt.RightButton

            anchors {
                left: parent ? parent.left : delegateComponent.left
                right: parent ? parent.right : delegateComponent.right
            }

            visible: matchesColumn
            height: matchesColumn ? content.height : 0
            //don't clip while dragging: content stays parented here (see states below) and needs
            //to be able to render over neighboring rows while being repositioned
            clip: !held

            drag.target:    dragArea.held ? content : undefined
            drag.axis:      Drag.YAxis
            cursorShape:    Qt.PointingHandCursor
            hoverEnabled: true
            onPressAndHold: dragArea.held = true;
            //MouseArea.onReleased does not reliably fire once content.Drag/DropArea has taken over
            //the gesture (the mouse grab can be stolen out from under dragArea by that mechanism);
            //onCanceled is what actually fires in that case, so held must be reset there too or it
            //gets stuck true forever for this row.
            onCanceled: dragArea.held = false;
            onReleased: {
                //onClick open properties
                if (
                        !dragArea.suppressOpen &&
                        loaded.status == Loader.Ready &&
                        loaded.item.dataModel &&
                        loaded.item.propertiesQml
                   ) {
                    applicationWindow.properiesbar.open(loaded.item.dataModel, loaded.item.propertiesQml);
                }
                dragArea.suppressOpen = false;
                //release drag
                if (dragArea.held) {
                    content.Drag.drop();
                    dragArea.held = false;
                    sourceModel.layoutChanged();
                }

                //swipe delete:
                if ((swipeStart - mouseX) / content.width >= 1) {
                    if (applicationWindow && applicationWindow.properiesbar.currentObject === dragArea.source) {
                        applicationWindow.properiesbar.reset();
                    }
                    sources.removeItem(dragArea.source.data.uuid);
                } else if ((swipeStart - mouseX) / content.width <= -0.5) {
                    content.opacity = 0;
                    content.height = 0;
                } else {
                    content.opacity = 1;
                }
            }
            onClicked: function (e) {
                if (e.button === Qt.LeftButton) {
                    var itemUuid = (dragArea.source && dragArea.source.data) ? dragArea.source.data.uuid : undefined;
                    if (e.modifiers & Qt.ShiftModifier) {
                        //range select from the last clicked row to this one
                        dragArea.suppressOpen = true;
                        var anchor = sideList.selectionAnchor >= 0 ? sideList.selectionAnchor : index;
                        var lo = Math.min(anchor, index);
                        var hi = Math.max(anchor, index);
                        for (var i = lo; i <= hi; i++) {
                            sources.setMultiSelected(sourceModel.get(i), true);
                        }
                    } else if (e.modifiers & Qt.ControlModifier) {
                        //toggle a single row (Ctrl on Windows/Linux, Cmd on macOS)
                        dragArea.suppressOpen = true;
                        if (itemUuid !== undefined) {
                            sources.setMultiSelected(itemUuid, !sources.isMultiSelected(itemUuid));
                        }
                        sideList.selectionAnchor = index;
                    } else {
                        sources.clearMultiSelected();
                        sideList.selectionAnchor = index;
                        if (sideList.currentIndex !== index) {
                            sideList.currentIndex = index;
                            sideList.forceActiveFocus();
                        }
                    }
                }
                if (sideList.currentIndex === index && e.button === Qt.RightButton) {
                    sideList.currentIndex = -1
                }
            }

            onPressed: {
                swipeStart = mouseX;
                dragStartY = mouseY;
            }
            onDoubleClicked: {
                if (
                    (
                        model.name === "Group"       ||
                        model.name === "RemoteGroup" ||
                        model.name === "Equalizer"
                    ) &&
                    source.data && sideList.hostStack
                ) {
                    sideList.hostStack.openGroup(source);
                }
            }

            onPositionChanged: {
                //start reordering as soon as the press moves mostly vertically,
                //instead of requiring a stationary press-and-hold first
                if (pressed && !dragArea.held) {
                    let dy = mouseY - dragStartY;
                    let dx = mouseX - swipeStart;
                    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
                        dragArea.held = true;
                    }
                }
                if (pressed) {
                    let opacity = 1 - Math.abs(mouseX - swipeStart) / content.width;
                    if (opacity > 0.6) opacity = 1.0;
                    content.opacity = opacity;
                }
            }

            Item {
                id: content
                //explicit width so it's preserved once the drag-state AnchorChanges clears left/right below
                width: dragArea.width
                anchors { left: parent.left; right: parent.right; top: parent.top }
                height: loaded.height
                z: dragArea.held ? 1000 : 0
                Drag.active: dragArea.held
                Drag.source: dragArea
                Drag.hotSpot.x: width / 2
                Drag.hotSpot.y: height / 2

                Rectangle {
                    id: multiSelectHighlight
                    anchors.fill: parent
                    z: -1
                    visible: (dragArea.source && dragArea.source.data && sources)
                             ? sources.multiSelectedUuids.indexOf(dragArea.source.data.uuid.toString()) !== -1
                             : false
                    color: sources ? Qt.rgba(sources.highlightColor.r, sources.highlightColor.g, sources.highlightColor.b, 0.25) : "transparent"
                }

                Loader {
                    id: loaded
                    property var modelData: dragArea.source
                    property bool modelHighlight: index == sideList.currentIndex
                    sourceComponent: {
                            switch(model.name) {
                                case "Measurement": return measurementDelegate;
                                case "Stored": return storedDelegate;
                                case "Union": return unionDelegate;
                                case "StandardLine": return standardLineDelegate;
                                case "Filter": return filterDelegate;
                                case "Equalizer": return equalizerDelegate;
                                case "Windowing": return windowingDelegate;
                                case "Group": return groupDelegate;

                                case "RemoteItem":
                                case "RemoteGroup":
                                case "RemoteStored":
                                case "RemoteMeasurement":
                                    return remoteItemDelegate;
                                default: console.log("unknow model " + model.name);return ;
                            }
                        }
                }

                states: State {
                    when: dragArea.held

                    //no ParentChange here: reparenting content mid-gesture was interfering with the
                    //mouse grab and preventing dragArea.onReleased from firing at all in some cases.
                    //content simply stays inside dragArea (still clipped by the ListView at the very
                    //top/bottom edge of the viewport, which is an acceptable trade-off for reordering)
                    AnchorChanges {
                        target: content
                        anchors {
                            left: undefined; right: undefined; top: undefined
                            horizontalCenter: undefined; verticalCenter: undefined
                        }
                    }
                }

                Button {
                    id: moveButton
                    font.family: "Osm"
                    text: "\ue80a"
                    anchors.right: cloneButton.left
                    anchors.top: parent.top
                    flat: true
                    font.pixelSize: 14
                    rightPadding: 4
                    leftPadding: 4
                    visible: model.name === "Stored" || model.name === "Group"
                    onClicked: {
                        //groupList() is not reactive, refresh it right before showing the menu
                        moveMenuGroups.model = sourceList.groupList();
                        moveMenu.open();
                    }
                    background: Rectangle {
                        color: "transparent"
                    }

                    Labs.Menu {
                        id: moveMenu

                        Labs.MenuItem {
                            text: qsTr("Move to top level")
                            onTriggered: sourceList.moveItem(dragArea.source.data.uuid, "")
                        }

                        Labs.MenuSeparator {}

                        Instantiator {
                            id: moveMenuGroups
                            model: sourceList.groupList()
                            delegate: Labs.MenuItem {
                                text: "    ".repeat(modelData.depth) + modelData.name
                                enabled: !dragArea.source || !dragArea.source.data ||
                                         modelData.uuid !== dragArea.source.data.uuid.toString()
                                onTriggered: sourceList.moveItem(dragArea.source.data.uuid, modelData.uuid)
                            }
                            onObjectAdded: (index, object) => moveMenu.insertItem(index + 2, object)
                            onObjectRemoved: (index, object) => moveMenu.removeItem(object)
                        }
                    }

                    ToolTip {
                        text: qsTr("move to group")
                        visible: moveButton.hovered
                        y: bottomPadding - moveButton.height
                        x: content.width - rightPadding - availableWidth - leftMargin - rightMargin
                    }
                }

                Button {
                    id: cloneButton
                    font.family: "Osm"
                    text: "\uf24d"
                    anchors.right: spacer.left
                    anchors.top: parent.top
                    flat: true
                    font.pixelSize: 14
                    rightPadding: 4
                    leftPadding: 4
                    visible: (dragArea.source && dragArea.source.data ? dragArea.source.data.cloneable : false)
                    onClicked: {
                        sources.cloneItem(dragArea.source);
                    }
                    background: Rectangle {
                        color: "transparent"
                    }
                }

                Rectangle {
                    id: spacer
                    anchors {
                        top: parent.top
                        bottom: parent.bottom
                        right: deleteButton.left
                    }
                    width: 6
                    color: "transparent"
                }

                Button {
                    id: deleteButton
                    font.family: "Osm"
                    text: "\ue801"
                    anchors.right: parent.right
                    anchors.top: parent.top
                    flat: true
                    font.pixelSize: 14
                    rightPadding: 4
                    leftPadding: 4
                    onClicked: {
                        applicationWindow.dialog.accepted.connect(deleteModel);
                        applicationWindow.dialog.rejected.connect(freeDialog);
                        applicationWindow.dialog.title = "Delete " + dragArea.source.data.name + "?";
                        applicationWindow.dialog.open();
                    }
                    function deleteModel() {
                        if (applicationWindow.properiesbar.currentObject === dragArea.source) {
                            applicationWindow.properiesbar.reset();
                        }
                        sources.removeItem(dragArea.source.data.uuid);
                        freeDialog();
                    }
                    function freeDialog() {
                        applicationWindow.dialog.accepted.disconnect(deleteModel);
                        applicationWindow.dialog.rejected.disconnect(freeDialog);
                    }
                    background: Rectangle {
                        color: "transparent"
                    }
                }

                ToolTip {
                    text: "delete source"
                    visible: deleteButton.hovered
                    y: bottomPadding - deleteButton.height
                    x: content.width - rightPadding - availableWidth - leftMargin - rightMargin
                }

                ToolTip {
                    text: "clone source"
                    visible: cloneButton.hovered
                    y: bottomPadding - cloneButton.height
                    x: content.width - rightPadding - availableWidth - leftMargin - rightMargin
                }
            }

            DropArea {
                //NOTE: dragArea.onReleased does not reliably fire once this Drag/DropArea gesture
                //is active (the mouse grab can be taken over by it), so reordering is driven from
                //here (onEntered/onDropped), which do fire reliably.
                anchors { fill: parent; margins: 0 }
                onEntered: {
                    //always reorder past this row (including Groups), so an item can be positioned
                    //right above/below a Group -- e.g. when the Group is the very first row, this is
                    //the only way to place something above it. Actually filing the item *into* a
                    //Group only happens on a real drop while hovering it (onDropped below); merely
                    //passing over it while still dragging must not be disruptive.
                    sources.move(
                            drag.source.DelegateModel.itemsIndex,
                               dragArea.DelegateModel.itemsIndex)
                }
                onDropped: {
                    if (dragArea.source.objectName === "Group") {
                        sources.moveToGroup(
                                drag.source.source.uuid,
                                   dragArea.source.uuid)
                    }
                }
            }

            Behavior on height {
                NumberAnimation { duration:  200 }
            }
        }
    }

    ScrollIndicator.vertical: ScrollIndicator {}
    onCurrentIndexChanged: sources.selectedIndex = currentIndex
    currentIndex: -1
    highlight: Rectangle {
        z: 2
        border.color: sources.highlightColor
        border.width: 0.5
        visible: sources.selectedIndex >= 0 ? true : false
        color: "transparent"
    }

    property bool hasExportableSelection: sources ? (
                                               sources.multiSelectedStoredCount > 0 ||
                                               (
                                                   sources.selectedIndex >= 0 && sources.selected && sources.selected.data &&
                                                   (
                                                       sources.selected.data.objectName === "Stored" ||
                                                       sources.selected.data.objectName === "Group"
                                                   )
                                               )
                                           ) : false

    header: Item {
        width: sideList.width
        height: sideList.showBulkHeader ? 50 : 0
        visible: sideList.showBulkHeader

        RowLayout {
            id: bulkBar
            anchors.fill: parent
            anchors.margins: 5

            Item {
                Layout.fillWidth: true
            }

            Button {
                text: qsTr("STORE")
                enabled: sideList.hasExportableSelection
                onClicked: {
                    //fall back to the single (non-multi) selection when nothing was Shift/Ctrl-selected
                    if (sources.multiSelectedCount === 0 && sources.selectedIndex >= 0 && sources.selected && sources.selected.data) {
                        sources.setMultiSelected(sources.selected.data.uuid, true);
                    }
                    bulkExportDialog.currentFile = bulkExportDialog.folder + "/OSM_" + Qt.formatDateTime(new Date(), "yyyyMMdd_HHmmss");
                    bulkExportDialog.open();
                }
            }

            Button {
                text: qsTr("Cancel")
                enabled: sideList.hasExportableSelection
                onClicked: {
                    sources.clearMultiSelected();
                    sources.selectedIndex = -1;
                    sideList.currentIndex = -1;
                }
            }
        }
    }

    Labs.FileDialog {
        id: bulkExportDialog
        fileMode: Labs.FileDialog.SaveFile
        title: qsTr("Choose destination folder name")
        folder: Labs.StandardPaths.writableLocation(Labs.StandardPaths.DesktopLocation)
        onAccepted: {
            sources.exportSelectedCSV(file);
            sources.clearMultiSelected();
        }
    }

    Item {
        id: fakeTraget
        signal selectedChanged()
    }

    Connections {
        target: sources ? sources : fakeTraget
        function onSelectedChanged() {
            sideList.currentIndex = sources.selectedIndex;
        }
    }

    Shortcut {
        sequence: "Ctrl+5"
        onActivated: {
            sourceModel.layoutChanged();
        }
    }
}
