# Hypergen — TODO (for you)

Legend: [ ] todo · [~] in progress · [x] done · ⏸ waiting on you

## Phase 0 — Setup
- [x] Research Cardboard.ai and alternatives; pick LTX-Desktop as the base
- [x] Agent docs: ADR, HANDOFF, TOOLS (`docs/agents/`)
- [x] Agent team + orchestration workflow (`.claude/agents/`, `.claude/workflows/hypergen-phase.js`)
- [x] Tools: uv, Graphify, headroom (codebase-memory already connected)
- ⏸ Your answers: demo hardware, deadline, repo name, HyperOx logo, Firebase config

## Phase 1 — Demo (waiting for you to pick the first task)
- [x] Clone the fork into `hypergen/`, index it, record the baseline tests
- [x] Rebrand P1+P2 → Hypergen: committed 56411af (2026-10-27)
  - [x] Repo-wide branding grep (ADR rule 9) and `graphify update .`
  - [x] Fix Windows EPERM flake: retry rename in `hypergen/apps/desktop/src/atomic.ts:44` (`projects.watch.test.ts`)
  - [x] `jsxTypings()` packaged mode: check `resourcesPath/jsx` exists (`hypergen/apps/desktop/src/projects.ts` ~738)
  - [x] P3: update `hypergen-web-ui.test.ts` login.tsx assertion when login.tsx changes
  - [x] Commit P1+P2, then merge with the P3 worktree
- [ ] Remove cloud features: LTX API, fal, Gemini, telemetry, updater, Hugging Face OAuth
- [ ] Remove templates and catalogs; add simple Hypergen prompt templates
- [ ] Login window: Firebase (email/password, Google, GitHub)
- [ ] Model-download window: "HyperGenX by Pavi" from the Hugging Face mirror
- [ ] Rehost the Python runtime archives
- [x] GitHub repo buckleson/hypergen (public) + Actions build for Windows, macOS, Linux
- [x] P3 cut vendor backend: WP1–WP8 green (2026-10-28), uncommitted on branch p3-backend
  - [ ] Commit P3 on p3-backend
  - [ ] apps/web: install jsdom or drop the jsdom test environment (vitest exits 1)
  - [ ] apps/web: raise timeout of flaky test wp5-fal-generation-core.test.ts:347
  - ⏸ Confirm ADR-011 (fal.ai, Gemini) supersedes ADR rule 4 (no third-party AI APIs)
- [x] README rewrite (d8e647f)
- [x] CI test fixes: Dock per platform, build.yml test, Windows drafts isolation
- [x] Merge P3 → main (c894ba4); full gate green: 1,363 tests, check, lint
- [ ] CI green on GitHub
- [x] P5 credits UI (Help → About: HyperOx, Buckleson, Pavi)
- [ ] P6 full audit (links, buttons, branding, agent connect)
- [ ] P7 website

## Phase 2 — Polish
- [ ] UX improvements in the same theme
- [ ] Full test suite green in CI

## Phase 3 — Optional
- [ ] Low-VRAM (8–12 GB) support with a GGUF loader (ADR-006)
