# CLAUDE.md — Idun Agent Standalone

## What this is

`idun_agent_standalone` is a single-process, single-tenant agent runtime. It wraps `idun-agent-engine` with an embedded admin REST surface, an in-process reload pipeline, and a bundled Next.js UI (chat plus admin pages). One agent per install — laptop, VM, or Cloud Run.

Published to PyPI as `idun-agent-standalone`. CLI entry point: `idun-standalone`.

## Module map

```
idun_agent_standalone/
├── cli.py                    # Click commands: setup, serve
├── app.py                    # create_standalone_app(settings) — async FastAPI factory wrapping the engine app
├── runtime_config.py         # GET /runtime-config.js — bootstrap script the SPA loads before first paint
├── core/
│   ├── settings.py           # Pydantic settings: IDUN_*, DATABASE_URL, AuthMode (NONE | PASSWORD)
│   └── logging.py            # logger setup
├── api/v1/
│   ├── deps.py               # SessionDep, ReloadCallableDep, require_auth, reload_disabled
│   ├── errors.py             # AdminAPIError + register_admin_exception_handlers
│   └── routers/              # agent, memory, guardrails, mcp_servers, observability, integrations, prompts, auth (/me stub)
├── services/
│   ├── reload.py             # commit_with_reload, _reload_mutex, ReloadInitFailed
│   ├── engine_config.py      # assemble_engine_config — DB rows → EngineConfig
│   ├── engine_reload.py      # build_engine_reload_callable — wraps engine cleanup + reconfigure
│   ├── runtime_state.py      # last reload outcome (status, ts, message) persisted to runtime_state row
│   ├── slugs.py              # NFKD normalize + ensure_unique_slug helpers (-2, -3, ... up to -99)
│   └── validation.py         # round-2 assembled-config validation helpers
├── infrastructure/
│   ├── db/
│   │   ├── session.py        # async_sessionmaker + Base
│   │   └── models/           # ORMs: agent, memory, guardrail, mcp_server, observability, integration, prompt, install_meta, runtime_state
│   └── scripts/seed.py       # YAML → DB seed at first boot
├── db/
│   ├── alembic.ini
│   ├── migrate.py
│   └── migrations/           # Alembic baseline (5e05fbe68d61_baseline.py)
└── static/                   # Bundled Next.js export (copied in by build-standalone-ui make target)
```

Empty legacy directories (`admin/`, `auth/`, `theme/`, `traces/`) remain only as namespace placeholders for features deferred to a later release; see "Deferred features" below.

## Key entry points

- `idun-standalone setup` — runs Alembic migrations and seeds the DB from `IDUN_CONFIG_PATH` if empty.
- `idun-standalone serve` — runs `create_standalone_app(settings)` under uvicorn in the same event loop.
- `create_standalone_app(settings: StandaloneSettings) -> FastAPI` — public async factory used by tests and embedders.

## Config flow

1. **First boot**: operator runs `idun-standalone setup`. If the DB is empty and `IDUN_CONFIG_PATH` points to a YAML file, `infrastructure/scripts/seed.seed_from_yaml_if_empty` materializes the admin tables.
2. **Steady state**: the DB is the source of truth. `services/engine_config.assemble_engine_config()` materializes a fresh `EngineConfig` for the engine on every (re)load.
3. **Admin write**: every admin REST mutation runs through `services/reload.commit_with_reload`, which (a) reassembles + validates the engine config, (b) on success calls the engine reload callable so the running engine picks up the new shape, (c) on failure rolls back the DB write so the API surface remains consistent.

## Auth

Two modes, gated by `IDUN_ADMIN_AUTH_MODE`:

- `none` — open admin (laptop default). The `require_auth` dependency is a pass-through.
- `password` — fails closed with `503` until the real password+session implementation lands. The dependency stub is in place so router-level wiring won't change when auth ships; only the dependency body becomes meaningful.

`/admin/api/v1/auth/me` is a stub: in `none` mode it returns `{authenticated: True, auth_mode: "none"}` so the bundled UI can render without a login wall.

`api/v1/deps.py:reload_disabled` is wired as `reload_auth=` on `create_engine_app`. Engine `POST /reload` returns `403` — admin reloads must go through `/admin/api/v1/*`, which run under the rebuild-and-validate pipeline.

## Reload pipeline

Three rounds of validation:

1. **Round 1** — FastAPI Pydantic body validation. Bad input shape → `422` with `field_errors`.
2. **Round 2** — assembled `EngineConfig` revalidation. Cross-resource mismatches (e.g. LangGraph agent + ADK SessionService memory) → `422` with `field_errors`, DB rolled back.
3. **Round 3** — engine reload callable applies the new config. Engine init failure → `500` (`ReloadInitFailed`), DB rolled back, `runtime_state` records the outcome.

Structural changes the running engine cannot pick up (e.g. agent.type switch) commit the DB and return `restart_required` instead of invoking reload. The `runtime_state` row records the most recent reload outcome for the operator dashboard.

## Tests

```bash
uv run pytest libs/idun_agent_standalone/tests
```

`tests/unit/` — module-level (settings, reload service, runtime state, slug normalization, validation, CLI shape regression, require_auth, reload_disabled).
`tests/integration/api/v1/` — end-to-end through ASGITransport with router-level dependency overrides; uses in-memory SQLite. One test per resource flow plus `test_auth_gate.py` covering the `require_auth` gate end-to-end.

The `_reload_mutex` is module-level for production but bound to a fresh `asyncio.Lock` per test by `tests/integration/api/v1/conftest.py:_reset_reload_mutex` (autouse).

## Deferred features

These were present in the pre-rework standalone but have **no router or service in the current api/v1 layer**. They will return in a future release; the standalone CLAUDE.md will be updated when they do.

| Feature | Pre-rework location | Status |
| --- | --- | --- |
| Real password auth (login, logout, change-password, sessions, sliding renewal, rotation) | `auth/` | Stub: `require_auth` returns 503 in `password` mode |
| `/admin/api/v1/theme` (theme model + admin route) | `theme/` | The runtime-config bootstrap (`runtime_config.py`) still exposes a default theme to the SPA, but there is no admin route to mutate it |
| Traces (AG-UI run-event observer, batched writer to `trace_event`, hourly retention purge via APScheduler) | `traces/` | Backend dropped; `trace_event` table is not materialized by the baseline migration. UI pages under `/traces` will 404 against the API |
| `idun-standalone init <name>` scaffold command | `scaffold.py` | Removed; bootstrap a new project by writing a `config.yaml` directly and running `idun-standalone setup` |
| `idun-standalone hash-password` | `cli.py` | Removed pending password auth |
| `idun-standalone export` | `config_io.py` | Removed; YAML export comes back with the materialized-config endpoints (deferred) |
| `runtime.py` (live agent handle, observer registration after each reload) | top-level | Removed with traces |

The empty `admin/`, `auth/`, `theme/`, `traces/` directories remain on disk so import paths used by deferred-feature work-in-progress branches don't have to change name.

## Conventions

Same as the rest of the monorepo: ruff + black, mypy, async throughout, schema lives in `idun_agent_schema`. The engine remains the single source of truth for runtime config — the standalone never duplicates engine logic; assembly is JSON normalization plus the manager-shape converters where needed.
