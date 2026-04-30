# Weekly Docs ↔ Code Sync

**Cadence:** every 7 days
**Branch prefix:** `docs/sync-`
**Required tools:** Read, Grep/Bash, Edit, GitHub MCP (PR create)
**Rolling issue label:** `schedule:docs-sync`

## Goal

Detect drift between the public Mintlify docs in `docs/` and the actual
behavior of `idun_agent_engine`, `idun_agent_manager`, and the CLI. Open a
single PR fixing mechanical drift; flag judgment calls in the PR description.

## What to verify

For each `.mdx` file under `docs/`:

1. **Config keys.** Anything documented as a YAML/Pydantic config key must
   exist on the corresponding model in `libs/idun_agent_schema/`. Missing or
   renamed keys → drift.
2. **Env vars.** Any documented env var must appear in a settings class or
   `os.getenv` call. Vendored secrets are out of scope.
3. **CLI flags.** For documented `idun …` commands, run
   `uv run idun <subcommand> --help` and diff documented flags vs actual.
4. **HTTP routes.** For documented manager endpoints, verify path + method
   exist in `services/idun_agent_manager/src/app/api/v1/routers/`.
5. **Code samples.** Snippets marked as runnable Python must parse with
   `python -m py_compile`. Snippets importing from `idun_agent_engine` or
   `idun_agent_schema` must resolve.

## Steps

1. Run all five checks above. Aggregate findings into a drift report.
2. Apply mechanical fixes (renamed keys, renamed flags, renamed env vars).
3. Flag everything else in the PR description under "Needs human review".
4. If fixes were made, open one PR titled
   `docs: weekly drift fixes (<YYYY-MM-DD>)`.
5. If no drift, append a clean-run line to the rolling issue.

## Out of scope

- Marketing copy, screenshots, conceptual explanations.
- `old-docs/` — archived, do not touch.
- Anything that requires running services (no integration tests here).
