# CLAUDE.md — Idun Agent Standalone

## What this is

`idun_agent_standalone` is a single-process, single-tenant agent runtime. It wraps `idun-agent-engine` with an embedded admin REST surface, traces capture, a bundled Next.js UI (chat / admin / traces), and a reload orchestrator. Designed for one-agent deployments — laptop, VM, or Cloud Run.

Published to PyPI as `idun-agent-standalone`. CLI entry point: `idun-standalone`.

## Module map

```
idun_agent_standalone/
├── cli.py              # Click commands: serve, init, hash-password, export
├── app.py              # create_standalone_app(settings) — FastAPI factory wrapping the engine app
├── settings.py         # Pydantic settings: IDUN_*, DATABASE_URL, IDUN_UI_DIR, container detection
├── config_assembly.py  # Merges DB-backed admin state into engine EngineConfig
├── config_io.py        # YAML <-> DB import/export
├── reload.py           # Reload orchestrator: rebuild engine app on admin write, swap routes atomically
├── runtime.py          # Live agent handle, observer registration after each reload
├── scaffold.py         # `init` command — copies template into a new project dir
├── middleware.py       # Session cookie middleware, container-aware Secure flag, auth gate
├── errors.py           # Standalone-specific HTTPException subclasses
├── auth/               # Password auth (none mode short-circuits); session cookies, sliding renewal, rotation
├── db/                 # SQLAlchemy async models + Alembic migrations (admin tables + trace_event)
├── admin/routers/      # /admin/api/v1/* — agent, guardrails, mcp, prompts, observability, integrations, theme, settings
├── traces/             # AG-UI run-event observer, batched writer, retention purge (APScheduler)
├── theme/              # Theme model, defaults, /runtime-config.js bootstrap
├── static/             # Bundled Next.js export (copied in by build-standalone-ui make target)
├── testing.py          # Pytest helpers: in-memory app fixture
└── testing_app.py      # Lightweight app variant for tests (skips static UI mount)
```

## Key entry points

- `idun-standalone serve` — runs `create_standalone_app(settings)` under uvicorn.
- `create_standalone_app(settings: StandaloneSettings) -> FastAPI` — public factory used by tests and embedders.
- `idun-standalone init <name>` — scaffold a new project from `scaffold/`.
- `idun-standalone hash-password [--password ...]` — bcrypt the admin password.
- `idun-standalone export [--out config.yaml]` — dump current DB state to YAML.

## Config flow

1. **First boot**: if the DB is empty and `IDUN_CONFIG_PATH` points to a YAML file, `config_io.import_yaml()` seeds the admin tables.
2. **Steady state**: the DB is the source of truth. `config_assembly.build_engine_config()` materializes a fresh `EngineConfig` for the engine on every (re)load.
3. **Admin write**: every admin REST mutation calls `reload.trigger()`, which rebuilds the engine app and swaps it atomically — running requests finish on the old app.

## Auth

Two modes, gated by `IDUN_ADMIN_AUTH_MODE`:

- `none` — open admin (laptop default).
- `password` — bcrypt hash + session cookie (containerized default).

OIDC is deferred to MVP-2. Sessions use signed cookies with sliding renewal on the configured TTL. Password rotation invalidates outstanding sessions. `IDUN_SESSION_SECRET` must be at least 32 characters in `password` mode (enforced at startup).

**Password rotation:** On first boot, the admin row is seeded from
`IDUN_ADMIN_PASSWORD_HASH`. After that, the DB is the source of truth —
admin password changes via the UI are durable across restarts. Re-seed
from env by setting `IDUN_FORCE_ADMIN_PASSWORD_RESET=1` for one boot.

## Traces

The runtime registers an AG-UI observer on the engine after every reload (`runtime.attach_observer()`). Events are buffered in-process and flushed in batches to `trace_event` to avoid blocking the request path. APScheduler runs an hourly retention purge (`IDUN_TRACES_RETENTION_DAYS`).

## Tests

```bash
uv run pytest libs/idun_agent_standalone/tests
```

`tests/unit/` — module-level (settings, auth, config_assembly, reload).
`tests/integration/` — end-to-end via the test app fixture; uses SQLite by default.

## Conventions

Same as the rest of the monorepo: ruff + black, mypy, async throughout, schema lives in `idun_agent_schema`. The engine remains the single source of truth for runtime config — the standalone never duplicates engine logic.
