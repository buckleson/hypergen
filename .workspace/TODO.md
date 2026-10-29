# Hypergen — TODO (for you)

Legend: [ ] todo · [~] in progress · [x] done · ⏸ waiting on you

## Done
- [x] Research Cardboard.ai and alternatives. Base app: the open-source agent video editor (MPL-2.0).
- [x] Agent team, docs and orchestration workflow (`.claude/agents/`, `.claude/workflows/hypergen-phase.js`, `docs/agents/`).
- [x] Tools: uv, Graphify, headroom, codebase-memory.
- [x] P0: fresh repo, install, test baseline.
- [x] P1+P2: full rebrand to Hypergen (names, icons, CLI `hypergen`, MCP id `hypergen`, agent docs, project template).
- [x] P3: local-first backend. No vendor sign-in, billing or telemetry. Local Whisper transcribe, Gemini listen and fal.ai generate with your own keys (Settings → AI providers).
- [x] P5: credits in Help → About (Secured by HyperOx · Powered by Buckleson · Managed by Pavi). README rewritten.
- [x] Public repo github.com/buckleson/hypergen with CI (tests and installers for Windows, macOS, Linux). Session data in `.workspace/`.
- [x] Windows installer builds in CI.

## In progress
- [x] P6: audit fixes. External links open in the browser, Linux .deb packaging, macOS ad-hoc signing, demo prompts, dead files, agent docs accuracy.
  - [x] Workflow `wf_cc809282-4a4` green (A, B, C targeted tests and package suites pass).
  - [x] Repo-wide gate green (1,733 tests, check, lint); committed and pushed.
- [x] CI green on all three OS (run 40750032752): test, Windows, macOS, Linux installers.
- [~] Built-in "Promo and launch videos" skill + better home-screen prompt suggestions.
  - [x] Workflow green (targeted and package suites, typecheck).
  - [ ] Repo-wide gate (`npm test`, `check`, `lint`), commit, push, CI.

## Next
- [ ] P7: marketing website (dark, glassmorphism, bento grid, animations). ⏸ Waiting for your design links.
- [ ] Firebase sign-in (email/password, Google, GitHub). ⏸ Waiting for your Firebase config.

## Waiting on you
- ⏸ OK to delete 84 test-draft folders in `%LOCALAPPDATA%\userData\Drafts` (made by earlier test runs).
- ⏸ Website design links.
- ⏸ Firebase config (when you want sign-in).

## Later / optional
- [ ] Mirror the SAM 2.1 model weights under a Buckleson Hugging Face account (they still download from the original repos).
- [ ] Code signing (Windows certificate, Apple Developer ID), so macOS auto-update works and the OS warnings go away.
- [ ] Reset the version number (0.216.0 is inherited) before the first Hypergen release tag.
