# Weekly CLAUDE.md Freshness Audit

**Cadence:** every 7 days (recommended: Monday morning)
**Branch prefix:** `chore/claude-md-audit-`
**Required tools:** Read, Grep/Bash, Edit, GitHub MCP (PR create)

## Goal

Each `CLAUDE.md` in the repo references file paths, module names, commands,
env vars, and API routes. These drift silently. This schedule detects drift
and opens **one PR** with mechanical fixes.

## Files in scope

- `CLAUDE.md` (root)
- `libs/idun_agent_schema/CLAUDE.md`
- `libs/idun_agent_engine/CLAUDE.md`
- `services/idun_agent_manager/CLAUDE.md`
- `services/idun_agent_web/CLAUDE.md`

## Steps

1. For each file in scope, extract every claim that can be verified
   automatically:
   - Referenced file paths and directories — must exist.
   - Referenced commands (`make <target>`, `uv run …`, `npm run …`) — target
     must exist in `Makefile` / `package.json` / pyproject scripts.
   - Referenced module imports — module must be importable.
   - Referenced env vars — must appear in code, `.env.example`, or settings
     classes.
   - Referenced API routes — must appear in a router file.
2. Build a drift report grouped by file. For each item: `claimed → actual`.
3. **Mechanical fixes** (apply directly): renamed paths, moved files,
   renamed make targets, renamed env vars where the new name is unambiguous.
4. **Judgment calls** (do not fix, list in PR description): removed concepts,
   architectural changes, anything where the doc may be intentionally
   aspirational.
5. If any mechanical fixes were made, open a PR titled
   `chore: weekly CLAUDE.md drift fixes (<YYYY-MM-DD>)` against `main` with:
   - Diff of doc changes.
   - Checklist of judgment calls for human review.
6. If no drift found, do not open a PR. Comment on the rolling issue
   `schedule:claude-md-audit` with `Clean run at <timestamp>`.

## Constraints

- Never modify code to match docs — docs follow code, not the other way around.
- Never delete a doc section; only update or flag.
- One PR per run, even if all five files have drift.
