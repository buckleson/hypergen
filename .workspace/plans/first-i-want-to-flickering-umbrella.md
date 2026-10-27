# Hypergen: full rebrand of the diffusionstudio/editor app (demo tonight)

## Context
The user changed the base app from LTX-Desktop to **diffusionstudio/editor**. It is a SolidJS + Electron 43 video editor:
- compositions are JSX code;
- it has a local MCP server and a CLI;
- an agent chat panel drives the user's own **Claude Code / Codex**.

We clone it and make it **Hypergen**:
- every visible place says Hypergen;
- every feature works;
- no tie to the old company's servers;
- a new public repo with no upstream history;
- free GitHub Actions builds for Windows, macOS and Linux;
- a marketing website **last** (the user sends design links then).

Deadline: about 12 hours, plus a 2-hour buffer. The result must be launch-ready, not a mock.

## User decisions (2026-10-27)
- **Name:** Hypergen everywhere.
  - CLI `hypergen`.
  - MCP id `hypergen`.
  - Protocol `hypergen://`.
  - npm scope `@hypergen/*`.
  - Bundle id `com.buckleson.hypergen`.
- **Icon:** the Hyper-0x "H" mark (`logos/Hyper-0x-logo.png`), recoloured **blue on white, with rounded corners**.
- **Credits:** "Secured by HyperOx" (no link), "Powered by Buckleson" → https://buckleson.com, "Managed by Pavi" → https://pavi.tech. Logos are in `E:\research-clones\logos\`.
- **Repo:** `buckleson/hypergen`, public, a single fresh first commit, upstream `.github` removed, a new README.
- **Builds:** Windows x64, macOS arm64, Linux x64; unsigned; free runners.
- **Cloud parts:** local-first, with user-supplied keys:
  - Remove sign-in, billing, credits, upgrade dialogs, Sentry and analytics.
  - **Transcribe:** local Whisper (transformers.js in the renderer).
  - **Listen:** the user's **Gemini** key.
  - **Generate:** the user's **fal.ai** key.
  - Claude/ChatGPT chat stays as is.
- **No sign-in in the demo.** Firebase sign-in comes in a later phase.
- **JSX library is shipped inside the app.** It is copied into each new project, with no npm publish.

## Fixed constraints
- **MPL-2.0:**
  - Keep `LICENSE`.
  - Keep the 3-line MPL notice in the 710 source files. The notice carries no company name.
  - Replace all of `apps/desktop/assets` (that folder is "all rights reserved").
  - Keep the third-party attributions (stackblitz, shadcn-solid and others).
- **No migration code:** Hypergen is a new app with no existing users, so persisted names (userData, IndexedDB, `.diffusion/`, the project `"diffusion"` field, env vars) are renamed outright (YAGNI).
- **What stays as-is:** the SAM 2.1 weights URLs (`huggingface.co/diffusionstudio/*`). They are network-only and never shown. Mirroring them is an optional later task.
- **Agent records stay outside the product repo** (`E:\research-clones\docs\agents\`), because they name the upstream. The product repo is `E:\research-clones\hypergen\`.

## Codebase map (from the 3 explore agents)
- **Workspace:** npm workspaces, Node 20, `patch-package` postinstall.
  - `apps/web` is the Solid/Vite UI, also the desktop renderer.
  - `apps/desktop` is the Electron Forge shell (MCP server `127.0.0.1:3274/mcp`, tray, CLI/MCP installers, agent-chat host).
  - `apps/cli` is `diffusion`/`dapi`.
  - `packages/` holds runtime, reconciler, jsx, assets, encoder, dapi (tool catalog), agent-chat, koota-solid, sam2.
- **External npm dependency:** `@diffusionstudio/api-contract` (tRPC types, `MODEL_IDS`, analytics events) → **remove**. Vendor only the types still used into `packages/dapi`.
- **Backend ties to cut:**
  - `apps/web/src/lib/api.ts` (tRPC `api.diffusion.studio`)
  - `context/auth.tsx`, `pages/login.tsx`, `AuthGate` in `app.tsx` (Supabase)
  - `lib/checkout.ts`, billing/plans/credits views, `upgrade-dialog.tsx`, `purchase-success.tsx`
  - Sentry in `index.tsx`
  - `lib/analytics.ts`, `apps/desktop/src/analytics.ts`
  - `dapi/lib/remote.ts` (`requireSignIn`), `lib/jobs.ts`
  - handlers `transcribe.ts`, `listen.ts`, `generate.ts`
- **Agent wiring:**
  - `apps/desktop/src/mcp-config.ts` (`SERVER_NAME`, `OUR_PATHS`, 9 agent targets) and `mcp-install.ts`
  - `cli-install.ts`, `cli-windows.ts`, `scripts/stage-cli.mjs`
  - `packages/agent-chat/src/host/{claude,codex,harness,env}.ts`
  - `apps/desktop/src/dapi/server.ts`
  - `docs/INSTRUCTIONS.md`, `docs/skills/*`, `docs/reference/**`, `docs/examples/*`
  - the project template in `apps/desktop/src/projects.ts` (README/AGENTS text, scripts, `.diffusion/`, `jsxImportSource`)
- **Branding:**
  - `forge.config.ts`, `main.ts` (`setName`, `updateElectronApp` repo, `AUTH_PROTOCOL`)
  - `apps/web/index.html` (title, OG tags, inline splash SVG)
  - `public/mark*.{svg,png}`, `og-default.png`, `src/assets/icons/diffusion-logo*.svg`
  - sidebars, login, mcp-view, help-view/help-menu (Discord, support, cal.com, legal links)
  - `context/render.ts` metadata, `scripts/win-assets.py` (procedural small icons, spinner label)
  - colours in `apps/web/src/index.css` (primary is already blue `#008CFF`)
- **Counts:** ~1,131 "diffusion" hits in 420 files (~85% are `@diffusionstudio/*` imports, handled by a codemod), plus 322 "dapi" hits.
- **CI:** `.github/workflows/{release,build-windows,bump-cask,bump-winget}.yml` → delete; write our own.
- **Tests:** Vitest, 24 files (desktop 16, agent-chat 5, dapi 3), plus `npm run check` (tsc) and `npm run lint`. CI doesn't run them today.

## Process (deterministic, per the user's rules)
- Every phase runs the saved workflow `hypergen-phase`: planner → dev-1..3 (no file overlap) → test-writer (edge cases) → test-runner → fix loop (max 3) → orchestrator records.
- **A red test blocks the next subtask.**
- YAGNI throughout.
- Tool routing per `docs/agents/TOOLS.md`:
  - Graphify and codebase-memory for code;
  - Grep for literals;
  - headroom for logs;
  - agent-reach for web docs (fal.ai, Gemini, transformers.js APIs).
- The orchestrator updates the ADR (new ADR-010, "pivot to editor", which supersedes the LTX ADRs), HANDOFF and TODO after each phase.
- Reports to the user use ASD-STE100 (simple technical English).

## Phases (times are targets)
**P0 Setup (0.5 h):**
- Clone into `hypergen/`, delete `.git`, and run `git init`.
- `npm install`, then a baseline of `npm test`, `npm run check` and `npm run build`. Record the results in HANDOFF.
- Index with Graphify and codebase-memory.
- Update the ADR/TODO for the pivot.

**P1 Surface rebrand (2.5 h):**
- Icon set from the Hyper-0x mark: blue lines on white, rounded square, made with a PIL script.
  - `icon.png`, `.icns`, `.ico` (including the small sizes in `win-assets.py`), tray templates, DMG background, install spinner, favicon, `mark.svg`, `og-default.png`.
  - A hand-traced vector `hypergen-logo.svg` (`currentColor`) replaces `diffusion-logo*.svg`, and the inline splash SVG.
- All visible strings → Hypergen: window/app name, forge names and installer filenames, HTML/OG, sidebars, MCP view, error screens, render metadata, CLI help, tray.
- Remove the Discord, cal.com and support links. The help menu gets Hypergen links: repo issues, pavi.tech, buckleson.com.

**P2 Deep rename (2 h):**
- Codemod `@diffusionstudio/*` → `@hypergen/*` (imports, package.json, scripts), then regenerate the lockfile.
- CLI → a single `hypergen` binary (drop the `dapi` alias).
- MCP `SERVER_NAME` → `hypergen`.
- `hypergen://`.
- `HYPERGEN_*` env vars, userData, `.hypergen/`, the `"hypergen"` project field, IndexedDB `hypergen-idb`, MIME `application/x-hypergen-mask`.
- Agent instructions and docs/skills/examples rewritten to Hypergen.
- `report` tool → `buckleson/hypergen`.
- `updateElectronApp` → `buckleson/hypergen`.
- Linux CLI install: a symlink into `~/.local/bin`, which upstream lacks.
- The JSX library is copied into new projects (`.hypergen/jsx` + tsconfig `paths`, `jsxImportSource: "@hypergen/jsx"`). The resolver accepts `@hypergen/jsx`.
- Update the tests that assert the old ids.

**P3 Cut the backend (3 h):**
- Remove AuthGate/login/Supabase, billing/plans/credits/upgrade/checkout, Sentry, analytics, `api-contract`.
- Add a Settings → **API keys** section (Gemini, fal.ai), stored encrypted in the Electron main process with `safeStorage`. Provider HTTP calls run in main over IPC, which avoids CORS.
- **transcribe:** local Whisper via `@huggingface/transformers` with word timestamps. The model is fetched from Hugging Face on first use and cached.
- **listen:** Gemini `generateContent` with the inline audio or video and the question.
- **generate:** fal.ai queue API, with a short vendored model list that maps the tool's `model` ids to fal endpoints (image, video, voice).
- Missing key → a clear error that tells the user (or agent) to add the key in Settings.

**P4 Repo + CI (1 h):**
- `.github/workflows/build.yml`: matrix of windows-latest, macos-14 and ubuntu-latest, with `SKIP_SIGN=1`, running `npm ci`, `npm test`, `npm run check` and `npm run make`.
  - Forge makers: Squirrel (Windows), DMG + zip (macOS), deb + zip (Linux).
  - Artifacts are uploaded on every push. On a `v*` tag it creates a GitHub Release.
- Make `buckleson/hypergen` (public), push a single "Initial commit", and confirm the first green run.

**P5 Credits + README (0.75 h):**
- About/help footer and dashboard footer: "Secured by HyperOx · Powered by Buckleson · Managed by Pavi", with links and small logos.
- New README: what it is, features, install, agent setup, build from source, license.

**P6 Hardening (1 h, buffer):**
- Full Vitest/tsc/lint run green.
- Manual smoke test of the packaged Windows app on this laptop:
  - open, create a project, timeline edit, export MP4;
  - connect Claude Code via MCP;
  - chat panel; transcribe; key-missing errors.
- A final Grep for `diffusion|Diffusion|dapi` in user-visible paths. The allow-list is MPL headers and the SAM URLs only.

**P7 Website (last, 2–3 h):**
- Ask the user for the design links first.
- Dark theme, glassmorphism, bento grid, motion.
- Use the taste/design skills and Anatomy. Built after the app is green.

## Verification
- `npm test`, `npm run check` and `npm run lint` all pass; new tests cover the rename ids, key storage, missing-key errors and the provider request shapes.
- `grep -riE "diffusion|dapi" --exclude-dir=node_modules` → only MPL-free allow-listed hits (SAM weight URLs).
- GitHub Actions: all 3 OS jobs green, with installers attached.
- The packaged app on Windows passes the P6 smoke list:
  - Claude Code shows the `mcp__hypergen__*` tools;
  - the chat panel works with the user's Claude/Codex sign-in.
