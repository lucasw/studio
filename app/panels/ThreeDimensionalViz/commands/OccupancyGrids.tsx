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

import { Command, withPose, pointToVec3, defaultBlend, CommonCommandProps } from "regl-worldview";

import { getGlobalHooks } from "@foxglove-studio/app/loadWebviz";
import { TextureCache } from "@foxglove-studio/app/panels/ThreeDimensionalViz/commands/utils";
import FragShader from "@foxglove-studio/app/panels/ThreeDimensionalViz/glsl/OccupancyGrid.frag";
import VertShader from "@foxglove-studio/app/panels/ThreeDimensionalViz/glsl/OccupancyGrid.vert";
import { OccupancyGridMessage } from "@foxglove-studio/app/types/Messages";

const occupancyGrids = (regl: any) => {
  // make a buffer holding the verticies of a 1x1 plane
  // it will be resized in the shader
  const positionBuffer = regl.buffer([0, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0]);

  const cache = new TextureCache(regl);
  const paletteTextures: any = {};

  return withPose({
    primitive: "triangle strip",

    vert: VertShader,
    frag: FragShader,
    blend: defaultBlend,

    depth: { enable: true, mask: false },

    attributes: {
      point: positionBuffer,
    },

    uniforms: {
      width: regl.prop("info.width"),
      height: regl.prop("info.height"),
      resolution: regl.prop("info.resolution"),
      // make alpha a uniform so in the future it can be controlled by topic settings
      alpha: (context: any, props: OccupancyGridMessage) => {
        return props.alpha || 0.5;
      },
      offset: (context: any, props: OccupancyGridMessage) => {
        return pointToVec3(props.info.origin.position);
      },
      orientation: (context: any, props: OccupancyGridMessage) => {
        const { x, y, z, w } = props.info.origin.orientation;
        return [x, y, z, w];
      },
      palette: (context: any, props: OccupancyGridMessage) => {
        const palette = (getGlobalHooks() as any)
          .perPanelHooks()
          .ThreeDimensionalViz.getMapPalette(props.map);
        // track which palettes we've uploaded as textures
        if (paletteTextures[palette]) {
          return paletteTextures[palette];
        }
        // if we haven't already uploaded this palette, upload it to the GPU
        paletteTextures[palette] = regl.texture({
          format: "rgba",
          type: "uint8",
          mipmap: false,
          data: palette,
          width: 256,
          height: 1,
        });
        return paletteTextures[palette];
      },
      data: (context: any, props: any) => {
        return cache.get(props);
      },
    },

    count: 4,
  });
};

type Props = CommonCommandProps & {
  children: OccupancyGridMessage[];
};

export default function OccupancyGrids(props: Props) {
  // We can click through OccupancyGrids.
  return <Command getChildrenForHitmap={undefined} {...props} reglCommand={occupancyGrids} />;
}
