// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { flatten, groupBy } from "lodash";
import { useCallback, useMemo, useRef, useState } from "react";
import { Time, TimeUtil } from "rosbag";

import useShallowMemo from "@foxglove-studio/app/hooks/useShallowMemo";
import {
  AdvertisePayload,
  Message,
  ParameterValue,
  PlayerPresence,
  PlayerStateActiveData,
  Progress,
  PublishPayload,
  SubscribePayload,
  Topic,
} from "@foxglove-studio/app/players/types";
import StoreSetup from "@foxglove-studio/app/stories/StoreSetup";
import { wrapMessages } from "@foxglove-studio/app/test/datatypes";
import { RosDatatypes } from "@foxglove-studio/app/types/RosDatatypes";
import { objectValues } from "@foxglove-studio/app/util";
import naturalSort from "@foxglove-studio/app/util/naturalSort";

import { ContextInternal } from "./index";

const NO_DATATYPES = Object.freeze({});

function noop() {}

// TODO(Audrey): put messages under activeData, add ability to mock seeking
export default function MockMessagePipelineProvider(props: {
  children: React.ReactNode;
  presence?: PlayerPresence;
  topics?: Topic[];
  datatypes?: RosDatatypes;
  messages?: Message[];
  bobjects?: Message[];
  publish?: (request: PublishPayload) => void;
  setPublishers?: (arg0: string, arg1: AdvertisePayload[]) => void;
  setSubscriptions?: (arg0: string, arg1: SubscribePayload[]) => void;
  setParameter?: (key: string, value: ParameterValue) => void;
  noActiveData?: boolean;
  activeData?: Partial<PlayerStateActiveData>;
  capabilities?: string[];
  store?: any;
  startPlayback?: () => void;
  pausePlayback?: () => void;
  seekPlayback?: (arg0: Time) => void;
  currentTime?: Time;
  startTime?: Time;
  endTime?: Time;
  isPlaying?: boolean;
  pauseFrame?: (arg0: string) => () => void;
  playerId?: string;
  requestBackfill?: () => void;
  progress?: Progress;
}): React.ReactElement {
  const startTime = useRef();
  let currentTime = props.currentTime;
  if (!currentTime) {
    for (const message of props.messages || []) {
      if (
        startTime.current == undefined ||
        TimeUtil.isLessThan(message.receiveTime, startTime.current as any)
      ) {
        startTime.current = message.receiveTime as any;
      }
      if (!currentTime || TimeUtil.isLessThan(currentTime, message.receiveTime)) {
        currentTime = message.receiveTime;
      }
    }
  }

  const [allSubscriptions, setAllSubscriptions] = useState<{
    [key: string]: SubscribePayload[];
  }>({});
  const flattenedSubscriptions: SubscribePayload[] = useMemo(
    () => flatten(objectValues(allSubscriptions)),
    [allSubscriptions],
  );
  const setSubscriptions = useCallback(
    (id, subs) => setAllSubscriptions((s) => ({ ...s, [id]: subs })),
    [setAllSubscriptions],
  );

  const requestBackfill = useMemo(() => props.requestBackfill ?? (() => {}), [
    props.requestBackfill,
  ]);

  const capabilities = useShallowMemo(props.capabilities ?? []);

  const playerState = useMemo(
    () => ({
      presence: props.presence ?? PlayerPresence.PRESENT,
      playerId: props.playerId ?? "1",
      progress: props.progress ?? {},
      capabilities,
      activeData:
        props.noActiveData === true
          ? undefined
          : {
              messages: props.messages ?? [],
              bobjects: props.bobjects ?? wrapMessages(props.messages ?? []),
              topics: props.topics ?? [],
              datatypes: props.datatypes ?? NO_DATATYPES,
              startTime: props.startTime ?? startTime.current ?? { sec: 100, nsec: 0 },
              currentTime: currentTime ?? { sec: 100, nsec: 0 },
              endTime: props.endTime ?? currentTime ?? { sec: 100, nsec: 0 },
              isPlaying: props.isPlaying ?? false,
              speed: 0.2,
              lastSeekTime: 0,
              ...props.activeData,
            },
    }),
    [
      props.presence,
      props.playerId,
      props.progress,
      props.noActiveData,
      props.messages,
      props.bobjects,
      props.topics,
      props.datatypes,
      props.startTime,
      props.endTime,
      props.isPlaying,
      props.activeData,
      capabilities,
      currentTime,
    ],
  );

  return (
    <StoreSetup store={props.store}>
      <ContextInternal.Provider
        value={{
          playerState: playerState as any,
          frame: groupBy(props.messages ?? [], "topic"),
          sortedTopics: (props.topics ?? []).sort(naturalSort("name")),
          datatypes: props.datatypes ?? NO_DATATYPES,
          subscriptions: flattenedSubscriptions,
          publishers: [],
          setSubscriptions: props.setSubscriptions ?? setSubscriptions,
          setPublishers: props.setPublishers ?? noop,
          setParameter: props.setParameter ?? noop,
          publish: props.publish ?? noop,
          startPlayback: props.startPlayback ?? noop,
          pausePlayback: props.pausePlayback ?? noop,
          setPlaybackSpeed: noop,
          seekPlayback: props.seekPlayback ?? noop,
          pauseFrame: props.pauseFrame ?? (() => noop),
          requestBackfill,
        }}
      >
        {props.children}
      </ContextInternal.Provider>
    </StoreSetup>
  );
}
