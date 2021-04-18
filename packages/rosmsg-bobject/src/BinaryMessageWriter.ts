// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2020-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { sumBy, maxBy } from "lodash";

// @ts-expect-error this js file is generated by emcc and has "any" type since we don't have a declaration for it
import ModuleFactory from "../wasm/translator";
import { BinaryDefinition, BinaryObjects, Message, RosDatatype, RosDatatypes } from "./types";

const wasmUrl = new URL("../wasm/translator.wasm", import.meta.url);

// The ModuleFactory tries to be smart about how it loads the file path based environment and protocol.
// In browsers it will try to load the path via _fetch_, however, if it detects file:// prefix it assumes
// that _fetch_ won't work and tries to fall-back to loading without _fetch_ which fails since we do not
// provide a fallback function.
// By using only the URL.pathname the ModuleFactory properly loads the file in production and development
// via fetch which works when the file is an asolute path on disk or served by the webserver in dev.
const wasmPath = wasmUrl.pathname;

export default class BinaryMessageWriter {
  _bridgeInstance?: any;
  _definitionRegistry?: any;

  async initialize() {
    this._bridgeInstance = await ModuleFactory({
      locateFile: () => {
        return wasmPath;
      },
    });
    if (this._bridgeInstance) {
      this._definitionRegistry = new this._bridgeInstance.DefinitionRegistry();
    }
  }

  _getBridge(): any {
    if (!this._bridgeInstance) {
      throw new Error("Wasm bridge not initialized");
    }
    return this._bridgeInstance;
  }

  _getDefinitions(): any {
    if (!this._definitionRegistry) {
      throw new Error("Definition registry not initialized");
    }
    return this._definitionRegistry;
  }

  // Creates a definition and adds it to the registry
  // Does not validate the definition. It must be done later.
  _createDefinition(name: string, dataType: RosDatatype): BinaryDefinition {
    const definition = this._getDefinitions().create(name);
    for (const field of dataType.fields) {
      if (field.isConstant ?? false) {
        // ignore constant fields since they have no values in the message's data.
        continue;
      }
      if (!definition.addField(field.type, field.name, field.isArray, field.arrayLength ?? -1)) {
        throw new Error(`Could not add field with type "${field.type}"`);
      }
    }
    return definition;
  }

  // Register a single definition. Performs validation before returning
  registerDefinition(name: string, dataType: RosDatatype): BinaryDefinition {
    const definition = this._createDefinition(name, dataType);
    if (!this._getDefinitions().finalize()) {
      throw new Error(`Invalid definition "${name}"`);
    }
    return definition;
  }

  registerDefinitions(dataTypes: RosDatatypes): BinaryDefinition[] {
    const definitions = Object.entries(dataTypes).map(([type, dataType]) => {
      return this._createDefinition(type, dataType);
    });
    if (!this._getDefinitions().finalize()) {
      throw new Error(`Failed to validate definitions`);
    }
    return definitions;
  }

  getDefinitionCommands(definitionName: string): number[] {
    const definition = this._getDefinitions().get(definitionName);
    if (!definition) {
      throw new Error(`No definition found with type "${definitionName}"`);
    }

    const ret = [];
    const cmds = definition.getCommands();
    for (let i = 0; i < cmds.size(); i++) {
      ret.push(cmds.get(i));
    }
    return ret;
  }

  rewriteMessages(definitionName: string, messages: Message[]): BinaryObjects {
    const bridge = this._getBridge();

    const definition = this._getDefinitions().get(definitionName);
    if (!definition) {
      throw new Error(`No definition found with type "${definitionName}"`);
    }

    const writer = new bridge.MessageWriter();

    // Get memory requirements for all messages
    // See MessageWriter::reserve() for more information
    const totalBytes = sumBy(messages, (m) => m.message.byteLength);
    const maxMessageBytes = maxBy(messages, (m) => m.message.byteLength)?.message.byteLength;
    writer.reserve(definition, messages.length, totalBytes);

    // Allocate a buffer to use to send data to C++ code that is big
    // enough to handle the maximum number of bytes for a single message
    // eslint-disable-next-line no-underscore-dangle
    const inDataPtr = bridge._malloc(maxMessageBytes);
    if (!inDataPtr) {
      throw new Error(`Could not allocate memory for data buffer with size "${maxMessageBytes}"`);
    }

    // Translate messages
    const offsets = messages.map((m) => {
      const { topic } = m;
      const data: ArrayBuffer = m.message as any;
      const dataLength = data.byteLength;

      const view = new Uint8Array(data);
      bridge.HEAPU8.set(view, inDataPtr); // requires typed array

      const offset = writer.write(definition, inDataPtr, dataLength);
      if (offset < 0) {
        throw new Error(
          `Could not write message from "${topic}" with undefined type "${definitionName}"`,
        );
      }

      return offset;
    });

    // eslint-disable-next-line no-underscore-dangle
    bridge._free(inDataPtr);

    // Copy result data int new arrays so we can access them
    // after the writer has been deleted (a few lines below).
    const buffer = new Uint8Array(writer.getBuffer()).buffer;
    // Notes:
    //  - TextDecoder overhead makes it more efficient to decode all of the strings in one go, and
    //    split them later (instead of parsing them from binary on access).
    //  - Decoding straight from the WASM heap is a nice performance win over copying the data out
    //    first.
    //  - It's very important that the indices into bigString inside the buffer correspond with
    //    characters returned by bigString.split(). Decoding as utf-8 is possible, and we could
    //    store _codepoint_ indices in the buffer, but we would need our codepoint counting to agree
    //    with the browser's for invalid data, which is difficult.
    const stringBuffer = writer.getBigString();
    const bigString = new TextDecoder("ascii").decode(stringBuffer);
    writer.delete();

    return {
      dataType: definitionName,
      offsets,
      buffer,
      bigString,
    };
  }
}
