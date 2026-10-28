// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP3 acceptance: the web shell opens with no sign-in and carries no
 * Supabase auth, Sentry or analytics. These are source-level guards (no DOM,
 * no network): they read the files WP3 owns and assert on what is and is not
 * in them, plus one behavioural check on `downloadDesktopApp`, which lost its
 * `track` call.
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` (which has no node types)
 * does not type-check it.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");

const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");

/** Drops block and line comments so a guard is not tripped by prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Every file WP3 edited (the deleted ones are checked separately). */
const TOUCHED = [
  "src/app.tsx",
  "src/index.tsx",
  "src/components/dashboard/sidebar.tsx",
  "src/context/render.ts",
  "src/context/index.ts",
  "src/agent-chat/store.ts",
  "src/lib/desktop-app.ts",
  "src/components/canvas/desktop-app-banner.tsx",
  "src/components/dashboard/get-desktop-app.tsx",
  "src/components/dashboard/home-view.tsx",
  "src/components/dashboard/projects-view.tsx",
  "src/components/dashboard/project-card.tsx",
  "src/components/dashboard/help-view.tsx",
  "src/components/sidebar-left/project-menu/help-menu.tsx",
  ".env.example",
  "vite.config.ts",
  "package.json",
];

const DELETED = [
  "src/context/auth.tsx",
  "src/pages/login.tsx",
  "src/pages/auth-callback.tsx",
  "src/lib/supabase.ts",
  "src/components/dev-auth-code-input.tsx",
  "src/hooks/use-avatar.ts",
  "src/lib/analytics.ts",
  "public/auth",
];

/** Import specifiers that only pointed at deleted modules. */
const DEAD_IMPORTS = [
  /from\s+["']@\/context\/auth["']/,
  /from\s+["']@\/lib\/supabase["']/,
  /from\s+["']@\/lib\/analytics["']/,
  /from\s+["']@\/hooks\/use-avatar["']/,
  /from\s+["'][^"']*dev-auth-code-input["']/,
  /from\s+["']@\/pages\/(login|auth-callback)["']/,
  /from\s+["']@sentry\/[^"']+["']/,
  /from\s+["']@supabase\/[^"']+["']/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|html|json|css)$/.test(name) || name.startsWith(".env")) out.push(full);
  }
  return out;
}

/**
 * An analytics event call: `track("event", ...)`. A string-literal first
 * argument keeps local signals named `track` (timeline keyframe rows) out.
 */
const ANALYTICS_CALL = /(^|[^.\w])track\s*\(\s*["'`]/m;

/** Same pattern as the acceptance grep, with a word boundary on sentry (ADR-015). */
const TELEMETRY = /supabase|\bsentry\b|useAuth|@\/lib\/analytics/i;

describe("deleted auth and analytics modules", () => {
  it.each(DELETED)("%s is gone", (rel) => {
    expect(existsSync(join(WEB, ...rel.split("/")))).toBe(false);
  });

  it.each(TOUCHED)("%s imports none of the deleted modules", (rel) => {
    const text = code(read(rel));
    for (const re of DEAD_IMPORTS) expect(text, `${rel} matches ${re}`).not.toMatch(re);
  });

  it("context/index.ts no longer re-exports auth", () => {
    expect(code(read("src/context/index.ts"))).not.toMatch(/['"]\.\/auth['"]/);
  });
});

describe("app.tsx opens straight to the dashboard", () => {
  const app = code(read("src/app.tsx"));

  it.each([
    "AuthProvider",
    "AuthGate",
    "LoginPage",
    "AuthCallbackPage",
    "UpgradeDialog",
    "PurchaseSuccess",
  ])("does not mention %s", (name) => {
    expect(app).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("has no /login, /auth/callback or /checkout route or check", () => {
    expect(app).not.toMatch(/["'`]\/login/);
    expect(app).not.toMatch(/\/auth\/callback/);
    expect(app).not.toMatch(/checkout/i);
  });

  it("routes / to DashboardPage and /projects/*ref to ProjectPage, unwrapped", () => {
    expect(app).toMatch(/<Route\s+path="\/"\s+component=\{DashboardPage\}\s*\/>/);
    expect(app).toMatch(/<Route\s+path="\/projects\/\*ref"\s+component=\{ProjectPage\}\s*\/>/);
    expect(app).toMatch(/<Route\s+path="\*404"\s+component=\{NotFoundPage\}\s*\/>/);
  });

  it("EnvironmentOverlays has no route or auth condition", () => {
    const body = app.match(/function EnvironmentOverlays\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).not.toMatch(/useLocation|pathname|Show\b|auth|user/i);
    expect(body).toMatch(/<ScreenTooSmall\s*\/>/);
    expect(body).toMatch(/<UnsupportedBrowser\s*\/>/);
  });

  it("BootSplash removes #boot-splash on mount, not behind an auth signal", () => {
    const body = app.match(/function BootSplash\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/onMount\(/);
    expect(body).toMatch(/getElementById\(\s*['"]boot-splash['"]\s*\)\??\.remove\(\)/);
    expect(body).not.toMatch(/createEffect|loading|session|user/i);
    // It is still mounted inside the router root.
    expect(app).toMatch(/<BootSplash\s*\/>/);
  });

  it("the boot splash it removes exists in index.html", () => {
    expect(read("index.html")).toMatch(/id=["']boot-splash["']/);
  });
});

describe("index.tsx has no Sentry or analytics bootstrap", () => {
  const index = code(read("src/index.tsx"));

  it("no Sentry import or init", () => {
    expect(index).not.toMatch(/\bsentry\b/i);
  });

  it("no initAnalytics call", () => {
    expect(index).not.toMatch(/initAnalytics|analytics/i);
  });

  it("still renders <App /> into #root", () => {
    expect(index).toMatch(/import App from ['"]\.\/app['"]/);
    expect(index).toMatch(/render\(\s*\(\)\s*=>\s*<App\s*\/>/);
  });
});

describe("DashboardSidebarUser is a plain Settings row", () => {
  const sidebar = code(read("src/components/dashboard/sidebar.tsx"));
  const fn = sidebar.match(/export function DashboardSidebarUser\([\s\S]*?\n\}/)?.[0] ?? "";

  it("exists", () => {
    expect(fn).not.toBe("");
  });

  it("does not use useAuth, planName or useAvatar anywhere in the file", () => {
    expect(sidebar).not.toMatch(/useAuth|planName|useAvatar/);
  });

  it("renders a 'Settings' label with the settings icon", () => {
    expect(fn).toMatch(/>\s*Settings\s*</);
    expect(fn).toMatch(/<Icon\s+name=["']settings["']/);
  });

  it("forwards the onClick prop to a button", () => {
    expect(fn).toMatch(/<button[\s\S]*?onClick=\{props\.onClick\}/);
    expect(sidebar).toMatch(/type DashboardSidebarUserProps\s*=\s*\{[\s\S]*?onClick\??:/);
  });

  it("shows no email, avatar or plan text", () => {
    expect(fn).not.toMatch(/email|avatar|<img|plan/i);
  });

  it("pages/dashboard.tsx still passes only onClick", () => {
    const dash = code(read("src/pages/dashboard.tsx"));
    expect(dash).toMatch(/<DashboardSidebarUser\s+onClick=\{[^}]+\}\s*\/>/);
  });
});

describe("telemetry call sites", () => {
  it.each(TOUCHED.filter((f) => f.startsWith("src/")))("%s has no track(...) call", (rel) => {
    const text = code(read(rel));
    expect(text).not.toMatch(ANALYTICS_CALL);
    expect(text).not.toMatch(/\bimport\s*\{[^}]*\btrack\b[^}]*\}/);
  });

  it("the call matcher ignores local signals named track", () => {
    expect(ANALYTICS_CALL.test("const p = track()?.property;")).toBe(false);
    expect(ANALYTICS_CALL.test("trackProperty(path())")).toBe(false);
    expect(ANALYTICS_CALL.test('track("project_created", { id })')).toBe(true);
    expect(ANALYTICS_CALL.test("  track('export_started')")).toBe(true);
    expect(ANALYTICS_CALL.test("analytics.track('x')")).toBe(false);
  });

  it("render.ts emits no export events", () => {
    const render = code(read("src/context/render.ts"));
    expect(render).not.toMatch(/export_(started|completed|failed|cancelled)/);
  });

  it.each([
    "src/components/dashboard/help-view.tsx",
    "src/components/sidebar-left/project-menu/help-menu.tsx",
  ])("%s no longer reads the user's account but keeps support links", (rel) => {
    const text = code(read(rel));
    expect(text).not.toMatch(/useAuth|user\(\)|\.email|user id|userId|clipboard/i);
    expect(text).toContain("https://github.com/buckleson/hypergen/issues");
    expect(text).toContain("https://github.com/buckleson/hypergen\"");
    expect(text).not.toMatch(/discord|mailto:|diffusion\.studio/i);
  });

  // Acceptance: "every track(...) call and every import of @/lib/analytics is
  // gone" across the whole web app, not just the WP3 files (test files excluded).
  it("no file under apps/web/src calls track(...) or imports @/lib/analytics", () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => {
        const text = code(readFileSync(f, "utf8"));
        return ANALYTICS_CALL.test(text) || /@\/lib\/analytics/.test(text);
      })
      .map((f) => relative(WEB, f).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});

describe("env and build config", () => {
  it(".env.example has no VITE_SUPABASE_* or VITE_API_URL", () => {
    const env = read(".env.example");
    expect(env).not.toMatch(/VITE_SUPABASE_/);
    expect(env).not.toMatch(/VITE_API_URL/);
  });

  it(".env.example still exists (CI copies it)", () => {
    expect(existsSync(join(WEB, ".env.example"))).toBe(true);
  });

  it("vite.config.ts no longer requires Supabase or API env vars", () => {
    const vite = code(read("vite.config.ts"));
    expect(vite).not.toMatch(/VITE_SUPABASE_|VITE_API_URL|supabase|\bsentry\b/i);
  });

  it("vite.config.ts does not throw on a missing env in any mode", () => {
    expect(code(read("vite.config.ts"))).not.toMatch(/throw\s+new\s+Error/);
  });

  it("package.json drops @sentry/solid and @supabase/supabase-js", () => {
    const pkg = JSON.parse(read("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    expect(Object.keys(all).filter((d) => /^@sentry\/|^@supabase\//.test(d))).toEqual([]);
  });

  it("the lockfile's apps/web entry no longer lists them", () => {
    const lock = JSON.parse(readFileSync(join(WEB, "..", "..", "package-lock.json"), "utf8"));
    const entry = lock.packages?.["apps/web"];
    expect(entry).toBeDefined();
    const deps = { ...entry.dependencies, ...entry.devDependencies };
    expect(deps["@sentry/solid"]).toBeUndefined();
    expect(deps["@supabase/supabase-js"]).toBeUndefined();
  });
});

describe("acceptance grep", () => {
  // Mirrors `git grep -nIi "supabase\|sentry\|useAuth\|@/lib/analytics"` with
  // \bsentry\b so FsEntry / getAsEntry do not count (ADR-015), scoped to the
  // WP3 file list. The whole-tree grep is a layer-end gate after WP4/WP5.
  it("finds nothing in the WP3 files (word-bounded sentry)", () => {
    // Narrowed to the WP3 file list per ADR-016; the whole-tree grep gates the last WP4/WP5 subtask.
    const hits = TOUCHED.flatMap((rel) =>
      read(rel)
        .split(/\r?\n/)
        .map((line, i) => ({ rel, i, line }))
        .filter(({ line }) => TELEMETRY.test(line))
        .map(({ rel, i }) => `${rel}:${i + 1}`),
    );
    expect(hits).toEqual([]);
  });

  it("none of the deleted paths exists", () => {
    expect(DELETED.filter((rel) => existsSync(join(WEB, ...rel.split("/"))))).toEqual([]);
  });

  it("the word boundary keeps FsEntry/getAsEntry from matching", () => {
    expect(TELEMETRY.test("type FsEntry = FileSystemEntry")).toBe(false);
    expect(TELEMETRY.test("item.webkitGetAsEntry()")).toBe(false);
    expect(TELEMETRY.test("import * as Sentry from '@sentry/solid'")).toBe(true);
    expect(TELEMETRY.test("Sentry.init({})")).toBe(true);
  });

  it.each(TOUCHED)("%s has no WP3 telemetry hit", (rel) => {
    expect(read(rel)).not.toMatch(TELEMETRY);
  });
});

describe("type check", () => {
  // WP4/WP5 files, plus WP6 genai and WP7 transcribe/listen/captions (p3-packages.json); remove these entries when WP6/WP7 land
  const ALLOWED = [
    /^src\/components\/dashboard\/(account|billing-info|ai-credits|billing|plans)-view\.tsx$/,
    /^src\/components\/dashboard\/shared\.tsx$/,
    /^src\/components\/purchase-success\.tsx$/,
    /^src\/components\/sidebar-left\/project-menu\/ai-credits-menu\.tsx$/,
    /^src\/components\/upgrade-dialog\.tsx$/,
    /^src\/lib\/(api|checkout)\.ts$/,
    /^src\/dapi\/lib\/[^/]+\.ts$/,
    /^src\/dapi\/handlers\/generate\.ts$/,
    /^src\/dapi\/local\/jobs\.ts$/,
    /^src\/components\/genai\/[^/]+\.tsx?$/, // WP6
    /^src\/dapi\/handlers\/(transcribe|listen)\.ts$/, // WP7
    /^src\/engine\/generate\/captions\.tsx$/, // WP7
  ];

  it("tsc reports errors only in WP4/WP5/genai files", () => {
    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    const { stdout } = spawnSync(process.execPath, [tsc, "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"], {
      cwd: WEB,
      encoding: "utf8",
    });
    const files = [...new Set([...stdout.matchAll(/^(.+?)\(\d+,\d+\): error/gm)].map((m) => m[1].replace(/\\/g, "/")))];
    expect(files.filter((f) => !ALLOWED.some((re) => re.test(f)))).toEqual([]);
  }, 300_000);
});

describe("branding", () => {
  it.each(TOUCHED)("%s has no LTX/Lightricks string", (rel) => {
    expect(read(rel)).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});

describe("downloadDesktopApp after losing its track call", () => {
  const toast = vi.fn();
  let clicked: { href: string; download: string }[] = [];

  beforeEach(() => {
    vi.resetModules();
    toast.mockReset();
    clicked = [];
    vi.doMock("somoto", () => ({ toast }));
    vi.stubGlobal("document", {
      createElement: () => {
        const a = { href: "", download: "x", click() { clicked.push({ href: a.href, download: a.download }); }, remove() {} };
        return a;
      },
      body: { appendChild() {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("somoto");
  });

  const load = async (platform: string) => {
    vi.stubGlobal("navigator", { platform });
    return import("../src/lib/desktop-app");
  };

  it("starts the Windows installer download on Win32", async () => {
    const { downloadDesktopApp } = await load("Win32");
    downloadDesktopApp();
    expect(toast).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(1);
    expect(clicked[0].href).toMatch(/x64-Setup\.exe$/);
    expect(clicked[0].download).toBe("");
  });

  it("starts the macOS download on MacIntel", async () => {
    const { downloadDesktopApp } = await load("MacIntel");
    downloadDesktopApp();
    expect(clicked[0].href).toMatch(/arm64\.dmg$/);
  });

  it("explains instead of downloading on an unsupported platform", async () => {
    const { downloadDesktopApp } = await load("Linux x86_64");
    downloadDesktopApp();
    expect(clicked).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
    expect(String(toast.mock.calls[0][0])).toMatch(/macOS and Windows/);
  });

  it("treats an empty platform string as unsupported", async () => {
    const { downloadDesktopApp } = await load("");
    downloadDesktopApp();
    expect(clicked).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
  });

  it("prefers userAgentData.platform over navigator.platform", async () => {
    vi.stubGlobal("navigator", { platform: "Linux", userAgentData: { platform: "Windows" } });
    const { desktopAppPlatform } = await import("../src/lib/desktop-app");
    expect(desktopAppPlatform()).toBe("windows");
  });
});
