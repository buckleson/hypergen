/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the `hypergen` server id in agent configs (subtask C / T8):
// entries left behind under the old names are never mistaken for ours, ids
// that merely start with ours are not matched, and the proxy paths we
// recognise are the Hypergen ones on every platform.

import { describe, expect, it } from "vitest";
import { AGENT_TARGETS, SERVER_NAME, readServer, removeServer, runsOurProxy, sameCommand, upsertServer } from "./mcp-config";

const URL = "http://127.0.0.1:3274/mcp";
const BANNED = /ltx|lightricks|diffusion|\bdapi\b/i;

describe("server id", () => {
  it("is hypergen", () => {
    expect(SERVER_NAME).toBe("hypergen");
  });

  it("writes JSON configs under mcpServers.hypergen and nothing else", () => {
    const text = upsertServer(null, "mcpServers", { url: URL });
    expect(JSON.parse(text)).toEqual({ mcpServers: { hypergen: { url: URL } } });
    expect(text).not.toMatch(BANNED);
  });

  it("writes Codex's table as [mcp_servers.hypergen]", () => {
    const text = upsertServer(null, "toml", { url: URL });
    expect(text.startsWith("[mcp_servers.hypergen]\n")).toBe(true);
    expect(text).not.toMatch(BANNED);
  });

  it("does not read an entry left under the old names as ours", () => {
    const json = JSON.stringify({ mcpServers: { diffusion: { url: URL }, dapi: { url: URL }, "Diffusion Studio": { url: URL } } });
    expect(readServer(json, "mcpServers")).toBeNull();
    expect(removeServer(json, "mcpServers")).toBeNull();

    const toml = `[mcp_servers.diffusion]\nurl = "${URL}"\n\n[mcp_servers.dapi]\nurl = "${URL}"\n`;
    expect(readServer(toml, "toml")).toBeNull();
    expect(removeServer(toml, "toml")).toBeNull();
  });

  it("adds ours next to a legacy entry and removes only ours", () => {
    const legacy = { mcpServers: { diffusion: { command: "/Applications/Diffusion Studio.app/x", args: ["mcp"] } } };
    const added = upsertServer(JSON.stringify(legacy), "mcpServers", { url: URL });
    expect(JSON.parse(added).mcpServers).toEqual({ ...legacy.mcpServers, hypergen: { url: URL } });
    expect(JSON.parse(removeServer(added, "mcpServers")!)).toEqual(legacy);
  });

  it("is case sensitive: a Hypergen key someone typed by hand is not ours", () => {
    const json = JSON.stringify({ mcpServers: { Hypergen: { url: URL }, HYPERGEN: { url: URL } } });
    expect(readServer(json, "mcpServers")).toBeNull();
  });

  it("does not treat a TOML table whose name only starts with hypergen as ours", () => {
    const toml = `[mcp_servers.hypergen_old]\nurl = "http://old"\n\n[mcp_servers.hypergen-dev]\nurl = "http://dev"\n`;
    expect(readServer(toml, "toml")).toBeNull();
    const next = upsertServer(toml, "toml", { url: URL });
    expect(next.startsWith(toml)).toBe(true);
    expect(readServer(next, "toml")).toEqual({ url: URL });
    expect(removeServer(next, "toml")).toBe(toml);
  });

  it("does not match a commented-out or indented hypergen header", () => {
    const toml = `# [mcp_servers.hypergen]\n  [mcp_servers.hypergen]\nurl = "${URL}"\n`;
    expect(readServer(toml, "toml")).toBeNull();
  });

  it("reads ours from an empty map, a null map and an array map as nothing", () => {
    expect(readServer("{}", "mcpServers")).toBeNull();
    expect(readServer(JSON.stringify({ mcpServers: null }), "mcpServers")).toBeNull();
    expect(readServer(JSON.stringify({ mcpServers: [{ hypergen: { url: URL } }] }), "mcpServers")).toBeNull();
    expect(readServer(JSON.stringify({ mcpServers: { hypergen: null } }), "mcpServers")).toBeNull();
    expect(readServer(JSON.stringify({ mcpServers: { hypergen: "url" } }), "mcpServers")).toBeNull();
  });
});

describe("our proxy paths", () => {
  it("recognises the macOS bundle path", () => {
    expect(runsOurProxy({ command: "/Applications/Hypergen.app/Contents/Resources/cli/bin/hypergen", args: ["mcp"] })).toBe(true);
  });

  it("recognises a translocated bundle", () => {
    expect(
      runsOurProxy({ command: "/private/var/folders/x/T/AppTranslocation/ABCD/d/Hypergen.app/Contents/Resources/cli/bin/hypergen" }),
    ).toBe(true);
    expect(runsOurProxy({ command: "/private/var/folders/x/AppTranslocation/ABCD/d/Other.app/bin/tool" })).toBe(true);
  });

  it("recognises the Windows shim as an argument to cmd, with backslashes", () => {
    const shim = "C:\\Users\\Ann Lee\\AppData\\Local\\Hypergen\\bin\\hypergen.cmd";
    expect(runsOurProxy({ command: "cmd", args: ["/c", shim, "mcp"] })).toBe(true);
  });

  it("does not claim the old Diffusion Studio paths or names", () => {
    expect(runsOurProxy({ command: "/Applications/Diffusion Studio.app/Contents/Resources/cli/bin/dapi", args: ["mcp"] })).toBe(false);
    expect(runsOurProxy({ command: "cmd", args: ["/c", "C:\\Users\\a\\AppData\\Local\\DiffusionStudio\\bin\\dapi.cmd", "mcp"] })).toBe(false);
  });

  it("does not claim something else the user registered by hand", () => {
    expect(runsOurProxy({ command: "npx", args: ["-y", "some-mcp"] })).toBe(false);
    expect(runsOurProxy({ command: "/usr/local/bin/hypergen-fork", args: ["mcp"] })).toBe(false);
  });

  it("does not claim the lowercase dev binary on its own", () => {
    expect(runsOurProxy({ command: "/opt/homebrew/bin/hypergen", args: ["mcp"] })).toBe(false);
  });

  it("handles an entry with no command and no args", () => {
    expect(runsOurProxy({})).toBe(false);
    expect(runsOurProxy({ url: URL })).toBe(false);
    expect(runsOurProxy({ command: "", args: [] })).toBe(false);
  });

  it("round-trips a Windows shim path with spaces through TOML and JSON", () => {
    const entry = { command: "cmd", args: ["/c", "C:\\Users\\Ann Lee\\AppData\\Local\\Hypergen\\hypergen.cmd", "mcp"] };
    for (const format of ["toml", "mcpServers"] as const) {
      const registered = readServer(upsertServer(null, format, entry), format)!;
      expect(sameCommand(registered, entry)).toBe(true);
      expect(runsOurProxy(registered)).toBe(true);
    }
  });

  it("sees a shim moved from the old name to hypergen.cmd as a different command", () => {
    const old = { command: "cmd", args: ["/c", "C:\\Users\\a\\AppData\\Local\\Hypergen\\dapi.cmd", "mcp"] };
    const now = { command: "cmd", args: ["/c", "C:\\Users\\a\\AppData\\Local\\Hypergen\\hypergen.cmd", "mcp"] };
    expect(sameCommand(old, now)).toBe(false);
    expect(runsOurProxy(old)).toBe(true);
  });
});

describe("branding", () => {
  it("shows no old or third-party names in agent labels", () => {
    for (const target of AGENT_TARGETS) expect(target.label).not.toMatch(BANNED);
  });
});
