# CLAUDE.md — Idun Agent Standalone

## What this is

`idun_agent_standalone` is a single-process, single-tenant agent runtime. It wraps `idun-agent-engine` with an embedded admin REST surface, an in-process reload pipeline, and a bundled Next.js UI (chat plus admin pages). One agent per install — laptop, VM, or Cloud Run.

Published to PyPI as `idun-agent-standalone`. CLI entry point: `idun`.

## Module map

<!-- VERIFY: regenerate from libs/idun_agent_standalone/src/idun_agent_standalone/ -->
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
│   ├── traces/               # OTel SpanExporter + writer + retention scheduler + bootstrap callback
│   └── scripts/seed.py       # YAML → DB seed at first boot
├── db/
│   ├── alembic.ini
│   ├── migrate.py
│   └── migrations/           # Alembic baseline (5e05fbe68d61_baseline.py)
└── static/                   # Bundled Next.js export (copied in by build-standalone-ui make target)
```

Empty legacy directories (`admin/`, `auth/`, `theme/`) remain only as namespace placeholders for features deferred to a later release; see "Deferred features" below.

## Key entry points

- `idun init` — first-run launcher. Runs migrations + seed + opens the browser at `http://<host>:<port>/` + boots uvicorn. Idempotent. `--port` flag (or `IDUN_PORT` env), `--no-browser` flag for Cloud Run / headless. The browser handles the wizard-or-chat conditional via the chat root's `getAgent` 200/404 redirect.
- `idun setup` — runs Alembic migrations and seeds the DB from `IDUN_CONFIG_PATH` if empty.
- `idun serve` — runs `create_standalone_app(settings)` under uvicorn in the same event loop.
- `create_standalone_app(settings: StandaloneSettings) -> FastAPI` — public async factory used by tests and embedders.

## Config flow

1. **First boot**: operator runs `idun setup`. If the DB is empty and `IDUN_CONFIG_PATH` points to a YAML file, `infrastructure/scripts/seed.seed_from_yaml_if_empty` materializes the admin tables.
2. **Steady state**: the DB is the source of truth. `services/engine_config.assemble_engine_config()` materializes a fresh `EngineConfig` for the engine on every (re)load.
3. **Admin write**: every admin REST mutation runs through `services/reload.commit_with_reload`, which (a) reassembles + validates the engine config, (b) on success calls the engine reload callable so the running engine picks up the new shape, (c) on failure rolls back the DB write so the API surface remains consistent.

## Auth

Two modes, gated by `IDUN_ADMIN_AUTH_MODE`:

- `none` — open admin (laptop default). `require_auth` is a pass-through.
- `password` — bcrypt-hashed admin password + signed session cookie. Strict-minimum scope: login / logout / change-password / me, no rate-limit, no CSRF token, no sliding renewal, no rotation invalidation of outstanding sessions.

<!-- VERIFY: env vars in libs/idun_agent_standalone/src/idun_agent_standalone/core/settings.py -->
Required env vars in password mode:

- `IDUN_SESSION_SECRET` — at least 32 characters; signs the `idun_session` cookie. Startup fails fast with `SettingsValidationError` when shorter.
- `IDUN_ADMIN_PASSWORD_HASH` — bcrypt hash, only consulted at first boot to seed the admin row. Generate with `idun hash-password` and export. Once the row exists, the env var is ignored.
- `IDUN_SESSION_TTL_HOURS` — defaults to 24, range `[1, 720]`.

<!-- VERIFY: regenerate from libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/auth.py -->
Endpoints (`/admin/api/v1/auth/`):

- `GET /me` — `{authenticated, authMode}`. In `none` mode always authenticated. In `password` mode reflects the cookie/session lookup.
- `POST /login` — `{password}` body; sets the signed `idun_session` cookie on success. Bad password and missing admin row both return `401` `auth_required` (anti-enumeration).
- `POST /logout` — drops the session row, clears the cookie. Idempotent.
- `POST /change-password` — gated by `require_auth`. `{currentPassword, newPassword}` body. New password must be at least 8 characters. Outstanding sessions are NOT invalidated by design; tightening that rule is a one-line `DELETE FROM standalone_session` away.

Cookie shape: `HttpOnly`, `SameSite=Lax`, `Secure` flipped on automatically when `request.url.scheme == https` or `X-Forwarded-Proto: https` (so localhost dev and TLS-terminating proxies both work without an extra knob).

Tables: `standalone_admin_user` (singleton, fixed PK `"singleton"`), `standalone_session` (one row per active session, TTL on `expires_at`). Both land in alembic revision `a1c0d2e3f4b5_admin_user_and_session`.

`api/v1/deps.py:reload_disabled` is wired as `reload_auth=` on `create_engine_app`. Engine `POST /reload` returns `403` — admin reloads must go through `/admin/api/v1/*`, which run under the rebuild-and-validate pipeline.

## Reload pipeline

Three rounds of validation:

1. **Round 1** — FastAPI Pydantic body validation. Bad input shape → `422` with `field_errors`.
2. **Round 2** — assembled `EngineConfig` revalidation. Cross-resource mismatches (e.g. LangGraph agent + ADK SessionService memory) → `422` with `field_errors`, DB rolled back.
3. **Round 3** — engine reload callable applies the new config. Engine init failure → `500` (`ReloadInitFailed`), DB rolled back, `runtime_state` records the outcome.

Structural changes the running engine cannot pick up (e.g. agent.type switch) commit the DB and return `restart_required` instead of invoking reload. The `runtime_state` row records the most recent reload outcome for the operator dashboard.

## Trace pipeline

Standalone owns the default local trace store. The pipeline is on by default; spans flow:

```text
Engine TracerProvider (LangChain/ADK/MCP/Guardrails instrumentors)
        │
        ▼  (BatchSpanProcessor, max_queue_size=8192, batch=512, schedule=2s)
infrastructure/traces/exporter.py — sync export() pushes onto bounded queue
        │
        ▼
infrastructure/traces/writer.py — asyncio task drains, dialect-dispatched insert
        │
        ▼  (Postgres: copy_records_to_table, 500 rows / 250 ms;
        │   SQLite: executemany)
standalone_trace + standalone_span tables
        │
        ▼
/admin/api/v1/traces  →  bundled trace UI
```

**Bootstrap.** A `post_configure_callbacks` entry registered on `app.state` calls `otel_lifecycle.attach_span_processor(...)` (see `libs/idun_agent_engine/CLAUDE.md`) with our exporter on first agent boot, plus on every reload. When the user has selected no observability provider, or selected Langfuse / LangSmith (which both bypass OTel), the callback also self-installs `LangChainInstrumentor` via `attach_instrumentor(...)` so the local store always captures.

**Root-span finalize.** On every span insert, the writer checks whether the parent `otel_trace_id` exists in `standalone_trace`. The first insert into a new trace creates the row. When the root span ends, `infrastructure/traces/_finalizer.py` aggregates child spans (`models text[]` denormalisation, `total_tokens`, `total_cost_usd`, end-to-end `latency_ms`) into the trace row.

**Multi-worker.** Uvicorn `--workers > 1` is supported. Each worker has its own `TracerProvider`, exporter, queue, and asyncio writer task. Singleton tasks (Postgres partition lifecycle, LiteLLM pricing-table refresh) are fenced via `pg_try_advisory_lock` — only the worker that wins the lock runs the task.

**Retention.** A scheduled task in `infrastructure/traces/retention.py` runs daily. Postgres detaches expired monthly partitions concurrently and drops them, plus pre-creates the next two months. SQLite runs `DELETE FROM standalone_trace WHERE started_at < ?`. Defaults to 14 days.

**Env vars (consumed at runtime by `infrastructure/traces/`):**

| Var | Default | Effect |
| --- | --- | --- |
| `IDUN_TRACE_RETENTION_DAYS` | `14` | Days to keep before retention drop. |
| `IDUN_TRACES_INPUT_VALUE_MAX_BYTES` | `65536` | Per-attribute byte cap before truncation. |
| `IDUN_PRICES_REFRESH` | `false` | When `true`, fetch the LiteLLM model-prices snapshot at boot (5 s timeout, snapshot fallback). |

**Failure mode.** OBS-001: if the asyncio writer task crashes, the engine continues serving and the failure is logged; the bounded queue overflow counter is exposed via `/admin/api/v1/traces/_health` for the trace pipeline health panel. Span emission never blocks agent boot or runtime.

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
| Real password auth (login, logout, change-password, /me) | `auth/` | **Implemented** in strict-minimum scope; see "Auth" above. Sliding renewal, rotation invalidation, rate-limit, CSRF token still deferred. |
| `/admin/api/v1/theme` (theme model + admin route) | `theme/` | The runtime-config bootstrap (`runtime_config.py`) still exposes a default theme to the SPA, but there is no admin route to mutate it |
| Traces | `traces/` | **Implemented in v1** — OTel-based trace pipeline lives at `infrastructure/traces/`, served via `/admin/api/v1/traces`. See "Trace pipeline" below. |
| `idun init <name>` scaffold command | `scaffold.py` | **Restored** — see "Key entry points" above. Now a thin launcher (migrations + seed + browser + serve), not the legacy multi-file scaffolder. |
| `idun hash-password` | `cli.py` | **Restored** — generates a bcrypt hash for `IDUN_ADMIN_PASSWORD_HASH`. |
| `idun-standalone export` | `config_io.py` | Removed; YAML export comes back with the materialized-config endpoints (deferred) |
| `runtime.py` (live agent handle, observer registration after each reload) | top-level | Removed with traces |

The empty `admin/`, `auth/`, `theme/` directories remain on disk so import paths used by deferred-feature work-in-progress branches don't have to change name.

## Conventions

Same as the rest of the monorepo: ruff (lint + format) + mypy, async throughout, schema lives in `idun_agent_schema`.

**Don't duplicate engine logic.** The engine is the single source of truth for runtime config. If a helper feels useful here, push it down into engine first; standalone consumes it. Assembly in this package is JSON normalization plus the manager-shape converters — nothing that overlaps with adapter, observability, guardrails, or MCP behavior already owned by the engine. **Why:** standalone is a thin composition layer over engine. Duplicating logic here causes drift between adapters, observability, and the rebuild-reload pipeline, and breaks the constitutional rule in the root CLAUDE.md ("Engine is the runtime source of truth — `idun_agent_standalone` never duplicates engine logic, it composes it").

**Single-process, single-tenant.** Reject changes that introduce multi-tenant assumptions (per-request tenant lookups, workspace scoping, multi-agent registries). One agent per install.

**DB is steady-state truth.** YAML seeds run at first boot only. Runtime mutations must flow through the admin REST and the validate-rebuild-reload pipeline (`services/reload.commit_with_reload`). Engine init failures must roll back the DB write — admin routes that mutate state without that rollback path are bugs.
