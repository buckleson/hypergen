/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Brand strings in the main process and in the repo-root files that ship with
// it (README, .gitignore, Windows CI). main.ts starts Electron on import, so
// these checks read the sources as text instead of executing them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = __dirname;
const root = join(src, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(...p), "utf8");
const lines = (text: string) => text.split(/\r?\n/);

// Lines that may still say "dapi": the DapiServer import/identifier, the
// `dapi` variable and the internal @hypergen/dapi package import.
const allowedDapi = (line: string) =>
  /DapiServer|\bdapi\.|const dapi\b|@hypergen\/dapi|\.\/dapi\//.test(line);

const leaks = (text: string) =>
  lines(text).filter((l) => /diffusion|LTX|Lightricks|\bdapi\b/i.test(l) && !allowedDapi(l));

describe("main.ts", () => {
  const main = read(src, "main.ts");

  it("names the app Hypergen", () => {
    expect(main).toMatch(/app\.setName\("Hypergen"\)/);
    expect(main.match(/app\.setName\(/g)).toHaveLength(1);
  });

  it("checks for updates against buckleson/hypergen", () => {
    expect(main).toMatch(/repo:\s*"buckleson\/hypergen"/);
  });

  it("uses the hypergen deep-link scheme", () => {
    expect(main).toMatch(/const AUTH_PROTOCOL = "hypergen";/);
    expect(main).toContain("hypergen://");
    expect(main).toMatch(/hypergen CLI/);
  });

  it("has no upstream brand outside the allowed dapi identifiers", () => {
    expect(leaks(main)).toEqual([]);
  });
});

describe("squirrel.ts", () => {
  const squirrel = read(src, "squirrel.ts");

  it("comment names only the hypergen command", () => {
    expect(squirrel).toContain("`hypergen`");
    expect(leaks(squirrel)).toEqual([]);
  });
});

describe("squirrel.test.ts fixtures", () => {
  const t = read(src, "squirrel.test.ts");

  it("use Hypergen install paths and links", () => {
    expect(t).toContain("\\\\Local\\\\Hypergen\\\\app-1.0.0\\\\Hypergen.exe");
    expect(t).toContain("hypergen://auth?x=1");
    expect(t).toContain("/Applications/Hypergen.app/Contents/MacOS/Hypergen");
    expect(leaks(t)).toEqual([]);
  });
});

describe("README.md", () => {
  const readme = read(root, "README.md");

  it("describes Hypergen and clones from buckleson/hypergen", () => {
    expect(readme).toMatch(/Hypergen/);
    expect(readme).toContain("git clone https://github.com/buckleson/hypergen.git");
  });

  it("shows CLI examples with the hypergen command, never dapi", () => {
    const fenced = [...readme.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
    expect(fenced).not.toMatch(/^\s*\$?\s*dapi\b/m);
    expect(readme).toMatch(/\bhypergen\s+[a-z-]+/);
  });

  it("drops upstream links and badges", () => {
    expect(readme).not.toMatch(/diffusion\.studio/i);
    expect(readme).not.toMatch(/ycombinator|\bY\s?Combinator\b/i);
    expect(readme).not.toMatch(/discord\.(gg|com)/i);
    expect(readme).not.toMatch(/open-projects/i);
    // X links are allowed only inside sample prompt text, never as brand links.
    expect(readme).not.toMatch(/\]\(https:\/\/(x|twitter)\.com\/(?!claudeai\/status)/i);
  });

  it("keeps MPL-2.0 and the ADR-012 credits", () => {
    expect(readme).toMatch(/MPL-2\.0/);
    expect(readme).toMatch(/Secured by HyperOx/);
    expect(readme).toMatch(/Powered by \[Buckleson\]\(https:\/\/buckleson\.com\)/);
    expect(readme).toMatch(/Managed by \[Pavi\]\(https:\/\/pavi\.tech\)/);
  });

  it("has no diffusion/dapi/LTX/Lightricks text", () => {
    expect(readme).not.toMatch(/diffusion|\bdapi\b|LTX|Lightricks/i);
  });
});

describe("root .gitignore", () => {
  const ignore = lines(read(root, ".gitignore")).map((l) => l.trim());

  it("ignores .claude and graphify-out/ on separate lines", () => {
    expect(ignore).toContain(".claude");
    expect(ignore).toContain("graphify-out/");
    expect(ignore).not.toContain(".claudegraphify-out/");
    expect(ignore.some((l) => /claude.*graphify|graphify.*claude/.test(l))).toBe(false);
  });

  it("has no upstream brand", () => {
    expect(ignore.join("\n")).not.toMatch(/diffusion|\bdapi\b/i);
  });
});

describe("build.yml", () => {
  const wf = read(root, ".github", "workflows", "build.yml");

  it("uploads the installers as hypergen-<os>-<arch>", () => {
    expect(wf).toMatch(/name:\s*hypergen-\$\{\{\s*runner\.os\s*\}\}-\$\{\{\s*runner\.arch\s*\}\}/);
  });

  it("has no upstream brand", () => {
    expect(wf).not.toMatch(/diffusion|\bdapi\b|LTX|Lightricks/i);
  });
});
