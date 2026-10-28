/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the agent docs and tool descriptions (subtask C): the model
// tables and every model-ish spelling in the docs name catalog models only,
// retired ids are gone, and the generate/open/transcribe descriptions say what
// the app actually does, in step with their reference pages.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalog, toolByName } from "./catalog";
import { toolJsonSchemas } from "./json-schema";
import { MODEL_IDS } from "./models";
import { LOCAL_MODEL_IDS } from "./local";
import { TranscriptSegment, TranscriptWord } from "./tools/transcribe";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(here, "..", "..", "..", "docs");
const REF = join(DOCS, "reference");
const KNOWN = new Set<string>([...MODEL_IDS, ...LOCAL_MODEL_IDS]);
const BRAND_LEAK = /\bltx\b|lightricks/i;

const read = (...parts: string[]) => readFileSync(join(...parts), "utf8");
const mdUnder = (dir: string) =>
  (readdirSync(dir, { recursive: true }) as string[]).filter((rel) => rel.endsWith(".md")).map((rel) => join(dir, rel));
const allDocs = [join(DOCS, "INSTRUCTIONS.md"), ...mdUnder(REF), ...mdUnder(join(DOCS, "skills"))];

/** First-column ids of every table whose header starts with `| Model |`. */
function modelTableIds(md: string): string[] {
  const ids: string[] = [];
  let inModelTable = false;
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      inModelTable = false;
      continue;
    }
    if (/^\|\s*Model\s*\|/.test(line)) {
      inModelTable = true;
      continue;
    }
    if (!inModelTable || /^\|\s*-+/.test(line)) continue;
    const m = /^\|\s*`([^`]+)`/.exec(line);
    if (m) ids.push(m[1]!);
  }
  return ids;
}

describe("models.md tables", () => {
  const md = read(REF, "models.md");
  const ids = modelTableIds(md);

  it("finds model rows at all (the parser is not silently empty)", () => {
    expect(ids.length).toBeGreaterThanOrEqual(MODEL_IDS.length);
  });

  it("lists only catalog models", () => {
    for (const id of ids) expect(KNOWN.has(id), id).toBe(true);
  });

  it("lists every catalog model, fal.ai and local, exactly once", () => {
    for (const id of KNOWN) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });
});

describe("model ids in other spellings", () => {
  // JS-style `model: "x"` and `--model x` are not covered by docs.models.test.ts.
  const PATTERNS = [/\bmodel:\s*["']([^"']+)["']/g, /--model[ =]([\w.-]+)/g, /"model":\s*'([^']+)'/g];

  it.each(allDocs.map((p) => [p.slice(DOCS.length + 1), p]))("%s", (_rel, path) => {
    const text = readFileSync(path, "utf8");
    for (const pattern of PATTERNS) {
      for (const m of text.matchAll(pattern)) expect(KNOWN.has(m[1]!), `${_rel}: ${m[1]}`).toBe(true);
    }
  });
});

describe("retired models", () => {
  it("has no gemini-3.8-flash-tts voice page", () => {
    expect(existsSync(join(REF, "voices", "gemini-3.8-flash-tts.md"))).toBe(false);
  });

  it.each(["gemini-3.8-flash-tts", "elevenlabs-v4"])("%s appears in no doc or tool description", (id) => {
    for (const path of allDocs) expect(readFileSync(path, "utf8"), path).not.toContain(id);
    for (const tool of catalog) expect(JSON.stringify(toolJsonSchemas(tool)), tool.name).not.toContain(id);
    expect(toolByName("generate").description).not.toContain(id);
  });

  it("is not a catalog id either", () => {
    expect(MODEL_IDS as readonly string[]).not.toContain("gemini-3.8-flash-tts");
    expect(MODEL_IDS as readonly string[]).not.toContain("elevenlabs-v4");
  });
});

describe("generate: inline files and per-model field mapping", () => {
  const sources: [string, string][] = [
    ["generate tool description", toolByName("generate").description],
    ["tools/generate.md", read(REF, "tools", "generate.md")],
    ["models.md", read(REF, "models.md")],
  ];

  it.each(sources)("%s says files go inline, at most 10 MB", (_name, text) => {
    expect(text).toMatch(/inline with the request/);
    expect(text).toMatch(/at most 10 MB/);
  });

  it.each(sources)("%s says Hypergen maps fields to the fal endpoint and ignores unused ones", (_name, text) => {
    expect(text).toMatch(/Hypergen maps each (?:fal\.ai )?model's fields to its fal endpoint/);
    expect(text).toMatch(/fields a model does not use are ignored/);
  });

  it.each(sources)("%s never claims files are uploaded ahead of the job", (_name, text) => {
    expect(text).not.toMatch(/\buploaded (?:first|to fal|to storage)\b/i);
    expect(text).not.toMatch(/\b(?:20|25|50|100) ?MB\b/);
  });

  it("names the MISSING_KEY settings path", () => {
    expect(toolByName("generate").description).toContain("Hypergen > Settings > AI providers");
  });
});

describe("open: loads in the editor, does not show the window", () => {
  const description = toolByName("open").description;
  const page = read(REF, "tools", "open.md");

  it("says the window stays as it is and points at `window`", () => {
    for (const text of [description, page]) {
      expect(text).toContain("load it in the editor");
      expect(text).toContain("the window stays as it is");
      expect(text).toContain("use `window` to show it");
    }
  });

  it("the page's opening paragraph is the tool description verbatim", () => {
    const opening = page.split(/\r?\n\r?\n/)[1]!.trim();
    expect(opening).toBe(description);
  });

  it("does not claim open raises or focuses the window", () => {
    expect(description).not.toMatch(/\b(?:raises|focuses|brings .* to the front)\b/i);
  });
});

describe("transcribe: no speaker field from local Whisper", () => {
  it("has no speaker in the segment or word schema", () => {
    expect(Object.keys(TranscriptSegment.shape)).not.toContain("speaker");
    expect(Object.keys(TranscriptWord.shape)).not.toContain("speaker");
  });

  it("neither its description nor its JSON Schemas mention a speaker field", () => {
    const tool = toolByName("transcribe");
    expect(tool.description).not.toMatch(/\bspeaker\b/);
    expect(JSON.stringify(toolJsonSchemas(tool))).not.toMatch(/"speaker"/);
  });

  it("says it runs locally with Whisper and needs no key", () => {
    const d = toolByName("transcribe").description;
    expect(d).toMatch(/locally with Whisper/);
    expect(d).toMatch(/no API key/);
  });

  it("the transcribe reference page shows no speaker field", () => {
    const page = join(REF, "tools", "transcribe.md");
    if (existsSync(page)) expect(read(page)).not.toMatch(/\bspeaker\b/);
  });
});

describe("tool reference README", () => {
  const text = read(REF, "tools", "README.md");

  it("recommends the bundled `hypergen mcp` stdio proxy", () => {
    expect(text).toContain("`hypergen mcp`");
    expect(text).toMatch(/stdio proxy/);
  });

  it("does not recommend mcp-remote", () => {
    expect(text).not.toContain("mcp-remote");
  });
});

describe("context.md", () => {
  const text = read(REF, "tools", "context.md");

  it("describes rootDir one way: the folder the last project was saved to, null until one has been", () => {
    const opening = text.split(/\r?\n/)[2]!;
    expect(opening).toContain("the folder the last project was saved to");
    expect(opening).toContain("null until one has been");
    expect(text).toMatch(/It is not where the app creates projects/);
  });

  it("uses Ctrl/Cmd+S, never a Mac-only or Windows-only shortcut", () => {
    expect(text).toContain("Ctrl/Cmd+S");
    expect(text).not.toMatch(/(?<!Ctrl\/)Cmd\+S|⌘S|(?<!\w)Ctrl\+S/);
  });
});

describe("skills and JSX docs", () => {
  it("watch.md labels the yt-dlp link as yt-dlp, not as something else", () => {
    const text = read(DOCS, "skills", "watch.md");
    const links = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]*yt-dlp[^)]*)\)/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, label, url] of links) {
      expect(label).toMatch(/yt-dlp/);
      expect(url).toMatch(/^https:\/\/github\.com\/yt-dlp\/yt-dlp/);
    }
  });

  it.each([
    ["skills/editor.md", ["skills", "editor.md"]],
    ["reference/jsx/media.md", ["reference", "jsx", "media.md"]],
  ])("%s pairs symlink advice with a Windows note (mklink, or copy)", (_rel, parts) => {
    const text = read(DOCS, ...parts);
    expect(text).toMatch(/[Ss]ymlink/);
    expect(text).toMatch(/Windows/);
    expect(text).toMatch(/`mklink`/);
    expect(text).toMatch(/copy the file/);
  });

  it("media.md says an input file appears as the data URI that was sent", () => {
    expect(read(REF, "jsx", "media.md")).toContain("the data URI that was sent");
  });

  it("media.md's mklink example uses Windows backslash paths, link first then target", () => {
    const m = /`mklink ([^`]+)`/.exec(read(REF, "jsx", "media.md"));
    expect(m).not.toBeNull();
    const [link, target] = m![1]!.split(" ");
    expect(link).toMatch(/^assets\\/);
    expect(target).toMatch(/^[A-Z]:\\/);
  });
});

describe("branding", () => {
  it.each(allDocs.map((p) => [p.slice(DOCS.length + 1), p]))("%s has no LTX/Lightricks", (_rel, path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(BRAND_LEAK);
  });

  it.each(["generate", "open", "transcribe", "listen", "context"] as const)("the %s description has no LTX/Lightricks", (name) => {
    expect(toolByName(name).description).not.toMatch(BRAND_LEAK);
  });
});
