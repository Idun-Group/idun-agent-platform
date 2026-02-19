# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idun Agent Platform is a self-hosted control plane that wraps LangGraph/ADK agents into production-ready services. It's a monorepo with three layers: a Python SDK/engine, a FastAPI management backend, and a React admin UI.

## Repository Structure

- `libs/idun_agent_schema/` — Shared Pydantic models (published to PyPI)
- `libs/idun_agent_engine/` — SDK runtime that wraps agents into FastAPI services (published to PyPI)
- `services/idun_agent_manager/` — FastAPI + PostgreSQL backend for agent config CRUD, auth, policy enforcement
- `services/idun_agent_web/` — React 19 + Vite + TypeScript admin dashboard
- `services/copilot_runtime/` — Node.js CopilotKit runtime for real-time agent streaming
- `docs/` — MkDocs Material documentation site

## Build & Development Commands

**Package manager:** UV (Python), npm (Node.js)

```bash
# Install all Python dependencies
make sync                    # or: uv sync --all-groups

# Install libs in editable mode
make dev

# Run full dev stack (PostgreSQL + Manager + Web + CopilotKit)
docker compose -f docker-compose.dev.yml up --build

# Run manager locally (port 8000)
make dev-manager

# Run frontend locally (port 3000)
cd services/idun_agent_web && npm install && npm run dev

# Run copilot runtime locally (port 8001)
cd services/copilot_runtime && npm install && npm run dev
```

## Testing

```bash
make test                    # Run all tests (uv run pytest -q)
make pytest                  # Run all tests (uv run pytest)

# Run a single test file
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_langgraph.py -v

# Run a specific test
uv run pytest tests/unit/agent/test_langgraph.py::test_name -v

# Skip tests requiring external services
uv run pytest -m "not requires_langfuse and not requires_phoenix and not requires_postgres"
```

Tests are in `libs/idun_agent_engine/tests/` with `unit/` and `integration/` subdirectories.

## Linting & Formatting

```bash
make lint                    # Ruff check
make format                  # Black + Ruff format
make mypy                    # Type check engine lib
make precommit               # Run all pre-commit hooks
make ci                      # lint + mypy + pytest
```

Pre-commit hooks: Ruff linter/formatter, Pyright (manual stage), Gitleaks secret detection.

## Architecture

**Engine** (`idun_agent_engine`): FastAPI wrapper around agent frameworks. Config-driven (YAML or programmatic). Handles streaming (AG-UI protocol), checkpointing (in-memory/SQLite/PostgreSQL), observability (Langfuse/Phoenix/LangSmith/OpenTelemetry), guardrails (PII detection, topic restriction, toxicity filtering), and MCP tool management. Entry point: `idun` CLI command.

**Manager** (`idun_agent_manager`): Control plane API. Routers in `src/app/api/v1/routers/` for agents, auth (OIDC + session-based), guardrails, memory, observability, MCP servers, workspaces (multi-tenancy). Database models in `src/app/infrastructure/db/models/`. Migrations via Alembic in `alembic/`.

**Web UI** (`idun_agent_web`): Pages in `src/pages/` (login, dashboard, agent forms, settings). Components in `src/components/`. Auto-generated API types in `src/generated/`. Uses styled-components, Monaco Editor, CopilotKit, i18next.

**CopilotKit Runtime** (`copilot_runtime`): Bridges CopilotKit clients to agents via AG-UI protocol adapters.

## Database Migrations (Manager)

```bash
# Create a new migration
cd services/idun_agent_manager && alembic revision --autogenerate -m "description"

# Run migrations (happens automatically in dev Docker setup)
alembic upgrade head
```

## Key Tech Stack

- **Python 3.12+**, FastAPI, SQLAlchemy (async), Pydantic 2.11+, Alembic
- **Node.js 20 LTS**, React 19, Vite 7, TypeScript
- **PostgreSQL 16** (asyncpg driver)
- **Agent frameworks:** LangGraph (primary), Google ADK, Haystack (experimental)
- **Build:** Hatchling (Python packages), UV workspace with editable local deps

## Conventions

- Python line length: 88 (Black default)
- Python code uses async throughout (asyncpg, SQLAlchemy async sessions)
- Ruff for linting, Black for formatting, mypy for type checking
- Schema changes go in `idun_agent_schema` first, then consumed by engine/manager
- Branch naming: `feat/*`, `fix/*`, `docs/*`, `chore/*`, `misc/*`

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
- Use dataclasses, `TypedDict`, or Pydantic models for structured data that crosses module boundaries — not raw dicts.

### Code Changes
- Read before you write. Understand existing patterns before modifying.
- Minimize blast radius — change only what's needed for the task.
- Preserve existing conventions even if you'd do it differently in a greenfield project.
- Don't mix refactoring with feature work in the same change.
- Small, focused commits — one concern per commit.
- When proposing a change, state what could break.
- Verify assumptions before acting on them (e.g. check if an import is circular before moving it, check if a dependency override matches before rewriting a test).

### Code Quality
- Run `make lint` and `make precommit` before committing.
- Only add comments when the logic isn't self-evident. No restating what the code does.
- Run `make ci` (lint + mypy + pytest) to validate changes end-to-end.

### Decision-Making
- Reason from PEPs, framework docs, and established patterns. State the reasoning.
- Don't reverse a position based on tone — only on new technical information.
- When unsure between two valid approaches, state both with trade-offs instead of picking one arbitrarily.
- If something feels off about a request or approach, say so and explain why. Push back with reasoning rather than complying silently.
- If the user's suggestion would introduce a bug, reduce safety, or violate a best practice, flag it clearly before proceeding.
