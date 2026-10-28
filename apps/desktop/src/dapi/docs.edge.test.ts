/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the connect-time instructions (subtask C): the keys
// paragraph is in both INSTRUCTIONS.md and the fallback, word for word; a
// blank or missing INSTRUCTIONS.md falls back; the brand-kit sentence; Windows
// docs paths survive verbatim; no LTX/Lightricks leaks.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { instructions } from "./docs";

const repoDocs = join(__dirname, "..", "..", "..", "..", "docs");
const root = mkdtempSync(join(tmpdir(), "dapi-docs-edge "));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const BRAND_LEAK = /\bltx\b|lightricks/i;

function docsWith(instructionsMd: string | null): string {
  const dir = mkdtempSync(join(root, "docs-"));
  if (instructionsMd !== null) writeFileSync(join(dir, "INSTRUCTIONS.md"), instructionsMd);
  return dir;
}

function expectKeysParagraph(text: string): void {
  expect(text).toContain("Hypergen is local-first and needs no account.");
  expect(text).toMatch(/`generate` runs on fal\.ai with the user's own fal\.ai API key/);
  expect(text).toMatch(/`listen` uses the user's own Gemini API key/);
  expect(text).toMatch(/`transcribe` runs locally with Whisper and needs no key/);
  expect(text).toMatch(/MISSING_KEY, tell the user to add the key in Hypergen > Settings > AI providers, and do not retry\./);
}

/** The paragraph that opens with "Hypergen is local-first". */
const keysParagraph = (text: string) => text.split(/\r?\n\r?\n/).find((p) => p.startsWith("Hypergen is local-first"));

describe("keys paragraph", () => {
  it("is in the fallback (no docs dir)", () => {
    expectKeysParagraph(instructions(null));
  });

  it("is in the repo's INSTRUCTIONS.md", () => {
    if (!existsSync(repoDocs)) return;
    expectKeysParagraph(instructions(repoDocs));
  });

  it("reads the same, word for word, in INSTRUCTIONS.md and the fallback", () => {
    if (!existsSync(repoDocs)) return;
    const fromFile = keysParagraph(readFileSync(join(repoDocs, "INSTRUCTIONS.md"), "utf8"));
    const fromFallback = keysParagraph(instructions(null));
    expect(fromFile).toBeDefined();
    expect(fromFile!.trim()).toBe(fromFallback!.trim());
  });

  it("is one short paragraph, not a section", () => {
    const p = keysParagraph(instructions(null))!;
    expect(p).not.toMatch(/\n/);
    expect(p.length).toBeLessThan(500);
  });

  it("does not tell the agent to retry or sign in", () => {
    const p = keysParagraph(instructions(null))!;
    expect(p).not.toMatch(/\bsign (?:in|up)\b|\blog ?in\b|\bcreate an account\b/i);
    expect(p).not.toMatch(/retry (?:after|later|once)/i);
  });
});

describe("fallbacks", () => {
  it("uses the fallback when INSTRUCTIONS.md is missing, then still says where the docs are", () => {
    const dir = docsWith(null);
    const text = instructions(dir);
    expectKeysParagraph(text);
    expect(text).toContain(`are the files at \`${dir}\``);
  });

  it("uses the fallback when INSTRUCTIONS.md is blank or only whitespace", () => {
    for (const blank of ["", "   \n\r\n\t  "]) {
      const text = instructions(docsWith(blank));
      expectKeysParagraph(text);
      expect(text.startsWith("Hypergen, a video editor")).toBe(true);
    }
  });

  it("uses a custom INSTRUCTIONS.md verbatim and does not add the fallback paragraph to it", () => {
    const text = instructions(docsWith("Custom page.\r\n"));
    expect(text.startsWith("Custom page.")).toBe(true);
    expect(text).not.toContain("local-first");
  });

  it("keeps a Windows docs path, spaces and backslashes, verbatim", () => {
    const winPath = "C:\\Program Files\\Hypergen\\resources\\docs";
    const text = instructions(winPath);
    expect(text).toContain(`are the files at \`${winPath}\``);
    expectKeysParagraph(text);
  });
});

describe("brand-kit sentence", () => {
  it("says style references, components and compositions to copy", () => {
    const text = instructions(docsWith("x"));
    expect(text).toContain("the brand kit (style references, components and compositions to copy)");
  });

  it("is absent with no docs dir (there is no brand kit to point at)", () => {
    expect(instructions(null)).not.toContain("brand kit");
  });
});

describe("branding", () => {
  it("has no LTX/Lightricks in either form", () => {
    expect(instructions(null)).not.toMatch(BRAND_LEAK);
    expect(instructions(docsWith("x"))).not.toMatch(BRAND_LEAK);
    if (existsSync(repoDocs)) expect(instructions(repoDocs)).not.toMatch(BRAND_LEAK);
  });
});
