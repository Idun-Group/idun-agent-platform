# CLAUDE.md

Guidance for Claude Code (and humans) working in `idun-agent-platform`.

## Project Overview

Idun Agent Platform is the open-source toolkit for shipping a single LangGraph or Google ADK agent to production. Developers `pip install idun-agent-standalone`, point at their agent module, and get a FastAPI service with a chat UI, admin panel, and built-in MCP, guardrails, observability, and auth — deployable on a laptop or Cloud Run with no manager service required.

## Constitution

These principles are load-bearing. Read them before deciding how to structure new work.

- **Schema flows first.** Pydantic models in `idun_agent_schema` change before consumers (engine, standalone, UI types).
- **Engine is the runtime source of truth.** `idun_agent_standalone` never duplicates engine logic — it composes it.
- **Standalone is the open-source product target.** Single-process, single-tenant, deployable on Cloud Run with `pip install`. One agent per install.
- **DB is steady-state truth in standalone.** YAML seeds at first boot only; runtime mutations flow through the admin REST.
- **Reload over restart.** Admin mutations route through the validate-rebuild-reload pipeline; engine init failures roll back the DB write.
- **AG-UI is the streaming contract.** Don't invent another protocol.
- **Async throughout.** All Python I/O paths are async — agents, sessions, DB, HTTP.

## Repository Map

| Path | Purpose | Read its CLAUDE.md when… |
| --- | --- | --- |
| `libs/idun_agent_schema` | Shared Pydantic models | Changing config shape, enums, validation |
| `libs/idun_agent_engine` | Engine SDK runtime | Touching agent adapters, AG-UI streaming, MCP, guardrails, observability |
| `libs/idun_agent_standalone` | Single-process runtime | Working on admin REST, reload pipeline, auth, CLI |
| `services/idun_agent_standalone_ui` | Bundled Next.js UI | Working on chat, admin pages, theme, traces viewer |
| `docs/` | Mintlify public docs | Writing user-facing documentation |

## Quick Commands

Package managers: `uv` (Python workspace), `pnpm` (Node — only in `services/idun_agent_standalone_ui`).

```bash
# First-time setup
make sync                      # uv sync --all-groups (full workspace install)
make dev                       # editable installs of the three libs

# Fast inner loop
make test                      # all pytest
make lint                      # ruff check
make format                    # black + ruff format
make mypy                      # mypy on engine
make precommit                 # all pre-commit hooks
make ci                        # lint + mypy + pytest

# Standalone runtime
idun-standalone setup          # alembic migrations + seed from IDUN_CONFIG_PATH
idun-standalone serve          # uvicorn under create_standalone_app
idun-standalone init           # first-run launcher (migrate + seed + open browser + serve)

# Standalone UI dev
cd services/idun_agent_standalone_ui
pnpm install
pnpm dev                       # local Next.js dev server

# Wheel build (UI bundled into standalone wheel)
make build-standalone-ui       # builds Next.js, copies static export into the standalone package
make build-standalone-wheel    # builds the Python wheel
```

For service-specific test commands, see the service's CLAUDE.md.

## Development Principles

### Testing Workflow

**New features:**
1. Write a test that defines expected behavior. Run it — it must fail.
2. Write the minimum code to make the test pass.
3. Refactor the implementation. Tests must still pass.
4. Add tests for edge cases.

**Editing existing features:**
1. Run existing tests — confirm they pass.
2. Modify the code.
3. Run tests — confirm no regressions.
4. Add new tests covering edge cases and new behavior.

**Rules:**
- Keep cycles small — a few lines of test, a few lines of implementation.
- When refactoring, change either test code or implementation, not both at once.
- Never skip the refactor step.
- Test infrastructure must match production patterns (same drivers, same lifecycle).

### Error Handling

- Use global exception handlers for unexpected errors. Catch locally only when the response or recovery logic differs from the default.
- `logger.exception()` for unexpected errors (preserves traceback). `logger.error()` only when you intentionally omit the traceback.
- Never swallow exceptions silently. Never catch `Exception` to re-raise a generic message unless preventing internal detail leaks.

### Refactoring

- Never reduce error safety when refactoring.
- Extract only when there are 2+ call sites with meaningfully coupled logic.
- Don't add abstraction layers for hypothetical future use.

### Type Safety

- No `Any` unless genuinely unavoidable. Read the source to find the real type.
- Use dataclasses, `TypedDict`, or Pydantic models for structured data crossing module boundaries — not raw dicts.

### Code Changes

- Read before you write. Understand existing patterns before modifying.
- Minimize blast radius — change only what's needed for the task.
- Preserve existing conventions even if you'd do it differently in a greenfield project.
- Don't mix refactoring with feature work in the same change.
- Small, focused commits — one concern per commit.
- When proposing a change, state what could break.
- Verify assumptions before acting on them (e.g. check if an import is circular before moving it).

### Decision-Making

- Reason from PEPs, framework docs, and established patterns. State the reasoning.
- Don't reverse a position based on tone — only on new technical information.
- When unsure between two valid approaches, state both with trade-offs instead of picking one arbitrarily.
- If something feels off about a request or approach, say so and explain why. Push back with reasoning rather than complying silently.
- If the user's suggestion would introduce a bug, reduce safety, or violate a best practice, flag it clearly before proceeding.

## Documentation Workflow

CLAUDE.md is part of the public contract — read by Claude, contributors, and AI indexers. Keep it current.

- **PR scope rule.** If your PR adds, removes, or renames any of: a public function/class, an HTTP route, a CLI command, an env var, a config field, a module, or a top-level directory — update the relevant CLAUDE.md in the same PR. Reviewers reject drift.
- **Verification anchors.** Volatile blocks (route tables, env var lists, module trees) carry an HTML comment immediately above of the form `<!-- VERIFY: regenerate from <path> -->`, `<!-- VERIFY: confirm against <path>:<symbol> -->`, or `<!-- VERIFY: env vars in <path> -->`. Always verify against source before quoting them.
- **New paths.** Adding a top-level directory or service requires a one-line entry in the Repository Map above.
- **Service files own their detail.** Don't restate route tables, env vars, or module trees in this root. Link to the service file instead.

### Service-level template

Every CLAUDE.md under `libs/` and `services/` must contain these sections in order:

1. `# CLAUDE.md — <Package Name>`
2. **What this is** — 2–4 sentences. What it does, what it's published as, entry points.
3. **Module map** — directory tree with one-line description per file/folder, prefixed by `<!-- VERIFY: regenerate from src/ tree -->`.
4. **Public API** *(or "Entry points")* — surface other parts of the system depend on.
5. **Tests** — how to run, what's in unit/ vs integration/, infrastructure quirks.
6. **Conventions** — rules specific to this package.
7. **Deferred features** — table of intentionally absent things a reader might expect.

Plus any of these domain blocks that genuinely apply, in this order: Config flow · Auth · Reload pipeline · Endpoints / routes table · Adapters / integrations table · Settings / environment variables · Build / packaging notes.

## Branch and code conventions

- Branch naming: `feat/*`, `fix/*`, `docs/*`, `chore/*`, `misc/*`.
- Python line length: 88. Async throughout. Ruff + Black + Mypy.
- Schema changes land in `idun_agent_schema` first, then engine and standalone consumers. Frontend types regenerate from the standalone OpenAPI spec.
