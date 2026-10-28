/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missingKey } from "@hypergen/dapi";

const state = vi.hoisted(() => ({
  available: true,
  handlers: new Map<string, (data: unknown) => unknown>(),
}));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    encryptString: (text: string) => Buffer.from(`enc:${[...text].reverse().join("")}`),
    decryptString: (buffer: Buffer) => [...buffer.toString().slice(4)].reverse().join(""),
  },
}));

vi.mock("../main-manager", () => ({
  mainBridge: {
    handle: (channel: string, handler: (data: unknown) => unknown) => state.handlers.set(channel, handler),
  },
}));

import { MAIN_CHANNELS } from "../main-channels";
import { registerProviderHandlers } from "./index";

const PROVIDER_CHANNELS = [
  "PROVIDERS_KEYS_STATUS",
  "PROVIDERS_KEYS_SET",
  "PROVIDERS_KEYS_REMOVE",
  "PROVIDERS_KEYS_TEST",
  "PROVIDERS_FAL_SUBMIT",
  "PROVIDERS_FAL_POLL",
  "PROVIDERS_FAL_CANCEL",
  "PROVIDERS_GEMINI_GENERATE",
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let dir: string;
let keysPath: string;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const call = (name: (typeof PROVIDER_CHANNELS)[number], data?: unknown) => {
  const handler = state.handlers.get(MAIN_CHANNELS[name]);
  if (!handler) throw new Error(`no handler for ${name}`);
  return Promise.resolve(handler(data));
};

beforeEach(() => {
  state.available = true;
  state.handlers.clear();
  dir = mkdtempSync(join(tmpdir(), "providers-ipc-"));
  keysPath = join(dir, "keys.json");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  registerProviderHandlers(keysPath);
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("registerProviderHandlers", () => {
  it("registers exactly the eight provider channels", () => {
    expect([...state.handlers.keys()].sort()).toEqual(PROVIDER_CHANNELS.map((name) => MAIN_CHANNELS[name]).sort());
  });

  it("stores keys at the injected path and reports booleans only", async () => {
    expect(await call("PROVIDERS_KEYS_STATUS")).toEqual({ gemini: false, fal: false });
    expect(await call("PROVIDERS_KEYS_SET", { provider: "gemini", key: "g-secret-key" })).toBeUndefined();
    expect(await call("PROVIDERS_KEYS_STATUS")).toEqual({ gemini: true, fal: false });
    expect(readFileSync(keysPath, "utf8")).not.toContain("g-secret-key");
    expect(await call("PROVIDERS_KEYS_REMOVE", { provider: "gemini" })).toBeUndefined();
    expect(await call("PROVIDERS_KEYS_STATUS")).toEqual({ gemini: false, fal: false });
  });

  it("never returns the raw key from any channel", async () => {
    await call("PROVIDERS_KEYS_SET", { provider: "gemini", key: "g-secret-key" });
    await call("PROVIDERS_KEYS_SET", { provider: "fal", key: "f-secret-key" });
    fetchMock.mockImplementation(async () => json({ models: [] }));
    const results = [
      await call("PROVIDERS_KEYS_STATUS"),
      await call("PROVIDERS_KEYS_TEST", { provider: "gemini" }),
      await call("PROVIDERS_KEYS_TEST", { provider: "fal" }),
    ];
    for (const result of results) {
      expect(JSON.stringify(result ?? null)).not.toMatch(/secret-key/);
    }
  });

  it.each(["gemini", "fal"] as const)("KEYS_TEST for %s with no key returns ok:false and makes no request", async (provider) => {
    expect(await call("PROVIDERS_KEYS_TEST", { provider })).toEqual({
      ok: false,
      error: `MISSING_KEY: ${missingKey(provider).message}`,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KEYS_TEST for gemini does an authenticated GET of the model list", async () => {
    await call("PROVIDERS_KEYS_SET", { provider: "gemini", key: "g-secret-key" });
    fetchMock.mockResolvedValue(json({ models: [] }));
    expect(await call("PROVIDERS_KEYS_TEST", { provider: "gemini" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(init?.headers).toMatchObject({ "x-goog-api-key": "g-secret-key" });
  });

  it("KEYS_TEST for fal reports a 401 as a rejected key", async () => {
    await call("PROVIDERS_KEYS_SET", { provider: "fal", key: "bad" });
    fetchMock.mockResolvedValue(json({}, 401));
    const result = (await call("PROVIDERS_KEYS_TEST", { provider: "fal" })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: "Key bad" });
  });

  it("KEYS_TEST reports a network failure without throwing", async () => {
    await call("PROVIDERS_KEYS_SET", { provider: "gemini", key: "k" });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await call("PROVIDERS_KEYS_TEST", { provider: "gemini" })).toEqual({ ok: false, error: "fetch failed" });
  });

  it("KEYS_SET surfaces the safeStorage error when encryption is unavailable", async () => {
    state.available = false;
    await expect(call("PROVIDERS_KEYS_SET", { provider: "fal", key: "k" })).rejects.toThrow(/cannot be stored securely/);
  });

  it.each([
    ["PROVIDERS_FAL_SUBMIT", { endpoint: "fal-ai/flux", input: {} }, "fal"],
    [
      "PROVIDERS_GEMINI_GENERATE",
      { prompt: "p", media: { mimeType: "image/png", data: new Uint8Array([1]) } },
      "gemini",
    ],
  ] as const)("%s without a key throws MISSING_KEY and makes no request", async (channel, data, provider) => {
    await expect(call(channel, data)).rejects.toThrow(`MISSING_KEY: ${missingKey(provider).message}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAL_POLL for an unknown request id rejects without a request", async () => {
    await expect(call("PROVIDERS_FAL_POLL", { requestId: "nope" })).rejects.toThrow(/Unknown fal.ai request/);
    await expect(call("PROVIDERS_FAL_CANCEL", { requestId: "nope" })).rejects.toThrow(/Unknown fal.ai request/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAL submit then poll goes through the stored key and job", async () => {
    await call("PROVIDERS_KEYS_SET", { provider: "fal", key: "f-secret-key" });
    fetchMock
      .mockResolvedValueOnce(
        json({
          request_id: "r1",
          status_url: "https://queue.fal.run/x/requests/r1/status",
          response_url: "https://queue.fal.run/x/requests/r1",
          cancel_url: "https://queue.fal.run/x/requests/r1/cancel",
        }),
      )
      .mockResolvedValueOnce(json({ status: "IN_QUEUE", queue_position: 2 }));
    expect(await call("PROVIDERS_FAL_SUBMIT", { endpoint: "x", input: { prompt: "a" } })).toEqual({ requestId: "r1" });
    expect(await call("PROVIDERS_FAL_POLL", { requestId: "r1" })).toEqual({ status: "IN_QUEUE", queuePosition: 2 });
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: "Key f-secret-key" });
  });
});
