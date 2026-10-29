// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP4 acceptance: the dashboard lost billing, plans, credits, invoices and
 * account, and gained Settings > AI providers backed by `lib/providers.ts`.
 *
 * Source-level guards (no DOM, no network, no desktop app) plus behavioural
 * checks on `lib/providers.ts` with the main bridge mocked, and one with the
 * real bridge in a browser build (no `window.desktop`).
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` does not type-check it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");

/** Drops block and line comments so a guard is not tripped by prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const DELETED = [
  "src/components/dashboard/account-view.tsx",
  "src/components/dashboard/ai-credits-view.tsx",
  "src/components/dashboard/billing-view.tsx",
  "src/components/dashboard/billing-info-view.tsx",
  "src/components/dashboard/invoices-view.tsx",
  "src/components/dashboard/plans-view.tsx",
  "src/components/purchase-success.tsx",
  "src/lib/checkout.ts",
  "src/components/sidebar-left/project-menu/ai-credits-menu.tsx",
  "public/checkout",
];

const TOUCHED = [
  "src/pages/dashboard.tsx",
  "src/components/dashboard/types.ts",
  "src/components/dashboard/shared.tsx",
  "src/components/sidebar-left/project-menu/index.tsx",
  "src/components/dashboard/ai-providers-view.tsx",
  "src/lib/providers.ts",
];

const DEAD_IMPORTS = [
  /from\s+["'][^"']*\/(account|ai-credits|billing|billing-info|invoices|plans)-view["']/,
  /from\s+["'][^"']*purchase-success["']/,
  /from\s+["']@\/lib\/checkout["']/,
  /from\s+["'][^"']*ai-credits-menu["']/,
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("deleted billing / account modules", () => {
  it.each(DELETED)("%s is gone", (rel) => {
    expect(existsSync(join(WEB, ...rel.split("/")))).toBe(false);
  });

  it.each(TOUCHED)("%s imports none of the deleted modules", (rel) => {
    const text = code(read(rel));
    for (const re of DEAD_IMPORTS) expect(text, `${rel} matches ${re}`).not.toMatch(re);
  });

  it("no file under src/ imports a deleted dashboard view or the credits menu", () => {
    // upgrade-dialog.tsx / api.ts (checkout) are owned elsewhere (see report); views and menu are WP4's.
    const VIEW_IMPORTS = DEAD_IMPORTS.filter((re) => !re.source.includes("checkout"));
    const offenders = walk(join(WEB, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => VIEW_IMPORTS.some((re) => re.test(code(readFileSync(f, "utf8")))))
      .map((f) => relative(WEB, f).split(sep).join("/"));
    expect(offenders).toEqual([]);
  }, 30_000);
});

describe("DashboardView type", () => {
  const types = code(read("src/components/dashboard/types.ts"));
  const union = types.match(/export type DashboardView\s*=([^;]+);/)?.[1] ?? "";
  const members = [...union.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);

  it("is declared", () => {
    expect(members.length).toBeGreaterThan(0);
  });

  it.each(["ai-credits", "billing", "account", "templates", "preferences"])("drops '%s'", (v) => {
    expect(members).not.toContain(v);
  });

  it("adds 'ai-providers'", () => {
    expect(members).toContain("ai-providers");
  });

  it.each(["home", "projects", "drafts", "settings", "mcp", "help"])("keeps '%s'", (v) => {
    expect(members).toContain(v);
  });

  it("has no plans/invoices/billing-info member", () => {
    expect(members.filter((m) => /plan|invoice|billing|credit|account/i.test(m))).toEqual([]);
  });
});

describe("pages/dashboard.tsx", () => {
  const dash = code(read("src/pages/dashboard.tsx"));
  const listOf = (name: string) =>
    [...(dash.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map(
      (m) => m[1],
    );

  it("DASHBOARD_VIEWS parses ai-providers and none of the removed views", () => {
    const views = listOf("DASHBOARD_VIEWS");
    expect(views).toContain("ai-providers");
    for (const v of ["ai-credits", "billing", "account", "templates", "preferences"]) expect(views).not.toContain(v);
  });

  it("SETTINGS_VIEWS is exactly settings, ai-providers, mcp, help", () => {
    expect(listOf("SETTINGS_VIEWS")).toEqual(["settings", "ai-providers", "mcp", "help"]);
  });

  it("an unknown or removed ?dashboard= value falls back to home", () => {
    expect(dash).toMatch(/DASHBOARD_VIEWS\.find\(.*\)\s*\?\?\s*["']home["']/);
  });

  it("the Settings nav lists General, AI providers, MCP & CLI, Help in that order", () => {
    const section = dash.match(/<DashboardSidebarSection title="Settings">([\s\S]*?)<\/DashboardSidebarSection>/)?.[1] ?? "";
    const labels = [...section.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["General", "AI providers", "MCP & CLI", "Help"]);
  });

  it("the AI providers nav item opens 'ai-providers'", () => {
    expect(dash).toMatch(/onClick=\{\(\) => setView\("ai-providers"\)\}[^>]*label="AI providers"/);
  });

  it.each(["Account", "AI credits", "Billing", "Plans", "Invoices"])("has no '%s' label", (label) => {
    expect(dash).not.toMatch(new RegExp(`label="${label}"`, "i"));
  });

  it("the sidebar Settings row opens 'settings'", () => {
    expect(dash).toMatch(/<DashboardSidebarUser\s+onClick=\{openSettings\}\s*\/>/);
    const body = dash.match(/const openSettings = \(\) => \{([\s\S]*?)\};/)?.[1] ?? "";
    expect(body).toMatch(/setView\(["']settings["']\)/);
  });

  it.each([
    ["home", /view\(\) === "home"\}>\s*<DashboardHomeView \/>/],
    ["projects and drafts", /view\(\) === "projects" \|\| view\(\) === "drafts"\}>\s*<DashboardProjectsView/],
    ["settings", /view\(\) === "settings"\}>\s*<DashboardSettingsView \/>/],
    ["ai-providers", /view\(\) === "ai-providers"\}>\s*<DashboardAiProvidersView \/>/],
    ["mcp", /view\(\) === "mcp"\}>\s*<DashboardMcpView \/>/],
    ["help", /view\(\) === "help"\}>\s*<DashboardHelpView \/>/],
  ])("still renders the %s view", (_name, re) => {
    expect(dash).toMatch(re);
  });

  it("still renders collections in the projects nav", () => {
    expect(dash).toMatch(/<DashboardSidebarCollections/);
  });

  it.each([
    "src/components/dashboard/home-view.tsx",
    "src/components/dashboard/projects-view.tsx",
    "src/components/dashboard/collections-nav.tsx",
    "src/components/dashboard/mcp-view.tsx",
    "src/components/dashboard/help-view.tsx",
    "src/components/dashboard/settings-view.tsx",
    "src/components/dashboard/ai-providers-view.tsx",
  ])("%s still exists", (rel) => {
    expect(existsSync(join(WEB, ...rel.split("/")))).toBe(true);
  });

  it("has no Match for a removed view", () => {
    expect(dash).not.toMatch(/view\(\) === "(ai-credits|billing|account)"/);
  });
});

describe("shared.tsx keeps only non-billing helpers", () => {
  const shared = code(read("src/components/dashboard/shared.tsx"));

  it.each(["DashboardPlanDetails", "FreePlan", "PaidPlan", "PlanSummary", "DashboardFeatureRow"])(
    "does not define or mention %s",
    (name) => {
      expect(shared).not.toMatch(new RegExp(`\\b${name}\\b`));
    },
  );

  it.each([/@\/lib\/checkout/, /@\/lib\/api["']/, /@\/context\/auth/])("does not import %s", (re) => {
    expect(shared).not.toMatch(re);
  });

  it.each(["DashboardScrollView", "DashboardSurfaceSection", "DashboardDividedStack", "DashboardInfoActionRow"])(
    "still exports %s (used by the AI providers panel)",
    (name) => {
      expect(shared).toMatch(new RegExp(`export function ${name}\\b`));
    },
  );
});

describe("project-menu/index.tsx", () => {
  const menu = code(read("src/components/sidebar-left/project-menu/index.tsx"));

  it("has no AI credits submenu", () => {
    expect(menu).not.toMatch(/AiCreditsMenu|ai-credits|AI credits/i);
  });

  it("does not navigate to a removed dashboard view", () => {
    expect(menu).not.toMatch(/dashboard=(account|billing|ai-credits)/);
  });

  it("Settings opens /?dashboard=settings", () => {
    expect(menu).toMatch(/navigate\(["']\/\?dashboard=settings["']\)/);
  });
});

describe("ai-providers-view.tsx", () => {
  const view = code(read("src/components/dashboard/ai-providers-view.tsx"));

  it("lists Gemini and fal.ai with their key pages", () => {
    expect(view).toMatch(/id:\s*"gemini",\s*name:\s*"Gemini",\s*keyUrl:\s*"https:\/\/aistudio\.google\.com\/apikey"/);
    expect(view).toMatch(/id:\s*"fal",\s*name:\s*"fal\.ai",\s*keyUrl:\s*"https:\/\/fal\.ai\/dashboard\/keys"/);
  });

  it("key URLs are https only", () => {
    const urls = [...view.matchAll(/keyUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
  });

  it("opens the key page with APP_OPEN_EXTERNAL, not window.open or an <a href>", () => {
    expect(view).toMatch(/MAIN_CHANNELS\.APP_OPEN_EXTERNAL,\s*\{\s*url:\s*props\.provider\.keyUrl\s*\}/);
    expect(view).not.toMatch(/window\.open\(/);
    expect(view).not.toMatch(/<a\s[^>]*href=/);
    expect(view).toMatch(/>\s*Get a key\s*</);
  });

  it("a failed open-external is swallowed (no unhandled rejection)", () => {
    expect(view).toMatch(/APP_OPEN_EXTERNAL[\s\S]*?\)\.catch\(/);
  });

  it("the key input is a password field with autocomplete off", () => {
    expect(view).toMatch(/<TextFieldInput[\s\S]*?type="password"/);
    expect(view).toMatch(/autocomplete="off"/);
  });

  it.each(["Save", "Remove", "Test"])("has a %s button", (label) => {
    expect(view).toMatch(new RegExp(`<Button[^>]*>\\s*${label}\\s*</Button>`));
  });

  it("shows 'Saved' / 'Not set' from the status", () => {
    expect(view).toMatch(/props\.saved \? "Saved" : "Not set"/);
    expect(view).toMatch(/keyStatus\(\)/);
  });

  it("clears the input after Save and only after setKey resolves", () => {
    const save = view.match(/const save = \(\) =>([\s\S]*?)\}\);/)?.[1] ?? "";
    expect(save).toMatch(/await setKey\([\s\S]*?\);\s*setDraft\(""\)/);
  });

  it("Save is disabled for an empty or whitespace-only draft", () => {
    expect(view).toMatch(/disabled=\{[^}]*!draft\(\)\.trim\(\)[^}]*\}[^>]*>\s*Save/);
  });

  it("the raw key is never read back: status is only a boolean, the draft only flows into setKey", () => {
    expect(view).toMatch(/saved=\{!!status\(\)\?\.\[provider\.id\]\}/);
    // The draft is never seeded from main, logged, or toasted.
    expect(view).not.toMatch(/setDraft\((?!""\))/);
    expect(view).not.toMatch(/console\.\w+\([^)]*draft/);
    expect(view).not.toMatch(/toast[.\w]*\([^)]*draft\(\)/);
    const draftReads = [...view.matchAll(/draft\(\)/g)].length;
    // value binding, setKey argument, Save disabled check
    expect(draftReads).toBe(3);
  });

  it("Test shows the {ok,error} result in a toast", () => {
    const test = view.match(/const test = \(\) =>([\s\S]*?)\}\);/)?.[1] ?? "";
    expect(test).toMatch(/await testKey\(props\.provider\.id\)/);
    expect(test).toMatch(/if \(result\.ok\) toast\.success\(/);
    expect(test).toMatch(/else toast\.error\(result\.error/);
  });

  it("errors from Save/Remove/Test surface as a toast and re-enable the buttons", () => {
    const run = view.match(/const run = async[\s\S]*?\n {2}\};/)?.[0] ?? "";
    expect(run).toMatch(/catch \(error\)\s*\{\s*toast\.error\(/);
    expect(run).toMatch(/finally\s*\{\s*setBusy\(false\)/);
  });

  it("Save and Remove refetch the status", () => {
    for (const fn of ["save", "remove"]) {
      const body = view.match(new RegExp(`const ${fn} = \\(\\) =>([\\s\\S]*?)\\}\\);`))?.[1] ?? "";
      expect(body, fn).toMatch(/props\.onChange\(\)/);
    }
    expect(view).toMatch(/onChange=\{refetch\}/);
  });

  it("in a browser build it says keys need the desktop app and never calls keyStatus", () => {
    expect(view).toMatch(/when=\{window\.desktop\}/);
    expect(view).toMatch(/fallback=\{<p[^>]*>API keys need the desktop app\.<\/p>\}/);
    expect(view).toMatch(/createResource\(\(\) => \(window\.desktop \? keyStatus\(\) : undefined\)\)/);
  });

  it("has no billing, credits or account wording", () => {
    expect(view).not.toMatch(/credits?|billing|checkout|invoice|plan|sign[- ]in|account/i);
  });
});

describe("lib/providers.ts with a mocked main bridge", () => {
  const call = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    call.mockReset();
    vi.doMock("@/lib/ipc", () => ({ mainBridge: { call } }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/ipc");
  });

  const load = () => import("../src/lib/providers");

  it("exports the eight functions", async () => {
    const mod = await load();
    for (const name of [
      "keyStatus",
      "setKey",
      "removeKey",
      "testKey",
      "falSubmit",
      "falPoll",
      "falCancel",
      "geminiGenerate",
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  const CASES: [string, (m: Awaited<ReturnType<typeof load>>) => Promise<unknown>, string, unknown][] = [
    ["keyStatus", (m) => m.keyStatus(), "providers:keys-status", undefined],
    ["setKey", (m) => m.setKey("gemini", "k-123"), "providers:keys-set", { provider: "gemini", key: "k-123" }],
    ["removeKey", (m) => m.removeKey("fal"), "providers:keys-remove", { provider: "fal" }],
    ["testKey", (m) => m.testKey("fal"), "providers:keys-test", { provider: "fal" }],
    [
      "falSubmit",
      (m) => m.falSubmit("fal-ai/flux/dev", { prompt: "x" }),
      "providers:fal-submit",
      { endpoint: "fal-ai/flux/dev", input: { prompt: "x" } },
    ],
    ["falPoll", (m) => m.falPoll("req-1"), "providers:fal-poll", { requestId: "req-1" }],
    ["falCancel", (m) => m.falCancel("req-1"), "providers:fal-cancel", { requestId: "req-1" }],
    [
      "geminiGenerate",
      (m) => m.geminiGenerate("a cat", []),
      "providers:gemini-generate",
      { prompt: "a cat", media: [] },
    ],
  ];

  it.each(CASES)("%s sends the right channel and payload and returns the reply", async (_n, invoke, channel, payload) => {
    call.mockResolvedValueOnce({ reply: channel });
    const mod = await load();
    await expect(invoke(mod)).resolves.toEqual({ reply: channel });
    expect(call).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith(channel, payload);
  });

  it.each(CASES)("%s maps 'MISSING_KEY: ' to a DapiError with code MISSING_KEY", async (_n, invoke) => {
    call.mockRejectedValueOnce(new Error("MISSING_KEY: Add your fal.ai API key in Hypergen > Settings > AI providers."));
    const mod = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const error = await invoke(mod).catch((e: unknown) => e);
    expect(isDapiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
    expect((error as Error).message).toBe("Add your fal.ai API key in Hypergen > Settings > AI providers.");
  });

  it.each(CASES)("%s passes other errors through as a plain Error with the same message", async (_n, invoke) => {
    call.mockRejectedValueOnce(new Error("fal.ai returned 500"));
    const mod = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const error = await invoke(mod).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isDapiError(error)).toBe(false);
    expect((error as Error).message).toBe("fal.ai returned 500");
  });

  it("maps a non-Error rejection (a bare string) through fromWireError too", async () => {
    call.mockRejectedValueOnce("MISSING_KEY: Add your Gemini API key in Hypergen > Settings > AI providers.");
    const mod = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const error = await mod.geminiGenerate("x", []).catch((e: unknown) => e);
    expect(isDapiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
  });

  it("does not treat MISSING_KEY without the prefix, or mid-message, as a missing key", async () => {
    const { isDapiError } = await import("@hypergen/dapi");
    for (const msg of ["MISSING_KEY", "missing_key: x", "upstream said MISSING_KEY: x", ""]) {
      call.mockRejectedValueOnce(new Error(msg));
      const mod = await load();
      const error = await mod.testKey("gemini").catch((e: unknown) => e);
      expect(isDapiError(error), JSON.stringify(msg)).toBe(false);
      expect((error as Error).message).toBe(msg);
    }
  });

  it("an empty key is forwarded as-is (validation belongs to main)", async () => {
    call.mockResolvedValueOnce(undefined);
    const mod = await load();
    await mod.setKey("fal", "");
    expect(call).toHaveBeenCalledWith("providers:keys-set", { provider: "fal", key: "" });
  });

  it("a cancelled fal job (falCancel) resolves to undefined and does not throw", async () => {
    call.mockResolvedValueOnce(undefined);
    const mod = await load();
    await expect(mod.falCancel("req-gone")).resolves.toBeUndefined();
  });
});

describe("lib/providers.ts in a browser build (no window.desktop)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with a plain Error (not MISSING_KEY) and sends nothing", async () => {
    const mod = await import("../src/lib/providers");
    const { isDapiError } = await import("@hypergen/dapi");
    for (const p of [mod.keyStatus(), mod.setKey("gemini", "k"), mod.falPoll("r")]) {
      const error = await p.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(isDapiError(error)).toBe(false);
      expect((error as Error).message).toMatch(/not running in desktop/);
    }
  });
});

describe("acceptance grep", () => {
  // Mirrors `git grep -nIi "credits\|checkout\|billing\|invoice\|planName" -- apps/web/src/components/dashboard
  // apps/web/src/pages apps/web/src/components/sidebar-left apps/web/public` (binary files skipped like -I).
  const PATTERN = /credits|checkout|billing|invoice|planName/i;
  const ROOTS = ["src/components/dashboard", "src/pages", "src/components/sidebar-left", "public"];
  // The on-screen attribution (HypergenCredits from @/components/credits) is not billing credits.
  const ATTRIBUTION = /HypergenCredits|@\/components\/credits/g;

  it("finds nothing", () => {
    const hits = ROOTS.flatMap((root) => walk(join(WEB, ...root.split("/"))))
      .flatMap((file) => {
        const buf = readFileSync(file);
        if (buf.includes(0)) return [];
        return buf
          .toString("utf8")
          .split(/\r?\n/)
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => PATTERN.test(line.replace(ATTRIBUTION, "")))
          .map(({ i }) => `${relative(WEB, file).split(sep).join("/")}:${i + 1}`);
      });
    expect(hits).toEqual([]);
  });
});

describe("branding", () => {
  it.each(TOUCHED)("%s has no LTX/Lightricks string", (rel) => {
    expect(read(rel)).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});
