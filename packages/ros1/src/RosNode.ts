// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";

import { HttpServer } from "@foxglove/xmlrpc";

import { LoggerService } from "./LoggerService";
import { Publication } from "./Publication";
import { RosFollower } from "./RosFollower";
import { RosFollowerClient } from "./RosFollowerClient";
import { RosMasterClient } from "./RosMasterClient";
import { Subscription } from "./Subscription";
import { TcpConnection } from "./TcpConnection";
import { TcpSocketCreate, TcpServer, TcpAddress, NetworkInterface } from "./TcpTypes";

export type RosGraph = {
  publishers: Map<string, Set<string>>; // Maps topic names to arrays of nodes publishing each topic
  subscribers: Map<string, Set<string>>; // Maps topic names to arrays of nodes subscribing to each topic
  services: Map<string, Set<string>>; // Maps service names to arrays of nodes providing each service
};

export type SubscribeOpts = {
  topic: string;
  type: string;
  md5sum?: string;
  queueSize?: number;
  tcpNoDelay?: boolean;
};

export class RosNode extends EventEmitter {
  readonly name: string;
  readonly hostname: string;
  readonly pid: number;

  rosMasterClient: RosMasterClient;
  rosFollower: RosFollower;
  subscriptions = new Map<string, Subscription>();
  publications = new Map<string, Publication>();

  private _running = true;
  private _tcpSocketCreate: TcpSocketCreate;
  private _connectionIdCounter = 0;
  private _tcpServer?: TcpServer;
  private _localApiUrl?: string;
  private _log?: LoggerService;

  constructor(options: {
    name: string;
    hostname: string;
    pid: number;
    rosMasterUri: string;
    httpServer: HttpServer;
    tcpSocketCreate: TcpSocketCreate;
    tcpServer?: TcpServer;
    log?: LoggerService;
  }) {
    super();
    this.name = options.name;
    this.hostname = options.hostname;
    this.pid = options.pid;
    this.rosMasterClient = new RosMasterClient(options.rosMasterUri);
    this.rosFollower = new RosFollower(this, options.httpServer);
    this._tcpSocketCreate = options.tcpSocketCreate;
    this._tcpServer = options.tcpServer;
    this._log = options.log;
  }

  async start(port?: number): Promise<void> {
    return this.rosFollower
      .start(this.hostname, port)
      .then(() => this._log?.debug?.(`rosfollower listening at ${this.rosFollower.url()}`));
  }

  shutdown(_msg?: string): void {
    this._log?.debug?.("shutting down");
    this._running = false;
    this._tcpServer?.close();
    this.rosFollower.close();

    for (const subTopic of Array.from(this.subscriptions.keys())) {
      this.unsubscribe(subTopic);
    }

    for (const pubTopic of Array.from(this.publications.keys())) {
      this.unpublish(pubTopic);
    }

    this.subscriptions.clear();
    this.publications.clear();
  }

  subscribe(options: SubscribeOpts): Subscription {
    const { topic, type } = options;
    const md5sum = options.md5sum ?? "*";
    const subscription = new Subscription(topic, md5sum, type);
    this.subscriptions.set(topic, subscription);

    this._log?.debug?.(`subscribing to ${topic} (${type})`);

    // Asynchronously register this subscription with rosmaster and connect to
    // each publisher
    this._registerSubscriberAndConnect(subscription, options);

    return subscription;
  }

  unsubscribe(topic: string): boolean {
    const subscription = this.subscriptions.get(topic);
    if (!subscription) {
      return false;
    }

    this._unregisterSubscriber(topic);

    subscription.close();
    this.subscriptions.delete(topic);
    return true;
  }

  unpublish(topic: string): boolean {
    const publication = this.publications.get(topic);
    if (!publication) {
      return false;
    }

    this._unregisterPublisher(topic);

    publication.close();
    this.publications.delete(topic);
    return true;
  }

  async getPublishedTopics(subgraph?: string): Promise<[topic: string, dataType: string][]> {
    const [status, msg, topicsAndTypes] = await this.rosMasterClient.getPublishedTopics(
      this.name,
      subgraph,
    );
    if (status !== 1) {
      throw new Error(`getPublishedTopics returned failure (status=${status}): ${msg}`);
    }
    return topicsAndTypes as [string, string][];
  }

  async getSystemState(): Promise<RosGraph> {
    const [status, msg, systemState] = await this.rosMasterClient.getSystemState(this.name);
    if (status !== 1) {
      throw new Error(`getPublishedTopics returned failure (status=${status}): ${msg}`);
    }
    if (!Array.isArray(systemState) || systemState.length !== 3) {
      throw new Error(`getPublishedTopics returned unrecognized data (${msg})`);
    }

    // Each of these has the form [ [topic, [node1...nodeN]] ... ]
    type SystemStateEntry = [topic: string, nodes: string[]];
    type SystemStateResponse = [SystemStateEntry[], SystemStateEntry[], SystemStateEntry[]];
    const [pubs, subs, srvs] = systemState as SystemStateResponse;

    const createMap = (entries: SystemStateEntry[]) =>
      new Map<string, Set<string>>(entries.map(([topic, nodes]) => [topic, new Set(nodes)]));

    return {
      publishers: createMap(pubs),
      subscribers: createMap(subs),
      services: createMap(srvs),
    };
  }

  tcpServerAddress(): TcpAddress | undefined {
    return this._tcpServer?.address();
  }

  receivedBytes(): number {
    let bytes = 0;
    for (const sub of this.subscriptions.values()) {
      bytes += sub.receivedBytes();
    }
    return bytes;
  }

  static async RequestTopic(
    name: string,
    topic: string,
    apiClient: RosFollowerClient,
  ): Promise<{ address: string; port: number }> {
    const [status, msg, protocol] = await apiClient.requestTopic(name, topic, [["TCPROS"]]);

    if (status !== 1) {
      throw new Error(`requestTopic("${name}", "${topic}") failed. status=${status}, msg=${msg}`);
    }
    if (!Array.isArray(protocol) || protocol.length < 3 || protocol[0] !== "TCPROS") {
      throw new Error(`TCP not supported by ${apiClient.url()} for topic "${topic}"`);
    }

    return { port: protocol[2] as number, address: protocol[1] as string };
  }

  private _newConnectionId(): number {
    return this._connectionIdCounter++;
  }

  private _callerApi(): string {
    if (this._localApiUrl != undefined) {
      return this._localApiUrl;
    }

    this._localApiUrl = this.rosFollower.url();
    if (this._localApiUrl == undefined) {
      throw new Error("Local XMLRPC server was not started");
    }

    return this._localApiUrl;
  }

  private async _registerSubscriber(subscription: Subscription): Promise<string[]> {
    if (!this._running) {
      return Promise.resolve([]);
    }

    const callerApi = this._callerApi();

    // Register with rosmaster as a subscriber to this topic
    const [status, msg, publishers] = await this.rosMasterClient.registerSubscriber(
      this.name,
      subscription.name,
      subscription.dataType,
      callerApi,
    );

    if (status !== 1) {
      throw new Error(`registerSubscriber() failed. status=${status}, msg="${msg}"`);
    }

    this._log?.debug?.(`registered subscriber to ${subscription.name} (${subscription.dataType})`);
    if (!Array.isArray(publishers)) {
      throw new Error(
        `registerSubscriber() did not receive a list of publishers. value=${publishers}`,
      );
    }

    return publishers as string[];
  }

  private async _unregisterSubscriber(topic: string): Promise<void> {
    try {
      const callerApi = this._callerApi();

      // Unregister with rosmaster as a subscriber to this topic
      const [status, msg] = await this.rosMasterClient.unregisterSubscriber(
        this.name,
        topic,
        callerApi,
      );

      if (status !== 1) {
        throw new Error(`unregisterSubscriber() failed. status=${status}, msg="${msg}"`);
      }

      this._log?.debug?.(`unregistered subscriber to ${topic}`);
    } catch (err) {
      // Warn and carry on, the rosmaster graph will be out of sync but there's
      // not much we can do (it may already be offline)
      this._log?.warn?.(err, "unregisterSubscriber");
    }
  }

  private async _unregisterPublisher(topic: string): Promise<void> {
    try {
      const callerApi = this._callerApi();

      // Unregister with rosmaster as a publisher of this topic
      const [status, msg] = await this.rosMasterClient.unregisterPublisher(
        this.name,
        topic,
        callerApi,
      );

      if (status !== 1) {
        throw new Error(`unregisterPublisher() failed. status=${status}, msg="${msg}"`);
      }

      this._log?.debug?.(`unregistered publisher for ${topic}`);
    } catch (err) {
      // Warn and carry on, the rosmaster graph will be out of sync but there's
      // not much we can do (it may already be offline)
      this._log?.warn?.(err, "unregisterPublisher");
    }
  }

  private async _registerSubscriberAndConnect(
    subscription: Subscription,
    options: SubscribeOpts,
  ): Promise<void> {
    const { topic, type } = options;
    const md5sum = options.md5sum ?? "*";
    const tcpNoDelay = options.tcpNoDelay ?? false;

    if (!this._running) {
      return;
    }

    // TODO: Handle this registration failing
    const publishers = await this._registerSubscriber(subscription);

    if (!this._running) {
      return;
    }

    // Register with each publisher
    await Promise.all(
      publishers.map(async (pubUrl) => {
        if (!this._running) {
          return;
        }

        // Create an XMLRPC client to talk to this publisher
        const rosFollowerClient = new RosFollowerClient(pubUrl);

        if (!this._running) {
          return;
        }

        // Call requestTopic on this publisher to register ourselves as a subscriber
        // TODO: Handle this requestTopic() call failing
        const { address, port } = await RosNode.RequestTopic(this.name, topic, rosFollowerClient);
        this._log?.debug?.(
          `reigstered with ${pubUrl} as a subscriber to ${topic}, connecting to tcpros://${address}:${port}`,
        );

        if (!this._running) {
          return;
        }

        // Create a TCP socket connecting to this publisher
        const socket = await this._tcpSocketCreate({ host: address, port });
        const connection = new TcpConnection(
          socket,
          new Map<string, string>([
            ["topic", topic],
            ["md5sum", md5sum],
            ["callerid", this.name],
            ["type", type],
            ["tcp_nodelay", tcpNoDelay ? "1" : "0"],
          ]),
        );

        if (!this._running) {
          socket.close();
          return;
        }

        // Hold a reference to this publisher
        const connectionId = this._newConnectionId();
        subscription.addPublisher(connectionId, rosFollowerClient, connection);

        // Asynchronously initiate the socket connection
        socket.connect().then(() => this._log?.debug?.(`connected to tcpros://${address}:${port}`));
      }),
    );
  }

  static GetRosHostname(
    getEnvVar: (envVar: string) => string | undefined,
    getHostname: () => string | undefined,
    getNetworkInterfaces: () => NetworkInterface[],
  ): string {
    // Prefer ROS_HOSTNAME, then ROS_IP env vars
    let hostname = getEnvVar("ROS_HOSTNAME") ?? getEnvVar("ROS_IP");
    if (hostname !== undefined && hostname.length > 0) {
      return hostname;
    }

    // Try to get the operating system hostname
    hostname = getHostname();
    if (hostname !== undefined && hostname.length > 0) {
      return hostname;
    }

    // Fall back to iterating network interfaces looking for an IP address
    let bestAddr: NetworkInterface | undefined;
    const ifaces = getNetworkInterfaces();
    for (const iface of ifaces) {
      if (
        (iface.family !== "IPv4" && iface.family !== "IPv6") ||
        iface.internal ||
        iface.address.length === 0
      ) {
        continue;
      }

      if (bestAddr === undefined) {
        // Use the first non-internal interface we find
        bestAddr = iface;
      } else if (RosNode.IsPrivateIP(bestAddr.address) && !RosNode.IsPrivateIP(iface.address)) {
        // Prefer public IPs over private
        bestAddr = iface;
      } else if (bestAddr.family !== "IPv6" && iface.family === "IPv6") {
        // Prefer IPv6
        bestAddr = iface;
      }
    }
    if (bestAddr !== undefined) {
      return bestAddr.address;
    }

    // Last resort, return IPv4 loopback
    return "127.0.0.1";
  }

  static IsPrivateIP(ip: string): boolean {
    // Logic based on isPrivateIP() in ros_comm network.cpp
    return ip.startsWith("192.168") || ip.startsWith("10.") || ip.startsWith("169.254");
  }
}
