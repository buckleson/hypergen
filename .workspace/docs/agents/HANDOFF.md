# Handoff log (append-only, newest at the bottom)

Every agent reads the **latest entry** before starting. The orchestrator appends one entry per session or workflow run, using this template:

```
## <YYYY-MM-DD> — <session/run name>
- Goal:
- Done (files):
- Tests: <suite> pass/fail (counts); failures + cause
- Decisions: ADR-### added/changed
- Open issues / blockers:
- Next step:
```

---

## 2026-10-27 — Session 1: research + workspace setup
- **Goal:** Research Cardboard.ai and open-source alternatives, choose the base app, and set up the agent process. No feature code.
- **Done:**
  - Research. Cardboard is an orchestration layer: third-party LLMs for its agent, credits for Kling/Hailuo/Seedance/Veo, and an in-browser WebCodecs renderer.
  - Chose to fork LTX-Desktop (ADR-001).
  - Wrote `docs/agents/{ADR,TOOLS,HANDOFF}.md`, `TODO.md`, `.claude/agents/*.md` and `.claude/workflows/hypergen-phase.js`.
  - Installed uv, Graphify and headroom.
- **Tests:**
  - Workflow `hypergen-phase.js` was simulated with mock agents. Four scenarios passed: file-overlap layering, fix-then-green, blocked after 3 rounds, and dependency-cycle rejection.
  - No product tests yet; the upstream baseline will be recorded on the first run after the clone.
- **Decisions:** ADR-001 to ADR-009.
- **Open issues / blockers (waiting on the user):**
  - Demo hardware (ADR-006).
  - Demo deadline.
  - GitHub repo name.
  - HyperOx logo file.
  - Firebase config and GitHub OAuth app.
  - Whether to keep the local Qwen assistant and the LAN remote server.
- **Next step:** The user names the first demo task. Then: clone into `hypergen/`, move these docs into it, index it with Graphify and codebase-memory, record the baseline test run, and run `hypergen-phase` with that goal.

## 2026-10-27 — P0 Setup (pivot to the editor)
- **Goal:** Clone the upstream editor into `E:/research-clones/hypergen` with fresh git, install, and record the baseline.
- **Done:**
  - Cloned the editor at upstream af570c1.
  - Removed `.git` and ran `git init -b main`.
  - Copied `.env.example` to `apps/web/.env`.
  - `npm install`: 953 packages, OK.
  - ADR-010…013 added.
- **Baseline (all failures pre-existing; Windows host):**
  - `npm test`:
    - desktop: 107 pass, 4 fail. Cause: Windows-only test-environment issues.
      - `window-host.test.ts`: 2 Dock tests expect `dock.show`, which only exists on macOS.
      - `projects.drafts.test.ts`: 2 tests where the drafts root isn't isolated on Windows.
    - agent-chat: 38 pass.
    - dapi: 52 pass.
  - `npm run check`: fails. `packages/assets/src/browser.ts:65` `showSaveFilePicker` is missing from the TS DOM lib (seen while checking `packages/encoder`). Fix in P6.
  - The test-runner treats these 5 as pre-existing. Anything new is red and blocks.
- **Next step:** P1 surface rebrand.

## 2026-10-27 — P1+P2 rebrand (hypergen-phase run)
- **Goal:** Rebrand the surface of `E:/research-clones/hypergen` (branch main) to Hypergen (ADR-010…014). P3 files were out of scope.
- **Done (10 work packages, all green):**
  - A: packaging, main process, root files. Tests `apps/desktop/forge.config.test.ts`, `src/main.branding.test.ts`, `src/squirrel.test.ts`.
  - B: single `hypergen` CLI and installers. Tests `apps/desktop/src/cli-{install,windows,branding}*.test.ts`.
  - C: desktop MCP server and agent config ids. Tests `apps/desktop/src/mcp-config.hypergen.test.ts`, `src/mcp-install.test.ts`, `src/dapi/hypergen-branding.test.ts`.
  - D: agent-chat host ids and prompt. Test `packages/agent-chat/test/branding.test.ts`.
  - E: dapi tool catalog, package metadata, tool docs (also `packages/jsx`). Test `packages/dapi/src/branding.test.ts`.
  - F: web storage, config field, messages, links, metadata. Tests `apps/web/src/hypergen-branding.test.ts`, `packages/assets` mask test.
  - G: web UI (index.html, sidebars, MCP view, help, icons). Test `apps/web/src/hypergen-web-ui.test.ts`.
  - H: project template and shipped jsx typings. Tests `apps/desktop/src/projects.{template,init}.test.ts`.
  - I: agent docs and examples. Test `apps/desktop/src/dapi/agent-docs.branding.test.ts`.
  - J: branding guard. Test `apps/desktop/src/branding.test.ts`.
  - Nothing committed. The orchestrator commits.
- **Tests:**
  - desktop: 385 pass, 4 fail (the 4 baseline Windows failures only). `tsc --noEmit` clean.
  - agent-chat: 63 pass. dapi: 99 pass. web: 144 pass. assets: 4 pass. Typechecks clean for these packages and `packages/jsx`.
  - New flake (not a regression, not in the baseline): `apps/desktop/src/projects.watch.test.ts` "config writes that overlap" fails about 2 of 5 runs with Windows EPERM on rename. Suspect `apps/desktop/src/atomic.ts:44` (`rename` has no EPERM/EBUSY retry).
- **Decisions:** none new.
- **Open issues:**
  - Not yet run: the repo-wide branding grep (rule 9) and `graphify update .`.
  - The `projects.watch` EPERM flake. Rule 2 forbids skipping it. Fix it with a retry in `atomic.ts`.
  - `apps/web/src/hypergen-web-ui.test.ts` asserts that `pages/login.tsx` is unchanged. It still uses `diffusion-logo`, and that SVG is deleted. P3 must update this test when it deletes or edits login.tsx.
  - `apps/desktop/src/projects.ts` ~738: in packaged mode `jsxTypings()` does not check that `resourcesPath/jsx` exists, so `scaffold` can fail. No test covers this.
  - C reported that `apps/desktop/src/cli-windows.ts` still named the shim `dapi.cmd`. B owns that file and J's guard passes, but confirm it in the repo-wide grep.
  - `pnpm check` cannot find `tsc` in apps/web. `npx tsc` works.
  - The copy at `hypergen/.workspace/docs/agents/` is stale (no ADR-015, no this entry).
- **Next step:** Run the rule-9 grep and `graphify update .`. Fix the `atomic.ts` rename flake. Commit P1+P2. Then merge with the P3 worktree.

## 2026-10-27 — First push (user asked for CI now, before the P3 merge)
- **Goal:** Push `main` as one "Initial commit" to public `buckleson/hypergen` so GitHub Actions builds Windows, macOS and Linux.
- **Done:**
  - P1+P2 committed (`56411af`).
  - New README banner. Old repo images removed.
  - Upstream workflows deleted. Added `.github/workflows/build.yml` (test job + make matrix + release on `v*` tags).
  - Linux makers added (zip + deb, `@electron-forge/maker-deb`).
  - Baseline typecheck error fixed (`packages/assets/src/file-system-access.d.ts`). `npm run check` is clean.
  - `.workspace/` synced (sessions, plans, docs, agents, memory, logos; secrets redacted).
- **State of P3:**
  - Branch `p3-backend` in worktree `E:/research-clones/hypergen-p3`, WIP commit `bcf1135`. WP1–WP4 green; WP5 had just started when the user paused.
  - Workflow run `wf_2a5e67c0-20b` (resume with `subtasksFile` = scratchpad `p3-packages.json`; a copy is in `.workspace/docs/agents/`).
  - The P3 branch is based on pre-squash history (`6f1f270`). Bring it onto the new main with `git diff 6f1f270 bcf1135 | git apply -3`, or cherry-pick.
- **Main still contains the old vendor sign-in, billing and API code until P3 merges** (known; the user chose to push now).
- **Next step:**
  1. Resume P3 (WP5–WP8).
  2. Merge it onto main.
  3. P5: README rewrite (remove "Pi", third-party prompt links; add the AI-provider keys section) and credits UI.
  4. P6: audit.
  5. P7: website.

## 2026-10-28 — Paused for a laptop restart (RESUME HERE)
- **State:**
  - **main** (`E:/research-clones/hypergen`, local, ahead of origin by 4 commits, NOT pushed):
    - `97aff6f`: Dock tests per platform, branding test reads `build.yml`.
    - `d8e647f`: README rewrite (UI labels checked: "MCP & CLI → Agents" switch, "CLI → Install"; "Settings → AI providers" must be checked after the P3 merge).
    - `eb88f84`: Windows drafts tests isolated (LOCALAPPDATA). Windows now has no known test failures.
    - origin/main = `3d23b6f` (Initial commit + Add build workflow).
  - **CI:** run 40544596773 failed.
    - (a) Dock tests: fixed in `97aff6f`.
    - (b) `main.branding.test` read a deleted `build-windows.yml`: fixed in `97aff6f`.
    - (c) macOS/Linux make: vite.config needs `VITE_SUPABASE_URL`. P3 removes it. Windows make: same cause.
    - Nothing is running on GitHub now.
  - **P3:** worktree `E:/research-clones/hypergen-p3`, branch `p3-backend`, WIP commit `e126c84`.
    - Workflow run `wf_2a5e67c0-20b` stopped during `run:WP6`. WP1–WP5 green (WP5 after one fix round); WP6 and WP7 developed, with WP6 tests being run.
    - The P3 branch is based on the old local history (`6f1f270`). Main was squashed. The old history is kept in local branch `pre-squash`.
- **Resume steps:**
  1. Resume P3 with the Workflow tool: `scriptPath` `E:/research-clones/.claude/workflows/hypergen-phase.js`, `resumeFromRunId` `wf_2a5e67c0-20b`, `args` = `{date:"2026-10-27", maxDevs:3, subtasksFile:"E:/temp/claude/E--research-clones/7534b4d1-ae93-44a1-a822-daaa894f8252/scratchpad/p3-packages.json", goal:"P3 CUT THE VENDOR BACKEND in the git worktree E:/research-clones/hypergen-p3 (branch p3-backend). ALL reads, edits and test runs happen ONLY under E:/research-clones/hypergen-p3. Brief: E:/research-clones/docs/agents/P3-providers.md; ADR-011 and ADR-015. Commit nothing; the orchestrator commits."}`.
     - The args must be identical for the cache to replay.
     - If the scratchpad file is gone, use the copy at `E:/research-clones/docs/agents/p3-packages.json` and expect the replay to miss the cache. WIP commits `bcf1135`/`e126c84` keep the code.
  2. When P3 is green, merge it onto main: in `hypergen`, run `git diff 6f1f270 p3-backend -- . ':!.workspace' | git apply -3`. Resolve conflicts (likely: dashboard `sidebar.tsx`, `app.tsx`, `help-view.tsx`, `desktop-app.ts`, `main.ts`, docs). Keep the Hypergen names from main and the backend removals from P3. Update `apps/web/src/hypergen-web-ui.test.ts` (it asserts on `login.tsx`, which P3 deletes).
  3. Run full `npm test`, `npm run check` and `npm run lint`. Commit. Push main. Watch CI until green.
  4. P5: credits UI (Secured by HyperOx · Powered by Buckleson → buckleson.com · Managed by Pavi → pavi.tech) in the dashboard footer and help.
  5. P6: audit (every link, button and menu; agent connect shows "hypergen"; branding grep).
  6. Run `python scripts/workspace/sync.py`, commit, push.
  7. P7: website. Ask the user for the design links.
- **Waiting on the user:**
  - OK to delete 84 test-draft folders in `%LOCALAPPDATA%\userData\Drafts` (made by earlier test runs).
  - Website design links.

## 2026-10-28 — P3 cut vendor backend (hypergen-phase run `wf_2a5e67c0-20b`, args date 2026-10-27)
- **Goal:** P3 in worktree `E:/research-clones/hypergen-p3` (branch `p3-backend`). Brief `docs/agents/P3-providers.md`, ADR-011, ADR-015.
- **Done (uncommitted in the worktree; the orchestrator commits):**
  - WP1 `packages/dapi`: Hypergen model catalog, job/transcript types, `MISSING_KEY`, Whisper mapping. `@diffusionstudio/api-contract` removed from dapi and CLI.
  - WP2 `apps/desktop`: analytics and auth/checkout deep links removed. `safeStorage` key store, fal/Gemini IPC (`src/providers/`). `fal.ts:31` has a dot-segment guard on the endpoint.
  - WP3 `apps/web`: Supabase auth, AuthGate, login, Sentry, `lib/analytics.ts` removed.
  - WP4: billing/plans/credits/invoices/account views removed. Settings → AI providers panel added.
  - WP5: tRPC api/jobs/uploads replaced by main-IPC fal jobs. Upgrade dialog removed.
  - WP6: genai UI and AI commands on the new catalog. No credits.
  - WP7: local Whisper transcribe (dapi handler + auto-captions). Gemini listen.
  - WP8: docs and tool descriptions. Repo-wide acceptance grep test.
- **Tests (all green):**
  - `packages/dapi`: vitest 10 files, 234/234. `tsc --noEmit` clean.
  - `apps/web`: vitest `test/` 5 files (wp3–wp7), 403/403. `tsc -p tsconfig.app.json --noEmit` clean.
  - `apps/desktop`: 9 files, 136/136. `tsc --noEmit` clean.
  - WP8 repo-wide git grep (word-bounded, ADR-015): clean.
  - Fix rounds: WP2 (fal endpoint guard), WP5 (one round).
  - Not run: full repo `npm test`, `npm run lint`.
- **Decisions:** none new.
- **Open issues:**
  - `apps/web` vitest exits 1 with all tests passing: "MISSING DEPENDENCY jsdom". CI that checks the exit code fails. Install jsdom or drop the jsdom environment in `apps/web/vite.config.ts`.
  - Flaky: `apps/web/test/wp5-fal-generation-core.test.ts:347` timed out at 5000 ms once under parallel load. Raise its timeout.
  - `pnpm check` in `apps/web` cannot find `tsc` on PATH. Use `../../node_modules/.bin/tsc`.
  - "no credits" wording in dapi `check.ts`, `filmstrip.ts`, `grab.ts`, `probe.ts`, `waveform.ts` has no direct test (only the WP8 grep).
  - Open (needs user): ADR rule 4 (no third-party AI APIs) conflicts with ADR-011 (fal.ai, Gemini). Confirm ADR-011 supersedes rule 4.
- **Next step:** Commit P3 on `p3-backend`. Then follow steps 2–7 of the "RESUME HERE" entry (merge onto main, full `npm test`/`check`/`lint`, push, CI green, P5, P6, P7).

## 2026-10-28 — P3 merged into main
- **Done:**
  - P3 workflow `wf_2a5e67c0-20b` finished green (8/8 WP).
  - P3 normalized to LF. `.gitattributes` forces LF.
  - Cherry-picked the P3 squash onto main and resolved 12 conflicts. Rule: Hypergen names from main, backend removals from P3; the help menu keeps Issues + pavi.tech.
  - 3 developer agents fixed the stale guard tests. Allow-lists for the deleted files are gone. The `hypergen://` protocol is removed (no deep links left).
  - `apps/web` now has a `test` script, and its vitest includes `test/`. The `@desktop` alias was added. ESLint ignores `apps/web/test`. CI runs lint.
  - Credits in Help → About. README fixed (Settings → MCP & CLI / AI providers).
  - ADR rule 4 updated to match ADR-011.
  - Commit `c894ba4`.
- **Tests:** `npm test` 1,363 pass (desktop 476, web 543, agent-chat 63, dapi 281). `npm run check` clean. `npm run lint` 0 errors.
- **Next step:**
  1. Push. Watch CI.
  2. P6 audit (every link, button, menu; agent connect shows "hypergen"; packaged-app smoke test on Windows).
  3. P7 website: ask the user for the design links.
- **Waiting on the user:** OK to delete 84 test drafts in `%LOCALAPPDATA%\userData\Drafts`; website design links.
