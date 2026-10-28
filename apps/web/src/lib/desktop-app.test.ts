/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The desktop-app promo: which installer each platform gets, the label it
// shows, and the Hypergen notice where there is no build. The toast is faked;
// navigator and document are stubbed. No network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.fn();
vi.mock('somoto', () => ({ toast }));

const { desktopAppPlatform, desktopAppPlatformLabel, desktopAppDownloadLabel, downloadDesktopApp } = await import(
  './desktop-app'
);

const RELEASES = 'https://github.com/buckleson/hypergen/releases/latest/download/';

type FakeAnchor = { href: string; download: string | null; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
let anchors: FakeAnchor[];

function stubBrowser(platform: string, uaPlatform?: string) {
  vi.stubGlobal('navigator', uaPlatform === undefined ? { platform } : { platform, userAgentData: { platform: uaPlatform } });
}

beforeEach(() => {
  anchors = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('a');
      const a: FakeAnchor = { href: '', download: null, click: vi.fn(), remove: vi.fn() };
      anchors.push(a);
      return a;
    },
    body: { appendChild: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  toast.mockReset();
});

describe('desktopAppPlatform', () => {
  it.each([
    ['MacIntel', 'macos'],
    ['Win32', 'windows'],
    ['Windows', 'windows'],
    ['Linux x86_64', null],
    ['', null],
  ])('navigator.platform %j is %j', (platform, expected) => {
    stubBrowser(platform);
    expect(desktopAppPlatform()).toBe(expected);
  });

  it('prefers userAgentData.platform over navigator.platform', () => {
    stubBrowser('Linux x86_64', 'Windows');
    expect(desktopAppPlatform()).toBe('windows');
  });

  it('falls back to navigator.platform when userAgentData has no platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: {} });
    expect(desktopAppPlatform()).toBe('macos');
  });
});

describe('labels', () => {
  it('name the platform when there is a build', () => {
    stubBrowser('Win32');
    expect(desktopAppPlatformLabel()).toBe('Windows');
    expect(desktopAppDownloadLabel()).toBe('Download for Windows');
  });

  it('fall back to a generic label where there is none', () => {
    stubBrowser('Linux x86_64');
    expect(desktopAppPlatformLabel()).toBeNull();
    expect(desktopAppDownloadLabel()).toBe('Download desktop app');
  });
});

describe('downloadDesktopApp', () => {
  it('hands macOS the Hypergen arm64 dmg from the hypergen releases', () => {
    stubBrowser('MacIntel');
    downloadDesktopApp();
    expect(anchors).toHaveLength(1);
    expect(anchors[0].href).toBe(`${RELEASES}Hypergen-arm64.dmg`);
    expect(anchors[0].download).toBe('');
    expect(anchors[0].click).toHaveBeenCalledOnce();
    expect(anchors[0].remove).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });

  it('hands Windows the Hypergen x64 setup exe from the hypergen releases', () => {
    stubBrowser('Win32');
    downloadDesktopApp();
    expect(anchors.map((a) => a.href)).toEqual([`${RELEASES}Hypergen-x64-Setup.exe`]);
  });

  it('starts no download elsewhere and explains with a Hypergen notice', () => {
    stubBrowser('Linux x86_64');
    downloadDesktopApp();
    expect(anchors).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
    const [title, options] = toast.mock.calls[0] as [string, { description: string }];
    expect(title).toBe('Available for macOS and Windows');
    expect(options.description).toContain('Open Hypergen on one of those to install it.');
  });

  it('shows no old or third-party name in any user-visible string or URL', () => {
    const seen: string[] = [];
    for (const platform of ['MacIntel', 'Win32', 'Linux x86_64']) {
      stubBrowser(platform);
      seen.push(desktopAppDownloadLabel());
      downloadDesktopApp();
    }
    for (const [title, options] of toast.mock.calls as [string, { description: string }][]) seen.push(title, options.description);
    seen.push(...anchors.map((a) => a.href));
    expect(seen.length).toBeGreaterThan(0);
    for (const text of seen) expect(text).not.toMatch(/diffusion|dspro|\bltx\b|lightricks/i);
  });
});
