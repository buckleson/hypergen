/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The desktop app loads the UI from file://, where a root-absolute path such
// as "/credits/x.png" points at the drive root. The credit logos must be
// bundled imports so they resolve in both the web and the desktop build.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "components", "credits.tsx");
const credits = readFileSync(src, "utf8");

describe("credits logos", () => {
  it("are imported from the bundled assets, not root-absolute public paths", () => {
    expect(credits).not.toMatch(/["']\/credits\//);
    for (const name of ["hyperox", "buckleson", "pavi"]) {
      expect(credits).toContain(`@/assets/images/credits/${name}.png`);
      expect(existsSync(join(__dirname, "assets", "images", "credits", `${name}.png`))).toBe(true);
    }
  });

  it("link Buckleson and Pavi to their sites, and HyperOx to nothing", () => {
    expect(credits).toMatch(/"Buckleson"[^}]*href: "https:\/\/buckleson\.com"/);
    expect(credits).toMatch(/"Pavi"[^}]*href: "https:\/\/pavi\.tech"/);
    expect(credits).not.toMatch(/"HyperOx"[^}]*href:/);
  });
});
