// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { Stack } from "@fluentui/react";
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { useToasts } from "react-toast-notifications";
import { useMountedState } from "react-use";
import styled from "styled-components";

import Log from "@foxglove/log";
import { AppSetting } from "@foxglove/studio-base/AppSetting";
import AccountSettings from "@foxglove/studio-base/components/AccountSettingsSidebar/AccountSettings";
import ConnectionList from "@foxglove/studio-base/components/ConnectionList";
import DocumentDropListener from "@foxglove/studio-base/components/DocumentDropListener";
import DropOverlay from "@foxglove/studio-base/components/DropOverlay";
import ExtensionsSidebar from "@foxglove/studio-base/components/ExtensionsSidebar";
import GlobalKeyListener from "@foxglove/studio-base/components/GlobalKeyListener";
import GlobalVariablesTable from "@foxglove/studio-base/components/GlobalVariablesTable";
import variablesHelp from "@foxglove/studio-base/components/GlobalVariablesTable/index.help.md";
import HelpModal from "@foxglove/studio-base/components/HelpModal";
import LayoutBrowser from "@foxglove/studio-base/components/LayoutBrowser";
import messagePathHelp from "@foxglove/studio-base/components/MessagePathSyntax/index.help.md";
import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import MultiProvider from "@foxglove/studio-base/components/MultiProvider";
import NotificationDisplay from "@foxglove/studio-base/components/NotificationDisplay";
import PanelLayout from "@foxglove/studio-base/components/PanelLayout";
import PanelList from "@foxglove/studio-base/components/PanelList";
import PanelSettings from "@foxglove/studio-base/components/PanelSettings";
import PlaybackControls from "@foxglove/studio-base/components/PlaybackControls";
import { PlayerStatusIndicator } from "@foxglove/studio-base/components/PlayerStatusIndicator";
import Preferences from "@foxglove/studio-base/components/Preferences";
import RemountOnValueChange from "@foxglove/studio-base/components/RemountOnValueChange";
import ShortcutsModal from "@foxglove/studio-base/components/ShortcutsModal";
import Sidebar, { SidebarItem } from "@foxglove/studio-base/components/Sidebar";
import { SidebarContent } from "@foxglove/studio-base/components/SidebarContent";
import Toolbar from "@foxglove/studio-base/components/Toolbar";
import { useAppConfiguration } from "@foxglove/studio-base/context/AppConfigurationContext";
import { useAssets } from "@foxglove/studio-base/context/AssetsContext";
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { useExtensionLoader } from "@foxglove/studio-base/context/ExtensionLoaderContext";
import { useLayoutStorage } from "@foxglove/studio-base/context/LayoutStorageContext";
import LinkHandlerContext from "@foxglove/studio-base/context/LinkHandlerContext";
import { PanelSettingsContext } from "@foxglove/studio-base/context/PanelSettingsContext";
import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";
import useAddPanel from "@foxglove/studio-base/hooks/useAddPanel";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks/useAppConfigurationValue";
import useElectronFilesToOpen from "@foxglove/studio-base/hooks/useElectronFilesToOpen";
import useNativeAppMenuEvent from "@foxglove/studio-base/hooks/useNativeAppMenuEvent";
import welcomeLayout from "@foxglove/studio-base/layouts/welcomeLayout";
import { PlayerPresence } from "@foxglove/studio-base/players/types";
import { isNonEmptyOrUndefined } from "@foxglove/studio-base/util/emptyOrUndefined";
import inAutomatedRunMode from "@foxglove/studio-base/util/inAutomatedRunMode";

const log = Log.getLogger(__filename);

const SToolbarItem = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: 100%;
  min-width: 40px;

  // Allow interacting with buttons in the title bar without dragging the window
  -webkit-app-region: no-drag;
`;

const TruncatedText = styled.span`
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: normal;
`;

type SidebarItemKey =
  | "connection"
  | "add-panel"
  | "panel-settings"
  | "variables"
  | "extensions"
  | "account"
  | "layouts"
  | "preferences";

const SIDEBAR_ITEMS = new Map<SidebarItemKey, SidebarItem>([
  [
    "connection",
    { iconName: "DataManagementSettings", title: "Connection", component: Connection },
  ],
  ["layouts", { iconName: "FiveTileGrid", title: "Layouts", component: LayoutBrowser }],
  ["add-panel", { iconName: "RectangularClipping", title: "Add Panel", component: AddPanel }],
  [
    "panel-settings",
    { iconName: "SingleColumnEdit", title: "Panel Settings", component: PanelSettings },
  ],
  ["variables", { iconName: "Variable2", title: "Variables", component: Variables }],
  ["preferences", { iconName: "Settings", title: "Preferences", component: Preferences }],
  ["extensions", { iconName: "AddIn", title: "Extensions", component: ExtensionsSidebar }],
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        ["account", { iconName: "Contact", title: "Account", component: AccountSettings }] as const,
      ]),
]);

const SIDEBAR_BOTTOM_ITEMS: readonly SidebarItemKey[] =
  process.env.NODE_ENV === "production" ? ["preferences"] : ["account", "preferences"];

function Connection() {
  return (
    <SidebarContent title="Connection">
      <ConnectionList />
    </SidebarContent>
  );
}

function AddPanel() {
  const addPanel = useAddPanel();
  return (
    <SidebarContent noPadding title="Add panel">
      <PanelList onPanelSelect={addPanel} />
    </SidebarContent>
  );
}

function Variables() {
  return (
    <SidebarContent title="Variables" helpContent={variablesHelp}>
      <GlobalVariablesTable />
    </SidebarContent>
  );
}

// file types we support for drag/drop
const allowedDropExtensions = [".bag", ".foxe", ".urdf"];

type WorkspaceProps = {
  demoBagUrl?: string;
  deepLinks?: string[];
  onToolbarDoubleClick?: () => void;
};

export default function Workspace(props: WorkspaceProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(ReactNull);
  const { currentSourceName, selectSource } = usePlayerSelection();
  const playerPresence = useMessagePipeline(
    useCallback(({ playerState }) => playerState.presence, []),
  );
  const playerCapabilities = useMessagePipeline(
    useCallback(({ playerState }) => playerState.capabilities, []),
  );

  // we use requestBackfill to signal when a player changes for RemountOnValueChange below
  // see comment below above the RemountOnValueChange component
  const requestBackfill = useMessagePipeline(useCallback((ctx) => ctx.requestBackfill, []));

  const [selectedSidebarItem, setSelectedSidebarItem] = useState<SidebarItemKey | undefined>(
    // Start with the sidebar open if no connection has been made
    currentSourceName == undefined ? "connection" : undefined,
  );

  // Automatically close the connection sidebar when a connection is chosen
  const prevSourceName = useRef(currentSourceName);
  useLayoutEffect(() => {
    if (
      selectedSidebarItem === "connection" &&
      prevSourceName.current == undefined &&
      currentSourceName != undefined
    ) {
      setSelectedSidebarItem(undefined);
    }
    prevSourceName.current = currentSourceName;
  }, [selectedSidebarItem, currentSourceName]);

  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [messagePathSyntaxModalOpen, setMessagePathSyntaxModalOpen] = useState(false);

  const isMounted = useMountedState();

  const layoutStorage = useLayoutStorage();
  const { setSelectedLayout } = useCurrentLayoutActions();

  const openWelcomeLayout = useCallback(async () => {
    const newLayout = await layoutStorage.saveNewLayout({
      path: [],
      name: welcomeLayout.name,
      data: welcomeLayout.data,
    });
    if (isMounted()) {
      setSelectedLayout({ id: newLayout.id, data: welcomeLayout.data });
      if (isNonEmptyOrUndefined(props.demoBagUrl)) {
        selectSource(
          { name: "Demo Bag", type: "ros1-remote-bagfile" },
          {
            url: props.demoBagUrl,
          },
        );
      }
    }
  }, [layoutStorage, isMounted, setSelectedLayout, props.demoBagUrl, selectSource]);

  const handleInternalLink = useCallback((event: React.MouseEvent, href: string) => {
    if (href === "#help:message-path-syntax") {
      event.preventDefault();
      setMessagePathSyntaxModalOpen(true);
    }
  }, []);

  useEffect(() => {
    // Focus on page load to enable keyboard interaction.
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, []);

  // For undo/redo events, first try the browser's native undo/redo, and if that is disabled, then
  // undo/redo the layout history. Note that in GlobalKeyListener we also handle the keyboard
  // events for undo/redo, so if an input or textarea element that would handle the event is not
  // focused, the GlobalKeyListener will handle it. The listeners here are to handle the case when
  // an editable element is focused, or when the user directly chooses the undo/redo menu item.

  const { undoLayoutChange, redoLayoutChange } = useCurrentLayoutActions();

  useNativeAppMenuEvent(
    "undo",
    useCallback(() => {
      if (!document.execCommand("undo")) {
        undoLayoutChange();
      }
    }, [undoLayoutChange]),
  );

  useNativeAppMenuEvent(
    "redo",
    useCallback(() => {
      if (!document.execCommand("redo")) {
        redoLayoutChange();
      }
    }, [redoLayoutChange]),
  );

  useNativeAppMenuEvent(
    "open-preferences",
    useCallback(() => {
      setSelectedSidebarItem((item) => (item === "preferences" ? undefined : "preferences"));
    }, []),
  );

  useNativeAppMenuEvent(
    "open-message-path-syntax-help",
    useCallback(() => setMessagePathSyntaxModalOpen(true), []),
  );

  useNativeAppMenuEvent(
    "open-keyboard-shortcuts",
    useCallback(() => setShortcutsModalOpen(true), []),
  );

  useNativeAppMenuEvent("open-welcome-layout", openWelcomeLayout);

  const appConfiguration = useAppConfiguration();
  const { addToast } = useToasts();

  // Show welcome layout on first run
  useEffect(() => {
    void (async () => {
      const welcomeLayoutShown = appConfiguration.get("onboarding.welcome-layout.shown");
      if (welcomeLayoutShown == undefined || welcomeLayoutShown === false) {
        // Set configuration *before* opening the layout to avoid infinite recursion when the player
        // loading state causes us to re-render.
        await appConfiguration.set("onboarding.welcome-layout.shown", true);
        await openWelcomeLayout();
      }
    })();
  }, [appConfiguration, openWelcomeLayout]);

  // previously loaded files are tracked so support the "add bag" feature which loads a second bag
  // file when the user presses shift during a drag/drop
  const previousFiles = useRef<File[]>([]);

  const { loadFromFile } = useAssets();

  const extensionLoader = useExtensionLoader();

  const openFiles = useCallback(
    async (files: FileList, { shiftPressed }: { shiftPressed: boolean }) => {
      const otherFiles: File[] = [];
      for (const file of files) {
        // electron extends File with a `path` field which is not available in browsers
        const basePath = (file as { path?: string }).path ?? "";

        if (file.name.endsWith(".foxe")) {
          // Extension installation
          try {
            const arrayBuffer = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const extension = await extensionLoader.installExtension(data);
            addToast(`Installed extension ${extension.id}`, { appearance: "success" });
          } catch (err) {
            addToast(`Failed to install extension ${file.name}: ${err.message}`, {
              appearance: "error",
            });
          }
        } else {
          try {
            if (!(await loadFromFile(file, { basePath }))) {
              otherFiles.push(file);
            }
          } catch (err) {
            addToast(`Failed to load ${file.name}`, {
              appearance: "error",
            });
          }
        }
      }

      if (otherFiles.length > 0) {
        if (shiftPressed) {
          previousFiles.current = previousFiles.current.concat(otherFiles);
        } else {
          previousFiles.current = otherFiles;
        }
        selectSource(
          { name: "ROS 1 Bag File (local)", type: "ros1-local-bagfile" },
          {
            files: previousFiles.current,
          },
        );
      }
    },
    [addToast, extensionLoader, loadFromFile, selectSource],
  );

  // files the main thread told us to open
  const filesToOpen = useElectronFilesToOpen();
  useEffect(() => {
    if (filesToOpen) {
      void openFiles(filesToOpen, { shiftPressed: false });
    }
  }, [filesToOpen, openFiles]);

  useEffect(() => {
    const firstLink = props.deepLinks?.[0];
    if (firstLink == undefined) {
      return;
    }

    try {
      const url = new URL(firstLink);
      // only support the open command

      // Test if the pathname matches //open or //open/
      if (!/\/\/open\/?/.test(url.pathname)) {
        return;
      }

      // only support rosbag urls
      const type = url.searchParams.get("type");
      const bagUrl = url.searchParams.get("url");
      if (type !== "rosbag" || bagUrl == undefined) {
        return;
      }
      selectSource(
        {
          name: "ROS 1 Bag File (HTTP)",
          type: "ros1-remote-bagfile",
        },
        { url: bagUrl },
      );
    } catch (err) {
      log.error(err);
    }
  }, [props.deepLinks, selectSource]);

  const dropHandler = useCallback(
    ({ files, shiftPressed }: { files: FileList; shiftPressed: boolean }) => {
      void openFiles(files, { shiftPressed });
    },
    [openFiles],
  );

  const showPlaybackControls =
    playerPresence === PlayerPresence.NOT_PRESENT || playerCapabilities.includes("playbackControl");

  const panelSettings = useMemo(
    () => ({
      panelSettingsOpen: selectedSidebarItem === "panel-settings",
      openPanelSettings: () => setSelectedSidebarItem("panel-settings"),
    }),
    [selectedSidebarItem],
  );

  const [showMarketplace = false] = useAppConfigurationValue<boolean>(
    AppSetting.EXTENSION_MARKETPLACE,
  );
  const sidebarItems = useMemo(() => {
    const filteredSidebarItems = new Map(SIDEBAR_ITEMS);
    if (!showMarketplace) {
      filteredSidebarItems.delete("extensions");
    }
    return filteredSidebarItems;
  }, [showMarketplace]);

  return (
    <MultiProvider
      providers={[
        /* eslint-disable react/jsx-key */
        <LinkHandlerContext.Provider value={handleInternalLink} />,
        <PanelSettingsContext.Provider value={panelSettings} />,
        /* eslint-enable react/jsx-key */
      ]}
    >
      <DocumentDropListener filesSelected={dropHandler} allowedExtensions={allowedDropExtensions}>
        <DropOverlay>
          <div style={{ fontSize: "4em", marginBottom: "1em" }}>Drop a file here</div>
        </DropOverlay>
      </DocumentDropListener>
      <div ref={containerRef} className="app-container" tabIndex={0}>
        <GlobalKeyListener />
        {shortcutsModalOpen && (
          <ShortcutsModal onRequestClose={() => setShortcutsModalOpen(false)} />
        )}
        {messagePathSyntaxModalOpen && (
          <HelpModal onRequestClose={() => setMessagePathSyntaxModalOpen(false)}>
            {messagePathHelp}
          </HelpModal>
        )}

        <Toolbar onDoubleClick={props.onToolbarDoubleClick}>
          <div style={{ flexGrow: 1 }} />
          <SToolbarItem>
            <PlayerStatusIndicator />
          </SToolbarItem>
          <SToolbarItem>
            <TruncatedText>{currentSourceName ?? "Foxglove Studio"}</TruncatedText>{" "}
          </SToolbarItem>
          <div style={{ flexGrow: 1 }} />
          <SToolbarItem style={{ marginRight: 5 }}>
            {!inAutomatedRunMode() && <NotificationDisplay />}
          </SToolbarItem>
        </Toolbar>
        <Sidebar
          items={sidebarItems}
          bottomItems={SIDEBAR_BOTTOM_ITEMS}
          selectedKey={selectedSidebarItem}
          onSelectKey={setSelectedSidebarItem}
        >
          {/* To ensure no stale player state remains, we unmount all panels when players change */}
          <RemountOnValueChange value={requestBackfill}>
            <Stack>
              <PanelLayout />
              {showPlaybackControls && (
                <Stack.Item disableShrink>
                  <PlaybackControls />
                </Stack.Item>
              )}
            </Stack>
          </RemountOnValueChange>
        </Sidebar>
      </div>
    </MultiProvider>
  );
}
