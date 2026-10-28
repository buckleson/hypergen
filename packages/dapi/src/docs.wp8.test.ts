/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP8 acceptance: the reference docs and tool descriptions describe the fal.ai
 * catalog (HYPERGEN_MODELS + local sam-2.1), the user's own fal.ai / Gemini
 * keys and local Whisper, with no paid-usage units, accounts or sign-in.
 *
 * Reads the docs from disk and the tool catalog from source; no network, no
 * GPU, no timers. Banned words are assembled from fragments so this file
 * never shows up in the acceptance `git grep` itself.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { missingKey } from "./errors";
import { HYPERGEN_MODELS, MODEL_IDS, REQUEST_FIELDS } from "./models";
import { LOCAL_MODEL_IDS } from "./local";
import { check } from "./tools/check";
import { filmstrip } from "./tools/filmstrip";
import { grab } from "./tools/grab";
import { listen } from "./tools/listen";
import { probe } from "./tools/probe";
import { transcribe } from "./tools/transcribe";
import { waveform } from "./tools/waveform";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOCS = join(ROOT, "docs", "reference");
/** Repo-relative, forward slashes; joined per platform so Windows works. */
const doc = (rel: string) => join(DOCS, ...rel.split("/"));
const read = (rel: string) => readFileSync(doc(rel), "utf8");

const TOOL_DOCS = ["generate", "job", "transcribe", "listen", "README", "check", "grab", "filmstrip", "probe", "waveform", "segment"].map(
  (name) => `tools/${name}.md`,
);
const SCOPE_DOCS = ["models.md", ...TOOL_DOCS, "jsx/audio-sync.md", "jsx/captions.md"];

// Fragments, so this source never matches the words it bans.
const CRED = "cred" + "its?";
const PAID = new RegExp(`\\b${CRED}\\b|max-?${"cred"}|refund|sign-?in|signed[- ]in|\\baccounts?\\b|Diffusion Studio API`, "i");
const BRAND = /\b(LTX|Lightricks)\b/i;
/** Model ids of the old upstream catalog that WP1 dropped. */
const REMOVED_MODELS = [
  "bria-rmbg-2.0",
  "bytedance-upscaler",
  "elevenlabs-sfx",
  "elevenlabs-v4",
  "flux-2-pro",
  "flux-3-image",
  "flux-3-video",
  "gemini-3.8-flash-tts",
  "gpt-image-2.5-sunburst",
  "grok-imagine-image-2.0",
  "grok-imagine-video-1.5",
  "kling-3-pro",
  "kling-o3-pro",
  "krea-2-large",
  "minimax-h3",
  "minimax-h3-max",
  "nano-banana-2",
  "nano-banana-2.1",
  "qwen3.8-omni-flash",
  "seedance-2.5",
  "seedream-5.0-pro",
  "seedvr-2",
  "universal-3.5-pro",
  "veo-3.1",
  "veo-3.1-fast",
  "wan-3.0",
];
const backticked = (id: string) => new RegExp("`" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`");

/** The table row (one line) whose first cell is `id` in backticks. */
function row(text: string, id: string): string | undefined {
  return text.split(/\r?\n/).find((line) => line.startsWith(`| \`${id}\` |`));
}

/** Headings of a markdown file, as GitHub anchors. */
function anchors(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) =>
      m[1]!
        .trim()
        .toLowerCase()
        .replace(/[`*_[\]()]/g, "")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s/g, "-"),
    ),
  );
}

describe("WP8 scope docs exist", () => {
  it.each(SCOPE_DOCS)("%s is present and non-empty", (rel) => {
    expect(existsSync(doc(rel))).toBe(true);
    expect(read(rel).trim().length).toBeGreaterThan(0);
  });
});

describe("models.md lists exactly the WP1 catalog plus local sam-2.1", () => {
  const text = read("models.md");

  it("has a row for every catalog model with its display name and every fal endpoint", () => {
    for (const id of MODEL_IDS) {
      const line = row(text, id);
      expect(line, id).toBeDefined();
      expect(line!.split("|")[2]!.trim(), id).toBe(HYPERGEN_MODELS[id].name);
      for (const endpoint of HYPERGEN_MODELS[id].endpoints) expect(line, `${id} → ${endpoint}`).toContain(`\`${endpoint}\``);
    }
  });

  it("lists each model's allowed resolutions, and none for a model without them", () => {
    for (const id of MODEL_IDS) {
      const line = row(text, id)!;
      const resolutions = HYPERGEN_MODELS[id].resolutions ?? [];
      for (const resolution of resolutions) expect(line, `${id} ${resolution}`).toContain(resolution);
      if (resolutions.length === 0) expect(line, id).not.toMatch(/\b(1K|2K|4K|480p|720p|1080p|1440p|2160p)\b/);
    }
  });

  it("names no model row outside the catalog, the local models and the request fields", () => {
    const firstCells = new Set([...text.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]!));
    const fields = new Set<string>(REQUEST_FIELDS);
    const models = [...firstCells].filter((cell) => !fields.has(cell)).sort();
    expect(models).toEqual([...MODEL_IDS, ...LOCAL_MODEL_IDS].sort());
    expect(LOCAL_MODEL_IDS).toEqual(["sam-2.1"]);
  });

  it("has a fal endpoint for every catalog model and none left unaccounted", () => {
    const documented = new Set([...text.matchAll(/`((?:fal-ai|bytedance)\/[^`]+)`/g)].map((m) => m[1]!));
    const catalogEndpoints = new Set(Object.values(HYPERGEN_MODELS).flatMap((model) => [...model.endpoints]));
    expect([...documented].sort()).toEqual([...catalogEndpoints].sort());
  });

  it("says generation uses the user's fal.ai key, transcribe is local Whisper, listen uses the user's Gemini key", () => {
    expect(text).toMatch(/fal\.ai API key/);
    expect(text).toMatch(/\bMISSING_KEY\b/);
    expect(text).toMatch(/transcribe[\s\S]{0,200}locally with Whisper/i);
    expect(text).toMatch(/listen[\s\S]{0,200}Gemini API key/i);
  });

  it("mentions no removed upstream model id", () => {
    for (const id of REMOVED_MODELS) expect(text, id).not.toMatch(backticked(id));
  });
});

describe("generate.md", () => {
  const text = read("tools/generate.md");

  it("drops the spending cap, cost and sign-in error", () => {
    expect(text).not.toMatch(PAID);
    expect(text).not.toMatch(/sign-in-required/);
    expect(text).not.toMatch(/--max-/);
  });

  it("documents MISSING_KEY with the exact fal.ai message the code throws", () => {
    const message = missingKey("fal").message;
    expect(message).toBe("Add your fal.ai API key in Hypergen > Settings > AI providers.");
    expect(text).toMatch(/`MISSING_KEY`/);
    expect(text).toContain(`\`${message}\``);
  });

  it("documents estimate as { etaSeconds } only", () => {
    expect(text).toContain("{ etaSeconds }");
    const estimating = text.split(/^## Estimating$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(estimating).not.toBe("");
    expect(estimating).not.toMatch(/\bcost/i);
  });

  it("describes files as data URIs with the 10 MB limit", () => {
    const files = text.split(/^## Files$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(files).toMatch(/data URI/);
    expect(files).toMatch(/\b10 MB\b/);
    expect(text).toMatch(/invalid-input[\s\S]{0,120}10 MB/);
  });

  it("uses only catalog or local model ids in its examples", () => {
    const known = new Set<string>([...MODEL_IDS, ...LOCAL_MODEL_IDS]);
    const cli = [...text.matchAll(/diffusion generate ([\w.-]+)/g)].map((m) => m[1]!);
    const json = [...text.matchAll(/"model":\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(cli.length + json.length).toBeGreaterThan(0);
    for (const id of [...cli, ...json]) expect(known.has(id), id).toBe(true);
  });
});

describe("job.md", () => {
  const text = read("tools/job.md");

  it("has no cost, refund or sign-in", () => {
    expect(text).not.toMatch(PAID);
  });

  it("says jobs are kept for the session only and answer not-found after a restart", () => {
    expect(text).toMatch(/for the session/);
    expect(text).toMatch(/restart/);
    expect(text).toMatch(/`not-found`/);
    expect(text).not.toMatch(/persist(ed|s)? (across|between)/i);
  });

  it("shows only catalog model ids in its examples", () => {
    for (const m of text.matchAll(/diffusion generate ([\w.-]+)/g)) expect(MODEL_IDS as readonly string[]).toContain(m[1]);
  });
});

describe("transcribe: local Whisper", () => {
  const text = read("tools/transcribe.md");

  it("the doc says Whisper runs locally with no key", () => {
    expect(text).toMatch(/Whisper/);
    expect(text).toMatch(/locally|on this machine/);
    expect(text).toMatch(/no API key/);
    expect(text).not.toMatch(/Gemini|fal\.ai|MISSING_KEY/);
  });

  it("the tool description says the same and promises no speaker labels", () => {
    expect(transcribe.description).toMatch(/Whisper/);
    expect(transcribe.description).toMatch(/locally/);
    expect(transcribe.description).toMatch(/no API key/);
    expect(transcribe.description).not.toMatch(/speaker\?|labelled A, B/);
    expect(text).not.toMatch(/speaker\??:/);
  });
});

describe("listen: the user's Gemini key and the 20 MB limit", () => {
  const text = read("tools/listen.md");
  const message = missingKey("gemini").message;

  it("the doc names Gemini, the user's key, the 20 MB limit and the exact MISSING_KEY message", () => {
    expect(message).toBe("Add your Gemini API key in Hypergen > Settings > AI providers.");
    expect(text).toMatch(/user's own Gemini API key/);
    expect(text).toMatch(/\b20 MB\b/);
    expect(text).toMatch(/`MISSING_KEY`/);
    expect(text).toContain(`\`${message}\``);
  });

  it("the tool description names Gemini, the 20 MB limit and MISSING_KEY", () => {
    expect(listen.description).toMatch(/Gemini API key/);
    expect(listen.description).toMatch(/\b20 MB\b/);
    expect(listen.description).toMatch(/MISSING_KEY/);
    expect(listen.description).toContain("Hypergen > Settings > AI providers");
  });
});

describe("local tool descriptions", () => {
  const local = { check, grab, filmstrip, probe, waveform };

  it.each(Object.entries(local))("%s says local, without any paid-usage note", (_name, tool) => {
    expect(tool.description).toMatch(/\(local (analysis|render|read)\)/);
    expect(tool.description).not.toMatch(new RegExp(`no ${CRED}`, "i"));
  });

  it("no tool description in the catalog mentions cost, accounts, sign-in or the vendor brand", () => {
    for (const tool of catalog) {
      expect(tool.description, tool.name).not.toMatch(PAID);
      expect(tool.description, tool.name).not.toMatch(BRAND);
      expect(tool.title ?? "", tool.name).not.toMatch(BRAND);
    }
  });
});

describe("WP8 scope docs, across the board", () => {
  it.each(SCOPE_DOCS)("%s has no cost, account or sign-in wording", (rel) => {
    expect(read(rel)).not.toMatch(PAID);
  });

  it.each(SCOPE_DOCS)("%s has no vendor brand", (rel) => {
    expect(read(rel)).not.toMatch(BRAND);
  });

  it.each(SCOPE_DOCS)("%s names no removed upstream model id", (rel) => {
    const text = read(rel);
    for (const id of REMOVED_MODELS) expect(text, `${rel}: ${id}`).not.toMatch(backticked(id));
  });

  it.each(SCOPE_DOCS)("%s links only to files and headings that exist", (rel) => {
    const text = read(rel);
    const here = dirname(doc(rel));
    for (const m of text.matchAll(/\]\((\.{1,2}\/[^)\s#]*|#)([^)\s]*)\)/g)) {
      const [target, rest] = [m[1]!, m[2]!];
      const file = target === "#" ? doc(rel) : join(here, ...target.split("/"));
      expect(existsSync(file), `${rel} → ${target}`).toBe(true);
      const anchor = target === "#" ? rest : rest.startsWith("#") ? rest.slice(1) : "";
      if (anchor && file.endsWith(".md")) expect(anchors(readFileSync(file, "utf8")), `${rel} → ${target}#${anchor}`).toContain(anchor);
    }
  });
});

describe("final acceptance sweep (git grep)", () => {
  const hasGit = (() => {
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  const pattern = ["supa" + "base", "sen" + "try", "api" + ".diff" + "usion", "api" + "-con" + "tract", "cred" + "its"].join("\\|");
  const banned = new RegExp(pattern.replace(/\\\|/g, "|"), "i");

  /** Hit lines that still match once the allowed FsEntry / webkitGetAsEntry / attribution-credits substrings are removed. */
  function hits(paths: string[] = []): string[] {
    let out = "";
    try {
      out = execFileSync("git", ["grep", "-nIi", pattern, "--", ...paths], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 1) return []; // git grep: no match
      throw error;
    }
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => banned.test(line.replace(/webkitGetAsEntry|FsEntry|HypergenCredits|@\/components\/credits|## Credits/g, "")));
  }

  it.skipIf(!hasGit)("is clean over the WP8 docs and tool sources", () => {
    const sources = ["check", "grab", "filmstrip", "probe", "waveform", "transcribe", "listen"].map((n) => `packages/dapi/src/tools/${n}.ts`);
    expect(hits([...SCOPE_DOCS.map((rel) => `docs/reference/${rel}`), ...sources])).toEqual([]);
  });

  it.skipIf(!hasGit)("is clean across the whole repo apart from the FsEntry / webkitGetAsEntry substrings", () => {
    // Test files name the banned words in negative assertions; .workspace holds agent session history;
    // the attribution credits (component and logo script) are not billing credits.
    const excluded = ["*.test.ts", ".workspace", "package-lock.json", "apps/web/src/components/credits.tsx", "scripts/brand/generate.py"];
    expect(hits([".", ...excluded.map((path) => `:(exclude)${path}`)])).toEqual([]);
  });
});
