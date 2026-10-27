/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the CLI install across platforms: status, install and
// uninstall on Linux, the macOS admin prompt, the unpackaged and unsupported
// cases, and that nothing user-visible carries an old name.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ app: { isPackaged: true } }));
vi.mock("electron", () => electron);
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: vi.fn(() => false),
  lstatSync: vi.fn(() => undefined),
  mkdirSync: vi.fn(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";

import { CLI_LINK_DIR, cliStatus, installCli, linuxLinkPath, uninstallCli } from "./cli-install";

const OLD_NAMES = /diffusion|\bdapi\b|ltx|lightricks/i;

const asLink = () => ({ isSymbolicLink: () => true }) as never;
const asFile = () => ({ isSymbolicLink: () => false }) as never;

function errno(code: string, message = code): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

const platform = process.platform;
const resourcesPath = process.resourcesPath;

function onPlatform(name: NodeJS.Platform, resources: string): void {
  Object.defineProperty(process, "platform", { value: name });
  Object.defineProperty(process, "resourcesPath", { value: resources, configurable: true });
}

beforeEach(() => {
  electron.app.isPackaged = true;
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(lstatSync).mockReturnValue(undefined);
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true });
  vi.clearAllMocks();
});

describe("linuxLinkPath", () => {
  it("defaults to the current user's home", () => {
    expect(linuxLinkPath()).toBe(linuxLinkPath(homedir()));
    expect(linuxLinkPath().startsWith(homedir())).toBe(true);
    expect(linuxLinkPath().endsWith("/.local/bin/hypergen")).toBe(true);
  });

  it("tolerates a trailing slash on home and always uses forward slashes", () => {
    expect(linuxLinkPath("/home/me/")).toBe("/home/me/.local/bin/hypergen");
    expect(linuxLinkPath("/")).toBe("/.local/bin/hypergen");
  });

  it("names only hypergen", () => {
    expect(linuxLinkPath("/home/me")).not.toMatch(OLD_NAMES);
  });
});

describe("linux", () => {
  beforeEach(() => onPlatform("linux", "/opt/Hypergen/resources"));

  it("status: absent reports not installed but available when packaged", async () => {
    await expect(cliStatus()).resolves.toEqual({ installed: false, path: null, managed: false, available: true });
    electron.app.isPackaged = false;
    await expect(cliStatus()).resolves.toEqual({ installed: false, path: null, managed: false, available: false });
  });

  it("status: our symlink is installed and managed", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asLink() : undefined));
    await expect(cliStatus()).resolves.toEqual({
      installed: true,
      path: linuxLinkPath(),
      managed: true,
      available: true,
    });
  });

  it("status: a plain file someone else put there is installed but not managed", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asFile() : undefined));
    vi.mocked(existsSync).mockImplementation((p) => p === linuxLinkPath());
    await expect(cliStatus()).resolves.toMatchObject({ installed: true, managed: false });
  });

  it("status never prompts for a password", async () => {
    await cliStatus();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("install replaces a stale (dangling) link instead of failing with EEXIST", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asLink() : undefined));
    await expect(installCli()).resolves.toEqual({ status: "installed" });
    expect(unlinkSync).toHaveBeenCalledWith(linuxLinkPath());
    const unlinkOrder = vi.mocked(unlinkSync).mock.invocationCallOrder[0];
    const symlinkOrder = vi.mocked(symlinkSync).mock.invocationCallOrder[0];
    expect(unlinkOrder).toBeLessThan(symlinkOrder);
  });

  it("install links the staged hypergen wrapper, not the js bundle", async () => {
    await installCli();
    const [target] = vi.mocked(symlinkSync).mock.calls[0];
    expect(String(target)).toMatch(/^[\\/]opt[\\/]Hypergen[\\/]resources[\\/]cli[\\/]bin[\\/]hypergen$/);
    expect(String(target)).not.toMatch(/\.js$|\.cmd$/);
  });

  it("install reports a filesystem error rather than throwing", async () => {
    vi.mocked(symlinkSync).mockImplementationOnce(() => {
      throw errno("EACCES", "EACCES: permission denied");
    });
    await expect(installCli()).resolves.toEqual({ status: "error", error: "EACCES: permission denied" });
    expect(execFile).not.toHaveBeenCalled();
  });

  it("install reports a mkdir failure (read-only home)", async () => {
    vi.mocked(mkdirSync).mockImplementationOnce(() => {
      throw errno("EROFS", "EROFS: read-only file system");
    });
    await expect(installCli()).resolves.toMatchObject({ status: "error" });
    expect(symlinkSync).not.toHaveBeenCalled();
  });

  it("uninstall when nothing is there is absent", async () => {
    await expect(uninstallCli()).resolves.toEqual({ status: "absent" });
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("uninstall removes our link without an admin prompt", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asLink() : undefined));
    await expect(uninstallCli()).resolves.toEqual({ status: "removed" });
    expect(unlinkSync).toHaveBeenCalledWith(linuxLinkPath());
    expect(execFile).not.toHaveBeenCalled();
  });

  it("uninstall refuses to delete a real file it did not create", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asFile() : undefined));
    vi.mocked(existsSync).mockImplementation((p) => p === linuxLinkPath());
    const result = await uninstallCli();
    expect(result.status).toBe("error");
    expect((result as { error: string }).error).toContain(linuxLinkPath());
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("uninstall reports an unlink failure", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === linuxLinkPath() ? asLink() : undefined));
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      throw errno("EPERM", "EPERM: operation not permitted");
    });
    await expect(uninstallCli()).resolves.toEqual({ status: "error", error: "EPERM: operation not permitted" });
  });
});

describe("darwin", () => {
  beforeEach(() => onPlatform("darwin", "/Applications/Hypergen.app/Contents/Resources"));

  it("install links /usr/local/bin/hypergen to the staged wrapper through the admin prompt", async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: (e: Error | null) => void) =>
      cb(null)) as never);
    await expect(installCli()).resolves.toEqual({ status: "installed" });
    expect(execFile).toHaveBeenCalledTimes(1);
    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe("osascript");
    const script = args.join(" ");
    expect(script).toContain(`${CLI_LINK_DIR}/hypergen`);
    expect(script).toMatch(/Resources[\\/]cli[\\/]bin[\\/]hypergen'/);
    expect(script).toContain("with administrator privileges");
    expect(script).not.toMatch(OLD_NAMES);
  });

  it("install treats a dismissed prompt (-128) as cancelled", async () => {
    vi.mocked(execFile).mockImplementation(((_c: string, _a: string[], cb: (e: Error | null) => void) =>
      cb(new Error("execution error: User canceled. (-128)"))) as never);
    await expect(installCli()).resolves.toEqual({ status: "cancelled" });
  });

  it("install surfaces any other osascript failure as an error", async () => {
    vi.mocked(execFile).mockImplementation(((_c: string, _a: string[], cb: (e: Error | null) => void) =>
      cb(new Error("boom"))) as never);
    await expect(installCli()).resolves.toEqual({ status: "error", error: "boom" });
  });

  it("status finds the packaged link at /usr/local/bin/hypergen", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === "/usr/local/bin/hypergen" ? asLink() : undefined));
    await expect(cliStatus()).resolves.toEqual({
      installed: true,
      path: "/usr/local/bin/hypergen",
      managed: true,
      available: true,
    });
  });

  it("status ignores leftover links under the old names", async () => {
    vi.mocked(lstatSync).mockImplementation((p) =>
      ["/usr/local/bin/dapi", "/usr/local/bin/diffusion", "/opt/homebrew/bin/dapi"].includes(String(p))
        ? asLink()
        : undefined,
    );
    await expect(cliStatus()).resolves.toMatchObject({ installed: false, path: null });
  });

  it("status counts the dev link in Homebrew's bin", async () => {
    vi.mocked(lstatSync).mockImplementation((p) => (p === "/opt/homebrew/bin/hypergen" ? asLink() : undefined));
    await expect(cliStatus()).resolves.toMatchObject({ installed: true, path: "/opt/homebrew/bin/hypergen" });
  });
});

describe("unpackaged and unsupported", () => {
  it("install in development points at npm run link and touches nothing", async () => {
    onPlatform("linux", "/x");
    electron.app.isPackaged = false;
    const result = await installCli();
    expect(result.status).toBe("error");
    expect((result as { error: string }).error).toContain("npm run link");
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(symlinkSync).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("an unsupported platform is reported, not attempted", async () => {
    onPlatform("freebsd", "/x");
    await expect(cliStatus()).resolves.toEqual({ installed: false, path: null, managed: false, available: false });
    const install = await installCli();
    const uninstall = await uninstallCli();
    expect(install).toMatchObject({ status: "error" });
    expect(uninstall).toMatchObject({ status: "error" });
    expect((install as { error: string }).error).toContain("Linux");
    expect(symlinkSync).not.toHaveBeenCalled();
  });

  it("no user-visible message carries an old or third-party name", async () => {
    const messages: string[] = [];
    for (const name of ["freebsd", "linux"] as NodeJS.Platform[]) {
      onPlatform(name, "/x");
      electron.app.isPackaged = name === "freebsd";
      messages.push(JSON.stringify(await installCli()), JSON.stringify(await uninstallCli()));
    }
    for (const message of messages) expect(message).not.toMatch(OLD_NAMES);
  });
});
