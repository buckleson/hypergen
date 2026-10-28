/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for subtask C outside the docs folder: the scaffolded project
// README and its npm scripts, the mcp-config / mcp-proxy comments, the CLI
// generate help, and the repo README's install, update and credits lines.

import { tmpdir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => tmpdir() },
  dialog: {},
  shell: {},
  ipcMain: { on: () => { } },
}));

const { scaffold } = await import("./projects");

const repo = join(__dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(repo, ...parts), "utf8");
const BRAND_LEAK = /\bltx\b|lightricks/i;

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "readme edge "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function scaffolded(name = "My Film"): Promise<{ readme: string; scripts: Record<string, string> }> {
  const dir = join(root, "My Film");
  await mkdir(dir, { recursive: true });
  await scaffold(dir, name);
  const readme = await readFile(join(dir, "README.md"), "utf8");
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as { scripts: Record<string, string> };
  return { readme, scripts: pkg.scripts };
}

/** Commands table rows, keyed by script name. */
function rows(readme: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of readme.split(/\r?\n/)) {
    const m = /^\| `([\w-]+)` \| `([^`]+)` \| (.+) \|$/.exec(line);
    if (m) map.set(m[1]!, line);
  }
  return map;
}

describe("template README", () => {
  it("makes no claim about MCP resources", async () => {
    const { readme } = await scaffolded();
    expect(readme).not.toMatch(/\bresources?\b/i);
  });

  it("says all the commands talk to the running app", async () => {
    const { readme } = await scaffolded();
    expect(readme).toContain("All of them talk to the running app.");
  });

  it("context row lists the playhead and loaded fonts", async () => {
    const row = rows((await scaffolded()).readme).get("context");
    expect(row).toMatch(/playhead/);
    expect(row).toMatch(/fonts/);
    expect(row).toMatch(/loaded/);
  });

  it("listen row names the user's own Gemini key", async () => {
    const row = rows((await scaffolded()).readme).get("listen");
    expect(row).toMatch(/your own Gemini API key/);
  });

  it("transcribe row says local Whisper and no cloud provider", async () => {
    const row = rows((await scaffolded()).readme).get("transcribe")!;
    expect(row).toMatch(/locally with Whisper/);
    expect(row).not.toMatch(/Gemini|fal\.ai|API key/);
  });

  it.each(["check", "export", "generate", "job", "window"])("has a %s row and npm script that agree", async (name) => {
    const { readme, scripts } = await scaffolded();
    const row = rows(readme).get(name);
    expect(row, name).toBeDefined();
    expect(scripts[name]).toBe(`hypergen ${name}`);
    const command = /^\| `[\w-]+` \| `([^`]+)`/.exec(row!)![1]!;
    expect(command.startsWith(scripts[name]!)).toBe(true);
  });

  it("has a row for every npm script and an npm script for every row", async () => {
    const { readme, scripts } = await scaffolded();
    const table = rows(readme);
    expect([...table.keys()].sort()).toEqual(Object.keys(scripts).sort());
  });

  it("the generate row names fal.ai and the user's own key", async () => {
    const row = rows((await scaffolded()).readme).get("generate");
    expect(row).toMatch(/fal\.ai/);
    expect(row).toMatch(/your own fal\.ai API key/);
  });

  it("escapes pipes inside table cells so every row keeps three columns", async () => {
    for (const row of rows((await scaffolded()).readme).values()) {
      const cells = row.replace(/\\\|/g, "").split("|").slice(1, -1);
      expect(cells, row).toHaveLength(3);
    }
  });

  it("keeps a display name with Windows-hostile characters out of the commands table", async () => {
    const { readme } = await scaffolded("C:\\Clips | Rough Cut");
    expect(readme.split(/\r?\n/)[0]).toContain("Rough Cut");
    expect(rows(readme).size).toBeGreaterThanOrEqual(18);
  });

  it("has no LTX/Lightricks", async () => {
    const { readme, scripts } = await scaffolded();
    expect(readme).not.toMatch(BRAND_LEAK);
    expect(JSON.stringify(scripts)).not.toMatch(BRAND_LEAK);
  });
});

describe("code comments", () => {
  it("mcp-config.ts drops the /hypergen:<prompt> mention", () => {
    const src = read("apps", "desktop", "src", "mcp-config.ts");
    expect(src).not.toMatch(/\/hypergen:/);
    expect(src).not.toMatch(/<prompt>/);
  });

  it("mcp-proxy.ts launch comment names both macOS and Windows", () => {
    const src = read("apps", "cli", "src", "mcp-proxy.ts");
    const comment = src.split(/\r?\n/).find((l) => /\/\/.*launch/i.test(l));
    expect(comment).toBeDefined();
    expect(comment).toMatch(/macOS/);
    expect(comment).toMatch(/Windows/);
  });
});

describe("CLI generate --help", () => {
  it("drops the clause about an audio field taking a scene", () => {
    const src = read("apps", "cli", "src", "index.ts");
    const start = src.indexOf('.command("generate")');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf(".action(", start));
    expect(block).not.toMatch(/scene/i);
    expect(src).not.toMatch(/audio[^\n]{0,80}\bscene\b/i);
  });

  it("the generate tool description says nothing about a scene as audio input", async () => {
    const { toolByName } = await import("@hypergen/dapi");
    expect(toolByName("generate").description).not.toMatch(/\bscene\b/i);
  });
});

describe("repo README", () => {
  const readme = read("README.md");

  it("macOS note: System Settings > Privacy & Security > Open Anyway, or xattr", () => {
    expect(readme).toMatch(/System Settings > Privacy & Security\*{0,2}[^\n]*\*{0,2}Open Anyway/);
    expect(readme).toContain("xattr -dr com.apple.quarantine /Applications/Hypergen.app");
    expect(readme).not.toMatch(/right-click[^\n]*Open|control-click/i);
  });

  it("says automatic updates are Windows-only for now", () => {
    expect(readme).toMatch(/Automatic updates are Windows-only for now/);
  });

  it("keeps the credits line exactly", () => {
    const lines = readme.split(/\r?\n/);
    const at = lines.indexOf("## Credits");
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1).find((l) => l.trim())).toBe(
      "Secured by HyperOx · Powered by [Buckleson](https://buckleson.com) · Managed by [Pavi](https://pavi.tech)",
    );
  });

  it("has no dapi, diffusion, LTX or Lightricks text", () => {
    expect(readme).not.toMatch(/\bdapi\b|diffusion/i);
    expect(readme).not.toMatch(BRAND_LEAK);
  });

  it("the deleted voice page is not linked from the README", () => {
    expect(readme).not.toContain("gemini-3.8-flash-tts");
    expect(existsSync(join(repo, "docs", "reference", "voices", "gemini-3.8-flash-tts.md"))).toBe(false);
  });
});
