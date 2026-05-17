# CLAUDE.md

Guidance for Claude Code (and humans) working in `idun-agent-platform`.

## Project Overview

Idun Agent Platform is the open-source toolkit for shipping a single LangGraph or Google ADK agent to production. Developers `pip install idun-agent-engine`, point at their agent module, and get a FastAPI service with a chat UI, admin panel, and built-in MCP, guardrails, observability, and auth — deployable on a laptop or Cloud Run with no manager service required. The `idun-agent-engine` wheel `force-include`s the standalone CLI + bundled UI, so a single `pip install` ships everything; `idun-agent-standalone` is a workspace dev package and is NOT published separately.

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
make format                    # Ruff format (Black-compatible)
make mypy                      # mypy on engine
make precommit                 # all pre-commit hooks
make ci                        # lint + mypy + pytest

# Standalone runtime
idun setup          # alembic migrations + seed from IDUN_CONFIG_PATH
idun serve          # uvicorn under create_standalone_app
idun init           # first-run launcher (migrate + seed + open browser + serve)

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
- Telemetry and observability code (PostHog captures, Langfuse exporters, OpenTelemetry instrumentation, audit-log middleware) must never alter command or runtime semantics. Wrap singleton init, capture, and flush/shutdown calls in their own `try/except Exception` and log via `logger.exception(...)`. Gate downstream telemetry calls on the client/handle being non-None — a failed init must not skip the wrapped function or mask its exception.

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

### Telemetry

- New user-visible UI flows must emit a corresponding PostHog `capture()` call. Reviewers reject PRs that add a button, route, or handler without telemetry.
- The canonical event list lives in `services/idun_agent_standalone_ui/CLAUDE.md#telemetry`. New event names must be added there, in `lib/telemetry/events.ts`, and in `docs/observability/telemetry-events.mdx` in the same PR.
- The single off-switch is `IDUN_TELEMETRY_ENABLED=false` — it kills both Python engine telemetry and the browser path.
- Session replay masking conventions (`data-ph-mask`, `data-ph-no-capture`) are documented in the UI CLAUDE.md. New input elements receiving user content must use one of them.

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
- Python line length: 88. Async throughout. Ruff (lint + format) + Mypy.
- Schema changes land in `idun_agent_schema` first, then engine and standalone consumers. Frontend types regenerate from the standalone OpenAPI spec.

<!-- BEGIN: generated-by render_guidelines -->
## Coding Guidelines — Severity Matrix (auto-generated)

| ID | Title | Severity | Layer |
| --- | --- | --- | --- |
| ADR-001 | Architectural change requires an ADR | advise | pr-review-agent |
| API-001 | Deprecation policy — semver and DeprecationWarning before removal | advise | pr-review-agent |
| ASYNC-001 | No sync I/O on async paths | warn | pre-commit, pr-review-agent |
| ASYNC-002 | Track `asyncio.create_task` references (no fire-and-forget) | warn | pre-commit, pr-review-agent |
| ASYNC-003 | Async session-per-request lifecycle | warn | pr-review-agent, manual |
| CMP-001 | Cyclomatic complexity ≤ 10 (advisory) | advise | pre-commit |
| CMP-002 | Max 6 args; prefer dataclass/TypedDict over many positional args | advise | pre-commit |
| CMP-003 | Extract on 2+ similar call sites; no premature DRY | advise | pr-review-agent |
| DEP-001 | Lockfile must be in sync; pip-audit advisory | advise | ci |
| DOC-001 | Public API requires a docstring | advise | pre-commit |
| ENV-001 | Typed env vars via Pydantic Settings; no scattered `os.getenv` in business logic | warn | pre-commit, pr-review-agent |
| ERR-001 | No `except Exception:` without re-raise + logger.exception | warn | pre-commit, pr-review-agent |
| ERR-002 | Custom exception hierarchy at package boundaries | advise | pr-review-agent |
| ERR-003 | Never swallow exceptions silently | warn | pre-commit, pr-review-agent |
| GIT-001 | Conventional Commits | advise | pre-commit |
| GIT-002 | PRs over 500 LOC should be split | advise | pr-review-agent |
| LOG-001 | Use `logger.exception` for unexpected; never bare `except` | warn | pre-commit, pr-review-agent |
| LOG-002 | Required structured log fields (request_id, agent_id, run_id) | advise | pr-review-agent |
| LOG-003 | Redact secrets/PII from log args | warn | pr-review-agent |
| MAGIC-001 | Magic numbers should be module-level Final constants | advise | pre-commit |
| MIGRATION-001 | SQLAlchemy model change requires Alembic revision in same PR | warn | pr-review-agent |
| OBS-001 | Telemetry must never alter business semantics | warn | pr-review-agent |
| RES-001 | Use `async with` for HTTP/DB/files; no manual `.close()` | warn | pre-commit, pr-review-agent |
| SCHEMA-001 | Schema changes ship in idun_agent_schema before consumers | warn | pr-review-agent |
| SCHEMA-002 | Keep UI API types in sync when standalone backend routes change | warn | pr-review-agent, ci |
| SQL-001 | Parametrized queries only; no f-string SQL | warn | pre-commit, pr-review-agent |
| TEST-001 | New feature ships with at least one test | advise | pr-review-agent |
| TEST-002 | Integration tests hit the real DB, not mocks | warn | pr-review-agent |
| TEST-003 | Coverage thresholds (advisory) | advise | ci |
| TEST-004 | UI and standalone tests gated on every PR | warn | ci |
| TIME-001 | Always tz-aware UTC datetimes; ban `datetime.utcnow()` | warn | pre-commit, pr-review-agent |
| TODO-001 | TODO/FIXME requires `# TODO(owner): <ticket-id>` | advise | pre-commit |
| TYPE-001 | No `Any` outside FFI/JSON boundaries | warn | pre-commit |
| TYPE-002 | Prefer TypedDict / dataclass / Pydantic over raw dicts at boundaries | advise | pr-review-agent |
| UI-001 | TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes | warn | ci |
| UI-002 | Accessibility — eslint-plugin-jsx-a11y rules | advise | pre-commit |
| UI-003 | i18n — user-facing strings via i18next, no inline literals | advise | pre-commit |

Full rule book: `docs/team/CODING-GUIDELINES.md`.
<!-- END: generated-by render_guidelines -->
