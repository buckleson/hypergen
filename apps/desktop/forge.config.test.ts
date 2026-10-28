/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Packaging identity: the Forge config, the Windows manifest and the
// desktop/root package.json files carry the Hypergen / Buckleson brand and
// nothing from the upstream product. The makers and publisher are replaced
// with recorders so the real config object is evaluated without touching
// electron-forge, the network or any signing tool.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@electron-forge/maker-zip", () => ({
  MakerZIP: class { kind = "zip"; constructor(public config: unknown, public platforms?: string[]) {} },
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
const FORBIDDEN = /diffusion|\bdapi\b|LTX|Lightricks/i;

let config: any;
const savedSkip = process.env.SKIP_SIGN;

beforeAll(async () => {
  // Never let the config look for a real signing setup.
  process.env.SKIP_SIGN = "1";
  config = (await import("./forge.config")).default;
});
afterAll(() => {
  if (savedSkip === undefined) delete process.env.SKIP_SIGN;
  else process.env.SKIP_SIGN = savedSkip;
});

const maker = (kind: string) => config.makers.find((m: any) => m.kind === kind);

describe("forge packagerConfig", () => {
  it("names the app and bundle id after Hypergen / Buckleson", () => {
    expect(config.packagerConfig.name).toBe("Hypergen");
    expect(config.packagerConfig.appBundleId).toBe("com.buckleson.hypergen");
  });

  it("sets the Windows version-info strings", () => {
    const meta = config.packagerConfig.win32metadata;
    expect(meta.CompanyName).toBe("Buckleson");
    expect(meta.ProductName).toBe("Hypergen");
    expect(meta.FileDescription).toBe("Hypergen");
    expect(meta["application-manifest"]).toMatch(/assets[\\/]app\.manifest$/);
    expect(existsSync(meta["application-manifest"])).toBe(true);
  });

  it("registers no URL scheme", () => {
    expect(config.packagerConfig.protocols).toBeUndefined();
  });

  it("takes the app version from the root package.json", () => {
    expect(config.packagerConfig.appVersion).toBe(JSON.parse(read(root, "package.json")).version);
  });

  it("leaves signing off when SKIP_SIGN is set", () => {
    expect(config.packagerConfig.windowsSign).toBeUndefined();
    expect(config.packagerConfig.osxSign).toBeUndefined();
  });
});

describe("forge makers and publisher", () => {
  it("builds the Squirrel installer as Hypergen by Buckleson", () => {
    const sq = maker("squirrel").config;
    expect(sq.name).toBe("Hypergen");
    expect(sq.authors).toBe("Buckleson");
    expect(sq.exe).toBe("Hypergen.exe");
    expect(sq.setupExe).toBe(`Hypergen-${process.arch}-Setup.exe`);
    expect(sq.iconUrl).toBe(
      "https://raw.githubusercontent.com/buckleson/hypergen/main/apps/desktop/assets/icon.ico",
    );
  });

  it("points iconUrl at an icon that exists at that repo path", () => {
    const sq = maker("squirrel").config;
    const rel = new URL(sq.iconUrl).pathname.split("/main/")[1];
    expect(existsSync(join(root, ...rel.split("/")))).toBe(true);
  });

  it("names the setup exe safely (no spaces, ends .exe) for every arch", () => {
    const sq = maker("squirrel").config;
    expect(sq.setupExe).not.toMatch(/\s/);
    expect(sq.setupExe).toMatch(/^Hypergen-[a-z0-9]+-Setup\.exe$/);
  });

  it("names the DMG per arch", () => {
    expect(maker("dmg").config.name).toBe(`Hypergen-${process.arch}`);
  });

  it("publishes to buckleson/hypergen", () => {
    expect(config.publishers).toHaveLength(1);
    expect(config.publishers[0].config.repository).toEqual({ owner: "buckleson", name: "hypergen" });
  });

  it("has no upstream brand in any string value of the evaluated config", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(config.packagerConfig);
    config.makers.forEach((m: any) => walk(m.config));
    config.publishers.forEach((p: any) => walk(p.config));
    expect(strings.filter((s) => FORBIDDEN.test(s))).toEqual([]);
  });
});

describe("brand text in packaging files", () => {
  it("forge.config.ts and app.manifest have no upstream brand", () => {
    expect(read(desktop, "forge.config.ts")).not.toMatch(FORBIDDEN);
    expect(read(desktop, "assets", "app.manifest")).not.toMatch(FORBIDDEN);
  });

  it("app.manifest comment names Hypergen.exe and stays valid XML-ish", () => {
    const manifest = read(desktop, "assets", "app.manifest");
    expect(manifest).toContain('"Hypergen.exe"');
    expect(manifest).toMatch(/<assembly[\s>]/);
    expect(manifest).toMatch(/<\/assembly>\s*$/);
    expect(manifest).toMatch(/longPathAware/);
  });
});

describe("superseded brand-asset scripts", () => {
  it("are deleted", () => {
    expect(existsSync(join(desktop, "scripts", "win-assets.py"))).toBe(false);
    expect(existsSync(join(desktop, "scripts", "make-icns.sh"))).toBe(false);
  });

  it("are no longer referenced by any desktop script", () => {
    const pkg = JSON.parse(read(desktop, "package.json"));
    for (const name of ["make:icns", "make:ico", "make:spinner"]) {
      expect(pkg.scripts).not.toHaveProperty(name);
    }
    const all = Object.values<string>(pkg.scripts).join("\n");
    expect(all).not.toMatch(/win-assets\.py|make-icns\.sh/);
  });
});

describe("package.json files", () => {
  it("desktop repository url is buckleson/hypergen", () => {
    const pkg = JSON.parse(read(desktop, "package.json"));
    expect(pkg.repository.url).toBe("https://github.com/buckleson/hypergen.git");
    expect(pkg.name).toBe("@hypergen/desktop");
  });

  it("root has the brand script", () => {
    const pkg = JSON.parse(read(root, "package.json"));
    expect(pkg.scripts.brand).toBe("python scripts/brand/generate.py");
  });

  it("neither package.json mentions diffusion", () => {
    expect(read(desktop, "package.json")).not.toMatch(/diffusion/i);
    expect(read(root, "package.json")).not.toMatch(/diffusion/i);
  });
});
