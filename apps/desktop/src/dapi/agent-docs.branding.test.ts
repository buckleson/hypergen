/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// T30 / T32: the agent-facing docs (INSTRUCTIONS.md, skills, JSX reference,
// runnable examples) speak of Hypergen and the `hypergen` CLI only.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const docs = join(repoRoot, "docs");
const haveDocs = existsSync(join(docs, "INSTRUCTIONS.md"));

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}

const scoped = {
  instructions: walk(join(docs, "INSTRUCTIONS.md")),
  skills: walk(join(docs, "skills")),
  jsx: walk(join(docs, "reference", "jsx")),
  examples: walk(join(docs, "examples")),
};
const allScoped = Object.values(scoped).flat();
const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => relative(repoRoot, file).split(sep).join("/");

// The acceptance grep, exactly: grep -riE 'diffusion|\bdapi\b'
const legacy = /diffusion|\bdapi\b/i;
const vendor = /\bltx\b|lightricks/i;

function offenders(files: string[], re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    read(file)
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
  }
  return hits;
}

describe.runIf(haveDocs)("agent docs branding (T30)", () => {
  it("finds the scoped files (walk is not silently empty)", () => {
    expect(scoped.instructions).toHaveLength(1);
    expect(scoped.skills.map(rel)).toEqual(
      expect.arrayContaining(["docs/skills/editor.md", "docs/skills/watch.md"]),
    );
    expect(scoped.jsx.length).toBeGreaterThan(10);
    for (const f of allScoped) expect(read(f).trim().length, rel(f)).toBeGreaterThan(0);
  });

  it("INSTRUCTIONS.md, skills and reference/jsx have no diffusion/dapi mention", () => {
    expect(offenders([...scoped.instructions, ...scoped.skills, ...scoped.jsx], legacy)).toEqual([]);
  });

  it("names the product Hypergen in INSTRUCTIONS.md; editor skill's shell launch is `hypergen open -b`", () => {
    expect(read(scoped.instructions[0])).toMatch(/^Hypergen, a video editor/);
    expect(read(join(docs, "skills", "editor.md"))).toContain("`hypergen open -b <dir>`");
  });

  it("has no leftover `Diffusion Studio` in any casing or spacing", () => {
    expect(offenders(allScoped, /diffusion[\s_-]*studio/i)).toEqual([]);
  });

  it("shell commands use `hypergen <cmd>`, never `diffusion <cmd>` or `dapi <cmd>`", () => {
    expect(offenders(allScoped, /(^|[\s`'"(])(diffusion|dapi)(\.exe)?\s+[a-z-]+/i)).toEqual([]);
    const commands = allScoped.flatMap((f) => [...read(f).matchAll(/\bhypergen\s+(open|generate|job)\b/g)]);
    expect(commands.length).toBeGreaterThan(0);
  });

  it("documents the package.json field as `hypergen`, not `diffusion`", () => {
    expect(offenders(allScoped, /"diffusion"\s*:/i)).toEqual([]);
    expect(read(join(docs, "reference", "jsx", "module.md"))).toContain("the hypergen commands as scripts");
  });

  it("repo links point at buckleson/hypergen or known third parties only", () => {
    const allowed = /^https:\/\/github\.com\/(buckleson\/hypergen|WICG\/|yt-dlp\/)/;
    const links = allScoped.flatMap((f) =>
      [...read(f).matchAll(/https?:\/\/github\.com\/[^\s)"'`>]+/g)].map((m) => `${rel(f)} -> ${m[0]}`),
    );
    expect(links.filter((l) => !allowed.test(l.split(" -> ")[1]))).toEqual([]);
    expect(offenders(allScoped, /diffusionstudio|diffusion-studio/i)).toEqual([]);
  });

  it("leaks no upstream vendor names (LTX, Lightricks)", () => {
    expect(offenders(allScoped, vendor)).toEqual([]);
  });

  it("legacy regex really catches the old spellings (guards the guard)", () => {
    for (const s of ["Diffusion Studio", "DIFFUSION open x", "run `dapi job 1`", "dapi://x"]) {
      expect(legacy.test(s), s).toBe(true);
    }
    for (const s of ["Hypergen", "hypergen open ~/p", "dapifoo", "rapid"]) {
      expect(legacy.test(s), s).toBe(false);
    }
  });
});

describe.runIf(haveDocs)("docs/brand untouched (T30)", () => {
  it("has no uncommitted changes under docs/brand", () => {
    const git = spawnSync("git", ["status", "--porcelain", "--", "docs/brand"], { cwd: repoRoot, encoding: "utf8" });
    if (git.error || git.status !== 0) return; // no git on this machine: nothing to compare against
    expect(git.stdout.trim()).toBe("");
  });
});

describe.runIf(haveDocs)("runnable examples (T32)", () => {
  const tsx = scoped.examples.filter((f) => f.endsWith(".tsx"));

  it("has no diffusion/dapi mention anywhere in docs/examples", () => {
    expect(tsx.length).toBeGreaterThanOrEqual(10);
    expect(offenders(scoped.examples, legacy)).toEqual([]);
  });

  it("every example's header usage comment opens it with `hypergen open`", () => {
    for (const file of tsx) {
      const header = read(file).match(/^\/\*[\s\S]*?\*\//)?.[0] ?? "";
      const opens = [...header.matchAll(/^\s*\*\s+(\S+)\s+open\s+(\S+)/gm)];
      if (opens.length === 0) continue; // header with no usage block
      for (const [, cli, target] of opens) {
        expect(cli, rel(file)).toBe("hypergen");
        expect(target, rel(file)).toMatch(/^~\/Projects\/[\w-]+$/);
      }
    }
    const withUsage = tsx.filter((f) => /^\s*\*\s+hypergen open /m.test(read(f)));
    expect(withUsage.length).toBeGreaterThanOrEqual(8);
  });

  it("the open target matches the folder the example is copied into", () => {
    for (const file of tsx) {
      const text = read(file);
      const cp = text.match(/cp examples\/[\w.-]+ (~\/Projects\/[\w-]+)\/index\.tsx/);
      const open = text.match(/hypergen open (~\/Projects\/[\w-]+)/);
      if (cp && open) expect(open[1], rel(file)).toBe(cp[1]);
    }
  });

  it("README.md says hypergen and its shell snippet uses `hypergen open`", () => {
    const readme = read(join(docs, "examples", "README.md"));
    expect(readme).toMatch(/hypergen/i);
    expect(readme).toMatch(/^hypergen open ~\/Projects\/basics$/m);
    expect(readme).not.toMatch(legacy);
  });

  it("README links resolve to files that exist (Windows-safe join)", () => {
    const readme = read(join(docs, "examples", "README.md"));
    const locals = [...readme.matchAll(/\]\(((?!https?:)[^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]);
    expect(locals.length).toBeGreaterThan(0);
    for (const link of locals) {
      expect(existsSync(join(docs, "examples", ...link.split("/"))), link).toBe(true);
    }
  });
});
