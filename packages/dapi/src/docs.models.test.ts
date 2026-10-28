/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Every model id the reference docs use, in a request, a CLI example, a link
// to a model's entry or a voice page's name, is one the catalog has.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "./models";
import { LOCAL_MODEL_IDS } from "./local";

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "reference");
const KNOWN = new Set<string>([...MODEL_IDS, ...LOCAL_MODEL_IDS]);

const pages = (readdirSync(DOCS, { recursive: true }) as string[]).filter((rel) => rel.endsWith(".md"));

const USES = [
  /"model":\s*"([^"]+)"/g,
  /hypergen (?:generate|gen) ([\w.-]+)/g,
  /\[`([\w.-]+)`\]\((?:\.\.?\/)*models\.md/g,
];

describe("reference docs name only catalog models", () => {
  it.each(pages)("%s", (rel) => {
    const text = readFileSync(join(DOCS, rel), "utf8");
    const ids = USES.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1]!));
    for (const id of ids) expect(KNOWN.has(id), `${rel}: ${id}`).toBe(true);
  });

  it("has a voice page only for a catalog model", () => {
    for (const file of readdirSync(join(DOCS, "voices"))) expect(MODEL_IDS as readonly string[]).toContain(file.replace(/\.md$/, ""));
  });
});
