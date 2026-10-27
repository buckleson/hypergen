/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the Windows shim and PATH edits: the LOCALAPPDATA fallback,
// that exactly one shim is written, and the env names PowerShell is given.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));
vi.mock("./atomic", () => ({ writeFileAtomic: vi.fn(async () => undefined) }));

import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { win32 } from "node:path";

import { writeFileAtomic } from "./atomic";
import {
  addShimToPath,
  removeShim,
  removeShimFromPath,
  shimContent,
  shimDir,
  shimOnPath,
  shimPath,
  stagedScript,
  writeShim,
  writeUserPath,
} from "./cli-windows";

const OLD_NAMES = /diffusion|\bdapi\b|ltx|lightricks/i;
const local = "C:\\Users\\me\\AppData\\Local";
const dir = `${local}\\Hypergen\\bin`;

type Call = [string, string[], { env: NodeJS.ProcessEnv }, (e: Error | null, out: string) => void];
const calls = () => vi.mocked(execFile).mock.calls as unknown as Call[];

/** Every powershell.exe call answers with `stdout` (the user PATH for reads). */
function powershellReturns(stdout: string): void {
  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => (args[3] as Call[3])(null, stdout)) as never);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("shim location", () => {
  it("falls back to <home>\\AppData\\Local when LOCALAPPDATA is unset or empty", () => {
    const expected = win32.join(homedir(), "AppData", "Local", "Hypergen", "bin");
    expect(shimDir({})).toBe(expected);
    expect(shimDir({ LOCALAPPDATA: "" })).toBe(expected);
    expect(shimPath({})).toBe(win32.join(expected, "hypergen.cmd"));
  });

  it("normalises forward slashes and a trailing separator in LOCALAPPDATA", () => {
    expect(shimPath({ LOCALAPPDATA: "C:/Users/me/AppData/Local/" })).toBe(`${dir}\\hypergen.cmd`);
  });

  it("handles a LOCALAPPDATA with spaces and non-ASCII characters", () => {
    expect(shimPath({ LOCALAPPDATA: "D:\\Users\\Zoë Smith\\AppData\\Local" })).toBe(
      "D:\\Users\\Zoë Smith\\AppData\\Local\\Hypergen\\bin\\hypergen.cmd",
    );
  });

  it("carries no old or third-party name", () => {
    expect(shimPath({ LOCALAPPDATA: local })).not.toMatch(OLD_NAMES);
  });
});

describe("stagedScript", () => {
  it("resolves beside the executable even with forward slashes", () => {
    expect(stagedScript("C:/Program Files/Hypergen/Hypergen.exe")).toBe(
      "C:\\Program Files\\Hypergen\\resources\\cli\\hypergen.js",
    );
  });

  it("works for a UNC install path", () => {
    expect(stagedScript("\\\\server\\share\\Hypergen\\Hypergen.exe")).toBe(
      "\\\\server\\share\\Hypergen\\resources\\cli\\hypergen.js",
    );
  });

  it("is quoted in the shim so spaces in the install folder survive", () => {
    const exe = "C:\\Program Files\\Hypergen\\Hypergen.exe";
    expect(shimContent(exe)).toContain(`"${exe}" "C:\\Program Files\\Hypergen\\resources\\cli\\hypergen.js" %*`);
    expect(shimContent(exe)).not.toMatch(OLD_NAMES);
  });
});

describe("writeShim", () => {
  it("writes exactly one shim, hypergen.cmd, and no old-name shims", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    await writeShim("C:\\Apps\\Hypergen\\Hypergen.exe");
    expect(mkdir).toHaveBeenCalledWith(dir, { recursive: true });
    expect(writeFileAtomic).toHaveBeenCalledTimes(1);
    const [path, text] = vi.mocked(writeFileAtomic).mock.calls[0];
    expect(path).toBe(`${dir}\\hypergen.cmd`);
    expect(text).toContain("C:\\Apps\\Hypergen\\resources\\cli\\hypergen.js");
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("propagates a failed write so the installer can report it", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    vi.mocked(writeFileAtomic).mockRejectedValueOnce(new Error("EBUSY"));
    await expect(writeShim("C:\\a.exe")).rejects.toThrow("EBUSY");
  });

  it("removeShim deletes only the Hypergen bin folder", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    await removeShim();
    expect(rm).toHaveBeenCalledWith(dir, { recursive: true, force: true });
  });
});

describe("user PATH through PowerShell", () => {
  it("passes the new PATH as HYPERGEN_USER_PATH and broadcasts via HYPERGEN_PATH_BROADCAST", async () => {
    powershellReturns("");
    await writeUserPath("C:\\Tools;" + dir);
    expect(calls()).toHaveLength(1);
    const [cmd, args, options] = calls()[0];
    expect(cmd).toBe("powershell.exe");
    expect(options.env.HYPERGEN_USER_PATH).toBe("C:\\Tools;" + dir);
    const script = args[args.length - 1];
    expect(script).toContain("$env:HYPERGEN_USER_PATH");
    expect(script).toContain("'HYPERGEN_PATH_BROADCAST'");
    expect(script).not.toMatch(/DAPI_/);
    expect(Object.keys(options.env).some((key) => /^DAPI_/.test(key))).toBe(false);
  });

  it("writes an empty PATH without crashing", async () => {
    powershellReturns("");
    await writeUserPath("");
    expect(calls()[0][2].env.HYPERGEN_USER_PATH).toBe("");
  });

  it("addShimToPath appends the shim folder to an empty user PATH", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    powershellReturns("");
    await addShimToPath();
    expect(calls()).toHaveLength(2);
    expect(calls()[1][2].env.HYPERGEN_USER_PATH).toBe(dir);
  });

  it("addShimToPath does not rewrite PATH when the folder is already there", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    powershellReturns(`C:\\Tools;${dir.toUpperCase()}\\`);
    await addShimToPath();
    expect(calls()).toHaveLength(1);
  });

  it("removeShimFromPath leaves PATH alone when the folder is absent", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    powershellReturns("C:\\Tools");
    await removeShimFromPath();
    expect(calls()).toHaveLength(1);
  });

  it("shimOnPath ignores an old-name folder on PATH", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    powershellReturns(`${local}\\Diffusion\\bin;${local}\\dapi\\bin`);
    await expect(shimOnPath()).resolves.toBe(false);
  });

  it("shimOnPath rejects when PowerShell is unavailable (offline / locked-down host)", async () => {
    vi.stubEnv("LOCALAPPDATA", local);
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) =>
      (args[3] as Call[3])(new Error("spawn powershell.exe ENOENT"), "")) as never);
    await expect(shimOnPath()).rejects.toThrow("ENOENT");
  });
});
