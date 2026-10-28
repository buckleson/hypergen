# Architecture Decision Records — Hypergen

Owner: orchestrator (only the orchestrator edits this file). Agents read it before starting any subtask.
Format: each ADR gives its status, then Context, Decision and Consequence. Add new ADRs at the end and never renumber.

## Deterministic rules (apply to every agent, every task)
1. **YAGNI.** Build only what the current subtask's acceptance criteria require. No speculative abstractions, config flags, "future" hooks, unused exports or wrapper layers. Delete before you add.
2. **Red blocks green.** If a test fails, fix it (code or test, whichever is wrong) before starting the next subtask. Never skip, xfail or delete a failing test to get past it without the orchestrator's approval recorded here.
3. **Branding.** No user-visible string, icon, window title, installer text or URL may say "LTX", "Lightricks", "ltx.io", "Diffusion Studio", "diffusion" or "dapi". The only exceptions are the Settings → About → Licenses page, the model-license link on the model-download screen, and the ADR-012 allow-list. Internal identifiers (Python package names like `ltx_core`, env vars) may stay until a subtask needs them renamed.
4. **Network.** No telemetry and no vendor backend. Allowed outbound calls: the providers the user configures with their own key (fal.ai, Gemini — ADR-011), Hugging Face model downloads (Whisper, SAM 2.1), Google Fonts, GitHub releases (update feed), and, later, Firebase Auth.
5. **One writer per file.** Two agents never edit the same file at the same time. The planner lists the files each subtask touches, and the orchestrator serializes subtasks that overlap.
6. **Handoff discipline.** Read the latest `HANDOFF.md` entry before starting. The orchestrator appends a new entry when a run ends.
7. **Ask, don't assume.** Any product decision not covered by an ADR goes back to the user.
8. **Tool routing.** Follow `TOOLS.md`.

---

## ADR-001 — Fork LTX-Desktop instead of building from scratch
Status: Accepted (2026-10-23)
- **Context:** The user needs a local text-to-video desktop app for a demo soon. Lightricks/LTX-Desktop (Apache-2.0, ~2k stars, v1.3.x) already does local text, image and audio to video, retake/extend, IC-LoRA effects and an asset library.
- **Decision:** Fork it into `E:\research-clones\hypergen\` and rebrand the surface as **Hypergen** (by Pavi). The downloadable model is called **HyperGenX by Pavi**.
- **Consequence:** We inherit its stack:
  - Electron 41, React 18, Vite 7, TypeScript, Tailwind 3 + SCSS, zustand, react-query, pnpm 10.
  - A Python 3.13 engine: FastAPI + uvicorn, managed with uv, using torch cu128 and `ltx-core`/`ltx-pipelines`.

  Upstream merges will get harder as branding diverges, and that is accepted.

## ADR-002 — Keep the shipped PyTorch engine; no vLLM
Status: Accepted
- **Context:** vLLM serves autoregressive LLMs and can't run video diffusion models.
- **Decision:** Keep `backend/ltx2_server.py`, which Electron spawns from `electron/python-backend.ts`.
- **Consequence:** Quantization is limited to what `ltx-core` supports. Today that is an FP8 cast at load time on GPUs with compute capability ≥ 8.9 (`runtime_config/accelerator.py`). GGUF for the video model would need new loader work; see ADR-006.

## ADR-003 — Remove every cloud feature
Status: Accepted
- **Decision:** Delete, don't hide behind flags (YAGNI):
  - LTX API client and API text encoding: `services/ltx_api_client/*`, `services/text_encoder/ltx_text_encoder.py`, `LtxApiKeyInput.tsx`, `FreeApiKeyBubble.tsx`, `first-run/LtxApiKeyCard.tsx`.
  - fal.ai: `services/zit_api_client/*`.
  - Gemini prompt enhancement and assistant: `gemini_*`, `assistant_provider.py`, `enhance-gemini-key.ts`.
  - Telemetry: `electron/analytics*.ts`, `backend/services/analytics.py`, `SetupAnalyticsOptOut.tsx`.
  - Upstream auto-updater: `electron/updater.ts`, `use-app-update.ts`.
  - Hugging Face OAuth: `hf_auth_handler.py`, `HfAccessCard.tsx`.
  - Remote GCS media and the `videos.ltx.io` / Google Fonts entries in `electron/csp.ts`.
  - API-key settings in `state/app_settings.py`.
- **Open:** whether to keep the local Qwen assistant (llama.cpp) and the LAN remote server (`backend/remote/*`). Ask the user when the task comes up.

## ADR-004 — Templates
Status: Accepted
- **Decision:** Remove upstream templates and catalogs: `shared/lora-recipes.json`, `shared/ic-lora-recipes.json`, `runtime_config/lora_catalog.json`, `home-feature-registry` example media. Replace them with a small Hypergen prompt-template list, where each template is just a prompt and settings.
- **Consequence:** Fewer downloads and no third-party LoRA repos.

## ADR-005 — Model hosting
Status: Accepted
- **Decision:** Host the model on a Hypergen-named **Hugging Face mirror** owned by the user. GitHub Releases are ruled out by their 2 GB per-file limit. The app keeps its download logic in `backend/runtime_config/model_download_specs.py` and `services/model_downloader/hugging_face_downloader.py`, with the repo ids pointed at the mirror.
- **Consequence:**
  - The mirror must ship the model license file (LTX-2 Community License).
  - The <$10M revenue limit, the anti-deepfake terms and the AI-labelling terms apply to Hypergen.
  - The Python runtime archives that upstream downloads from Lightricks URLs (`electron/python-setup.ts`) must also be rehosted, on our GitHub Releases (each part under 2 GB).

## ADR-006 — Hardware target
Status: Open (needs a user decision)
- **Context:**
  - Stock floors (`runtime_config/runtime_policy.py`) are 9 GiB of VRAM on FP8-capable GPUs (RTX 40-series+) and 15 GiB otherwise.
  - The user's dev laptop has an RTX 3050 Laptop GPU (4 GB VRAM, compute capability 8.6) and 7.7 GB of RAM, so it **cannot run the model**.
  - Community GGUF builds of the model (QuantStack, unsloth) need about 8 GB of VRAM plus 32 GB of RAM, and are slow.
- **Options:**
  - (a) A demo machine with an RTX 40/50-series card, 16 GB+ of VRAM and 32 GB of RAM, using the stock engine. Recommended.
  - (b) GGUF loader work for 8–12 GB cards.
  - (c) A tiny model on this laptop.

## ADR-007 — Licensing
Status: Accepted
- **Decision:** Keep `LICENSE.txt` (Apache-2.0), `NOTICES.md` and the model license. Show them only under Settings → About → Licenses and through the license link on the model-download screen. Mark modified files where Apache §4 requires it.

## ADR-008 — Authentication
Status: Accepted, details pending
- **Decision:** Use Firebase Auth with email/password, Google and GitHub. Login becomes a new boot phase before `setup` in `frontend/lib/boot-phase.ts`. Google and GitHub sign-in run in the system browser through a loopback redirect, not inside the Electron webview.
- **Pending:** Firebase config, and the GitHub OAuth app registered in the Firebase console. The user will provide both.

## ADR-009 — Agent process
Status: Accepted
- **Decision:**
  - Roles: orchestrator, planner, developer ×1–3, test-writer, test-runner. Definitions are in `.claude/agents/`, and the loop is in `.claude/workflows/hypergen-phase.js`.
  - Subagents can't spawn agents, so the workflow script plus the main session play the orchestrator's runtime. The `orchestrator` agent does tool choice, doc writing and replanning.
  - Each run stays under 10 agents.

---

## ADR-010 — Pivot: rebrand diffusionstudio/editor as Hypergen (supersedes ADR-001…008 for the current product)
Status: Accepted (2026-10-27)
- **Context:** The user changed the base app to diffusionstudio/editor (MPL-2.0). It is a SolidJS + Electron 43 + Forge app with an npm-workspaces monorepo, a local MCP server on 127.0.0.1:3274, a CLI, and an agent chat that drives the user's own Claude Code/Codex.
- **Decision:**
  - Product repo: `E:/research-clones/hypergen`, with fresh git history, published as public `buckleson/hypergen`.
  - Names: Hypergen; CLI `hypergen` (single binary); MCP id `hypergen`; protocol `hypergen://`; npm scope `@hypergen/*`; bundle id `com.buckleson.hypergen`.
  - No migration code: it is a new app (YAGNI).
- **Consequence:** ADR-001…008 (LTX) are parked. ADR-009 (agent process) still applies.

## ADR-011 — Local-first, no vendor backend
Status: Accepted (2026-10-27)
- **Decision:**
  - Remove Supabase auth/AuthGate, billing, credits, upgrade, checkout, Sentry, analytics, the tRPC API and `@diffusionstudio/api-contract`.
  - Transcribe uses local Whisper (transformers.js).
  - Listen uses the user's Gemini key.
  - Generate uses the user's fal.ai key.
  - Keys are stored with Electron `safeStorage` in main. Provider HTTP calls run in main via IPC.
  - The Claude/Codex agent chat stays unchanged.
- **Open:** Firebase sign-in, in a later phase.

## ADR-012 — License and brand assets
Status: Accepted (2026-10-27)
- **Decision:**
  - Keep `LICENSE` (MPL-2.0) and the 3-line MPL notice in source files.
  - Replace every file in `apps/desktop/assets` (upstream "all rights reserved").
  - Icon: the Hyper-0x mark, blue on white, rounded square (source `E:/research-clones/logos/Hyper-0x-logo.png`).
  - Credits: "Secured by HyperOx" (no link), "Powered by Buckleson" → https://buckleson.com, "Managed by Pavi" → https://pavi.tech.
  - Agent records (this folder) never go into the product repo.
  - Allowed leftover: the SAM 2.1 weight URLs `huggingface.co/diffusionstudio/*` (network only, never shown).

## ADR-013 — JSX library shipped in-app
Status: Accepted (2026-10-27)
- **Decision:** No npm publish. New projects get the library copied to `.hypergen/jsx`, wired with tsconfig `paths`; `jsxImportSource` is `@hypergen/jsx`. The reconciler resolves `@hypergen/jsx`.

## Deterministic rules — additions for ADR-010+
9. Branding check: `grep -riE "diffusion|dapi"` outside node_modules must show only the allow-list in ADR-012, plus the MPL notices (which contain no brand).
10. User-facing reports use ASD-STE100 (simple technical English: short sentences, active voice, one instruction per sentence).

## ADR-014 — P1 planner decisions (2026-10-27)
- Delete `.github/workflows/bump-cask.yml` and `bump-winget.yml` now. P4 writes our own CI.
- `apps/web/.env.example` `VITE_API_URL`: P3 removes it. It is allow-listed until then.
- New projects may keep `solid-js` (and `koota`) as npm devDependencies. ADR-013 only forbids publishing or depending on our own `@hypergen/jsx` from npm.
- Linux: P1 adds the `~/.local/bin/hypergen` link code and the POSIX wrapper. P4 adds the deb and zip makers.
- `pages/login.tsx`: a one-line icon rename to `hypergen-logo` is allowed now, so no icon is broken before P3 deletes the page.

## ADR-015 — P3 planner decisions (2026-10-27)
- fal.ai generation jobs live in memory for the session only (YAGNI). Rerun and Reuse work within a session.
- The fal key "Test" uses a cheap authenticated request (bad key → 401/403). If none exists, Test reports "saved".
- Whisper transcription runs in a Web Worker, so the editor UI never freezes.
- Brand and telemetry greps use word boundaries (`\bsentry\b`), so `FsEntry` and `webkitGetAsEntry` don't match.
