// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PropsWithChildren } from "react";
import { useAsync } from "react-use";

import Logger from "@foxglove/log";
import { ExtensionInfo, ExtensionLoader, ExtensionLoaderContext } from "@foxglove/studio-base";

const log = Logger.getLogger(__filename);

// example provider showing how to load extensions from a separate js file
export default function ExtensionLoaderProvider(props: PropsWithChildren<unknown>): JSX.Element {
  const { value: registry, error } = useAsync(async () => {
    log.info("Fetching builtin extensions");

    try {
      const extensions: ExtensionInfo[] = [];

      const loader: ExtensionLoader = {
        getExtensions: async () => extensions,
        loadExtension: async (_id: string) => {
          throw new Error(`not implemented`);
        },
        downloadExtension,
        installExtension,
        uninstallExtension,
      };
      return loader;
    } catch (err) {
      log.error(err);

      const loader: ExtensionLoader = {
        getExtensions: async () => [],
        loadExtension: async () => "",
        downloadExtension,
        installExtension,
        uninstallExtension,
      };
      return loader;
    }
  }, []);

  if (error) {
    throw error;
  }

  if (!registry) {
    return <></>;
  }

  return (
    <ExtensionLoaderContext.Provider value={registry}>
      {props.children}
    </ExtensionLoaderContext.Provider>
  );
}

async function downloadExtension(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
}

async function installExtension(_foxeFileData: Uint8Array): Promise<ExtensionInfo> {
  // The web view can load extensions, but can't install them
  throw new Error("Extensions cannot be installed from the web viewer");
}

async function uninstallExtension(_id: string): Promise<boolean> {
  return false;
}
