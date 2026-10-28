/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Transcript } from "./models";

/** A word chunk as Whisper returns it with word timestamps; the last word's end may be null. */
export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

const SENTENCE_END = /[.!?…]["')\]]*$/;

/** Longest pause, in seconds, kept inside one segment. */
const MAX_GAP = 1;

/**
 * Whisper's word chunks as a transcript: words trimmed and empty ones
 * dropped, a missing end taken as the next word's start (or `duration` for
 * the last word), and a new segment after a sentence ends or a pause longer
 * than a second.
 */
export function whisperToTranscript(chunks: WhisperChunk[], duration: number): Transcript {
  const kept = chunks.map((chunk) => ({ text: chunk.text.trim(), timestamp: chunk.timestamp })).filter((chunk) => chunk.text !== "");
  const segments: Transcript = [];
  let words: Transcript[number]["words"] = [];
  const close = () => {
    if (words.length) segments.push({ text: words.map((word) => word.text).join(" "), words });
    words = [];
  };
  kept.forEach((chunk, index) => {
    const [start, end] = chunk.timestamp;
    const previous = words.at(-1);
    if (previous && (SENTENCE_END.test(previous.text) || start - previous.end > MAX_GAP)) close();
    words.push({ text: chunk.text, start, end: end ?? kept[index + 1]?.timestamp[0] ?? duration });
  });
  close();
  return segments;
}
