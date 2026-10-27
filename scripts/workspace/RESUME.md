# Hypergen agent workspace

This folder lets you continue the Hypergen work on any computer. `python scripts/workspace/sync.py` refreshes it before each push.

| Path | Content |
|---|---|
| `TODO.md` | Phase checklist (for people) |
| `docs/agents/ADR.md` | Architecture decisions and the deterministic rules every agent follows |
| `docs/agents/HANDOFF.md` | Session log: what changed, test status, next step. Read the newest entry first. |
| `docs/agents/TOOLS.md` | Which tool to use for which job (YAGNI) |
| `docs/agents/P3-providers.md` | Provider API research (fal.ai, Gemini, local Whisper) |
| `claude/agents/` | Agent definitions: orchestrator, planner, developer, test-writer, test-runner |
| `claude/workflows/hypergen-phase.js` | The orchestration loop: plan → develop → test → fix → record |
| `plans/` | Approved plans |
| `memory/` | Claude memory files |
| `sessions/` | Session transcripts, gzipped JSONL, with secrets redacted |
| `logos/` | Source brand logos |

## Continue on a new computer
1. Clone the repo, and run `npm install`.
2. Copy `.workspace/claude/agents` and `.workspace/claude/workflows` into the repo's parent workspace `.claude/`, or into your user `~/.claude/`.
3. Copy `.workspace/docs`, `TODO.md` and `CLAUDE.md` into the workspace folder. Use the same folder name, or update the absolute paths in the agent files.
4. Start Claude Code. Tell it to read `docs/agents/HANDOFF.md` and `docs/agents/ADR.md`, then continue from the newest HANDOFF entry.
