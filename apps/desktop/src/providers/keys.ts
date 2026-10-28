/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The user's own API keys, encrypted with the OS keychain (safeStorage) and
// kept as base64 in one JSON file. A key is decrypted only in main, for the
// request that needs it; the renderer learns whether one is saved, never what.

import { safeStorage } from "electron";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { missingKey } from "@hypergen/dapi";
import { writeFileAtomic } from "../atomic";

export const PROVIDERS = ["gemini", "fal"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type KeyStatus = Record<Provider, boolean>;
export type KeyTestResult = { ok: boolean; error?: string };

type KeyFile = Partial<Record<Provider, string>>;

function assertProvider(provider: string): asserts provider is Provider {
  if (!(PROVIDERS as readonly string[]).includes(provider)) throw new Error(`Unknown provider: ${provider}`);
}

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("API keys cannot be stored securely: this system has no keychain or secret service available.");
  }
}

export class KeyStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async status(): Promise<KeyStatus> {
    const file = await this.read();
    return { gemini: typeof file.gemini === "string", fal: typeof file.fal === "string" };
  }

  async set(provider: Provider, key: string): Promise<void> {
    assertProvider(provider);
    assertEncryption();
    const trimmed = key.trim();
    if (!trimmed) throw new Error("The API key is empty.");
    const file = await this.read();
    file[provider] = safeStorage.encryptString(trimmed).toString("base64");
    await this.write(file);
  }

  async remove(provider: Provider): Promise<void> {
    assertProvider(provider);
    const file = await this.read();
    delete file[provider];
    await this.write(file);
  }

  /** The decrypted key, for main-process requests only. Throws `MISSING_KEY: …` when none is saved. */
  async require(provider: Provider): Promise<string> {
    const stored = (await this.read())[provider];
    if (typeof stored !== "string") throw new Error(`MISSING_KEY: ${missingKey(provider).message}`);
    assertEncryption();
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  }

  private async read(): Promise<KeyFile> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const file: KeyFile = {};
      for (const provider of PROVIDERS) {
        const value = (parsed as Record<string, unknown>)[provider];
        if (typeof value === "string" && value) file[provider] = value;
      }
      return file;
    } catch {
      return {};
    }
  }

  private async write(file: KeyFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, JSON.stringify(file));
  }
}
