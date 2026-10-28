/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it, vi } from "vitest";
import { MAX_MEDIA_BYTES, generateWithGemini, testGeminiKey } from "./gemini";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const key = async () => "g-secret-key";
const media = (size = 3, mimeType = "image/png") => ({ mimeType, data: new Uint8Array(size).fill(7) });

describe("generateWithGemini edge cases", () => {
  it("defines the limit as exactly 20 MB", () => {
    expect(MAX_MEDIA_BYTES).toBe(20 * 1024 * 1024);
  });

  it("accepts media of exactly 20 MB", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    await expect(generateWithGemini(key, { prompt: "p", media: media(MAX_MEDIA_BYTES) }, fetchFn)).resolves.toEqual({ text: "ok" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized media before asking for the key", async () => {
    const keyFn = vi.fn(key);
    const fetchFn = vi.fn<typeof fetch>();
    await expect(generateWithGemini(keyFn, { prompt: "p", media: media(MAX_MEDIA_BYTES + 1) }, fetchFn)).rejects.toThrow(/20 MB/);
    expect(keyFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns empty text when there are no candidates", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    expect(await generateWithGemini(key, { prompt: "p", media: media() }, fetchFn)).toEqual({ text: "" });
  });

  it("ignores non-text parts and uses only the first candidate", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        candidates: [
          { content: { parts: [{ text: "a" }, { inline_data: {} }, { text: 5 }, { text: "b" }] } },
          { content: { parts: [{ text: "IGNORED" }] } },
        ],
      }),
    );
    expect(await generateWithGemini(key, { prompt: "p", media: media() }, fetchFn)).toEqual({ text: "ab" });
  });

  it("sends an empty media buffer as an empty base64 string", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await generateWithGemini(key, { prompt: "", media: media(0, "audio/wav") }, fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0]![1]?.body as string)).toEqual({
      contents: [{ parts: [{ inline_data: { mime_type: "audio/wav", data: "" } }, { text: "" }] }],
    });
  });

  it("puts the key only in the header, never the URL or body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await generateWithGemini(key, { prompt: "p", media: media() }, fetchFn);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).not.toContain("g-secret-key");
    expect(String(url)).not.toContain("key=");
    expect(init?.body as string).not.toContain("g-secret-key");
  });

  it("falls back to the raw body for a non-JSON error", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("Service Unavailable", { status: 503 }));
    await expect(generateWithGemini(key, { prompt: "p", media: media() }, fetchFn)).rejects.toThrow(
      "Gemini request failed (503): Service Unavailable",
    );
  });

  it("includes the status for an error with an empty body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 500 }));
    await expect(generateWithGemini(key, { prompt: "p", media: media() }, fetchFn)).rejects.toThrow(/Gemini request failed \(500\)/);
  });

  it("propagates an offline failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(generateWithGemini(key, { prompt: "p", media: media() }, fetchFn)).rejects.toThrow("fetch failed");
  });
});

describe("testGeminiKey edge cases", () => {
  it("uses a GET with no body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ models: [] }));
    await testGeminiKey("k", fetchFn);
    const init = fetchFn.mock.calls[0]![1];
    expect(init?.method === undefined || init?.method === "GET").toBe(true);
    expect(init?.body).toBeUndefined();
  });

  it.each([401, 403])("reports status %i as a rejected key", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: "denied" } }, status));
    expect(await testGeminiKey("k", fetchFn)).toEqual({ ok: false, error: `Gemini rejected the key (${status}): denied` });
  });

  it("reports an offline failure as ok:false", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await testGeminiKey("k", fetchFn)).toEqual({ ok: false, error: "fetch failed" });
  });

  it("does not echo the key in the result", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: "API key not valid." } }, 400));
    expect(JSON.stringify(await testGeminiKey("g-secret-key", fetchFn))).not.toContain("g-secret-key");
  });
});
