/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Static checks for the web app's storage namespaces, project-config comments,
// dapi messages, download links, notices, export metadata and
// mask MIME type: all say hypergen, none carry an old
// (diffusion, dspro, `dapi open`) or third-party name. Reads the files as text
// through Vite's `?raw`; runs none of them.

import { describe, expect, it } from 'vitest';

import initSrc from './init.ts?raw';
import hostSrc from './projects/host.ts?raw';
import dbSrc from './lib/db.ts?raw';
import projectConfigSrc from './engine/project-config.ts?raw';
import traitsSrc from './engine/traits.ts?raw';
import editorSrc from './pages/editor.tsx?raw';
import exportInspectorSrc from './components/sidebar-right/inspector/export.tsx?raw';
import sessionSrc from './dapi/session.ts?raw';
import exportHandlerSrc from './dapi/handlers/export.ts?raw';
import mcpSrc from './lib/mcp.ts?raw';
import desktopAppSrc from './lib/desktop-app.ts?raw';
import screenTooSmallSrc from './components/screen-too-small.tsx?raw';
import unsupportedBrowserSrc from './components/unsupported-browser.tsx?raw';
import renderSrc from './context/render.ts?raw';
import maskSrc from '../../../packages/assets/src/mask.ts?raw';

const FILES: Record<string, string> = {
  'init.ts': initSrc,
  'projects/host.ts': hostSrc,
  'lib/db.ts': dbSrc,
  'engine/project-config.ts': projectConfigSrc,
  'engine/traits.ts': traitsSrc,
  'pages/editor.tsx': editorSrc,
  'components/sidebar-right/inspector/export.tsx': exportInspectorSrc,
  'dapi/session.ts': sessionSrc,
  'dapi/handlers/export.ts': exportHandlerSrc,
  'lib/mcp.ts': mcpSrc,
  'lib/desktop-app.ts': desktopAppSrc,
  'components/screen-too-small.tsx': screenTooSmallSrc,
  'components/unsupported-browser.tsx': unsupportedBrowserSrc,
  'context/render.ts': renderSrc,
  'packages/assets/src/mask.ts': maskSrc,
};

const OLD_NAMES = /diffusion|dspro|dapi open/i;
const THIRD_PARTY = /\bltx\b|lightricks/i;

/** Lines matching `pattern`, prefixed with their 1-based number. */
function linesMatching(text: string, pattern: RegExp): string[] {
  return text
    .split(/\r?\n/)
    .map((line, i) => `${i + 1}: ${line}`)
    .filter((line) => pattern.test(line));
}

describe('every touched file', () => {
  it('loads non-empty', () => {
    for (const [name, text] of Object.entries(FILES)) {
      expect(text.length, name).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(FILES))('%s has no diffusion, dspro or `dapi open`', (name) => {
    expect(linesMatching(FILES[name], OLD_NAMES)).toEqual([]);
  });

  it.each(Object.keys(FILES))('%s has no LTX or Lightricks', (name) => {
    expect(linesMatching(FILES[name], THIRD_PARTY)).toEqual([]);
  });
});

describe('T17 web storage namespaces', () => {
  it("init.ts opens the UI store under 'hypergen.ui', and only that one", () => {
    const stores = [...initSrc.matchAll(/new Store\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map((m) => m[1]);
    expect(stores).toEqual(['hypergen.ui']);
  });

  it("host.ts keeps the save folder under 'hypergen:projects-root'", () => {
    expect(hostSrc).toMatch(/const SAVE_FOLDER_STORAGE_KEY = ['"]hypergen:projects-root['"];/);
  });

  it('host.ts touches localStorage only through that key (no old-key migration)', () => {
    const calls = [...hostSrc.matchAll(/localStorage\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[2].trim()).toBe('SAVE_FOLDER_STORAGE_KEY');
  });

  it('host.ts comments name `hypergen open` and the `hypergen` field', () => {
    expect(hostSrc).toContain('`hypergen open <path>`');
    expect(hostSrc).toContain('the `hypergen` field');
  });

  it("db.ts names the database 'hypergen-idb', opens only it, and deletes none", () => {
    expect(dbSrc).toMatch(/const DB_NAME = ['"]hypergen-idb['"];/);
    expect(dbSrc.match(/\bopenDB\s*[<(]/g)).toHaveLength(1);
    expect(dbSrc).toMatch(/\bopenDB\s*<[^>]*>\(\s*DB_NAME\b/);
    expect(dbSrc).not.toMatch(/\bdeleteDB\b/);
  });

  it('db.ts comment says `hypergen open`', () => {
    expect(dbSrc).toContain('`hypergen open <path>`');
  });
});

describe("T18 comments for the 'hypergen' project config field", () => {
  it('project-config.ts refers to the package.json `hypergen` field', () => {
    expect(projectConfigSrc).toMatch(/`hypergen` field of its package\.json/);
  });

  it('traits.ts refers to package.json `hypergen`', () => {
    expect(traitsSrc).toContain('package.json `hypergen` field');
  });

  it('editor.tsx refers to package.json `hypergen`', () => {
    expect(editorSrc).toContain('package.json `hypergen`');
  });

  it('export inspector refers to package.json `hypergen.export.<scene id>`', () => {
    expect(exportInspectorSrc).toContain('package.json `hypergen.export.<scene id>`');
  });
});

describe('T19 dapi user messages', () => {
  it('session.ts no-project error tells the user to run `hypergen open <dir>`', () => {
    expect(sessionSrc).toContain('"No project open — open one first (`hypergen open <dir>`)."');
  });

  it("session.ts keeps the 'no-project' error code", () => {
    expect(sessionSrc).toMatch(/new DapiError\(\s*"no-project"/);
  });

  it('handlers/export.ts comment says `hypergen.export.<id>`', () => {
    expect(exportHandlerSrc).toContain('`hypergen.export.<id>`');
  });

  it('lib/mcp.ts comment says `hypergen` is on PATH', () => {
    expect(mcpSrc).toContain('whether `hypergen` is on PATH');
  });
});

describe('T24 download links and environment notices', () => {
  it('RELEASES points at the hypergen latest-download alias', () => {
    expect(desktopAppSrc).toContain(
      'const RELEASES = "https://github.com/buckleson/hypergen/releases/latest/download/";',
    );
  });

  it('installers are Hypergen-arm64.dmg and Hypergen-x64-Setup.exe', () => {
    expect(desktopAppSrc).toContain('${RELEASES}Hypergen-arm64.dmg');
    expect(desktopAppSrc).toContain('${RELEASES}Hypergen-x64-Setup.exe');
  });

  it('every URL in desktop-app.ts is https on the buckleson/hypergen repo', () => {
    const code = desktopAppSrc.replace(/\/\*[\s\S]*?\*\//g, ''); // drop the MPL header and doc comments
    const urls = code.match(/https?:\/\/[^\s"'`]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('https://github.com/buckleson/hypergen/')).toBe(true);
  });

  it('the unsupported-platform toast names Hypergen', () => {
    expect(desktopAppSrc).toContain('Open Hypergen on one of those to install it.');
  });

  it('screen-too-small notice names Hypergen', () => {
    expect(screenTooSmallSrc).toContain('Hypergen needs at least 720×480 to work properly.');
  });

  it('unsupported-browser notice names Hypergen', () => {
    expect(unsupportedBrowserSrc).toContain('Hypergen requires a Chromium-based browser.');
  });

  it('user-facing copy spells the brand Hypergen, not a casing variant', () => {
    for (const text of [screenTooSmallSrc, unsupportedBrowserSrc, desktopAppSrc]) {
      expect(text).not.toMatch(/\b(HYPERGEN|HyperGen|hyperGen)\b/);
    }
  });
});

describe('T25 export metadata and mask MIME', () => {
  it('render.ts stamps `Made with Hypergen v${version}` into the export', () => {
    expect(renderSrc).toContain('comment: `Made with Hypergen v${version}`');
  });

  it("MASK_MIME_TYPE is 'application/x-hypergen-mask'", () => {
    expect(maskSrc).toMatch(/export const MASK_MIME_TYPE = ['"]application\/x-hypergen-mask['"];/);
  });
});
