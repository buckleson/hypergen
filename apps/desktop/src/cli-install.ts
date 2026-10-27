/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix } from "node:path";
import { addShimToPath, removeShimFromPath, shimOnPath, shimPath, writeShim } from "./cli-windows";

import type { CliInstallResult, CliStatus, CliUninstallResult } from "./main-channels";

export const CLI_LINK_DIR = "/usr/local/bin";

// The dev workflow links the workspace build into Homebrew's bin instead
// (`npm run link` in apps/cli), so that location counts as installed too.
const DEV_LINK_DIR = "/opt/homebrew/bin";

const LINK_NAMES = ["hypergen"] as const;

const linkPaths = (dir: string): string[] => LINK_NAMES.map((name) => `${dir}/${name}`);

/**
 * Whether `path` is a symlink — dangling or not, since a link left behind
 * by a deleted bundle is exactly what removal is for. `existsSync` follows
 * links and would miss that case.
 */
function isLink(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

/** On Linux the link goes in the user's own bin, so installing needs no admin prompt. */
export function linuxLinkPath(home: string = homedir()): string {
  return posix.join(home, ".local", "bin", "hypergen");
}

/** The first of the two locations that holds any of our links, or null. */
function installedDir(): string | null {
  for (const dir of [CLI_LINK_DIR, DEV_LINK_DIR]) {
    if (linkPaths(dir).some((path) => isLink(path) || existsSync(path))) {
      return dir;
    }
  }
  return null;
}

/**
 * Rewrites the Windows shim so it names this executable. Runs on every
 * packaged launch, because an update moved the app to a new folder; the
 * agents' MCP entries point at the shim whether or not it is on PATH.
 */
export function refreshCliShim(): void {
  if (process.platform !== "win32" || !app.isPackaged) return;
  writeShim().catch((e) => console.error("cli shim: could not write", e));
}

async function cliStatusWin32(): Promise<CliStatus> {
  const installed = await shimOnPath().catch(() => false);
  if (installed) {
    return { installed: true, path: shimPath(), managed: true, available: true };
  }
  return { installed: false, path: null, managed: false, available: app.isPackaged };
}

async function cliStatusDarwin(): Promise<CliStatus> {
  const dir = installedDir();
  if (dir) {
    const path = linkPaths(dir).find((candidate) => isLink(candidate) || existsSync(candidate))!;
    return { installed: true, path, managed: isLink(path), available: true };
  }
  return { installed: false, path: null, managed: false, available: app.isPackaged };
}

async function cliStatusLinux(): Promise<CliStatus> {
  const path = linuxLinkPath();
  if (isLink(path) || existsSync(path)) {
    return { installed: true, path, managed: isLink(path), available: true };
  }
  return { installed: false, path: null, managed: false, available: app.isPackaged };
}

/** Where `hypergen` stands on this machine, without asking for a password. */
export async function cliStatus(): Promise<CliStatus> {
  if (process.platform === "win32") return cliStatusWin32();
  if (process.platform === "darwin") return cliStatusDarwin();
  if (process.platform === "linux") return cliStatusLinux();

  return { installed: false, path: null, managed: false, available: false };
}

// The standard macOS admin prompt, for the one shell line that needs it.
function elevated(shell: string): Promise<void> {
  const script = `do shell script "${shell.replaceAll('"', '\\"')}" with administrator privileges`;
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (err) => (err ? reject(err) : resolve()));
  });
}

/** osascript error -128: the user dismissed the prompt. Not an error, not done. */
const cancelled = (e: unknown): boolean => ((e as Error).message ?? "").includes("-128");

async function installCliDarwin(): Promise<CliInstallResult> {
  const wrapper = join(process.resourcesPath, "cli", "bin", "hypergen");
  const links = linkPaths(CLI_LINK_DIR).map((path) => `ln -sf '${wrapper}' '${path}'`).join(" && ");
  try {
    await elevated(`mkdir -p ${CLI_LINK_DIR} && ${links}`);
    return { status: "installed" };
  } catch (e) {
    return cancelled(e) ? { status: "cancelled" } : { status: "error", error: (e as Error).message };
  }
}

async function installCliLinux(): Promise<CliInstallResult> {
  const path = linuxLinkPath();
  try {
    mkdirSync(posix.dirname(path), { recursive: true });
    if (isLink(path)) unlinkSync(path);
    symlinkSync(join(process.resourcesPath, "cli", "bin", "hypergen"), path);
    return { status: "installed" };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

async function installCliWin32(): Promise<CliInstallResult> {
  try {
    await writeShim();
    await addShimToPath();
    return { status: "installed" };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

export async function installCli(): Promise<CliInstallResult> {
  if (!app.isPackaged) {
    return {
      status: "error",
      error: `Installing the CLI is only available in the packaged app. Use \`npm run link\` in apps/cli in development.`,
    };
  }
  if (process.platform === "win32") return installCliWin32();
  if (process.platform === "darwin") return installCliDarwin();
  if (process.platform === "linux") return installCliLinux();

  return {
    status: "error",
    error: `Installing the CLI is only available on Windows, macOS and Linux.`,
  };
}

async function uninstallCliWin32(): Promise<CliUninstallResult> {
  try {
    if (!(await shimOnPath())) return { status: "absent" };
    await removeShimFromPath();
    return { status: "removed" };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

async function uninstallCliDarwin(): Promise<CliUninstallResult> {
  const dir = installedDir();
  if (!dir) return { status: "absent" };
  const present = linkPaths(dir).filter((path) => isLink(path) || existsSync(path));
  const notLinks = present.filter((path) => !isLink(path));
  if (notLinks.length > 0) {
    const is = notLinks.length > 1 ? "are not links" : "is not a link";
    return { status: "error", error: `${notLinks.join(", ")} ${is}, so nothing was removed.` };
  }
  try {
    for (const path of present) unlinkSync(path);
    return { status: "removed" };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "EACCES" && code !== "EPERM") return { status: "error", error: (e as Error).message };
  }
  try {
    await elevated(`rm -f ${present.map((path) => `'${path}'`).join(" ")}`);
    return { status: "removed" };
  } catch (e) {
    return cancelled(e) ? { status: "cancelled" } : { status: "error", error: (e as Error).message };
  }
}

async function uninstallCliLinux(): Promise<CliUninstallResult> {
  const path = linuxLinkPath();
  if (!isLink(path)) {
    return existsSync(path) ? { status: "error", error: `${path} is not a link, so nothing was removed.` } : { status: "absent" };
  }
  try {
    unlinkSync(path);
    return { status: "removed" };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

/** Takes the `hypergen` link off PATH, wherever this platform keeps it. */
export async function uninstallCli(): Promise<CliUninstallResult> {
  if (process.platform === "win32") return uninstallCliWin32();
  if (process.platform === "darwin") return uninstallCliDarwin();
  if (process.platform === "linux") return uninstallCliLinux();

  return {
    status: "error",
    error: `Uninstalling the CLI is only available on Windows, macOS and Linux.`,
  };
}
