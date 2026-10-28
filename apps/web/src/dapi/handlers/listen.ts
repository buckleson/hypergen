/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DapiError } from "@hypergen/dapi";

import { geminiGenerate } from "@/lib/providers";
import { requireAssetType, resolveAsset } from "../lib/assets";
import { audioFile } from "../lib/audio";

import type { ToolHandler } from "../handler";

/** What is asked when no prompt is given. */
const DEFAULT_PROMPT = "Describe this audio: what is said, by whom, the music and other sounds, with timestamps.";

/** The most audio Gemini takes inline with a request. */
const MAX_BYTES = 20 * 1024 * 1024;

/** The asset's audio, or a window of it, analyzed by Gemini; times in the answer count from `start`, echoed with `end` when a window was given. */
export const listen: ToolHandler<"listen"> = async ({ path, prompt, start, end }, ctx) => {
  const asset = await resolveAsset(ctx, path);
  requireAssetType(asset, ["AUDIO", "VIDEO"], "a video or audio asset");

  const windowed = start !== undefined || end !== undefined;
  const from = start ?? 0;
  const to = Math.min(end ?? asset.duration, asset.duration);
  if (windowed && from >= to) {
    throw new DapiError("invalid-input", `The window is empty: start (${from.toFixed(2)}s) is at or past the end (${to.toFixed(2)}s).`);
  }

  const audio = windowed ? await audioFile(asset, from, to) : await audioFile(asset);
  if (audio.size > MAX_BYTES) {
    throw new DapiError(
      "invalid-input",
      `The audio is ${(audio.size / 1024 / 1024).toFixed(1)} MB, over the 20 MB that can be analyzed at once: pass a shorter start/end window.`,
    );
  }
  ctx.signal.throwIfAborted();

  const { text } = await geminiGenerate(prompt ?? DEFAULT_PROMPT, { mimeType: audio.type || "audio/mpeg", data: new Uint8Array(await audio.arrayBuffer()) });
  const result = text.trim();
  return windowed ? { result, start: from, end: to } : { result };
};
