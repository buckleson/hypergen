/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Static checks for subtask G (T20-T23, T26): index.html title, social meta
// and boot splash; the sidebars' Hypergen logo and labels; the MCP/CLI view
// and its `cli` icon; the help links; and the icons README. Reads the files as
// text through Vite's `?raw` and lists the icon folder through
// `import.meta.glob` (keys only); renders and runs none of them.

import { describe, expect, it } from 'vitest';

import indexHtml from '../index.html?raw';
import dashboardSidebarSrc from './components/dashboard/sidebar.tsx?raw';
import sidebarLeftSrc from './components/sidebar-left/sidebar-left.tsx?raw';
import projectMenuSrc from './components/sidebar-left/project-menu/index.tsx?raw';
import mcpViewSrc from './components/dashboard/mcp-view.tsx?raw';
import helpViewSrc from './components/dashboard/help-view.tsx?raw';
import helpMenuSrc from './components/sidebar-left/project-menu/help-menu.tsx?raw';
import iconsReadme from './assets/icons/README.md?raw';
import homeViewSrc from './components/dashboard/home-view.tsx?raw';
import dashboardTypesSrc from './components/dashboard/types.ts?raw';
import persistRouteSrc from './lib/persist-route.tsx?raw';
import desktopAppSrc from './lib/desktop-app.ts?raw';

// Lazy glob: only the keys are used, so no SVG is loaded.
const ICON_FILES = Object.keys(import.meta.glob('./assets/icons/*.svg', { query: '?raw', import: 'default' }));
const ICON_NAMES = new Set(ICON_FILES.map((p) => p.replace('./assets/icons/', '').replace(/\.svg$/, '')));

// The approved splash mark (scratchpad splash.txt, text after the first line),
// copied here so the test does not depend on a session-local file.
const SPLASH_PATH =
  'M28.12 27.48 L27.54 28.12 L27.31 28.76 L27.31 35.18 L27.72 36.05 L28.24 36.52 L29.22 36.81 L34.84 36.81 L35.53 36.63 L36.11 36.23 L36.40 35.88 L36.69 35.07 L36.69 28.87 L36.34 27.95 L35.76 27.43 L35.07 27.14 L28.93 27.14Z M28.70 28.24 L29.05 28.06 L34.95 28.06 L35.59 28.53 L35.76 28.87 L35.76 35.07 L35.36 35.65 L34.78 35.88 L29.22 35.88 L28.70 35.71 L28.41 35.42 L28.18 34.84 L28.18 29.11 L28.29 28.70Z M49.14 10.00 L48.38 10.00 L47.86 10.17 L39.29 15.73 L38.19 16.54 L37.62 17.64 L37.56 52.38 L37.91 53.19 L38.37 53.65 L39.06 53.94 L39.82 53.94 L40.45 53.71 L49.66 47.69 L50.06 47.28 L50.53 46.30 L50.53 11.33 L50.29 10.81 L49.89 10.35Z M49.60 18.16 L49.66 46.01 L49.48 46.47 L49.31 46.53 L44.91 43.64 L44.45 43.17 L44.33 42.88 L44.33 21.87 L44.74 21.23Z M48.96 10.93 L49.25 11.04 L49.66 11.62 L49.66 16.95 L44.04 20.59 L43.69 21.06 L43.41 21.87 L43.41 42.88 L43.64 43.58 L44.22 44.27 L48.62 47.23 L39.99 52.90 L39.70 53.02 L39.18 53.02 L38.60 52.55 L38.48 52.26 L38.48 17.99 L38.72 17.41 L39.24 16.89 L48.33 10.98Z M25.05 10.00 L24.30 10.00 L23.78 10.17 L14.75 16.02 L13.94 16.72 L13.47 17.64 L13.42 52.38 L13.82 53.25 L14.34 53.71 L14.92 53.94 L15.73 53.94 L16.37 53.71 L25.57 47.69 L26.09 47.17 L26.50 46.24 L26.50 11.45 L26.21 10.75 L25.57 10.17Z M25.57 18.16 L25.63 45.78 L25.57 46.18 L25.28 46.53 L20.71 43.52 L20.31 42.88 L20.31 21.87 L20.71 21.23Z M24.94 10.93 L25.52 11.39 L25.63 11.79 L25.63 16.89 L24.71 17.58 L20.02 20.59 L19.67 21.00 L19.38 21.69 L19.38 43.00 L19.67 43.69 L20.19 44.27 L24.59 47.17 L15.67 53.02 L15.04 53.02 L14.52 52.61 L14.34 52.26 L14.34 17.93 L14.57 17.41 L15.38 16.72 L24.42 10.93Z';

const TAGLINE = 'Hypergen — The AI video editor built for agents.';

const FILES: Record<string, string> = {
  'index.html': indexHtml,
  'components/dashboard/sidebar.tsx': dashboardSidebarSrc,
  'components/sidebar-left/sidebar-left.tsx': sidebarLeftSrc,
  'components/sidebar-left/project-menu/index.tsx': projectMenuSrc,
  'components/dashboard/mcp-view.tsx': mcpViewSrc,
  'components/dashboard/help-view.tsx': helpViewSrc,
  'components/sidebar-left/project-menu/help-menu.tsx': helpMenuSrc,
  'assets/icons/README.md': iconsReadme,
};

const THIRD_PARTY = /\bltx\b|lightricks/i;

/** Lines matching `pattern`, prefixed with their 1-based number. */
function linesMatching(text: string, pattern: RegExp): string[] {
  return text
    .split(/\r?\n/)
    .map((line, i) => `${i + 1}: ${line}`)
    .filter((line) => pattern.test(line));
}

/** Every literal `<Icon name="...">` in a source file. */
function iconNames(src: string): string[] {
  return [...src.matchAll(/<Icon\s+name=["']([^"']+)["']/g)].map((m) => m[1]);
}

/** `content` of every `<meta {attr}="{key}">` tag. */
function metaContent(html: string, attr: 'property' | 'name', key: string): string[] {
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content="([^"]*)"`, 'g');
  return [...html.matchAll(re)].map((m) => m[1]);
}

describe('every touched file', () => {
  it.each(Object.keys(FILES))('%s loads non-empty', (name) => {
    expect(FILES[name].trim().length).toBeGreaterThan(0);
  });

  it.each(Object.keys(FILES))('%s has no LTX or Lightricks', (name) => {
    expect(linesMatching(FILES[name], THIRD_PARTY)).toEqual([]);
  });

  it.each(Object.keys(FILES))('%s spells the brand Hypergen, not a casing variant', (name) => {
    expect(linesMatching(FILES[name], /\b(HYPERGEN|HyperGen|hyperGen|Hyper Gen)\b/)).toEqual([]);
  });
});

describe('T20 index.html title, social meta and boot splash', () => {
  it('has exactly one <title>, and it is Hypergen', () => {
    const titles = [...indexHtml.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Hypergen']);
  });

  it('og:title and twitter:title are the tagline, each once', () => {
    expect(metaContent(indexHtml, 'property', 'og:title')).toEqual([TAGLINE]);
    expect(metaContent(indexHtml, 'name', 'twitter:title')).toEqual([TAGLINE]);
  });

  it('the tagline uses an em dash, not a hyphen or en dash', () => {
    expect(indexHtml).not.toContain('Hypergen - The AI');
    expect(indexHtml).not.toContain('Hypergen – The AI');
  });

  it('the boot splash has one 64x64 svg with one evenodd currentColor path', () => {
    const splash = indexHtml.match(/<div id="boot-splash"[^>]*>([\s\S]*?)<\/div>/);
    expect(splash).not.toBeNull();
    const svgs = [...splash![1].matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)];
    expect(svgs).toHaveLength(1);
    expect(svgs[0][1]).toContain('viewBox="0 0 64 64"');
    const paths = [...svgs[0][2].matchAll(/<path\b[^>]*\/?>/g)].map((m) => m[0]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/fill-rule="evenodd"/);
    expect(paths[0]).toMatch(/fill="currentColor"/);
    // No other shapes (old logo rects, circles, groups) left in the splash.
    expect(svgs[0][2]).not.toMatch(/<(rect|circle|g|polygon|ellipse|use)\b/);
  });

  it("the splash path's d equals the approved splash path exactly", () => {
    const d = indexHtml.match(/<div id="boot-splash"[\s\S]*?<path\b[^>]*\bd="([^"]*)"/);
    expect(d).not.toBeNull();
    expect(d![1]).toBe(SPLASH_PATH);
  });

  it('the splash path stays inside the 64x64 viewBox and every subpath is closed', () => {
    const nums = SPLASH_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(64);
    }
    const subpaths = SPLASH_PATH.split(/(?=M)/).map((s) => s.trim());
    expect(subpaths.length).toBeGreaterThan(1);
    for (const s of subpaths) expect(s.endsWith('Z')).toBe(true);
  });

  it('the splash is decorative (aria-hidden) so screen readers skip it', () => {
    expect(indexHtml).toMatch(/<div id="boot-splash" aria-hidden="true">/);
  });

  it('grep -i diffusion finds nothing', () => {
    expect(linesMatching(indexHtml, /diffusion/i)).toEqual([]);
  });
});

describe('T21 sidebars use the Hypergen logo; old logos deleted', () => {
  it('dashboard sidebar uses hypergen-logo-large and hypergen-logo', () => {
    const names = iconNames(dashboardSidebarSrc);
    expect(names).toContain('hypergen-logo-large');
    expect(names).toContain('hypergen-logo');
  });

  it('project menu uses hypergen-logo', () => {
    expect(iconNames(projectMenuSrc)).toContain('hypergen-logo');
  });

  it('no touched sidebar file names a diffusion-logo icon', () => {
    for (const src of [dashboardSidebarSrc, sidebarLeftSrc, projectMenuSrc]) {
      expect(src).not.toMatch(/diffusion-logo/);
    }
  });

  it('dashboard sidebar shows the Hypergen label next to both logos', () => {
    expect(dashboardSidebarSrc).toMatch(/hypergen-logo-large[\s\S]{0,400}?>\s*Hypergen\s*</);
    expect(dashboardSidebarSrc).toMatch(/hypergen-logo"[\s\S]{0,400}?>\s*Hypergen\s*</);
  });

  it('left sidebar shows Hypergen in both labels', () => {
    expect(sidebarLeftSrc.match(/>\s*Hypergen\s*</g)).toHaveLength(2);
  });

  it('hypergen-logo.svg and hypergen-logo-large.svg exist', () => {
    expect(ICON_NAMES.has('hypergen-logo')).toBe(true);
    expect(ICON_NAMES.has('hypergen-logo-large')).toBe(true);
  });

  it('diffusion-logo.svg and diffusion-logo-large.svg are deleted', () => {
    expect(ICON_NAMES.has('diffusion-logo')).toBe(false);
    expect(ICON_NAMES.has('diffusion-logo-large')).toBe(false);
  });

  it('grep -i diffusion on the three sidebar files finds nothing', () => {
    for (const src of [dashboardSidebarSrc, sidebarLeftSrc, projectMenuSrc]) {
      expect(linesMatching(src, /diffusion/i)).toEqual([]);
    }
  });
});

describe('T22 MCP/CLI settings view and CLI icon', () => {
  // Apostrophes may be straight or typographic.
  const APOS = "['’]";

  it('MCP card title is Hypergen MCP', () => {
    expect(mcpViewSrc).toMatch(/title="Hypergen MCP"/);
  });

  it("MCP description starts 'Connect to Hypergen's MCP server'", () => {
    expect(mcpViewSrc).toMatch(new RegExp(`Connect to Hypergen${APOS}s MCP server`));
  });

  it("local availability note reads 'Available locally while Hypergen is running.'", () => {
    expect(mcpViewSrc).toContain('Available locally while Hypergen is running.');
  });

  it("CLI card title is 'hypergen CLI' (lowercase command name)", () => {
    expect(mcpViewSrc).toMatch(/title="hypergen CLI"/);
  });

  it("CLI description starts 'Hypergen's command-line tool'", () => {
    expect(mcpViewSrc).toMatch(new RegExp(`Hypergen${APOS}s command-line tool`));
  });

  it("CLI section description starts 'Give agents access to Hypergen'", () => {
    expect(mcpViewSrc).toContain('Give agents access to Hypergen');
  });

  it('install toast tells the user to run hypergen --help', () => {
    expect(mcpViewSrc).toContain('"Run hypergen --help in a terminal to get started."');
  });

  it("CLI uses the 'cli' icon, and every icon name in the view resolves to a file", () => {
    const names = iconNames(mcpViewSrc);
    expect(names).toContain('cli');
    expect(names).not.toContain('dapi-cli');
    for (const name of names) expect(ICON_NAMES.has(name), name).toBe(true);
  });

  it('dapi-cli.svg is renamed to cli.svg', () => {
    expect(ICON_NAMES.has('cli')).toBe(true);
    expect(ICON_NAMES.has('dapi-cli')).toBe(false);
  });

  it('grep -iE "diffusion|dapi" on mcp-view.tsx finds nothing', () => {
    expect(linesMatching(mcpViewSrc, /diffusion|dapi/i)).toEqual([]);
  });
});

describe('T23 help links: issues + website only', () => {
  const HELP = { 'help-view.tsx': helpViewSrc, 'help-menu.tsx': helpMenuSrc };

  it.each(Object.keys(HELP))('%s has no Discord, mailto:support@ or diffusion.studio/updates link', (name) => {
    const src = HELP[name as keyof typeof HELP];
    expect(src).not.toMatch(/discord/i);
    expect(src).not.toMatch(/mailto:/i);
    expect(src).not.toMatch(/diffusion\.studio\/updates/i);
    expect(src).not.toMatch(/What['’]s new/i);
  });

  it('help-view shows Report an issue -> GitHub issues and Website -> the GitHub repo', () => {
    expect(helpViewSrc).toMatch(
      /label="Report an issue"\s+href="https:\/\/github\.com\/buckleson\/hypergen\/issues"/,
    );
    expect(helpViewSrc).toMatch(/label="Website"\s+href="https:\/\/github\.com\/buckleson\/hypergen"/);
  });

  it('help-menu shows Report an issue -> GitHub issues and Website -> the GitHub repo', () => {
    expect(helpMenuSrc).toMatch(
      /href="https:\/\/github\.com\/buckleson\/hypergen\/issues"[^>]*>\s*Report an issue\s*</,
    );
    expect(helpMenuSrc).toMatch(/href="https:\/\/github\.com\/buckleson\/hypergen"[^>]*>\s*Website\s*</);
  });

  it.each(Object.keys(HELP))('%s links only to the issues page and the website, over https, in a new tab', (name) => {
    const src = HELP[name as keyof typeof HELP];
    const urls = [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(['https://github.com/buckleson/hypergen', 'https://github.com/buckleson/hypergen/issues']);
  });

  it('every external link opens in a new tab with rel="noopener noreferrer"', () => {
    const viewLinks = helpViewSrc.match(/<a\s[^>]*>/g) ?? [];
    expect(viewLinks).toHaveLength(1);
    expect(viewLinks[0]).toMatch(/href=\{props\.href\}/);
    expect(viewLinks[0]).toContain('target="_blank"');
    expect(viewLinks[0]).toContain('rel="noopener noreferrer"');
    const menuLinks = helpMenuSrc.match(/<DropdownMenuItem as="a"[^>]*>/g) ?? [];
    expect(menuLinks).toHaveLength(2);
    for (const a of menuLinks) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });

  it('help-view makes the whole row one link whose text is the label', () => {
    const row = helpViewSrc.match(/function DashboardHelpExternalRow[\s\S]*?\n}/)?.[0] ?? '';
    expect(row).toMatch(/<a\s[\s\S]*?\{props\.label\}[\s\S]*?<\/a>/);
    expect(row).not.toMatch(/<div/);
  });

  it('help-view has no commented-out keyboard-shortcuts block', () => {
    expect(helpViewSrc).not.toMatch(/Keyboard shortcuts|\{\/\*/);
  });

  it('mcp-view docs link has rel and the undated connect-local-servers URL', () => {
    expect(mcpViewSrc).toContain('"https://modelcontextprotocol.io/docs/develop/connect-local-servers"');
    expect(mcpViewSrc).toMatch(/<a href=\{MCP_DOCS_URL\}[^>]*rel="noopener noreferrer"/);
  });

  it.each(Object.keys(HELP))('%s has no copy-user-id flow (sign-in is gone)', (name) => {
    const src = HELP[name as keyof typeof HELP];
    expect(src).not.toMatch(/clipboard|Copy user id/);
  });

  it('help-menu lists Report an issue before Website', () => {
    const order = ['Report an issue', 'Website'].map((s) => helpMenuSrc.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('help-menu no longer imports the unused separator', () => {
    expect(helpMenuSrc).not.toMatch(/DropdownMenuSeparator/);
  });

  it.each(Object.keys(HELP))('grep -iE "diffusion|discord|mailto" on %s finds nothing', (name) => {
    expect(linesMatching(HELP[name as keyof typeof HELP], /diffusion|discord|mailto/i)).toEqual([]);
  });
});

describe('T26 icons README and unused project-file icon', () => {
  it('diffusion-project-file.svg is deleted', () => {
    expect(ICON_NAMES.has('diffusion-project-file')).toBe(false);
  });

  it('no icon file name still carries diffusion or dapi', () => {
    expect(ICON_FILES.filter((p) => /diffusion|dapi/i.test(p))).toEqual([]);
  });

  it('README lists `hypergen-logo*` among the brand logos', () => {
    expect(iconsReadme).toMatch(/\*\*Brand logos\*\*[^\n]*`hypergen-logo\*`/);
  });

  it('README has no Figma link left (the Diffusion one is dropped)', () => {
    expect(iconsReadme).not.toMatch(/figma\.com/i);
  });

  it('grep -i diffusion on the README finds nothing', () => {
    expect(linesMatching(iconsReadme, /diffusion/i)).toEqual([]);
  });
});

describe('icon names in the touched components all resolve', () => {
  it.each([
    ['dashboard/sidebar.tsx', dashboardSidebarSrc],
    ['sidebar-left/sidebar-left.tsx', sidebarLeftSrc],
    ['project-menu/index.tsx', projectMenuSrc],
    ['dashboard/mcp-view.tsx', mcpViewSrc],
    ['dashboard/help-view.tsx', helpViewSrc],
  ])('%s', (_name, src) => {
    const missing = iconNames(src).filter((n) => !ICON_NAMES.has(n));
    expect(missing).toEqual([]);
  });
});

describe('web UI cleanup: demo prompts, dead routes, meta', () => {
  it('home-view demo prompts link no third-party video', () => {
    expect(homeViewSrc).not.toMatch(/youtu\.be|youtube\.com/i);
    const prompts = homeViewSrc.match(/const PROMPT_EXAMPLES = \[([\s\S]*?)\];/)?.[1] ?? '';
    expect(prompts).toMatch(/your own|this project|my footage/);
    expect(prompts).not.toMatch(/https?:\/\//);
  });

  it('DashboardView has no templates or preferences, and no Template* types remain', () => {
    expect(dashboardTypesSrc).not.toMatch(/"templates"|"preferences"/);
    expect(dashboardTypesSrc).not.toMatch(/\bTemplate\w*/);
  });

  it('persist-route has no checkout param or /auth/ route handling', () => {
    expect(persistRouteSrc).not.toMatch(/checkout|\/auth\//);
  });

  it('downloadDesktopApp takes no analytics source', () => {
    expect(desktopAppSrc).not.toMatch(/DesktopAppDownloadSource|_source/);
    expect(desktopAppSrc).toContain('export function downloadDesktopApp() {');
  });

  it('meta, og and twitter descriptions are the agent-first copy', () => {
    const copy = 'Hypergen is the AI video editor built for agents. Edit video with Claude Code, Codex and your own words, then finish it by hand.';
    for (const attr of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      expect(indexHtml).toContain(`<meta ${attr} content="${copy}" />`);
    }
  });
});
