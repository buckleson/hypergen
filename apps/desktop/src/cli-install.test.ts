/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { isPackaged: true } }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  lstatSync: vi.fn(() => undefined),
  mkdirSync: vi.fn(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";

import { installCli, linuxLinkPath } from "./cli-install";

describe("linux CLI install", () => {
  const platform = process.platform;
  const resourcesPath = process.resourcesPath;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "resourcesPath", { value: "/opt/Hypergen/resources", configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true });
    vi.clearAllMocks();
  });

  it("links into the user's own bin", () => {
    expect(linuxLinkPath("/home/me")).toBe("/home/me/.local/bin/hypergen");
  });

  it("installs without an admin prompt", async () => {
    await expect(installCli()).resolves.toEqual({ status: "installed" });
    expect(execFile).not.toHaveBeenCalled();
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/\/\.local\/bin$/), { recursive: true });
    expect(symlinkSync).toHaveBeenCalledWith(
      expect.stringMatching(/cli[\\/]bin[\\/]hypergen$/),
      linuxLinkPath(),
    );
  });
});
