/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { sha256 } from "@/lib/uploads";
import { transcribe as transcribeLocally } from "@/lib/whisper";
import { requireAssetType, resolveAsset } from "../lib/assets";
import { audioFile } from "../lib/audio";

import type { Transcript } from "@hypergen/dapi";
import type { ToolHandler } from "../handler";

/** Transcripts by the sha256 of the audio sent, for this app session: asking again costs nothing. */
const transcripts = new Map<string, Promise<Transcript>>();

/** The asset's audio, transcribed on this machine; the main process writes the transcript to its file. */
export const transcribe: ToolHandler<"transcribe"> = async ({ path }, ctx) => {
  const asset = await resolveAsset(ctx, path);
  requireAssetType(asset, ["AUDIO", "VIDEO"], "a video or audio asset");

  const audio = await audioFile(asset);
  const key = await sha256(audio);
  let transcript = transcripts.get(key);
  if (!transcript) {
    transcript = transcribeLocally(audio, { signal: ctx.signal });
    transcripts.set(key, transcript);
    transcript.catch(() => transcripts.delete(key));
  }

  const segments = await transcript;
  if (!segments.some((segment) => segment.words.length > 0)) {
    throw new Error("No speech detected: the audio does not appear to contain recognizable speech.");
  }
  return { segments };
};
