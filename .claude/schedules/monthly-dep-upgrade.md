# Monthly Dependency Upgrade

**Cadence:** first business day of each month
**Branch prefix:** `chore/deps-`
**Required tools:** Bash, Read, Edit, GitHub MCP (PR create)

## Goal

Bump non-major versions of Python and Node dependencies, run the full CI
suite locally, and open one PR per ecosystem. Major bumps are surfaced as a
separate issue for human review — never auto-applied.

## Python (uv workspace)

1. On a fresh branch from `main`, run `uv lock --upgrade` to refresh the lock
   file with the latest compatible versions.
2. Run `make ci` (lint + mypy + pytest). If anything fails:
   - Identify the failing dependency by bisecting the lockfile diff.
   - Pin that single package to the previous version and retry.
   - Document the pin in the PR description with a link to the upstream
     release notes.
3. Open a PR titled `chore(deps): monthly Python upgrade (<YYYY-MM>)` with:
   - Diff of `uv.lock`.
   - List of pinned-back packages with reasons.
   - Output of `make ci` showing green.

## Node (web UI)

1. In `services/idun_agent_web/`, run `npm outdated --json`.
2. Apply non-major bumps via `npm update` and `npm install <pkg>@latest` for
   non-major-only packages.
3. Run `npm run build` and `npm run lint`. Fix mechanical type errors only —
   anything beyond that is a major bump in disguise; pin back.
4. Open a PR titled `chore(deps): monthly Node upgrade (<YYYY-MM>)`.

## Major version bumps

For any dependency where a new major is available:
- Do **not** apply.
- Append to a single rolling issue `schedule:major-bumps` with: package,
  current version, latest, link to changelog, breaking-change summary.
- Suggest a priority based on whether the current version still receives
  security updates.

## Constraints

- Never bypass tests or hooks (`--no-verify` is forbidden).
- Never bump across known-breaking pins listed in `pyproject.toml` comments.
- Never run on a release week — check for an open release PR first and skip.
