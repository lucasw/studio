// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { RosNode } from "@foxglove/ros1";
import {
  getEnvVar,
  getHostname,
  getNetworkInterfaces,
  getPid,
  TcpSocketNode,
} from "@foxglove/ros1/dist/nodejs";
import { HttpServerNodejs } from "@foxglove/xmlrpc/dist/HttpServerNodejs.js";

async function main() {
  const name = "/testclient";
  let rosNode: RosNode | undefined;

  try {
    rosNode = new RosNode({
      name,
      rosMasterUri: getEnvVar("ROS_MASTER_URI") ?? "http://localhost:11311/",
      hostname: RosNode.GetRosHostname(getEnvVar, getHostname, getNetworkInterfaces),
      pid: getPid(),
      httpServer: new HttpServerNodejs(),
      tcpSocketCreate: TcpSocketNode.Create,
      log: console,
    });

    await rosNode.start();

    const sub = rosNode.subscribe({
      topic: "/turtle1/color_sensor",
      type: "turtlesim/Color",
    });

    sub.on("message", (msg, data, pub) => {
      // eslint-disable-next-line no-restricted-syntax
      console.log(
        `[MSG] ${JSON.stringify(msg)} (${
          data.byteLength
        } bytes from ${pub.connection.getTransportInfo()})`,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // eslint-disable-next-line no-restricted-syntax
    console.dir(sub.getStats());
  } catch (err) {
    const msg = (err as Error).stack ?? `${err}`;
    console.error(msg);
  } finally {
    rosNode?.shutdown();
  }
}

main();
