/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the Hypergen project template (T27), the staged jsx typings
// (T28) and the scaffold's copy of them into <project>/.hypergen/jsx (T29).
// Packaged mode is simulated with a fake resourcesPath so the copy is tested
// without depending on gitignored build output.

import { tmpdir } from "node:os";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ isPackaged: false }));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return electron.isPackaged;
    },
    getPath: () => tmpdir(),
  },
  dialog: {},
  shell: {},
  ipcMain: { on: () => { } },
}));

const { scaffold, initProject, readConfig, writeConfig, writeManifest } = await import("./projects");

const desktop = join(__dirname, "..");
const src = (rel: string) => readFile(join(desktop, rel), "utf8");
const BRAND_LEAK = /diffusion|ltx|lightricks/i;

let root: string;
let originalResources: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "template test "));
  originalResources = process.resourcesPath;
  electron.isPackaged = false;
});

afterEach(async () => {
  electron.isPackaged = false;
  (process as { resourcesPath?: string }).resourcesPath = originalResources;
  await rm(root, { recursive: true, force: true });
});

/** A fake packaged app: resourcesPath/jsx holding typings plus build leftovers that must not be copied. */
async function fakeResources(files: Record<string, string>): Promise<string> {
  const resources = join(root, "Program Files", "Hypergen", "resources");
  const jsx = join(resources, "jsx");
  await rm(jsx, { recursive: true, force: true });
  await mkdir(jsx, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(jsx, name), content);
  (process as { resourcesPath?: string }).resourcesPath = resources;
  electron.isPackaged = true;
  return jsx;
}

async function freshProject(name = "fresh"): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("T27 template text", () => {
  it("gives every script the hypergen command and no other brand", async () => {
    const dir = await freshProject();
    await scaffold(dir);
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    const values = Object.values(pkg.scripts as Record<string, string>);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toMatch(/^hypergen /);
    expect(pkg.scripts.open).toBe("hypergen open .");
    expect(JSON.stringify(pkg)).not.toMatch(BRAND_LEAK);
  });

  it("falls back to hypergen-project when the folder name has no npm-safe characters", async () => {
    const dir = await freshProject("___");
    await scaffold(dir);
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("hypergen-project");
    expect(pkg.displayName).toBe("___");
  });

  it("ignores the app-owned .hypergen folder and nothing branded otherwise", async () => {
    const dir = await freshProject();
    await scaffold(dir);
    const gitignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/)).toContain(".hypergen/");
    expect(gitignore).not.toMatch(BRAND_LEAK);
  });

  it("writes a README that names Hypergen, the hypergen MCP server, and buckleson/hypergen docs", async () => {
    const dir = await freshProject();
    await scaffold(dir, "My Film");
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toMatch(/^# My Film/);
    expect(readme).toContain("A Hypergen project");
    expect(readme).toContain("(`hypergen`)");
    expect(readme).toContain("`hypergen open .`");
    expect(readme).not.toMatch(BRAND_LEAK);
    const links = [...readme.matchAll(/\]\((https?:\/\/github\.com[^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) expect(link).toMatch(/^https:\/\/github\.com\/buckleson\/hypergen\//);
  });

  it("heads assets.yml with the Hypergen asset library line", async () => {
    const dir = await freshProject();
    await scaffold(dir);
    const manifest = await readFile(join(dir, "assets.yml"), "utf8");
    expect(manifest.startsWith("# Hypergen asset library.")).toBe(true);
    await writeManifest(dir, { version: 1, folders: [], assets: [] });
    expect((await readFile(join(dir, "assets.yml"), "utf8")).startsWith("# Hypergen asset library.")).toBe(true);
  });

  it("stores the config under package.json `hypergen`, and removes it for null", async () => {
    const dir = await freshProject();
    await scaffold(dir);
    await writeConfig(dir, { scenes: { a: 1 } });
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.hypergen).toEqual({ scenes: { a: 1 } });
    expect(Object.keys(pkg).some((k) => BRAND_LEAK.test(k))).toBe(false);
    expect(await readConfig(dir)).toEqual({ scenes: { a: 1 } });
    await writeConfig(dir, null);
    expect(await readConfig(dir)).toBeNull();
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8"))).not.toHaveProperty("hypergen");
  });

  it("gives a package.json without scripts the hypergen scripts, and keeps one that has its own", async () => {
    const bare = await freshProject("bare");
    await writeFile(join(bare, "package.json"), JSON.stringify({ name: "bare" }) + "\n");
    await scaffold(bare);
    expect(JSON.parse(await readFile(join(bare, "package.json"), "utf8")).scripts.open).toBe("hypergen open .");

    const own = await freshProject("own");
    await writeFile(join(own, "package.json"), JSON.stringify({ name: "own", scripts: { dev: "vite" } }) + "\n");
    await scaffold(own);
    expect(JSON.parse(await readFile(join(own, "package.json"), "utf8")).scripts).toEqual({ dev: "vite" });
  });

  it("keeps the source free of the old brand and points the save folder at <videos>/Hypergen", async () => {
    const projects = await src("src/projects.ts");
    expect(projects).not.toMatch(/diffusion/i);
    expect(projects).not.toMatch(/lightricks|\bLTX\b/i);
    expect(projects).toContain('join(app.getPath("videos"), "Hypergen")');
    expect(projects).toContain('const APP_DIR = ".hypergen"');
    expect(projects).toContain('const CONFIG_FIELD = "hypergen"');
  });
});

describe("T28 staging the jsx typings", () => {
  it("runs stage:jsx right after stage:docs in package, make and publish", async () => {
    const pkg = JSON.parse(await src("package.json"));
    expect(pkg.scripts["stage:jsx"]).toBe("node scripts/stage-jsx.mjs");
    for (const name of ["package", "make", "publish"]) {
      expect(pkg.scripts[name]).toContain("npm run stage:docs && npm run stage:jsx && electron-forge");
    }
  });

  it("ships ./jsx as an extra resource and keeps it out of git", async () => {
    const forge = await src("forge.config.ts");
    expect(forge).toMatch(/extraResource:\s*\['\.\/cli',\s*'\.\/runtime',\s*'\.\/docs',\s*'\.\/jsx'\]/);
    const gitignore = (await src(".gitignore")).split(/\r?\n/).map((l) => l.trim());
    expect(gitignore).toContain("jsx");
  });

  it("builds packages/jsx with tsconfig.build.json and stages only declarations plus package.json", async () => {
    const script = await src("scripts/stage-jsx.mjs");
    expect(script).toContain('"tsconfig.build.json"');
    expect(script).toMatch(/endsWith\("\.d\.ts"\)/);
    expect(script).toContain('join(stageDir, "package.json")');
    expect(script).toContain('"./jsx-runtime": { types: "./jsx-runtime.d.ts" }');
    expect(script).not.toMatch(BRAND_LEAK);
  });
});

describe("T29 scaffold copies the typings into .hypergen/jsx", () => {
  it("copies the packaged typings from resourcesPath/jsx, declarations only, from a path with spaces", async () => {
    await fakeResources({
      "index.d.ts": "export declare const v: 1;\n",
      "jsx-runtime.d.ts": "export {};\n",
      "package.json": '{"name":"@hypergen/jsx"}\n',
      "index.js": "export const v = 1;\n",
      "index.js.map": "{}\n",
    });
    const dir = await freshProject("with space");
    await scaffold(dir);
    const target = join(dir, ".hypergen", "jsx");
    expect((await readdir(target)).sort()).toEqual(["index.d.ts", "jsx-runtime.d.ts", "package.json"]);
    expect(await readFile(join(target, "index.d.ts"), "utf8")).toBe("export declare const v: 1;\n");
  });

  it("refreshes the copy on every scaffold, dropping stale files, while project-owned files stay as written", async () => {
    await fakeResources({ "index.d.ts": "old\n", "stale.d.ts": "gone\n" });
    const dir = await freshProject();
    await scaffold(dir);
    await writeFile(join(dir, "tsconfig.json"), "{}\n");
    await writeFile(join(dir, ".hypergen", "jsx", "hand-edit.d.ts"), "mine\n");

    await fakeResources({ "index.d.ts": "new\n", "jsx-runtime.d.ts": "rt\n" });
    await scaffold(dir);
    const target = join(dir, ".hypergen", "jsx");
    expect((await readdir(target)).sort()).toEqual(["index.d.ts", "jsx-runtime.d.ts"]);
    expect(await readFile(join(target, "index.d.ts"), "utf8")).toBe("new\n");
    expect(await readFile(join(dir, "tsconfig.json"), "utf8")).toBe("{}\n");
  });

  it("maps @hypergen/jsx through tsconfig paths onto files the copy actually contains", async () => {
    await fakeResources({ "index.d.ts": "x\n", "jsx-runtime.d.ts": "y\n" });
    const dir = await freshProject();
    await scaffold(dir);
    const tsconfig = JSON.parse(await readFile(join(dir, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("@hypergen/jsx");
    const [main] = tsconfig.compilerOptions.paths["@hypergen/jsx"] as string[];
    const [star] = tsconfig.compilerOptions.paths["@hypergen/jsx/*"] as string[];
    await expect(readFile(join(dir, main), "utf8")).resolves.toBe("x\n");
    await expect(readFile(join(dir, star.replace("*", "jsx-runtime")), "utf8")).resolves.toBe("y\n");
    // Forward slashes even on Windows: tsconfig paths are not OS paths.
    expect(main).not.toContain("\\");
  });

  it("drops the @hypergen/jsx devDependency and keeps solid-js", async () => {
    await fakeResources({ "index.d.ts": "x\n" });
    const dir = await freshProject();
    await scaffold(dir);
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(Object.keys(pkg.devDependencies)).toEqual(["solid-js"]);
    expect(JSON.stringify(pkg)).not.toContain("@hypergen/jsx");
  });

  it("leaves a JavaScript project without a .hypergen folder", async () => {
    await fakeResources({ "index.d.ts": "x\n" });
    const dir = await freshProject("js");
    await writeFile(join(dir, "index.jsx"), "export default () => null;\n");
    await scaffold(dir);
    expect(await readdir(dir)).toEqual(["index.jsx"]);
  });

  it("does not copy typings when a folder is only opened (initProject)", async () => {
    await fakeResources({ "index.d.ts": "x\n" });
    const dir = join(root, "opened");
    await initProject(null, dir);
    expect((await readdir(dir)).sort()).toEqual(["index.tsx", "package.json"]);
  });

  it("keeps the module ids at @hypergen/jsx and removes JSX_VERSION", async () => {
    const projects = await src("src/projects.ts");
    expect(projects).toContain('const RUNTIME_MODULE = "@hypergen/jsx"');
    expect(projects).not.toContain("JSX_VERSION");
    expect(await src("src/source.ts")).toContain('const INSPECT_MODULE = "@hypergen/jsx"');
    expect(await src("src/legacy-generations.ts")).toContain('const JSX_MODULE = "@hypergen/jsx"');
  });
});
