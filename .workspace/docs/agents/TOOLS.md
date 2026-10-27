# Tool routing — read before using any tool

Goal: the fewest tokens for a correct result (YAGNI applies to tool use too). Use the cheapest tool that answers the question, and use each tool only when its row applies.

| Need | Use | Don't |
|---|---|---|
| Where a symbol is defined, who calls it, blast radius before an edit | codebase-memory `search_graph` → `trace_path` → `get_code_snippet` (or graft `graft_find_code` / `graft_trace_calls` if the repo is indexed by graft) | Read whole files or grep the whole tree |
| Overview of an area, or docs, configs, CI and SQL relationships | Graphify: `graphify query "<q>"`, `graphify path A B`, `graphify explain X` (scoped, cheap); `GRAPH_REPORT.md` only for broad reviews. Binary: `E:/dev-tools/bin/graphify.exe`. After code edits: `graphify update .` | Open 10 files to "get a feel" |
| Literal text (e.g. every "LTX" string, env vars, URLs) | Grep (`output_mode: count` first, then `content` with `head_limit`) | Graph tools; they index symbols, not literals |
| A large tool output (test logs, build logs, JSON, lockfiles) | headroom MCP compress, or headroom's retrieval to fetch the original when exact lines matter | Paste raw logs into reports |
| Web research (library docs, model cards, error messages) | `agent-reach` skill | Ad-hoc multi-page browsing |
| Edit code | Edit (exact, small); Write only for new files | sed/awk on multi-line code |
| Run tests | `pnpm` / `uv run pytest` limited to the affected files first; full suite only at layer end | Full suite after every one-line change |

## Rules
1. Check coverage before trusting the graph: after a codebase-memory answer, call `check_index_coverage` for any file you rely on. If coverage is partial, read only the missed lines.
2. Never re-read a file you just edited; the editor would have errored.
3. Reports are compact: say what changed, which files, and pass/fail, with the failing test name and one-line cause. No log dumps.
4. Re-index after big edits: codebase-memory auto-refreshes; rerun `graphify . --update` only after structural changes (new or moved modules).
5. If a tool isn't installed or is failing, say so in the report and fall back to Grep/Read. Don't install new tools without the orchestrator.

## Status (2026-10-27)
- codebase-memory-mcp: connected; nothing indexed yet (the fork isn't cloned).
- Graphify 0.9.96:
  - Binary: `E:/dev-tools/bin/graphify.exe` (not on PATH).
  - Project skill: `.claude/skills/graphify`.
  - PreToolUse hooks: `.claude/settings.json`, with absolute paths.
  - Run `/graphify .` inside `hypergen/` after the clone.
- headroom 0.42.0:
  - MCP registered for Claude Code only (`headroom mcp install --agent claude`); active after an app restart.
  - Automatic compression of all traffic needs `headroom proxy` plus `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`. That is optional and not enabled.
- agent-reach:
  - `web`, `rss`: ok.
  - `github`: warn, but `gh` is logged in as buckleson.
  - `youtube`: warn (needs the yt-dlp JS runtime).
  - Social channels: off. Use only `web` and `github` for scouting.
- uv 0.13.6: run it as `python -m uv`.
