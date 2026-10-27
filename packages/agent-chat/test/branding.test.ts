/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The ids the agent chat shows the world — MCP server key, client names,
// env overrides, the paste folder, the system prompt — all say "hypergen".

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { AgentChatClient } from "../src/client";
import { FakeHarness } from "../src/host/fake";
import { chatInstructions, toolTitle } from "../src/host/harness";
import { createAgentHost } from "../src/host/index";
import { resolveBinary } from "../src/host/env";

import type { McpConfig } from "../src/host/harness";
import type { HostEnv } from "../src/host/env";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const repo = resolve(pkg, "..", "..");

const FILES = {
  harness: join(pkg, "src/host/harness.ts"),
  bin: join(pkg, "src/bin.ts"),
  e2e: join(pkg, "test/e2e.test.ts"),
  desktop: join(repo, "apps/desktop/src/agent-chat.ts"),
  codex: join(pkg, "src/host/codex.ts"),
  claude: join(pkg, "src/host/claude.ts"),
  env: join(pkg, "src/host/env.ts"),
  host: join(pkg, "src/host/host.ts"),
};
const read = (path: string) => readFileSync(path, "utf8");

describe("system prompt", () => {
  it("names Hypergen and the hypergen MCP tools", () => {
    const text = chatInstructions("/tmp/proj");
    expect(text).toContain("You are running in Hypergen's chat panel.");
    expect(text).toContain("The `hypergen` MCP tools act on it live");
    expect(text).toContain("`/tmp/proj`");
  });

  it("keeps a Windows path verbatim", () => {
    const cwd = "C:\\Users\\me\\My Project";
    expect(chatInstructions(cwd)).toContain(`\`${cwd}\``);
  });

  it("appends custom instructions after a blank line, and ignores an empty one", () => {
    expect(chatInstructions("/p", "be brief").endsWith("\n\nbe brief")).toBe(true);
    expect(chatInstructions("/p", "")).toBe(chatInstructions("/p"));
  });

  it("leaks no old or upstream brand", () => {
    const text = chatInstructions("/p", "x");
    expect(text).not.toMatch(/diffusion|ltx|lightricks/i);
  });
});

describe("toolTitle", () => {
  it("strips the hypergen MCP prefix", () => {
    expect(toolTitle("mcp__hypergen__capture")).toBe("capture");
    expect(toolTitle("mcp__hypergen__check")).toBe("check");
  });

  it("keeps underscores inside the tool name", () => {
    expect(toolTitle("mcp__hypergen__list_clips")).toBe("list_clips");
  });

  it("strips any server prefix, and leaves plain or malformed names alone", () => {
    expect(toolTitle("mcp__other__thing")).toBe("thing");
    expect(toolTitle("Bash")).toBe("Bash");
    expect(toolTitle("")).toBe("");
    expect(toolTitle("mcp__hypergen__")).toBe("mcp__hypergen__");
  });

  it("documents the hypergen prefix", () => {
    expect(read(FILES.harness)).toContain("`mcp__hypergen__capture`");
  });
});

describe("McpConfig", () => {
  it("is keyed hypergen", () => {
    const config: McpConfig = { name: "hypergen", url: "http://127.0.0.1:1/mcp" };
    // @ts-expect-error the old key no longer type-checks
    const old: McpConfig = { name: "diffusion", url: "x" };
    expect(config.name).toBe("hypergen");
    expect(old).toBeDefined();
    expect(read(FILES.harness)).toMatch(/export type McpConfig = \{ name: "hypergen"; url: string \}/);
  });

  it("is passed as hypergen by the bin, the desktop app and the e2e test", () => {
    for (const file of [FILES.bin, FILES.desktop, FILES.e2e]) {
      expect(read(file), file).toContain('name: "hypergen"');
    }
  });
});

describe("client ids", () => {
  it("codex identifies as hypergen and registers the hypergen MCP server", () => {
    const src = read(FILES.codex);
    expect(src).toContain('const CLIENT_NAME = "hypergen";');
    expect(src).toContain('title: "Hypergen"');
    expect(src).toContain("mcp_servers.hypergen.url=");
  });

  it("claude reports hypergen/<version> as its client app", () => {
    expect(read(FILES.claude)).toContain("CLAUDE_AGENT_SDK_CLIENT_APP: `hypergen/${version}`");
  });
});

describe("binary overrides", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function fakeBinary(name: string): string {
    dir = mkdtempSync(join(tmpdir(), "agent-chat-bin-"));
    const path = join(dir, name);
    writeFileSync(path, "#!/bin/sh\n");
    chmodSync(path, 0o755);
    return path;
  }

  const empty = (env: Record<string, string>): HostEnv => ({ env: { PATH: "", ...env }, extraDirs: [] });

  it.each(["claude", "codex"] as const)("reads HYPERGEN_%s_PATH", (name) => {
    const path = fakeBinary(`my-${name}`);
    expect(resolveBinary(name, empty({ [`HYPERGEN_${name.toUpperCase()}_PATH`]: path }))).toBe(path);
  });

  it("ignores the old DIFFUSION_* override", () => {
    const path = fakeBinary("my-claude");
    expect(resolveBinary("claude", empty({ DIFFUSION_CLAUDE_PATH: path }))).toBeNull();
  });

  it("falls through when the override points at nothing, or at a folder", () => {
    expect(resolveBinary("codex", empty({ HYPERGEN_CODEX_PATH: join(tmpdir(), "no-such-codex-xyz") }))).toBeNull();
    dir = mkdtempSync(join(tmpdir(), "agent-chat-bin-"));
    expect(resolveBinary("codex", empty({ HYPERGEN_CODEX_PATH: dir }))).toBeNull();
    expect(resolveBinary("codex", empty({ HYPERGEN_CODEX_PATH: "" }))).toBeNull();
  });
});

describe("paste folder", () => {
  it("defaults to tmpdir()/hypergen-pasted", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-chat-paste-"));
    const host = await createAgentHost({
      token: "t",
      dataDir,
      mcp: null,
      version: "0.0.0-test",
      harnesses: [new FakeHarness({ tickMs: 1 })],
      allowedOrigins: ["null"],
      log: () => {},
    });
    const client = new AgentChatClient({
      resolveEndpoint: async () => host.url,
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      minBackoffMs: 20,
      maxBackoffMs: 50,
    });
    let uploaded: string | null = null;
    try {
      await new Promise<void>((done, fail) => {
        const stop = client.onState((state) => {
          if (state === "open") {
            stop();
            done();
          }
        });
        client.connect();
        setTimeout(() => fail(new Error("no connection")), 3000);
      });
      const { path } = await client.request("attachments.upload", { name: "shot.png", data: Buffer.from("x").toString("base64") });
      uploaded = path;
      expect(dirname(dirname(path))).toBe(join(tmpdir(), "hypergen-pasted"));
      expect(path).not.toMatch(/diffusion/i);
    } finally {
      client.close();
      await host.stop();
      if (uploaded) rmSync(dirname(uploaded), { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
    expect(read(FILES.host)).toContain('join(tmpdir(), "hypergen-pasted")');
  });
});

describe("branding leaks", () => {
  it.each(Object.entries(FILES))("%s has no diffusion, LTX or Lightricks", (_, file) => {
    expect(read(file)).not.toMatch(/diffusion|\bltx\b|lightricks/i);
  });
});
