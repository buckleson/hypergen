/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from "vitest";
import { whisperToTranscript, type WhisperChunk } from "./transcript";
import { transcribe } from "./tools/transcribe";

const w = (text: string, start: number, end: number | null): WhisperChunk => ({ text, timestamp: [start, end] });
const texts = (chunks: WhisperChunk[], duration = 10) => whisperToTranscript(chunks, duration).map((segment) => segment.text);

describe("whisperToTranscript edge cases", () => {
  it("handles a single word", () => {
    expect(whisperToTranscript([w(" hi ", 0.2, 0.5)], 1)).toEqual([{ text: "hi", words: [{ text: "hi", start: 0.2, end: 0.5 }] }]);
  });

  it("gives a lone word with no end the duration as its end", () => {
    expect(whisperToTranscript([w("hi", 0.2, null)], 3)).toEqual([{ text: "hi", words: [{ text: "hi", start: 0.2, end: 3 }] }]);
  });

  it("trims tabs and newlines and drops words that are only whitespace", () => {
    expect(texts([w("\tone\n", 0, 0.3), w("\n\t ", 0.3, 0.4), w("", 0.4, 0.5), w(" two", 0.5, 0.8)])).toEqual(["one two"]);
  });

  it("ends a null-end word at the next kept word's start, skipping dropped empty words", () => {
    const [segment] = whisperToTranscript([w("one", 0, null), w("  ", 0.3, 0.4), w("two", 0.7, 0.9)], 5);
    expect(segment.words[0]).toEqual({ text: "one", start: 0, end: 0.7 });
  });

  it("uses the filled-in end when measuring the following gap", () => {
    // "one" ends at 0.5 (next start), so the 0.5 s gap after it is not a split.
    expect(texts([w("one", 0, null), w("two", 0.5, 0.6)])).toEqual(["one two"]);
  });

  it("splits only on a pause strictly longer than one second", () => {
    expect(texts([w("a", 0, 1), w("b", 2, 2.5)])).toEqual(["a b"]);
    expect(texts([w("a", 0, 1), w("b", 2.01, 2.5)])).toEqual(["a", "b"]);
  });

  it("splits after ?, ! and … and after punctuation followed by a closing quote or bracket", () => {
    expect(texts([w("Why?", 0, 0.3), w("Yes!", 0.4, 0.6), w("Well…", 0.7, 0.9), w('"Go."', 1, 1.2), w("(fine.)", 1.3, 1.5), w("end", 1.6, 1.8)])).toEqual([
      "Why?",
      "Yes!",
      "Well…",
      '"Go."',
      "(fine.)",
      "end",
    ]);
  });

  it("does not split on commas, colons, or a period inside a word", () => {
    expect(texts([w("one,", 0, 0.2), w("two:", 0.3, 0.5), w("3.5", 0.6, 0.8), w("x", 0.9, 1)])).toEqual(["one, two: 3.5 x"]);
  });

  it("does not add an empty segment when the last word ends a sentence", () => {
    expect(whisperToTranscript([w("Done.", 0, 0.5)], 1)).toHaveLength(1);
  });

  it("does not mutate the chunks it is given", () => {
    const chunks = [w(" a", 0, null), w(" b.", 0.5, 0.6)];
    const snapshot = structuredClone(chunks);
    whisperToTranscript(chunks, 1);
    expect(chunks).toEqual(snapshot);
  });

  it("returns [] for no chunks regardless of duration", () => {
    expect(whisperToTranscript([], 0)).toEqual([]);
  });

  it("produces exactly {text, words:[{text,start,end}]} that transcribe's result accepts", () => {
    const segments = whisperToTranscript([w(" Hi.", 0, 0.4), w(" Next", 0.5, null), w(" word", 3, null)], 4);
    for (const segment of segments) {
      expect(Object.keys(segment).sort()).toEqual(["text", "words"]);
      for (const word of segment.words) {
        expect(Object.keys(word).sort()).toEqual(["end", "start", "text"]);
        expect(word.end).toBeGreaterThanOrEqual(word.start);
        expect(Number.isFinite(word.end)).toBe(true);
      }
    }
    expect(transcribe.result!.parse({ segments })).toEqual({ segments });
  });
});
