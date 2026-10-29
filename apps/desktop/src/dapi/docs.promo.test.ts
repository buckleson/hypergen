/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Edge cases for the built-in promo skill: the page, its listing in
// INSTRUCTIONS.md, the pointer from editor.md, and the JSX in its snippets.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { instructions } from "./docs";

const repoDocs = resolve(__dirname, "..", "..", "..", "..", "docs");
const promoPath = join(repoDocs, "skills", "promo.md");
const read = (...p: string[]) => readFileSync(join(repoDocs, ...p), "utf8");
const has = existsSync(promoPath);

const PROMO_ENTRY =
  "- `skills/promo.md` — Product promos, launch videos, explainers and motion graphics: structure, pacing, animated UI mockups, kinetic type, camera, easing. Use for any promo, launch, explainer, ad or motion-graphics video, including when the user only gives a website.";

/** Inline markdown links and images, minus external and in-page ones. */
function relativeLinks(md: string): string[] {
  return [...md.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    .map((m) => m[1]!)
    .filter((l) => !/^[a-z][a-z0-9+.-]*:/i.test(l) && !l.startsWith("#"));
}

/** The bodies of fenced code blocks. */
function fences(md: string): string[] {
  return [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]!);
}

describe.skipIf(!has)("promo.md links", () => {
  const text = has ? readFileSync(promoPath, "utf8") : "";
  const links = relativeLinks(text);

  it("uses only portable forward-slash relative links (no Windows or absolute paths)", () => {
    for (const link of links) {
      expect(link, link).not.toContain("\\");
      expect(link, link).not.toMatch(/^[A-Za-z]:/);
      expect(link, link).not.toMatch(/^\//);
      expect(link, link).not.toMatch(/research-clones|docs\/agents|draft/i);
    }
  });

  it("has no links still relative to the draft's old location", () => {
    // From docs/skills/, "brand/", "reference/" or "guides/" without "../" would miss.
    for (const link of links) expect(link, link).not.toMatch(/^(?:\.\/)?(?:brand|reference|guides|examples)\//);
  });

  it("resolves every link (anchor stripped, decoded) to a file inside docs/", () => {
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const target = resolve(dirname(promoPath), decodeURIComponent(link.split("#")[0]!));
      const rel = relative(repoDocs, target);
      expect(rel.startsWith("..") || rel.includes(`..${sep}`), `${link} escapes docs/`).toBe(false);
      expect(existsSync(target), link).toBe(true);
    }
  });

  it("links to the pages the acceptance names, at their docs/skills-relative paths", () => {
    expect(links).toContain("../guides/motion/easings.md");
    expect(links).toContain("../reference/jsx/html.md");
  });

  it("has no reference-style link definitions pointing at missing files", () => {
    const defs = [...text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map((m) => m[1]!).filter((l) => !/^[a-z]+:/i.test(l));
    for (const d of defs) expect(existsSync(resolve(dirname(promoPath), d.split("#")[0]!)), d).toBe(true);
  });
});

describe.skipIf(!has)("promo.md content", () => {
  const text = has ? readFileSync(promoPath, "utf8") : "";

  it("is non-trivial and starts with a heading", () => {
    expect(text.trim().length).toBeGreaterThan(500);
    expect(text.trimStart().startsWith("# ")).toBe(true);
  });

  it("keeps the closing attribution line as the last line", () => {
    const last = text.trim().split(/\r?\n/).pop()!;
    expect(last).toMatch(/MIT-licensed/);
  });

  it("leaks no upstream branding or internal names (case-insensitive)", () => {
    const banned = new RegExp(["L", "TX|Light", "ricks|Diff", "usion|\\bdapi\\b|dapi://"].join(""), "i");
    expect(text).not.toMatch(banned);
  });

  it("has balanced code fences", () => {
    expect((text.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});

describe.skipIf(!has)("promo.md JSX snippets match the JSX reference", () => {
  const text = has ? readFileSync(promoPath, "utf8") : "";
  const jsxDir = join(repoDocs, "reference", "jsx");
  const reference = existsSync(jsxDir)
    ? readdirSync(jsxDir).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(jsxDir, f), "utf8")).join("\n")
    : "";
  // HTML inside <html> is plain DOM, not Hypergen JSX.
  const domTags = new Set(["span", "div", "button", "p", "img", "svg", "a", "b", "i", "em", "strong"]);
  // Comments may describe DOM content; strip them before scanning.
  const code = fences(text).map((f) => f.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
  const elements = [...code.matchAll(/<([a-z][A-Za-z0-9]*)((?:\s+[A-Za-z][\w-]*(?:=(?:\{[^}]*\}|"[^"]*"))?)*)\s*\/?>/g)]
    .filter((m) => !domTags.has(m[1]!));

  it("finds the JSX elements the snippets use", () => {
    const tags = new Set(elements.map((m) => m[1]));
    for (const t of ["html", "adjustmentLayer", "keyframeTrack", "keyframe"]) expect(tags.has(t), t).toBe(true);
  });

  it("uses only tags the reference documents", () => {
    for (const [, tag] of elements) expect(reference.includes(`<${tag}`), `<${tag}>`).toBe(true);
  });

  it("uses only attributes the reference documents", () => {
    for (const [, tag, attrs] of elements) {
      for (const [, name] of attrs!.matchAll(/([A-Za-z][\w-]*)=/g)) {
        expect(reference.includes(`\`${name}\``) || reference.includes(` ${name}=`), `<${tag} ${name}>`).toBe(true);
      }
    }
  });

  it("animates only props keyframes.md lists as animatable", () => {
    const keyframes = read("reference", "jsx", "keyframes.md");
    const animatable = keyframes.split(/\r?\n/).find((l) => l.startsWith("Animatable props")) ?? "";
    for (const [, prop] of code.matchAll(/<keyframeTrack\s+property="([^"]+)"/g)) {
      expect(animatable.includes(`\`${prop}\``), prop).toBe(true);
    }
  });

  it("imports only from documented packages", () => {
    for (const [, pkg] of code.matchAll(/from\s+"(@hypergen\/[^"]+)"/g)) {
      expect(pkg).toBe("@hypergen/jsx");
    }
    if (code.includes("useTicker")) expect(reference).toContain("useTicker");
  });
});

describe("the repo's skill listing and editor pointer", () => {
  const hasDocs = existsSync(join(repoDocs, "INSTRUCTIONS.md"));

  it.skipIf(!hasDocs)("lists promo.md exactly once, word for word, after the default editor skill", () => {
    const lines = read("INSTRUCTIONS.md").split(/\r?\n/);
    const skillLines = lines.filter((l) => l.startsWith("- `skills/"));
    expect(skillLines.filter((l) => l.includes("skills/promo.md"))).toEqual([PROMO_ENTRY]);
    expect(skillLines[0]).toContain("`skills/editor.md` (the default)");
    expect(skillLines.length).toBe(3);
  });

  it.skipIf(!hasDocs)("passes the promo entry through instructions() unchanged", () => {
    const text = instructions(repoDocs);
    expect(text).toContain(PROMO_ENTRY);
    expect(text).not.toMatch(new RegExp(["L", "TX|Light", "ricks|Diff", "usion"].join(""), "i"));
  });

  it.skipIf(!hasDocs)("every skill page INSTRUCTIONS.md lists is a real file in docs/skills", () => {
    const listed = [...read("INSTRUCTIONS.md").matchAll(/`skills\/([^`]+\.md)`/g)].map((m) => m[1]);
    const onDisk = readdirSync(join(repoDocs, "skills")).filter((f) => f.endsWith(".md"));
    for (const page of listed) expect(onDisk, page).toContain(page);
    // and no skill page is left unlisted
    for (const page of onDisk) expect(listed, page).toContain(page);
  });

  it.skipIf(!hasDocs)("editor.md points at the promo playbook exactly once, with a working link", () => {
    const editor = read("skills", "editor.md");
    const lines = editor.split(/\r?\n/).filter((l) => /promo/i.test(l) && /\]\([^)]*promo\.md\)/.test(l));
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/promo|launch|motion-graphics/);
    for (const link of relativeLinks(lines[0]!)) {
      expect(existsSync(resolve(repoDocs, "skills", link.split("#")[0]!)), link).toBe(true);
    }
  });
});

describe("instructions() with a promo listing in a scratch docs dir", () => {
  const root = mkdtempSync(join(tmpdir(), "hypergen-promo-docs-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("keeps CRLF-authored listings intact apart from trimming", () => {
    const dir = join(root, "crlf");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "INSTRUCTIONS.md"), `Intro.\r\n\r\n${PROMO_ENTRY}\r\n\r\n`);
    const text = instructions(dir);
    expect(text).toContain(PROMO_ENTRY);
    expect(text.startsWith("Intro.")).toBe(true);
  });

  it("names the docs dir even when it contains spaces", () => {
    const dir = join(root, "with space", "docs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "INSTRUCTIONS.md"), PROMO_ENTRY);
    const text = instructions(dir);
    expect(text).toContain(PROMO_ENTRY);
    expect(text).toContain(`\`${dir}\``);
  });

  it("the no-docs fallback names no skill page, promo included", () => {
    const text = instructions(null);
    expect(text).not.toMatch(/skills\/|promo\.md/);
  });
});
