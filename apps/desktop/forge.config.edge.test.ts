/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for packaging identity: osxSign without SKIP_SIGN, the DMG
// background colour against the actual image, package metadata, and the
// repo-level cleanups (scripts, .gitignore, build matrix, release comment).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@electron-forge/maker-zip", () => ({
  MakerZIP: class { kind = "zip"; constructor(public config: unknown, public platforms?: string[]) {} },
}));
vi.mock("@electron-forge/maker-deb", () => ({
  MakerDeb: class { kind = "deb"; constructor(public config: any) {} },
}));
vi.mock("@electron-forge/maker-squirrel", () => ({
  MakerSquirrel: class { kind = "squirrel"; constructor(public config: any) {} },
}));
vi.mock("@electron-forge/maker-dmg", () => ({
  MakerDMG: class { kind = "dmg"; constructor(public config: any) {} },
}));
vi.mock("@electron-forge/publisher-github", () => ({
  PublisherGithub: class { kind = "github"; constructor(public config: any) {} },
}));

const desktop = __dirname;
const root = join(desktop, "..", "..");
const read = (...p: string[]) => readFileSync(join(...p), "utf8");
const TAGLINE = "The AI video editor built for agents";
const ENV_KEYS = ["SKIP_SIGN", "WINDOWS_SIGNTOOL_PATH", "WINDOWS_SIGN_DLIB", "WINDOWS_SIGN_METADATA"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

async function loadConfig(skipSign: string | undefined) {
  for (const k of ENV_KEYS) delete process.env[k];
  if (skipSign !== undefined) process.env.SKIP_SIGN = skipSign;
  vi.resetModules();
  return (await import("./forge.config")).default as any;
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("osxSign by SKIP_SIGN", () => {
  it("is an empty object (real identity lookup) when SKIP_SIGN is unset", async () => {
    expect((await loadConfig(undefined)).packagerConfig.osxSign).toEqual({});
  });

  it("treats an empty SKIP_SIGN as unset", async () => {
    expect((await loadConfig("")).packagerConfig.osxSign).toEqual({});
  });

  it("is ad-hoc for any non-empty SKIP_SIGN", async () => {
    expect((await loadConfig("true")).packagerConfig.osxSign).toEqual({ identity: "-" });
  });

  it("never registers a URL scheme whether or not signing is skipped", async () => {
    expect((await loadConfig(undefined)).packagerConfig.protocols).toBeUndefined();
    expect((await loadConfig("1")).packagerConfig.protocols).toBeUndefined();
  });
});

describe("deb and squirrel identity", () => {
  it("deb productDescription is a single non-empty sentence with no upstream brand", async () => {
    const deb = (await loadConfig("1")).makers.find((m: any) => m.kind === "deb").config.options;
    expect(typeof deb.productDescription).toBe("string");
    expect(deb.productDescription.trim().length).toBeGreaterThan(TAGLINE.length - 10);
    expect(deb.productDescription.trim().match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(deb.productDescription).not.toMatch(/LTX|Lightricks|diffusion/i);
  });

  it("deb bin has no spaces or path separators", async () => {
    const deb = (await loadConfig("1")).makers.find((m: any) => m.kind === "deb").config.options;
    expect(deb.bin).not.toMatch(/[\s/\\]/);
  });

  it("squirrel and deb share the exact tagline", async () => {
    const cfg = await loadConfig("1");
    const deb = cfg.makers.find((m: any) => m.kind === "deb").config.options;
    const sq = cfg.makers.find((m: any) => m.kind === "squirrel").config;
    expect(sq.description).toBe(deb.description);
    expect(sq.description).toBe(TAGLINE);
  });
});

describe("DMG background", () => {
  function firstPixelHex(file: string): string {
    const png = readFileSync(file);
    let o = 8;
    let ihdr: Buffer | undefined;
    const idat: Buffer[] = [];
    while (o < png.length) {
      const len = png.readUInt32BE(o);
      const type = png.toString("ascii", o + 4, o + 8);
      const data = png.subarray(o + 8, o + 8 + len);
      if (type === "IHDR") ihdr = data;
      if (type === "IDAT") idat.push(data);
      o += 12 + len;
    }
    expect(ihdr![8]).toBe(8); // 8-bit channels
    expect([2, 6]).toContain(ihdr![9]); // RGB or RGBA
    // Byte 0 is the row filter; for the first pixel every filter predicts 0.
    const raw = inflateSync(Buffer.concat(idat));
    return "#" + [...raw.subarray(1, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("background-color matches the corner of dmg-background.png", async () => {
    const dmg = (await loadConfig("1")).makers.find((m: any) => m.kind === "dmg").config;
    const color = dmg.additionalDMGOptions["background-color"].toLowerCase();
    expect(color).toBe("#f7f9fc");
    expect(firstPixelHex(join(desktop, "assets", "dmg-background.png"))).toBe(color);
  });

  it("the DMG comment describes a light background, not a dark one", () => {
    const src = read(desktop, "forge.config.ts");
    const block = src.slice(src.indexOf("new MakerDMG("), src.indexOf("additionalDMGOptions"));
    expect(block).toMatch(/\/\/[^\n]*light/i);
    expect(block).not.toMatch(/\/\/[^\n]*dark/i);
  });
});

describe("desktop package.json identity", () => {
  const pkg = JSON.parse(read(desktop, "package.json"));

  it("has the product fields", () => {
    expect(pkg.productName).toBe("Hypergen");
    expect(pkg.description).toBe(TAGLINE);
    expect(pkg.author).toBe("Buckleson");
    expect(pkg.homepage).toBe("https://github.com/buckleson/hypergen");
  });

  it("homepage matches the deb homepage and the repository url", async () => {
    const deb = (await loadConfig("1")).makers.find((m: any) => m.kind === "deb").config.options;
    expect(deb.homepage).toBe(pkg.homepage);
    expect(pkg.repository.url).toBe(`${pkg.homepage}.git`);
  });

  it("has no upstream brand in any identity field", () => {
    for (const k of ["productName", "description", "author", "homepage"]) {
      expect(pkg[k]).not.toMatch(/LTX|Lightricks/i);
    }
  });
});

describe("repo cleanups", () => {
  it("root package.json drops the web_v1 scripts and nothing calls them", () => {
    const pkg = JSON.parse(read(root, "package.json"));
    expect(pkg.scripts).not.toHaveProperty("dev:web_v1");
    expect(pkg.scripts).not.toHaveProperty("build:web_v1");
    expect(Object.values<string>(pkg.scripts).join("\n")).not.toMatch(/web_v1/);
    expect(read(root, ".github", "workflows", "build.yml")).not.toMatch(/web_v1/);
  });

  it(".gitignore has no .vercel entry", () => {
    const lines = read(root, ".gitignore").split(/\r?\n/).map((l) => l.trim());
    expect(lines.filter((l) => /^\/?\.vercel\/?$/.test(l))).toEqual([]);
  });

  it("build.yml matrix entries have no 'out' key", () => {
    const yml = read(root, ".github", "workflows", "build.yml");
    const matrix = yml.slice(yml.indexOf("matrix:"), yml.indexOf("runs-on:", yml.indexOf("matrix:")));
    expect(matrix).toMatch(/os:/);
    expect(matrix).not.toMatch(/^\s*-?\s*out:/m);
    expect(yml).not.toMatch(/matrix\.out\b/);
  });

  it("release.mjs points at the release job in build.yml, not a separate workflow", () => {
    const src = read(root, "scripts", "release.mjs");
    expect(src).toMatch(/build\.yml/);
    expect(src).not.toMatch(/release\.ya?ml/i);
    expect(src).not.toMatch(/Release workflow/);
  });
});
