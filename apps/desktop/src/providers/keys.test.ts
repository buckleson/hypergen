/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  dir = mkdtempSync(join(tmpdir(), "keys-test-"));
  path = join(dir, "keys.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("KeyStore", () => {
  it("reports a saved key and can hand it back to main", async () => {
    const keys = new KeyStore(path);
    await keys.set("gemini", "secret-gemini");
    expect(await keys.status()).toEqual({ gemini: true, fal: false });
    expect(await keys.require("gemini")).toBe("secret-gemini");
  });

  it("never writes the plain key to disk", async () => {
    await new KeyStore(path).set("fal", "secret-fal");
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain("secret-fal");
    expect(JSON.parse(text).fal).toBe(Buffer.from("enc:laf-terces").toString("base64"));
  });

  it("reports a removed key as missing", async () => {
    const keys = new KeyStore(path);
    await keys.set("fal", "secret-fal");
    await keys.remove("fal");
    expect(await keys.status()).toEqual({ gemini: false, fal: false });
  });

  it("treats a missing file as no keys", async () => {
    expect(await new KeyStore(path).status()).toEqual({ gemini: false, fal: false });
  });

  it("treats a corrupt file as no keys", async () => {
    writeFileSync(path, "{not json");
    expect(await new KeyStore(path).status()).toEqual({ gemini: false, fal: false });
  });

  it("refuses to save when safeStorage is unavailable", async () => {
    storage.available = false;
    await expect(new KeyStore(path).set("gemini", "secret")).rejects.toThrow(/cannot be stored securely/);
  });

  it.each(["gemini", "fal"] as const)("fails with MISSING_KEY when no %s key is saved", async (provider) => {
    await expect(new KeyStore(path).require(provider)).rejects.toThrow(`MISSING_KEY: ${missingKey(provider).message}`);
  });
});
