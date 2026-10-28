/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Static checks that the usage-tracking, sign-in and checkout plumbing stays out of
// the desktop main process, and that the provider channels are wired once.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_CHANNELS } from "./main-channels";

const src = __dirname;
// Built from fragments so this file never matches the repo-wide grep it mirrors.
const TRACK_WORD = "analy" + "tics";
const BILLING_WORD = "cred" + "its";
const API_CONTRACT = "api-" + "contract";
const read = (file: string) => readFileSync(join(src, file), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("main process removals", () => {
  it("has no usage-tracking module", () => {
    expect(existsSync(join(src, `${TRACK_WORD}.ts`))).toBe(false);
  });

  it("main.ts has no tracking, protocol client or deep-link routing", () => {
    const main = read("main.ts");
    for (const banned of [
      new RegExp(TRACK_WORD, "i"),
      /AUTH_PROTOCOL/,
      /setAsDefaultProtocolClient/,
      /pendingDeepLinks/,
      /deliverDeepLink/,
      /takePendingDeepLink/,
      /deepLinkChannel/,
      /["']open-url["']/,
      new RegExp(`${TRACK_WORD.toUpperCase()}_CONFIGURE`),
      /\bAUTH_[A-Z_]+/,
      /\bCHECKOUT_[A-Z_]+/,
    ]) {
      expect(main, String(banned)).not.toMatch(banned);
    }
  });

  it("second-instance still focuses the window", () => {
    const main = read("main.ts");
    const handler = main.slice(main.indexOf('"second-instance"'));
    expect(main).toContain('"second-instance"');
    expect(handler.slice(0, 300)).toMatch(/windows\.show\(\)/);
  });

  it("main.ts registers the provider handlers exactly once, with keys.json under userData", () => {
    const main = read("main.ts");
    const calls = main.match(/registerProviderHandlers\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(main).toMatch(/registerProviderHandlers\(join\(app\.getPath\("userData"\), "keys\.json"\)\)/);
  });

  it("main-channels drops tracking, auth, checkout and deep links", () => {
    const names = Object.keys(MAIN_CHANNELS);
    expect(names.filter((n) => new RegExp(`^(${TRACK_WORD.toUpperCase()}_|AUTH_|CHECKOUT_)`).test(n))).toEqual([]);
    const channels = read("main-channels.ts");
    expect(channels).not.toMatch(/DeepLinkChannel/);
    expect(channels).not.toMatch(new RegExp(`\\b(${TRACK_WORD.toUpperCase()}_CONFIGURE|AUTH_[A-Z_]+|CHECKOUT_[A-Z_]+)\\b`));
  });

  it("main-channels has the eight provider channels with unique wire names", () => {
    const expected = [
      "PROVIDERS_KEYS_STATUS",
      "PROVIDERS_KEYS_SET",
      "PROVIDERS_KEYS_REMOVE",
      "PROVIDERS_KEYS_TEST",
      "PROVIDERS_FAL_SUBMIT",
      "PROVIDERS_FAL_POLL",
      "PROVIDERS_FAL_CANCEL",
      "PROVIDERS_GEMINI_GENERATE",
    ];
    const channels = MAIN_CHANNELS as Record<string, string>;
    for (const name of expected) expect(typeof channels[name], name).toBe("string");
    const values = Object.values(channels);
    expect(new Set(values).size).toBe(values.length);
    const source = read("main-channels.ts");
    for (const name of expected) expect(source).toMatch(new RegExp(`\\[MAIN_CHANNELS\\.${name}\\]:\\s*\\{`));
  });

  it("dapi/server.ts has no tool-call tracking", () => {
    const server = read(join("dapi", "server.ts"));
    expect(server).not.toMatch(/TrackProps/);
    expect(server).not.toMatch(/onToolCall/);
  });

  it("projects.ts no longer counts code changes", () => {
    expect(read("projects.ts")).not.toMatch(/countCodeChange/);
  });

  it("no desktop source mentions the banned billing/tracking words", () => {
    const banned = new RegExp(`${TRACK_WORD}|${API_CONTRACT}|${BILLING_WORD}`, "i");
    const hits = sourceFiles(src)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => banned.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("the provider modules carry no legacy branding or telemetry", () => {
    const dir = join(src, "providers");
    for (const file of readdirSync(dir).filter((n) => !n.includes(".test."))) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/\b(LTX|Lightricks|sentry|posthog|telemetry)\b/i);
    }
  });
});
