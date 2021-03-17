// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { EventEmitter } from "eventemitter3";

import { Connection } from "./Connection";
import { PublisherLink } from "./PublisherLink";
import { RosFollowerClient } from "./RosFollowerClient";

type PublisherStats = [
  connectionId: number,
  bytesReceived: number,
  messagesReceived: number,
  estimatedDrops: number,
  connected: 0,
];

// e.g. [1, "http://host:54893/", "i", "TCPROS", "/chatter", 1, "TCPROS connection on port 59746 to [host:34318 on socket 11]"]
type PublisherInfo = [
  connectionId: number,
  publisherXmlRpcUri: string,
  direction: "i",
  transport: string,
  topicName: string,
  connected: number,
  connectionInfo: string,
];

export class Subscription {
  readonly name: string;
  readonly md5sum: string;
  readonly dataType: string;
  #publishers: PublisherLink[] = [];
  #emitter = new EventEmitter();

  constructor(name: string, md5sum: string, dataType: string) {
    this.name = name;
    this.md5sum = md5sum;
    this.dataType = dataType;
  }

  addPublisherLink(
    connectionId: number,
    rosFollowerClient: RosFollowerClient,
    connection: Connection,
  ): void {
    const publisher = new PublisherLink(connectionId, rosFollowerClient, connection);
    this.#publishers.push(publisher);

    connection.on("message", (msg, data) => this.#emitter.emit("message", msg, data, publisher));
  }

  on(
    eventName: "message",
    listener: (msg: unknown, data: Uint8Array, publisher: PublisherLink) => void,
  ): this {
    this.#emitter.on(eventName, listener);
    return this;
  }

  getInfo(): PublisherInfo[] {
    return this.#publishers.map(
      (pub): PublisherInfo => {
        return [
          pub.connectionId,
          pub.publisherXmlRpcUrl().toString(),
          "i",
          pub.connection.transportType(),
          this.name,
          1,
          pub.connection.getTransportInfo(),
        ];
      },
    );
  }

  getStats(): [string, PublisherStats[]] {
    const pubStats = this.#publishers.map(
      (pub): PublisherStats => {
        const stats = pub.connection.stats();
        return [
          pub.connectionId,
          stats.bytesReceived,
          stats.messagesReceived,
          stats.dropEstimate,
          0,
        ];
      },
    );
    return [this.name, pubStats];
  }

  receivedBytes(): number {
    return this.#publishers.reduce((sum, pub) => sum + pub.connection.stats().bytesReceived, 0);
  }
}
