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
    //StackView hosting this list, used to push/pop when entering an Equalizer
    property var hostStack: null;
    //nesting depth when this list is inline-embedded inside an expanded Group row (0 = top level)
    property int depth: 0;
    //uuid of the Group that directly contains this list, or "" at the top level
    property string parentGroupUuid: "";
    //where multi-selection (Shift/Ctrl-click) state lives: defaults to this list's own "sources",
    //but Group rows forward their own scope down to their inline-expanded children so that
    //selection spans every nesting level in the data column as a single set
    property var multiSelectScope: sources;
    //true when an ancestor Group's checkbox is off: forwarded to Stored/Group row delegates so
    //they can grey out their own checkbox color without touching their checked state
    property bool dimmed: false;

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
            dimmed: sideList.dimmed
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
            depth: sideList.depth
            multiSelectScope: sideList.multiSelectScope
            containingList: sideList.sources
            containingParentGroupUuid: sideList.parentGroupUuid
            dimmed: sideList.dimmed
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
            //the list that directly contains this row, exposed so other rows' DropArea can tell
            //whether a drag started in the same list (plain reorder) or a different one (crossing
            //into/out of a Group, handled only on an actual drop)
            property var rowSources: sources

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
                var itemUuid = (dragArea.source && dragArea.source.data) ? dragArea.source.data.uuid : undefined;
                if (e.button === Qt.LeftButton) {
                    if (e.modifiers & Qt.ShiftModifier) {
                        //range select from the last clicked row to this one
                        dragArea.suppressOpen = true;
                        var anchor = sideList.selectionAnchor >= 0 ? sideList.selectionAnchor : index;
                        var lo = Math.min(anchor, index);
                        var hi = Math.max(anchor, index);
                        for (var i = lo; i <= hi; i++) {
                            multiSelectScope.setMultiSelected(sourceModel.get(i), true);
                        }
                    } else if (e.modifiers & Qt.ControlModifier) {
                        //toggle a single row (Ctrl on Windows/Linux, Cmd on macOS)
                        dragArea.suppressOpen = true;
                        if (itemUuid !== undefined) {
                            multiSelectScope.setMultiSelected(itemUuid, !multiSelectScope.isMultiSelected(itemUuid));
                        }
                        sideList.selectionAnchor = index;
                    } else {
                        multiSelectScope.clearMultiSelected();
                        sideList.selectionAnchor = index;
                        if (sideList.currentIndex !== index) {
                            sideList.currentIndex = index;
                            sideList.forceActiveFocus();
                        }
                    }
                } else if (e.button === Qt.RightButton && dragArea.isDataType) {
                    dragArea.suppressOpen = true;
                    if (itemUuid !== undefined && !multiSelectScope.isMultiSelected(itemUuid)) {
                        //right-clicking a row outside the current multi-selection replaces it,
                        //same as most file managers; right-clicking within it preserves the set
                        //so "Delete" in the context menu below acts on the whole selection
                        multiSelectScope.clearMultiSelected();
                        multiSelectScope.setMultiSelected(itemUuid, true);
                        sideList.selectionAnchor = index;
                    }
                    contextMenu.open();
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
                //local Group rows expand inline instead (see the disclosure arrow in Group.qml);
                //RemoteGroup/Equalizer still drill down into a separate pushed page
                if (
                    (
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
                width: dragArea.width - sideList.depth * 32
                anchors { left: parent.left; right: parent.right; top: parent.top; leftMargin: sideList.depth * 32 }
                height: loaded.height
                z: dragArea.held ? 1000 : 0
                Drag.active: dragArea.held
                Drag.source: dragArea
                Drag.hotSpot.x: width / 2
                //fixed, not height / 2: an expanded Group's content can be much taller than a
                //plain 50px row (header + all its inline children), which would otherwise push
                //the effective drop point far below the actual mouse cursor while dragging one
                Drag.hotSpot.y: 25

                Rectangle {
                    id: multiSelectHighlight
                    anchors.fill: parent
                    z: -1
                    visible: (dragArea.source && dragArea.source.data && multiSelectScope)
                             ? multiSelectScope.multiSelectedUuids.indexOf(dragArea.source.data.uuid.toString()) !== -1
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
                    //data rows (Stored/Group) delete via the right-click context menu instead
                    visible: !dragArea.isDataType
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
                id: rowDropArea
                //Capped to the 50px header band instead of anchors.fill: parent: an expanded
                //Group's own row (content/dragArea) is as tall as its header plus all its inline
                //children, but this DropArea represents *only* that row's own header -- its
                //children have their own separate DropAreas (via the nested SourceLayout) and
                //must not be shadowed by this one, or hovering a child to reorder it would
                //register here instead and be misread as "into"/"eject from" this Group.
                anchors { left: parent.left; right: parent.right; top: parent.top }
                height: Math.min(parent.height, 50)
                //color of whatever is currently being dragged over this row, used by the preview
                property color previewColor: "transparent"
                //"before"/"after" this row (plain reorder), or "into" (Group rows only, when
                //hovering their middle band)
                property string dropZone: ""

                function updateZone(drag) {
                    var zone;
                    if (dragArea.source.objectName === "Group" && drag.y > height * 0.25 && drag.y < height * 0.75) {
                        zone = "into";
                    } else {
                        zone = drag.y < height / 2 ? "before" : "after";
                    }
                    if (zone === dropZone) {
                        return;
                    }
                    dropZone = zone;
                    //Same-list "before"/"after" reorders live, continuously, exactly like plain
                    //rows have always done -- this is what keeps dragging feel responsive. The
                    //Group "into" band and any cross-list move (ejecting out of / filing into a
                    //different list) are deliberately NOT live: they're resolved once, on an
                    //actual drop (onDropped below), because reparenting the dragged row's own
                    //delegate into a different list mid-gesture would destroy and recreate it,
                    //aborting the drag. (An earlier version also made Group's "into" band live,
                    //which made the Group continuously slide out from under the cursor, so it was
                    //impossible to hold still long enough to actually drop *into* one.)
                    if (zone !== "into" && drag.source.rowSources === sources) {
                        var fromIndex = drag.source.DelegateModel.itemsIndex;
                        var targetIndex = dragArea.DelegateModel.itemsIndex + (zone === "after" ? 1 : 0);
                        //onPositionChanged can fire again before a previous move's ListView
                        //transition has fully settled; DelegateModel.itemsIndex briefly reads -1
                        //for a delegate mid-move, and calling sources.move() with that corrupts
                        //the list (and, downstream, leaves the dragged row's own "source" role
                        //undefined). Skip anything that isn't a clean, meaningful move.
                        if (fromIndex >= 0 && fromIndex < sources.count && fromIndex !== targetIndex) {
                            sources.move(fromIndex, targetIndex);
                        }
                    }
                }

                onEntered: {
                    previewColor = (drag.source.source && drag.source.source.data) ? drag.source.source.data.color : "transparent";
                    dropZone = "";
                    updateZone(drag);
                }
                onPositionChanged: updateZone(drag)
                onExited: {
                    previewColor = "transparent";
                    dropZone = "";
                }
                onDropped: {
                    console.log("[DBG] onDropped target=" + (dragArea.source ? dragArea.source.objectName : "?")
                                 + " dropZone=" + dropZone
                                 + " sameList=" + (drag.source.rowSources === sources)
                                 + " targetSources=" + sources
                                 + " draggedRowSources=" + drag.source.rowSources
                                 + " parentGroupUuid=" + sideList.parentGroupUuid);
                    //same-list "before"/"after" already happened live in updateZone() above --
                    //but "into" is a containment change (nest/eject), never applied live even
                    //when dragged item and this Group happen to share the same containing list,
                    //so it must still fall through here regardless.
                    if (dropZone !== "into" && drag.source.rowSources === sources) {
                        console.log("[DBG] onDropped early-return (same-list before/after)");
                        previewColor = "transparent";
                        dropZone = "";
                        return;
                    }
                    var draggedUuid = drag.source.source.data.uuid;
                    if (dropZone === "into") {
                        if (drag.source.rowSources === dragArea.source.data.sourceList) {
                            //the dragged row is already a direct child of this very Group:
                            //dropping it back on its own header (middle band) ejects it one level up
                            sourceList.moveItem(draggedUuid, sideList.parentGroupUuid);
                        } else {
                            //dropping on a foreign Group files the item into it, regardless of
                            //how deep either side is currently nested
                            sourceList.moveItem(draggedUuid, dragArea.source.data.uuid);
                        }
                    } else {
                        //"before"/"after" this row, joining whichever list it belongs to -- e.g.
                        //ejecting out of a Group via its edge instead of its middle (when the
                        //Group is the first/last/only row and there is no plain sibling row
                        //available above/below it to drop on instead)
                        sourceList.moveItem(draggedUuid, sideList.parentGroupUuid);
                        var newIndex = sources.indexOf(draggedUuid);
                        console.log("[DBG] onDropped before/after cross-list moveItem done, newIndex=" + newIndex);
                        if (newIndex >= 0) {
                            var targetIndex = dragArea.DelegateModel.itemsIndex + (dropZone === "after" ? 1 : 0);
                            sources.move(newIndex, targetIndex);
                        }
                    }
                    previewColor = "transparent";
                    dropZone = "";
                }

                //"into" a Group: translucent tint of the whole row. "before"/"after": a thin
                //insertion line at the corresponding edge. Both tinted with the dragged item's own
                //color so it's obvious both what and where.
                Rectangle {
                    anchors.fill: parent
                    z: 10
                    visible: rowDropArea.containsDrag && rowDropArea.dropZone === "into"
                    color: rowDropArea.previewColor
                    opacity: 0.3
                }
            }

            //"before"/"after" insertion line, tinted with the dragged item's own color. A sibling
            //of rowDropArea (rather than nested inside it) so it can anchor to content's full
            //height -- an expanded Group's row is taller than the capped DropArea above, and
            //"after" needs to land below all of its inline children, not just its own header.
            Rectangle {
                z: 10
                anchors.left: content.left
                anchors.right: content.right
                anchors.top: rowDropArea.dropZone === "before" ? content.top : undefined
                anchors.bottom: rowDropArea.dropZone === "after" ? content.bottom : undefined
                height: 3
                visible: rowDropArea.containsDrag && (rowDropArea.dropZone === "before" || rowDropArea.dropZone === "after")
                color: rowDropArea.previewColor
                opacity: 0.8
            }

            //data rows (Stored/Group) only: right-click brings this up instead of a trash icon
            Labs.Menu {
                id: contextMenu

                Labs.MenuItem {
                    text: multiSelectScope && multiSelectScope.multiSelectedCount > 1
                          ? qsTr("Delete %1 items").arg(multiSelectScope.multiSelectedCount)
                          : qsTr("Delete")
                    onTriggered: {
                        applicationWindow.dialog.accepted.connect(dragArea.deleteSelection);
                        applicationWindow.dialog.rejected.connect(dragArea.freeDeleteDialog);
                        applicationWindow.dialog.title = multiSelectScope && multiSelectScope.multiSelectedCount > 1
                                ? qsTr("Delete %1 items?").arg(multiSelectScope.multiSelectedCount)
                                : qsTr("Delete ") + dragArea.source.data.name + "?";
                        applicationWindow.dialog.open();
                    }
                }
            }

            function deleteSelection() {
                applicationWindow.properiesbar.reset();
                if (multiSelectScope && multiSelectScope.multiSelectedCount > 1) {
                    multiSelectScope.removeMultiSelected();
                } else {
                    sources.removeItem(dragArea.source.data.uuid);
                }
                dragArea.freeDeleteDialog();
            }
            function freeDeleteDialog() {
                applicationWindow.dialog.accepted.disconnect(dragArea.deleteSelection);
                applicationWindow.dialog.rejected.disconnect(dragArea.freeDeleteDialog);
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
