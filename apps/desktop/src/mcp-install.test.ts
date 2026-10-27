/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mcp-install.ts with Electron and the file system faked (subtask C / T8):
// which `hypergen` binary a build registers, and the reasons the settings
// page shows when it cannot.

import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isPackaged: false,
  existing: new Set<string>(),
  files: new Map<string, string>(),
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return state.isPackaged;
    },
    getPath: () => "/fake/appData",
  },
}));

vi.mock("node:os", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:os")>()), homedir: () => "/fake/home" }));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: (path: string) => state.existing.has(path) || state.files.has(path),
  readFileSync: (path: string) => {
    const text = state.files.get(path);
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  },
  writeFileSync: (path: string, text: string) => void state.files.set(path, text),
  mkdirSync: () => undefined,
}));

// The paths under test are macOS ones; build them the way macOS does on any host.
vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return { ...actual.posix, default: actual.posix, posix: actual.posix, win32: actual.win32 };
});

vi.mock("./cli-windows", () => ({ shimPath: () => "C:\\Users\\a\\AppData\\Local\\Hypergen\\bin\\hypergen.cmd" }));

const { applyMcp, dapiBinary, healMcpRegistrations, mcpStatus } = await import("./mcp-install");

const BANNED = /ltx|lightricks|diffusion|\bdapi\b/i;
const platform = process.platform;
const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
const desktopConfig = join("/fake/appData", "Claude/claude_desktop_config.json");

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

function setResources(value: string) {
  Object.defineProperty(process, "resourcesPath", { value, configurable: true, writable: true });
}

beforeEach(() => {
  state.isPackaged = false;
  state.existing.clear();
  state.files.clear();
  setPlatform("darwin");
});

afterEach(() => {
  setPlatform(platform);
  if (resourcesPath !== undefined) setResources(resourcesPath);
});

const claudeDesktop = () => mcpStatus().agents.find((agent) => agent.id === "claude-desktop")!;

describe("the hypergen binary", () => {
  it("is Homebrew's hypergen in a dev build", () => {
    state.existing.add("/opt/homebrew/bin/hypergen");
    expect(dapiBinary()).toBe("/opt/homebrew/bin/hypergen");
  });

  it("is resources/cli/bin/hypergen in a packaged build", () => {
    state.isPackaged = true;
    setResources("/Applications/Hypergen.app/Contents/Resources");
    const expected = join("/Applications/Hypergen.app/Contents/Resources", "cli", "bin", "hypergen");
    state.existing.add(expected);
    expect(dapiBinary()).toBe(expected);
  });

  it("is null when the binary is missing", () => {
    expect(dapiBinary()).toBeNull();
    state.isPackaged = true;
    setResources("/Applications/Hypergen.app/Contents/Resources");
    expect(dapiBinary()).toBeNull();
  });

  it("is the hypergen.cmd shim on Windows, even before a packaged app writes it", () => {
    setPlatform("win32");
    expect(dapiBinary()).toBeNull();
    state.isPackaged = true;
    expect(dapiBinary()).toBe("C:\\Users\\a\\AppData\\Local\\Hypergen\\bin\\hypergen.cmd");
  });

  it("registers Claude Desktop under hypergen with the binary and `mcp`", () => {
    state.existing.add("/opt/homebrew/bin/hypergen");
    const result = applyMcp({ add: ["claude-desktop"], remove: [] });
    expect(result).toEqual({ added: ["claude-desktop"], removed: [], failures: [] });
    const config = JSON.parse(state.files.get(desktopConfig)!);
    expect(config).toEqual({ mcpServers: { hypergen: { command: "/opt/homebrew/bin/hypergen", args: ["mcp"] } } });
  });

  it("registers the Windows shim through cmd /c", () => {
    setPlatform("win32");
    state.isPackaged = true;
    applyMcp({ add: ["claude-desktop"], remove: [] });
    const config = JSON.parse(state.files.get(desktopConfig)!);
    expect(config.mcpServers.hypergen).toEqual({
      command: "cmd",
      args: ["/c", "C:\\Users\\a\\AppData\\Local\\Hypergen\\bin\\hypergen.cmd", "mcp"],
    });
  });
});

describe("unavailable reasons", () => {
  it("names the hypergen command line tool when the build has none", () => {
    expect(claudeDesktop().unavailable).toBe("Needs the hypergen command line tool, which this build does not include.");
  });

  it("asks to move Hypergen to Applications when it runs translocated", () => {
    state.isPackaged = true;
    setResources("/private/var/folders/x/T/AppTranslocation/ABCD/d/Hypergen.app/Contents/Resources");
    state.existing.add(join("/private/var/folders/x/T/AppTranslocation/ABCD/d/Hypergen.app/Contents/Resources", "cli", "bin", "hypergen"));
    expect(claudeDesktop().unavailable).toBe("Move Hypergen to the Applications folder and relaunch it first.");
  });

  it("gives HTTP agents no reason even without a binary", () => {
    for (const agent of mcpStatus().agents) {
      if (agent.id !== "claude-desktop") expect(agent.unavailable).toBeNull();
    }
  });

  it("refuses to register a stdio agent it has no binary for, and writes nothing", () => {
    const result = applyMcp({ add: ["claude-desktop"], remove: [] });
    expect(result.added).toEqual([]);
    expect(result.failures).toEqual([{ id: "claude-desktop", error: "Needs the hypergen command line tool, which this build does not include." }]);
    expect(state.files.size).toBe(0);
  });

  it("reports an unreadable config with its path and keeps going", () => {
    state.files.set(join("/fake/home", ".cursor/mcp.json"), "{ not json");
    const result = applyMcp({ add: ["cursor", "claude-code"], remove: [] });
    expect(result.added).toEqual(["claude-code"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.id).toBe("cursor");
    expect(result.failures[0]!.error.startsWith(".cursor/mcp.json: ")).toBe(true);
  });

  it("leaks no old or third-party names into anything the settings page shows", () => {
    for (const agent of mcpStatus().agents) {
      expect(agent.label).not.toMatch(BANNED);
      expect(agent.unavailable ?? "").not.toMatch(BANNED);
    }
  });
});

describe("healing registrations at launch", () => {
  const packagedBinary = join("/Applications/Hypergen.app/Contents/Resources", "cli", "bin", "hypergen");

  beforeEach(() => {
    state.isPackaged = true;
    setResources("/Applications/Hypergen.app/Contents/Resources");
    state.existing.add(packagedBinary);
  });

  it("rewrites an entry that runs our proxy from a bundle that moved", () => {
    const old = { mcpServers: { hypergen: { command: "/Users/a/Downloads/Hypergen.app/Contents/Resources/cli/bin/hypergen", args: ["mcp"] } } };
    state.files.set(desktopConfig, JSON.stringify(old));
    healMcpRegistrations();
    expect(JSON.parse(state.files.get(desktopConfig)!).mcpServers.hypergen).toEqual({ command: packagedBinary, args: ["mcp"] });
  });

  it("leaves a hand-written entry under our name alone", () => {
    const text = JSON.stringify({ mcpServers: { hypergen: { command: "npx", args: ["-y", "other"] } } });
    state.files.set(desktopConfig, text);
    healMcpRegistrations();
    expect(state.files.get(desktopConfig)).toBe(text);
  });

  it("leaves an old Diffusion Studio entry alone", () => {
    const text = JSON.stringify({ mcpServers: { diffusion: { command: "/Applications/Diffusion Studio.app/x/dapi", args: ["mcp"] } } });
    state.files.set(desktopConfig, text);
    healMcpRegistrations();
    expect(state.files.get(desktopConfig)).toBe(text);
  });

  it("does nothing while running translocated", () => {
    const translocated = "/private/var/folders/x/T/AppTranslocation/A/d/Hypergen.app/Contents/Resources";
    setResources(translocated);
    state.existing.add(join(translocated, "cli", "bin", "hypergen"));
    const text = JSON.stringify({ mcpServers: { hypergen: { command: "/Users/a/Downloads/Hypergen.app/x/hypergen", args: ["mcp"] } } });
    state.files.set(desktopConfig, text);
    healMcpRegistrations();
    expect(state.files.get(desktopConfig)).toBe(text);
  });

  it("does nothing in a dev build", () => {
    state.isPackaged = false;
    const text = JSON.stringify({ mcpServers: { hypergen: { command: "/Users/a/Downloads/Hypergen.app/x/hypergen", args: ["mcp"] } } });
    state.files.set(desktopConfig, text);
    healMcpRegistrations();
    expect(state.files.get(desktopConfig)).toBe(text);
  });
});
