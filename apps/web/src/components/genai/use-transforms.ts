/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Upscaling, taking a background out: tools run over the
// media the selected nodes show on top. The result is laid over that paint,
// which is hidden rather than removed (see `transform`).

import { useWorld } from "@hypergen/koota-solid";
import { Generating, PaintType } from "@hypergen/runtime";
import { transform } from "@/engine/generate";
import { useMediaSelection } from "./selection";

import type { ModelRequest } from "@hypergen/dapi";
import type { NodeMedia } from "@/engine/generate";
import type { TransformType } from "./types";

interface Tool {
  /** What a failure is reported under. */
  title: string;
  /** Whether the tool can be run over media of `type`. */
  takes(type: NodeMedia["type"]): boolean;
  /** The request over `input`, an upload of media of `type`. */
  request(type: NodeMedia["type"], input: string): ModelRequest;
}

const TOOLS: Record<TransformType, Tool> = {
  upscale: {
    title: "Upscale failed",
    takes: () => true,
    request: (type, input) =>
      type === PaintType.VIDEO
        ? { model: "seedvr-video-upscale", video: input }
        : { model: "seedvr-image-upscale", image: input },
  },
  removeBackground: {
    title: "Background removal failed",
    takes: (type) => type === PaintType.IMAGE,
    request: (_type, image) => ({ model: "bria-background-removal", image }),
  },
};

export function useTransforms() {
  const world = useWorld();
  const { media } = useMediaSelection();

  /** The selected media `type` is run over: what it applies to and is not generating already. */
  const targets = (type: TransformType) =>
    media().filter((entry) => TOOLS[type].takes(entry.type) && !entry.node.has(Generating));

  /** Runs `type` over every selected node it applies to that is not generating already. */
  const run = (type: TransformType): void => {
    const tool = TOOLS[type];
    for (const entry of targets(type)) {
      transform(world, entry, tool.title, (input) => tool.request(entry.type, input));
    }
  };

  return { targets, run };
}
