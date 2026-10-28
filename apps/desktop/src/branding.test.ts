/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Guards against the old product name returning to user-facing sources.
// Reads the files as text; runs nothing.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const OLD_NAME = /diffusion|Diffusion Studio/i;
const CONTRACT_IMPORT = "@diffusionstudio/api-contract";

const SCANNED_FILES = [
  "apps/web/index.html",
  "apps/desktop/src/main.ts",
  "apps/desktop/src/tray.ts",
  "apps/desktop/src/menu.ts",
  "apps/desktop/src/mcp-config.ts",
  "apps/desktop/src/mcp-install.ts",
];

const SCANNED_DIRS = ["apps/web/src/components", "apps/cli/src", "packages/agent-chat/src/host", "docs"];

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (name === "node_modules") return [];
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

/** Lines of `text` naming the old product, ignoring imports of the upstream API contract. */
function matchingLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => !(/\bimport\b|\bfrom\b/.test(line) && line.includes(CONTRACT_IMPORT)))
    .filter((line) => OLD_NAME.test(line));
}

function offendingLines(path: string): string[] {
  return matchingLines(readFileSync(join(root, path), "utf8"));
}

function offenders(paths: string[], read: (path: string) => string[] = offendingLines): string[] {
  return paths.flatMap((path) => read(path).map((line) => `${path}: ${line.trim()}`));
}

const files = [...SCANNED_FILES, ...SCANNED_DIRS.flatMap(walk)];

describe("branding guard", () => {
  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("keeps the old product name out of every scanned file", () => {
    expect(offenders(files)).toEqual([]);
  });
});

describe("branding guard: scanned set", () => {
  it("every explicitly listed file exists", () => {
    for (const path of SCANNED_FILES) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("every scanned directory contributes at least one file", () => {
    for (const dir of SCANNED_DIRS) {
      expect(files.some((path) => path.startsWith(`${dir}/`)), dir).toBe(true);
    }
  });

  it("uses forward-slash repo-relative paths on every platform (no Windows backslashes)", () => {
    for (const path of files) {
      expect(path.includes("\\")).toBe(false);
      expect(path).not.toMatch(/^[A-Za-z]:/);
      expect(path.startsWith("/")).toBe(false);
    }
  });

  it("skips node_modules and lists each file once", () => {
    expect(files.some((path) => path.split("/").includes("node_modules"))).toBe(false);
    expect(new Set(files).size).toBe(files.length);
  });

  it("covers React components and the CLI sources", () => {
    expect(files.some((path) => path.startsWith("apps/web/src/components/") && path.endsWith(".tsx"))).toBe(true);
    expect(files.some((path) => path.startsWith("apps/cli/src/") && path.endsWith(".ts"))).toBe(true);
  });
});

describe("branding guard: line matcher", () => {
  it("returns nothing for empty or clean text", () => {
    expect(matchingLines("")).toEqual([]);
    expect(matchingLines("\n\r\n\n")).toEqual([]);
    expect(matchingLines("Hypergen\nWelcome to Hypergen")).toEqual([]);
  });

  it.each([
    "Diffusion Studio",
    "DIFFUSION STUDIO",
    "diffusion",
    "<title>diffusion studio</title>",
    'icon="diffusion-logo"',
    "https://app.diffusion.studio/callback",
    "diffusion://open",
    "const DIFFUSION_ANALYTICS = 1;",
    "StableDiffusion",
  ])("flags %j case-insensitively", (line) => {
    expect(matchingLines(line)).toEqual([line]);
  });

  it("ignores import lines of the api contract", () => {
    expect(matchingLines('import { Plan } from "@diffusionstudio/api-contract";')).toEqual([]);
    expect(matchingLines('import type { Plan } from "@diffusionstudio/api-contract/plans";')).toEqual([]);
    expect(matchingLines('} from "@diffusionstudio/api-contract";')).toEqual([]);
    expect(matchingLines('import "@diffusionstudio/api-contract";')).toEqual([]);
  });

  it("still flags api-contract mentions that are not import lines", () => {
    const line = 'const pkg = "@diffusionstudio/api-contract";';
    expect(matchingLines(line)).toEqual([line]);
  });

  it("still flags imports of other old-brand packages", () => {
    const line = 'import x from "@diffusionstudio/core";';
    expect(matchingLines(line)).toEqual([line]);
  });

  it("does not let an ignored import hide a match on another line", () => {
    const text = 'import { A } from "@diffusionstudio/api-contract";\nexport const label = "Diffusion Studio";';
    expect(matchingLines(text)).toEqual(['export const label = "Diffusion Studio";']);
  });

  it("splits CRLF and LF line endings without leaking carriage returns", () => {
    expect(matchingLines("ok\r\nDiffusion Studio\r\nok")).toEqual(["Diffusion Studio"]);
    expect(matchingLines("a\ndiffusion\nb\ndiffusion")).toEqual(["diffusion", "diffusion"]);
  });
});

describe("branding guard: failure reporting", () => {
  const fake: Record<string, string> = {
    "apps/cli/src/zz-probe.ts": 'export const name = "Diffusion Studio";',
    "apps/web/src/components/upgrade-dialog.tsx": "Upgrade your Diffusion Studio plan",
    "apps/web/src/components/genai/x.tsx": "diffusion",
    "apps/web/src/components/dashboard/billing-view.tsx": "  Billed by diffusion  ",
    "docs/clean.md": "Hypergen docs",
  };
  const read = (path: string) => matchingLines(fake[path] ?? "");

  it("names every matching file and its trimmed line", () => {
    expect(offenders(Object.keys(fake), read)).toEqual([
      'apps/cli/src/zz-probe.ts: export const name = "Diffusion Studio";',
      "apps/web/src/components/upgrade-dialog.tsx: Upgrade your Diffusion Studio plan",
      "apps/web/src/components/genai/x.tsx: diffusion",
      "apps/web/src/components/dashboard/billing-view.tsx: Billed by diffusion",
    ]);
  });

  it("passes when no file matches", () => {
    expect(offenders(["docs/clean.md"], read)).toEqual([]);
  });

  it("passes on an empty file set", () => {
    expect(offenders([], read)).toEqual([]);
  });
});

describe("branding guard: no third-party brand leaks", () => {
  it("no scanned user-facing file mentions LTX or Lightricks", () => {
    const leaks = files.filter((path) => /\bLTX\b|Lightricks/i.test(readFileSync(join(root, path), "utf8")));
    expect(leaks).toEqual([]);
  });
});
