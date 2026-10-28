// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Edge cases for the web UI cleanup: demo prompts, help and MCP links, the
 * dashboard's view list, persist-route, the desktop download call and the
 * deleted dead or old-brand files. Mostly source-level guards; persist-route
 * runs with solid, the router and the store faked. No DOM, no network.
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` (no node types) skips it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");
const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Every non-test source file under src, as a forward-slash path relative to apps/web. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|css|html)$/.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(relative(WEB, full).split(sep).join("/"));
  }
  return out;
}
const SOURCES = sourceFiles();

const HOME = read("src/components/dashboard/home-view.tsx");
const HELP_VIEW = read("src/components/dashboard/help-view.tsx");
const HELP_MENU = read("src/components/sidebar-left/project-menu/help-menu.tsx");
const MCP_VIEW = read("src/components/dashboard/mcp-view.tsx");
const DASHBOARD = read("src/pages/dashboard.tsx");
const TYPES = read("src/components/dashboard/types.ts");
const INDEX_HTML = read("index.html");

const PROMPTS = (() => {
  const body = HOME.match(/const PROMPT_EXAMPLES = \[([\s\S]*?)\];/)?.[1] ?? "";
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
})();

describe("home-view demo prompts", () => {
  it("there is at least one prompt and none is blank", () => {
    expect(PROMPTS.length).toBeGreaterThan(0);
    for (const p of PROMPTS) expect(p.trim().length).toBeGreaterThan(0);
  });

  it("no prompt carries a URL, a bare domain or a youtu.be short link", () => {
    for (const p of PROMPTS) {
      expect(p).not.toMatch(/https?:\/\/|www\.|youtu\.be|youtube\.com|\b[\w-]+\.(com|be|io|net|org)\b/i);
    }
  });

  it("the whole home-view file has no youtu.be or youtube.com link", () => {
    expect(HOME).not.toMatch(/youtu\.be|youtube\.com/i);
  });

  it("the interview prompt about the user's own footage is present", () => {
    expect(PROMPTS).toContain(
      "Pull the best 30-second moment from the interview in this project and make a vertical version for social.",
    );
  });

  it("no prompt names LTX or Lightricks", () => {
    for (const p of PROMPTS) expect(p).not.toMatch(/\bltx\b|lightricks/i);
  });
});

describe("help and MCP external links", () => {
  const anchors = (src: string) => code(src).match(/<(?:a|DropdownMenuItem as="a")\s[^>]*>/g) ?? [];

  it.each([
    ["help-view", HELP_VIEW],
    ["help-menu", HELP_MENU],
    ["mcp-view", MCP_VIEW],
  ])("%s: every anchor with target=_blank has rel=noopener noreferrer", (_n, src) => {
    const blank = anchors(src).filter((a) => a.includes('target="_blank"'));
    expect(blank.length).toBeGreaterThan(0);
    for (const a of blank) expect(a).toContain('rel="noopener noreferrer"');
  });

  it.each([
    ["help-view", HELP_VIEW],
    ["help-menu", HELP_MENU],
    ["mcp-view", MCP_VIEW],
  ])("%s: no plain-http, pavi.tech or diffusion link", (_n, src) => {
    expect(src).not.toMatch(/href="http:\/\//);
    expect(src).not.toMatch(/pavi\.tech|diffusion\.studio/i);
  });

  it("help-view and help-menu point at the same two URLs", () => {
    const urls = (src: string) =>
      [...code(src).matchAll(/https:\/\/github\.com\/buckleson\/hypergen[^"'\s]*/g)].map((m) => m[0]).sort();
    expect(urls(HELP_VIEW)).toEqual(urls(HELP_MENU));
  });

  it("help-view row link has no aria-label that would override its label text", () => {
    const row = HELP_VIEW.match(/function DashboardHelpExternalRow[\s\S]*?\n}/)?.[0] ?? "";
    expect(row).not.toBe("");
    expect(row).not.toMatch(/aria-label=/);
  });

  it("mcp-view has no dated (YYYY-MM-DD) modelcontextprotocol.io URL", () => {
    expect(MCP_VIEW).not.toMatch(/modelcontextprotocol\.io\/[^"']*\d{4}-\d{2}-\d{2}/);
    expect(MCP_VIEW).not.toMatch(/quickstart\/user/);
  });
});

describe("dashboard views", () => {
  const listOf = (name: string) =>
    [...(DASHBOARD.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (m) => m[1],
    );
  const VIEWS = listOf("DASHBOARD_VIEWS");
  const SETTINGS = listOf("SETTINGS_VIEWS");
  const UNION = [...(TYPES.match(/type DashboardView\s*=([^;]*);/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  it("DASHBOARD_VIEWS has neither templates nor preferences", () => {
    expect(VIEWS.length).toBeGreaterThan(0);
    expect(VIEWS).not.toContain("templates");
    expect(VIEWS).not.toContain("preferences");
  });

  it("DASHBOARD_VIEWS and the DashboardView union list the same views, without duplicates", () => {
    expect(new Set(VIEWS).size).toBe(VIEWS.length);
    expect([...VIEWS].sort()).toEqual([...UNION].sort());
  });

  it("SETTINGS_VIEWS is a subset of DASHBOARD_VIEWS", () => {
    for (const v of SETTINGS) expect(VIEWS).toContain(v);
  });

  it("unknown views (templates, preferences, empty) fall back to home", () => {
    expect(VIEWS[0]).toBe("home");
    expect(DASHBOARD).toMatch(/DASHBOARD_VIEWS\.find\(\(v\) => v === raw\) \?\? "home"/);
    // Replays parseView against the parsed list.
    const parseView = (value: string | string[] | undefined) => {
      const raw = Array.isArray(value) ? value[0] : value;
      return VIEWS.find((v) => v === raw) ?? "home";
    };
    for (const bad of ["templates", "preferences", "", undefined, ["templates"], "HOME", "home "]) {
      expect(parseView(bad as string | string[] | undefined)).toBe("home");
    }
    expect(parseView(["mcp", "templates"])).toBe("mcp");
  });

  it("every listed view has a <Match> branch, and none renders templates or preferences", () => {
    for (const v of VIEWS) expect(DASHBOARD).toContain(`view() === "${v}"`);
    expect(DASHBOARD).not.toMatch(/"templates"|"preferences"/);
  });

  it("no source file still navigates to the templates or preferences view or imports Template* types", () => {
    const hits = SOURCES.filter((f) => {
      const src = code(read(f));
      return (
        /setView\(\s*["'](templates|preferences)["']/.test(src) ||
        /dashboard:\s*["'](templates|preferences)["']/.test(src) ||
        /import[^;]*\bTemplate\w*\b[^;]*from\s*["'][^"']*dashboard\/types["']/.test(src)
      );
    });
    expect(hits).toEqual([]);
  });
});

describe("desktop download: no analytics source anywhere", () => {
  it("no source file passes an argument to downloadDesktopApp", () => {
    const hits = SOURCES.flatMap((f) =>
      [...code(read(f)).matchAll(/downloadDesktopApp\(([^)]*)\)/g)]
        .filter((m) => m[1].trim() !== "")
        .map((m) => `${f}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });

  it("no source file mentions DesktopAppDownloadSource", () => {
    expect(SOURCES.filter((f) => read(f).includes("DesktopAppDownloadSource"))).toEqual([]);
  });

  it("downloadDesktopApp declares zero parameters and has at least one caller", () => {
    expect(paramCount(read("src/lib/desktop-app.ts"))).toBe(0);
    const callers = SOURCES.filter((f) => f !== "src/lib/desktop-app.ts" && /downloadDesktopApp\(\)/.test(read(f)));
    expect(callers.length).toBeGreaterThan(0);
  });
});

/** Parameter count of `export function downloadDesktopApp(...)` read from source. */
function paramCount(src: string): number {
  const params = src.match(/export function downloadDesktopApp\(([^)]*)\)/)?.[1];
  if (params === undefined) return -1;
  return params.trim() === "" ? 0 : params.split(",").length;
}

const { store, location } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  location: { pathname: "/", search: "" },
}));
vi.mock("solid-js", () => ({ createEffect: (fn: () => void) => fn() }));
vi.mock("@solidjs/router", () => ({ useLocation: () => location }));
vi.mock("@/init", () => ({
  store: {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => void store.set(k, v),
  },
}));

describe("persist-route (behaviour)", () => {
  beforeEach(() => {
    store.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("source has no checkout param and no /auth/ handling", () => {
    const src = read("src/lib/persist-route.tsx");
    expect(src).not.toMatch(/checkout/i);
    expect(src).not.toMatch(/\/auth\//);
    expect(src).not.toMatch(/sanitizeRoute/);
  });

  it("on desktop saves pathname + search verbatim", async () => {
    vi.stubGlobal("window", { desktop: {}, location: { hash: "" } });
    location.pathname = "/project";
    location.search = "?project=a%20b&dashboard=mcp";
    const { PersistRoute } = await import("@/lib/persist-route");
    expect(PersistRoute()).toBeNull();
    expect(store.get("last-route.v2")).toBe("/project?project=a%20b&dashboard=mcp");
  });

  it("no longer special-cases /auth/ or ?checkout= (they are saved as is)", async () => {
    vi.stubGlobal("window", { desktop: {}, location: { hash: "" } });
    location.pathname = "/auth/callback";
    location.search = "?checkout=success";
    const { PersistRoute } = await import("@/lib/persist-route");
    PersistRoute();
    expect(store.get("last-route.v2")).toBe("/auth/callback?checkout=success");
  });

  it("saves a Windows-style project path in the query untouched", async () => {
    vi.stubGlobal("window", { desktop: {}, location: { hash: "" } });
    location.pathname = "/";
    location.search = "?project=C%3A%5CUsers%5Cme%5Cclip";
    const { PersistRoute } = await import("@/lib/persist-route");
    PersistRoute();
    expect(store.get("last-route.v2")).toBe("/?project=C%3A%5CUsers%5Cme%5Cclip");
  });

  it("in the browser (no window.desktop) saves nothing", async () => {
    vi.stubGlobal("window", { location: { hash: "" } });
    location.pathname = "/project";
    location.search = "";
    const { PersistRoute } = await import("@/lib/persist-route");
    PersistRoute();
    expect(store.has("last-route.v2")).toBe(false);
  });

  it("restoreLastRoute keeps an existing hash, ignores an empty store, else restores", async () => {
    const { restoreLastRoute } = await import("@/lib/persist-route");
    const win = { location: { hash: "#/kept" } };
    vi.stubGlobal("window", win);
    store.set("last-route.v2", "/project");
    restoreLastRoute();
    expect(win.location.hash).toBe("#/kept");

    win.location.hash = "";
    store.clear();
    restoreLastRoute();
    expect(win.location.hash).toBe("");

    store.set("last-route.v2", "/project?dashboard=help");
    restoreLastRoute();
    expect(win.location.hash).toBe("/project?dashboard=help");
  });
});

describe("index.html descriptions", () => {
  const COPY =
    "Hypergen is the AI video editor built for agents. Edit video with Claude Code, Codex and your own words, then finish it by hand.";

  it.each(['name="description"', 'property="og:description"', 'name="twitter:description"'])(
    "%s appears exactly once, with the new copy",
    (attr) => {
      const all = [...INDEX_HTML.matchAll(new RegExp(`<meta\\s+${attr}\\s+content="([^"]*)"`, "g"))].map((m) => m[1]);
      expect(all).toEqual([COPY]);
    },
  );

  it("no description names LTX, Lightricks or Diffusion", () => {
    const descs = [...INDEX_HTML.matchAll(/description"\s+content="([^"]*)"/g)].map((m) => m[1]);
    for (const d of descs) expect(d).not.toMatch(/\bltx\b|lightricks|diffusion/i);
  });
});

describe("dead and old-brand files are gone and unreferenced", () => {
  const DELETED = [
    "vercel.json",
    "public/permission-dialog-header.png",
    "src/assets/images/purchase-success-poster.webp",
    "src/assets/images/placeholder112x63.png",
    "src/assets/images/placeholder232x130.png",
    "src/components/purchase-success.css",
    "src/components/sidebar-left/project-menu/preferences-menu.tsx",
    "src/components/sidebar-left/project-menu/text-menu.tsx",
    "src/components/sidebar-left/project-menu/object-menu.tsx",
    "src/components/sidebar-left/project-menu/timeline-menu.tsx",
    ...[
      "ai-credits",
      "ai-credits-small",
      "billing",
      "upgrade",
      "email",
      "social.google",
      "social.github",
      "large-grok",
      "large-krea",
      "large-minimax",
      "large-openai",
      "large-wan",
    ].map((n) => `src/assets/icons/${n}.svg`),
  ];

  it.each(DELETED)("%s does not exist", (rel) => {
    expect(existsSync(join(WEB, ...rel.split("/")))).toBe(false);
  });

  it("no source file or index.html references a deleted file by name", () => {
    const esc = (t: string) => t.replace(/[.]/g, "\\.");
    const patterns = DELETED.map((rel) => {
      const base = rel.split("/").pop()!;
      if (rel.startsWith("src/assets/icons/")) {
        // Icons are referenced by bare name: <Icon name="x">, icon="x", icon: "x".
        const n = esc(base.replace(/\.svg$/, ""));
        return { rel, re: new RegExp(`(?:name|icon)\\s*[=:]\\s*["']${n}["']|${n}\\.svg`) };
      }
      // Modules by import path tail (with or without extension), assets by file name.
      const stem = esc(base.replace(/\.tsx$/, ""));
      return { rel, re: new RegExp(`[/"']${stem}(?:\\.tsx)?["']|${esc(base)}`) };
    });
    const hits: string[] = [];
    for (const f of [...SOURCES, "index.html"]) {
      const src = code(read(f));
      for (const { rel, re } of patterns) if (re.test(src)) hits.push(`${f} -> ${rel}`);
    }
    expect(hits).toEqual([]);
  });

  it("project-menu still has its live menus", () => {
    for (const m of ["edit-menu", "file-menu", "help-menu", "tool-menu", "view-menu"]) {
      expect(existsSync(join(SRC, "components", "sidebar-left", "project-menu", `${m}.tsx`))).toBe(true);
    }
  });
});
