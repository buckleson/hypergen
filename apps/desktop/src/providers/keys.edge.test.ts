/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missingKey } from "@hypergen/dapi";

const storage = vi.hoisted(() => ({ available: true }));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    encryptString: (text: string) => Buffer.from(`enc:${[...text].reverse().join("")}`),
    decryptString: (buffer: Buffer) => [...buffer.toString().slice(4)].reverse().join(""),
  },
}));

import { KeyStore } from "./keys";

let dir: string;
let path: string;

beforeEach(() => {
  storage.available = true;
  dir = mkdtempSync(join(tmpdir(), "keys-edge-"));
  path = join(dir, "keys.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("KeyStore edge cases", () => {
  it("keeps the other provider's key when one is removed", async () => {
    const keys = new KeyStore(path);
    await keys.set("gemini", "g-secret");
    await keys.set("fal", "f-secret");
    await keys.remove("gemini");
    expect(await keys.status()).toEqual({ gemini: false, fal: true });
    expect(await keys.require("fal")).toBe("f-secret");
  });

  it("replaces a key that is set twice", async () => {
    const keys = new KeyStore(path);
    await keys.set("fal", "old-secret");
    await keys.set("fal", "new-secret");
    expect(await keys.require("fal")).toBe("new-secret");
  });

  it("trims whitespace around a pasted key", async () => {
    const keys = new KeyStore(path);
    await keys.set("gemini", "  pasted-key\n");
    expect(await keys.require("gemini")).toBe("pasted-key");
  });

  it.each(["", "   ", "\n\t"])("rejects an empty key %j and writes nothing", async (key) => {
    await expect(new KeyStore(path).set("gemini", key)).rejects.toThrow(/empty/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("rejects an unknown provider", async () => {
    const keys = new KeyStore(path);
    await expect(keys.set("openai" as never, "k")).rejects.toThrow(/Unknown provider: openai/);
    await expect(keys.remove("openai" as never)).rejects.toThrow(/Unknown provider/);
  });

  it("status() returns only two booleans and never key material", async () => {
    const keys = new KeyStore(path);
    await keys.set("gemini", "g-secret");
    const status = await keys.status();
    expect(Object.keys(status).sort()).toEqual(["fal", "gemini"]);
    expect(Object.values(status).every((v) => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("leaves no temp file behind after an atomic write", async () => {
    await new KeyStore(path).set("fal", "f-secret");
    expect(readdirSync(dir)).toEqual(["keys.json"]);
  });

  it("creates a missing parent directory with spaces in its name (fresh userData)", async () => {
    const nested = join(dir, "Hypergen Data", "sub dir", "keys.json");
    const keys = new KeyStore(nested);
    await keys.set("gemini", "g-secret");
    expect(await keys.status()).toEqual({ gemini: true, fal: false });
  });

  it.each([
    ["an array", "[1,2]"],
    ["null", "null"],
    ["a string", '"x"'],
    ["non-string values", '{"gemini":123,"fal":{"a":1}}'],
    ["empty strings", '{"gemini":"","fal":""}'],
    ["an empty file", ""],
  ])("treats %s in the file as no keys", async (_name, content) => {
    writeFileSync(path, content);
    expect(await new KeyStore(path).status()).toEqual({ gemini: false, fal: false });
  });

  it("drops unknown entries when it rewrites the file", async () => {
    writeFileSync(path, JSON.stringify({ other: "zzz" }));
    await new KeyStore(path).set("gemini", "g-secret");
    expect(Object.keys(JSON.parse(readFileSync(path, "utf8")))).toEqual(["gemini"]);
  });

  it("recovers from a corrupt file on the next save", async () => {
    writeFileSync(path, "{broken");
    const keys = new KeyStore(path);
    await keys.set("fal", "f-secret");
    expect(await keys.status()).toEqual({ gemini: false, fal: true });
  });

  it("writes nothing when safeStorage is unavailable", async () => {
    storage.available = false;
    await expect(new KeyStore(path).set("fal", "f-secret")).rejects.toThrow(/cannot be stored securely/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("can still remove a key while safeStorage is unavailable", async () => {
    const keys = new KeyStore(path);
    await keys.set("fal", "f-secret");
    storage.available = false;
    await keys.remove("fal");
    expect(await keys.status()).toEqual({ gemini: false, fal: false });
  });

  it("refuses to decrypt a saved key once safeStorage is unavailable", async () => {
    const keys = new KeyStore(path);
    await keys.set("gemini", "g-secret");
    storage.available = false;
    await expect(keys.require("gemini")).rejects.toThrow(/cannot be stored securely/);
  });

  it("reports MISSING_KEY (not a crash) for a corrupt file", async () => {
    writeFileSync(path, "{broken");
    await expect(new KeyStore(path).require("fal")).rejects.toThrow(`MISSING_KEY: ${missingKey("fal").message}`);
  });

  it.each(["gemini", "fal"] as const)("MISSING_KEY message for %s has no legacy branding", async (provider) => {
    const error = (await new KeyStore(path).require(provider).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/^MISSING_KEY: /);
    expect(error.message).not.toMatch(new RegExp(`\\b(LTX|Lightricks|${"cred"}its?)\\b`, "i"));
  });
});
