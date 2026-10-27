/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Static checks that the CLI ships as a single `hypergen` binary and that the
// staging and dev-link scripts carry no old (`dapi`, `diffusion`) or
// third-party names. Reads the files as text; runs nothing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

const OLD_NAMES = /diffusion|\bdapi\b/i;
const THIRD_PARTY = /\bltx\b|lightricks/i;

/** Lines with an old name, once the `@hypergen/dapi` package specifier is set aside. */
function oldNameLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => OLD_NAMES.test(line.replaceAll("@hypergen/dapi", "")));
}

const CLI_FILES = [
  "apps/cli/package.json",
  "apps/cli/src/index.ts",
  "apps/cli/src/cli-client.ts",
  "apps/cli/src/mcp-proxy.ts",
];

const SCRIPT_FILES = [
  "apps/cli/scripts/dev-link.mjs",
  "scripts/dev-desktop.mjs",
  "apps/desktop/scripts/stage-cli.mjs",
  "apps/desktop/src/cli-install.ts",
  "apps/desktop/src/cli-windows.ts",
];

describe("CLI package", () => {
  const pkg = JSON.parse(read("apps/cli/package.json"));

  it("exposes exactly one binary, hypergen", () => {
    expect(pkg.bin).toEqual({ hypergen: "./dist/index.js" });
  });

  it("names the program hypergen and opens help with 'The Hypergen CLI'", () => {
    const index = read("apps/cli/src/index.ts");
    expect(index).toContain('.name("hypergen")');
    expect(index).toMatch(/`The Hypergen CLI/);
  });

  it("calls the app Hypergen and the MCP client hypergen", () => {
    const client = read("apps/cli/src/cli-client.ts");
    expect(client).toMatch(/export const APP_NAME = "Hypergen";/);
    expect(client).toMatch(/new Client\(\{ name: "hypergen"/);
  });

  it("prefixes MCP proxy logs with [hypergen mcp]", () => {
    const proxy = read("apps/cli/src/mcp-proxy.ts");
    expect(proxy).toContain("`hypergen mcp`");
    expect(proxy).toContain("[hypergen mcp]");
    expect(proxy).not.toMatch(/\[(dapi|diffusion) mcp\]/i);
  });

  it.each(CLI_FILES)("%s mentions old names only as @hypergen/dapi imports", (file) => {
    expect(oldNameLines(read(file))).toEqual([]);
  });
});

describe("dev link", () => {
  const devLink = read("apps/cli/scripts/dev-link.mjs");

  it("links only hypergen", () => {
    expect(devLink).toMatch(/const NAMES = \["hypergen"\];/);
  });

  it("uses %LOCALAPPDATA%\\Hypergen\\bin on Windows", () => {
    expect(devLink).toContain('join(local, "Hypergen", "bin")');
  });

  it("uses the same PowerShell env names as cli-windows.ts", () => {
    const windows = read("apps/desktop/src/cli-windows.ts");
    for (const name of ["HYPERGEN_USER_PATH", "HYPERGEN_PATH_BROADCAST"]) {
      expect(devLink).toContain(name);
      expect(windows).toContain(name);
    }
    expect(devLink).not.toMatch(/DAPI_/);
    expect(windows).not.toMatch(/DAPI_/);
  });
});

describe("staged wrappers", () => {
  const stage = read("apps/desktop/scripts/stage-cli.mjs");

  it("stages hypergen.js, bin/hypergen and bin/hypergen.cmd", () => {
    expect(stage).toContain('join(stageDir, "hypergen.js")');
    expect(stage).toContain('join(stageDir, "bin", "hypergen")');
    expect(stage).toContain('join(stageDir, "bin", "hypergen.cmd")');
  });

  it("the POSIX wrapper exports HYPERGEN_APP_PATH and execs Hypergen on macOS and Linux", () => {
    expect(stage).toContain("export HYPERGEN_APP_PATH=");
    expect(stage).toContain('EXE="$DIR/../../../MacOS/Hypergen"');
    expect(stage).toContain('EXE="$HYPERGEN_APP_PATH/Hypergen"');
    expect(stage).toContain('"$DIR/../hypergen.js"');
  });

  it("the Windows wrapper calls Hypergen.exe", () => {
    expect(stage).toContain("Hypergen.exe");
    expect(stage).toContain("..\\\\hypergen.js");
  });
});

describe("no old or third-party names", () => {
  it.each(SCRIPT_FILES)("%s has none", (file) => {
    const text = read(file);
    expect(oldNameLines(text)).toEqual([]);
    expect(text).not.toMatch(THIRD_PARTY);
  });

  it.each(CLI_FILES)("%s has no third-party name", (file) => {
    expect(read(file)).not.toMatch(THIRD_PARTY);
  });
});
