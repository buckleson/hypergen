/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("electron", () => ({ shell: { openExternal } }));

import { openExternalUrl, routeExternalLinks } from "./external-links";

function fakeContents() {
  let openHandler: ((details: { url: string }) => { action: string }) | undefined;
  let navigate: ((event: { preventDefault: () => void }, url: string) => void) | undefined;
  const contents = {
    setWindowOpenHandler: (h: typeof openHandler) => (openHandler = h),
    on: (name: string, h: typeof navigate) => {
      if (name === "will-navigate") navigate = h;
    },
  };
  routeExternalLinks(contents as never, (url) => url.startsWith("file:"));
  return {
    open: (url: string) => openHandler!({ url }),
    navigate: (url: string) => {
      const event = { preventDefault: vi.fn() };
      navigate!(event, url);
      return event.preventDefault;
    },
  };
}

beforeEach(() => openExternal.mockClear());

describe("window-open handler", () => {
  it("opens http and https URLs externally and denies the window", () => {
    const c = fakeContents();
    expect(c.open("https://example.com/a")).toEqual({ action: "deny" });
    expect(c.open("http://example.com/b")).toEqual({ action: "deny" });
    expect(openExternal.mock.calls).toEqual([["https://example.com/a"], ["http://example.com/b"]]);
  });

  it("denies and never opens other schemes", () => {
    const c = fakeContents();
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "smb://host/share", "ms-settings:", "not a url"]) {
      expect(c.open(url)).toEqual({ action: "deny" });
    }
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("will-navigate", () => {
  it("keeps app URLs in the window", () => {
    const prevent = fakeContents().navigate("file:///app/web/index.html#/x");
    expect(prevent).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("prevents leaving the app and opens web URLs externally", () => {
    const c = fakeContents();
    expect(c.navigate("https://example.com")).toHaveBeenCalled();
    expect(c.navigate("smb://host/share")).toHaveBeenCalled();
    expect(openExternal.mock.calls).toEqual([["https://example.com"]]);
  });
});

describe("openExternalUrl", () => {
  it("only opens http(s) URLs", async () => {
    await openExternalUrl("mailto:a@b.c");
    await openExternalUrl("https://example.com");
    expect(openExternal.mock.calls).toEqual([["https://example.com"]]);
  });
});
