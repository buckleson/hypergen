/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the external-link guard: scheme spoofing, Windows paths,
// empty input, and the main.ts wiring (checked statically, since main.ts
// cannot be imported without starting the app).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("electron", () => ({ shell: { openExternal } }));

import { openExternalUrl, routeExternalLinks } from "./external-links";

type OpenHandler = (details: { url: string }) => { action: string };
type NavHandler = (event: { preventDefault: () => void }, url: string) => void;

function wire(isAppUrl: (url: string) => boolean) {
  let open: OpenHandler | undefined;
  const nav: NavHandler[] = [];
  const contents = {
    setWindowOpenHandler: vi.fn((h: OpenHandler) => (open = h)),
    on: vi.fn((name: string, h: NavHandler) => {
      if (name === "will-navigate") nav.push(h);
    }),
  };
  routeExternalLinks(contents as never, isAppUrl);
  return {
    contents,
    open: (url: string) => open!({ url }),
    navigate: (url: string) => {
      const event = { preventDefault: vi.fn() };
      nav.forEach((h) => h(event, url));
      return event.preventDefault;
    },
  };
}

// Mirrors the isAppUrl predicate main.ts passes in dev mode.
const DEV_URL = "http://localhost:5173";
const devIsApp = (url: string) => url === DEV_URL || url.startsWith(`${DEV_URL}/`);

beforeEach(() => openExternal.mockClear());

describe("openExternalUrl edge cases", () => {
  it.each([
    "",
    " ",
    "https:",
    "//example.com/path",
    "example.com",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "about:blank",
    "chrome://settings",
    "ftp://example.com/file",
    "file://C:/Windows/System32/calc.exe",
    "C:\\Windows\\System32\\calc.exe",
    "\\\\server\\share\\evil.exe",
    "smb://server/share",
    "ms-msdt:/id PCWDiagnostic",
    "search-ms:query=x",
    "x-apple.systempreferences:",
    "tel:+15555550100",
  ])("never opens %j", async (url) => {
    await openExternalUrl(url);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("opens upper-case and mixed-case http(s) schemes", async () => {
    await openExternalUrl("HTTPS://example.com/");
    await openExternalUrl("Http://example.com/");
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it("passes the original URL string through unchanged", async () => {
    const url = "https://example.com/a b?q=1#frag";
    await openExternalUrl(url);
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it("propagates a failure from shell.openExternal to the IPC caller", async () => {
    openExternal.mockRejectedValueOnce(new Error("no browser"));
    await expect(openExternalUrl("https://example.com")).rejects.toThrow("no browser");
  });
});

describe("routeExternalLinks wiring", () => {
  it("installs exactly one window-open handler and one will-navigate listener", () => {
    const { contents } = wire(() => false);
    expect(contents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    expect(contents.on).toHaveBeenCalledTimes(1);
    expect(contents.on.mock.calls[0][0]).toBe("will-navigate");
  });

  it("denies even app URLs from window.open (no child windows at all)", () => {
    const c = wire(() => true);
    expect(c.open("file:///app/index.html")).toEqual({ action: "deny" });
    expect(c.open("")).toEqual({ action: "deny" });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("returns deny synchronously even when openExternal is still pending", () => {
    openExternal.mockImplementationOnce(() => new Promise(() => {}));
    expect(wire(() => false).open("https://example.com")).toEqual({ action: "deny" });
  });
});

describe("will-navigate with the dev-mode app predicate", () => {
  it("keeps the dev server and its routes in the window", () => {
    const c = wire(devIsApp);
    expect(c.navigate(DEV_URL)).not.toHaveBeenCalled();
    expect(c.navigate(`${DEV_URL}/#/editor`)).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it.each(["http://localhost:5173@evil.com/", "http://localhost:51730/", "http://localhost:5174/"])(
    "treats look-alike host %s as external",
    (url) => {
      const c = wire(devIsApp);
      expect(c.navigate(url)).toHaveBeenCalled();
      expect(openExternal).toHaveBeenCalledWith(url);
    },
  );

  it("prevents navigation to non-web schemes without opening them", () => {
    const c = wire(devIsApp);
    for (const url of ["file:///C:/Users/x/secret.txt", "javascript:void(0)", "ms-settings:privacy", "http://localhost:5173.evil.com/"]) {
      expect(c.navigate(url)).toHaveBeenCalled();
    }
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("main.ts uses the guard", () => {
  const main = readFileSync(join(__dirname, "main.ts"), "utf8");

  it("routes links on every BrowserWindow it creates", () => {
    const windows = main.match(/new BrowserWindow\(/g) ?? [];
    const routed = main.match(/routeExternalLinks\(/g) ?? [];
    expect(windows.length).toBeGreaterThan(0);
    expect(routed.length).toBeGreaterThanOrEqual(windows.length);
  });

  it("APP_OPEN_EXTERNAL goes through openExternalUrl, not shell.openExternal", () => {
    expect(main).toMatch(/APP_OPEN_EXTERNAL,[^\n]*openExternalUrl\(/);
    expect(main).not.toMatch(/shell\.openExternal\(/);
  });

  it("runs updateElectronApp only on win32, with a comment saying why", () => {
    const at = main.indexOf("updateElectronApp({");
    expect(at).toBeGreaterThan(0);
    const before = main.slice(Math.max(0, at - 400), at);
    expect(before).toMatch(/process\.platform === "win32"/);
    expect(before).toMatch(/\/\/[^\n]*(mac|Squirrel\.Mac)[^\n]*/i);
    expect((main.match(/updateElectronApp\(/g) ?? []).length).toBe(1);
  });

  it("has no upstream brand in the link guard", () => {
    expect(readFileSync(join(__dirname, "external-links.ts"), "utf8")).not.toMatch(/LTX|Lightricks/i);
  });
});
