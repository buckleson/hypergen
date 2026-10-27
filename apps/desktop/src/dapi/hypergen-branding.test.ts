/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Subtask C (T8-T11): the MCP server, presented files, fallback instructions,
// bug-report repo and log prefixes say Hypergen, and nothing old or
// third-party leaks into what agents and users see.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { instructions } from "./docs";
import { present } from "./present";

const src = join(__dirname, "..");
const read = (path: string) => readFileSync(join(src, path), "utf8");
const scratch = mkdtempSync(join(tmpdir(), "hypergen-branding-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const FILES = [
  "mcp-config.ts",
  "mcp-config.test.ts",
  "mcp-install.ts",
  "dapi/server.ts",
  "dapi/present.ts",
  "dapi/present.test.ts",
  "dapi/docs.ts",
  "dapi/docs.test.ts",
  "dapi/handlers/report.ts",
  "dapi/http.ts",
  "dapi/http.test.ts",
  "dapi/renderer-calls.ts",
  "main-channels.ts",
];

// Lines that may still say dapi/diffusion: package imports, the api-contract
// import, Dapi*/DAPI_* identifiers, and the dapiBinary export.
function leftovers(path: string, pattern: RegExp): string[] {
  return read(path)
    .split("\n")
    .filter((line) => pattern.test(line))
    .filter((line) => !/from "@hypergen\/dapi"|from "@diffusionstudio\/api-contract"/.test(line))
    .filter((line) => !/^\s*\/\/.*@hypergen\/dapi/.test(line))
    .filter((line) => pattern.test(line.replace(/\bDapi\w*|\bDAPI_\w+|\bdapiBinary\b|\bisDapiError\b|@hypergen\/dapi|apps\/web\/src\/dapi/g, "")));
}

describe("source branding", () => {
  it.each(FILES)("%s never mentions LTX or Lightricks", (path) => {
    expect(read(path)).not.toMatch(/\bltx\b|lightricks/i);
  });

  // T8/T9 grep `diffusion|\bdapi\b`; T10/T11 grep `diffusion` only, so the
  // `dapi:*` IPC channel names and the docs test's own temp prefix may stay.
  const DAPI_CHECKED = ["mcp-config.ts", "mcp-config.test.ts", "mcp-install.ts", "dapi/server.ts", "dapi/present.ts", "dapi/present.test.ts"];

  it.each(DAPI_CHECKED)("%s has no diffusion or bare dapi outside imports and identifiers", (path) => {
    expect(leftovers(path, /diffusion|\bdapi\b/i)).toEqual([]);
  });

  it.each(FILES)("%s has no diffusion outside imports", (path) => {
    expect(leftovers(path, /diffusion/i)).toEqual([]);
  });

  it("names the MCP server hypergen and titles it Hypergen", () => {
    const server = read("dapi/server.ts");
    expect(server).toContain('const SERVER_NAME = "hypergen";');
    expect(server).toMatch(/title: "Hypergen"/);
    expect(server).toContain("mcp__hypergen__<tool>");
  });

  it("files bug reports against buckleson/hypergen", () => {
    expect(read("dapi/handlers/report.ts")).toContain('const REPO = "buckleson/hypergen";');
  });

  it.each(["dapi/server.ts", "dapi/http.ts", "dapi/renderer-calls.ts"])("%s logs under [hypergen], never [dapi]", (path) => {
    const text = read(path);
    expect(text).not.toContain("[dapi]");
    for (const call of text.match(/console\.(?:log|warn|error|info)\([^)]*/g) ?? []) {
      expect(call).toMatch(/\[hypergen\]/);
    }
  });

  it("keeps the DAPI_WIRE name in main-channels while its comments say hypergen", () => {
    const channels = read("main-channels.ts");
    expect(channels).toContain("DAPI_WIRE");
    expect(channels).toContain("`hypergen://`");
    expect(channels).toContain("`hypergen` field of its package.json");
  });

  it("uses hypergen:// in the http test resource", () => {
    expect(read("dapi/http.test.ts")).toContain("hypergen://note");
  });
});

describe("fallback instructions", () => {
  const FALLBACK = "Hypergen, a video editor, is running on this machine";

  it("starts with Hypergen when no docs are staged", () => {
    expect(instructions(null).startsWith(FALLBACK)).toBe(true);
  });

  it("falls back when the docs dir has no INSTRUCTIONS.md, but still names the dir", () => {
    const dir = join(scratch, "no-instructions");
    mkdirSync(dir, { recursive: true });
    const text = instructions(dir);
    expect(text.startsWith(FALLBACK)).toBe(true);
    expect(text).toContain(dir);
  });

  it("falls back when INSTRUCTIONS.md is empty or whitespace", () => {
    for (const [name, body] of [["empty", ""], ["blank", " \n\t\n"]] as const) {
      const dir = join(scratch, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "INSTRUCTIONS.md"), body);
      expect(instructions(dir).startsWith(FALLBACK)).toBe(true);
    }
  });

  it("handles a Windows-style docs dir with spaces", () => {
    const dir = "C:\\Program Files\\Hypergen\\resources\\docs";
    const text = instructions(dir);
    expect(text.startsWith(FALLBACK)).toBe(true);
    expect(text).toContain(`\`${dir}\``);
  });

  it("never mentions Diffusion, LTX or Lightricks", () => {
    expect(instructions(null)).not.toMatch(/diffusion|ltx|lightricks|\bdapi\b/i);
    expect(instructions("/docs")).not.toMatch(/diffusion|ltx|lightricks|\bdapi\b/i);
  });
});

describe("presented file names", () => {
  const png = (byte: number) => new Uint8Array(8).fill(byte);

  it.each(["capture", "grab"] as const)("puts %s frames in a hypergen-<kind>- temp dir", async (kind) => {
    const args = kind === "capture" ? { id: "intro" } : { path: "/c.mp4" };
    const presented = await present(kind, args, [{ timecode: "0f", png: png(1) }]);
    const path = (presented.output as { images: Array<{ path: string }> }).images[0]!.path;
    expect(basename(dirname(path))).toMatch(new RegExp(`^hypergen-${kind}-`));
    rmSync(dirname(path), { recursive: true, force: true });
  });

  it("names a preview and a transcript hypergen-* in an output directory", async () => {
    const out = join(scratch, "out");
    mkdirSync(out, { recursive: true });
    const film = await present("filmstrip", { path: "/c.mp4", output: out }, { png: png(2) });
    expect(basename((film.output as { path: string }).path)).toMatch(/^hypergen-filmstrip-[0-9a-f-]{36}\.png$/);
    const transcript = await present("transcribe", { path: "/c.mp4", output: out }, { segments: [] });
    expect(basename((transcript.output as { path: string }).path)).toMatch(/^hypergen-transcript-[0-9a-f-]{36}\.json$/);
    expect(readdirSync(out).every((name) => name.startsWith("hypergen-"))).toBe(true);
  });

  it("names screenshots hypergen_<date>_<time> and numbers a clash", async () => {
    const out = join(scratch, "shots");
    mkdirSync(out, { recursive: true });
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const shot = await present("screenshot", { output: out }, { png: png(3 + i), width: 1, height: 1 });
      names.push(basename((shot.output as { path: string }).path));
    }
    for (const name of names) expect(name).toMatch(/^hypergen_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.png$/);
    expect(new Set(names).size).toBe(3);
  });

  it("writes a local job's picture as hypergen-<job id>.png", async () => {
    const job = { id: "job-edge-1", status: "running", assets: [], details: {} };
    const presented = await present("job", {}, { job, saveTo: null, image: png(9) });
    const image = (presented.output as { details: { image: string } }).details.image;
    expect(basename(image)).toBe("hypergen-job-edge-1.png");
    rmSync(image, { force: true });
  });

  it("never names a file after dapi or diffusion", async () => {
    const out = join(scratch, "names");
    mkdirSync(out, { recursive: true });
    await present("waveform", { path: "/c.mp4", output: out }, { png: png(4), silences: [] });
    await present("screenshot", { output: out }, { png: png(5), width: 1, height: 1 });
    for (const name of readdirSync(out)) expect(name).not.toMatch(/dapi|diffusion|ltx|lightricks/i);
  });
});
