/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it, vi } from "vitest";
import { missingKey } from "@hypergen/dapi";
import { MAX_MEDIA_BYTES, generateWithGemini, testGeminiKey } from "./gemini";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const media = { mimeType: "audio/wav", data: new Uint8Array([1, 2, 3]) };

describe("generateWithGemini", () => {
  it("posts the media and prompt with the key and joins the reply", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      json({ candidates: [{ content: { parts: [{ text: "Hello " }, { text: "world" }] } }] }),
    );
    const result = await generateWithGemini(async () => "g-key", { prompt: "Transcribe", media }, fetchFn);
    expect(result).toEqual({ text: "Hello world" });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "x-goog-api-key": "g-key" });
    expect(JSON.parse(init?.body as string)).toEqual({
      contents: [{ parts: [{ inline_data: { mime_type: "audio/wav", data: "AQID" } }, { text: "Transcribe" }] }],
    });
  });

  it("rejects media over 20 MB before any request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const big = { mimeType: "video/mp4", data: new Uint8Array(MAX_MEDIA_BYTES + 1) };
    await expect(generateWithGemini(async () => "g-key", { prompt: "x", media: big }, fetchFn)).rejects.toThrow(
      /at most 20 MB/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces the API's error message", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: "API key not valid." } }, 400));
    await expect(generateWithGemini(async () => "g-key", { prompt: "x", media }, fetchFn)).rejects.toThrow(
      "Gemini request failed (400): API key not valid.",
    );
  });

  it("fails with MISSING_KEY and no request when there is no key", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const message = `MISSING_KEY: ${missingKey("gemini").message}`;
    const key = async (): Promise<string> => { throw new Error(message); };
    await expect(generateWithGemini(key, { prompt: "x", media }, fetchFn)).rejects.toThrow(message);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("testGeminiKey", () => {
  it("lists the models with the key", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ models: [] }));
    expect(await testGeminiKey("g-key", fetchFn)).toEqual({ ok: true });
    expect(fetchFn.mock.calls[0]![0]).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(fetchFn.mock.calls[0]![1]?.headers).toMatchObject({ "x-goog-api-key": "g-key" });
  });

  it("reports a rejected key", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: "API key not valid." } }, 400));
    expect(await testGeminiKey("bad", fetchFn)).toEqual({ ok: false, error: "Gemini rejected the key (400): API key not valid." });
  });
});
