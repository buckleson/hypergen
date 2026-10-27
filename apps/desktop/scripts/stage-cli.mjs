/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Stages the hypergen CLI into apps/desktop/cli so electron-forge can ship it
// as an app resource (Contents/Resources/cli, or resources/cli). The staged layout:
//   cli/hypergen.js        bundled CLI (built by apps/cli), self-contained
//   cli/bin/hypergen       macOS/Linux shell wrapper: what Claude Desktop runs
//                          as `hypergen mcp` (registered by mcp-install.ts) and
//                          the file that gets linked into PATH
//   cli/bin/hypergen.cmd   Windows wrapper, relative to the install folder. PATH
//                          and the agents get a shim outside the install folder
//                          instead (src/cli-windows.ts), since Squirrel moves the
//                          app on every update; this one is for running the CLI
//                          straight out of an install.
// Each host stages its own wrapper; `--all` stages both, so a macOS host can
// produce a Windows tree for inspection.

import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(desktopDir, "..", "cli");
const stageDir = join(desktopDir, "cli");

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, "bin"), { recursive: true });

cpSync(join(cliDir, "dist", "index.js"), join(stageDir, "hypergen.js"));

// The wrapper runs the CLI bundle on the app's own Electron binary in Node
// mode, so users need no separate Node install. It resolves symlinks first
// because both Homebrew and the in-app installer link it into PATH. On macOS
// it sits in <bundle>.app/Contents/Resources/cli/bin; on Linux in
// <install>/resources/cli/bin, beside the executable's folder.
const all = process.argv.includes("--all");

const wrapper = `#!/bin/sh
SELF="$0"
while [ -L "$SELF" ]; do
  LINK="$(readlink "$SELF")"
  case "$LINK" in
    /*) SELF="$LINK" ;;
    *) SELF="$(dirname "$SELF")/$LINK" ;;
  esac
done
DIR="$(cd "$(dirname "$SELF")" && pwd)"
if [ "$(uname)" = "Darwin" ]; then
  export HYPERGEN_APP_PATH="$(cd "$DIR/../../../.." && pwd)"
  EXE="$DIR/../../../MacOS/Hypergen"
else
  export HYPERGEN_APP_PATH="$(cd "$DIR/../../.." && pwd)"
  EXE="$HYPERGEN_APP_PATH/Hypergen"
fi
ELECTRON_RUN_AS_NODE=1 exec "$EXE" "$DIR/../hypergen.js" "$@"
`;

if (all || process.platform !== "win32") {
  writeFileSync(join(stageDir, "bin", "hypergen"), wrapper);
  chmodSync(join(stageDir, "bin", "hypergen"), 0o755);
}

// Staged at <install>\resources\cli\bin, three folders below the executable.
const cmdWrapper = [
  "@echo off",
  "setlocal",
  'set "ELECTRON_RUN_AS_NODE=1"',
  '"%~dp0..\\..\\..\\Hypergen.exe" "%~dp0..\\hypergen.js" %*',
  "",
].join("\r\n");

if (all || process.platform === "win32") {
  writeFileSync(join(stageDir, "bin", "hypergen.cmd"), cmdWrapper);
}

console.log(`stage-cli: staged hypergen at ${stageDir}`);
