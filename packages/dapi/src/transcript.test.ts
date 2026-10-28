/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from "vitest";
import { whisperToTranscript } from "./transcript";
import { transcribe } from "./tools/transcribe";

describe("whisperToTranscript", () => {
  it("returns no segments for no words", () => {
    expect(whisperToTranscript([], 10)).toEqual([]);
    expect(whisperToTranscript([{ text: "  ", timestamp: [0, 1] }], 10)).toEqual([]);
  });

  it("trims words, drops empty ones, and splits on sentence ends and long pauses", () => {
    const segments = whisperToTranscript(
      [
        { text: " Hello", timestamp: [0, 0.4] },
        { text: " world.", timestamp: [0.5, 1] },
        { text: " ", timestamp: [1, 1.1] },
        { text: " Next", timestamp: [1.2, 1.5] },
        { text: " one", timestamp: [1.6, 2] },
        { text: " later", timestamp: [3.5, 4] },
      ],
      5,
    );
    expect(segments).toEqual([
      { text: "Hello world.", words: [{ text: "Hello", start: 0, end: 0.4 }, { text: "world.", start: 0.5, end: 1 }] },
      { text: "Next one", words: [{ text: "Next", start: 1.2, end: 1.5 }, { text: "one", start: 1.6, end: 2 }] },
      { text: "later", words: [{ text: "later", start: 3.5, end: 4 }] },
    ]);
    expect(transcribe.result!.safeParse({ segments }).success).toBe(true);
  });

  it("ends a word with no end at the next word's start, or the duration when last", () => {
    expect(
      whisperToTranscript(
        [
          { text: "one", timestamp: [0, null] },
          { text: "two", timestamp: [0.6, null] },
        ],
        2.5,
      ),
    ).toEqual([{ text: "one two", words: [{ text: "one", start: 0, end: 0.6 }, { text: "two", start: 0.6, end: 2.5 }] }]);
  });
});
