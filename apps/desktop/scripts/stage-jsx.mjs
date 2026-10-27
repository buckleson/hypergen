/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Stages the @hypergen/jsx typings into apps/desktop/jsx so electron-forge can
// ship them as an app resource (Contents/Resources/jsx). Scaffolding a project
// copies them into <project>/.hypergen/jsx, where its tsconfig points
// @hypergen/jsx, so a project typechecks without installing the package.
// Only the declarations are staged: the editor supplies the runtime.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsxDir = join(desktopDir, "..", "..", "packages", "jsx");
const distDir = join(jsxDir, "dist");
const stageDir = join(desktopDir, "jsx");
const require = createRequire(join(jsxDir, "package.json"));

rmSync(distDir, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"], {
  cwd: jsxDir,
  stdio: "inherit",
});

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
for (const name of readdirSync(distDir)) {
  if (name.endsWith(".d.ts")) copyFileSync(join(distDir, name), join(stageDir, name));
}

const pkg = JSON.parse(readFileSync(join(jsxDir, "package.json"), "utf8"));
pkg.types = "./index.d.ts";
pkg.exports = {
  ".": { types: "./index.d.ts" },
  "./jsx-runtime": { types: "./jsx-runtime.d.ts" },
  "./jsx-dev-runtime": { types: "./jsx-runtime.d.ts" },
};
delete pkg.files;
delete pkg.scripts;
delete pkg.devDependencies;
delete pkg.publishConfig;
writeFileSync(join(stageDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

console.log(`stage-jsx: staged the jsx typings at ${stageDir}`);
