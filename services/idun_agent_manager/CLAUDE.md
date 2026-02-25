# CLAUDE.md — Idun Agent Manager

## What This Is

`idun_agent_manager` is the **control plane API** for the Idun Agent Platform. It's a FastAPI + PostgreSQL backend that provides CRUD operations for managing agents, guardrails, MCP servers, observability configs, and memory configs — all through a multi-tenant workspace model. The web UI talks to this service.

The engine fetches its config from this service when running with `--source manager`.

## Project Layout

```
services/idun_agent_manager/
├── src/app/
│   ├── main.py                    # FastAPI app factory, lifespan, route setup
│   ├── core/
│   │   ├── settings.py            # get_settings() — cached Settings singleton
│   │   ├── security.py            # bcrypt password hashing/verification
│   │   └── logging.py             # stdlib logging setup
│   ├── api/v1/
│   │   ├── deps.py                # DI: get_session, get_current_user, require_workspace
│   │   ├── schemas/auth.py        # LoginRequest, RegisterRequest
│   │   └── routers/
│   │       ├── auth.py            # Google OIDC SSO + username/password auth
│   │       ├── agents.py          # Agent CRUD + API key generation + config endpoint
│   │       ├── guardrails.py      # Guardrail config CRUD
│   │       ├── mcp_servers.py     # MCP server config CRUD
│   │       ├── observability.py   # Observability config CRUD
│   │       ├── memory.py          # Memory/checkpoint config CRUD
│   │       ├── workspaces.py      # Workspace CRUD
│   │       ├── agent_frameworks.py  # List supported frameworks (read-only)
│   │       └── health.py          # /healthz, /readyz, /version
│   └── infrastructure/db/
│       ├── session.py             # SQLAlchemy async engine + session factory (singletons)
│       ├── migrate.py             # Alembic auto-migration at startup (with advisory lock)
│       ├── seed.py                # DB seeding
│       └── models/
│           ├── settings.py        # Pydantic Settings (nested: Database, Auth, Google)
│           ├── managed_agent.py   # ManagedAgentModel
│           ├── managed_guardrail.py
│           ├── managed_mcp_server.py
│           ├── managed_memory.py
│           ├── managed_observability.py
│           ├── user.py            # UserModel
│           ├── workspace.py       # WorkspaceModel
│           └── membership.py      # MembershipModel (user ↔ workspace, role)
├── alembic/                       # Alembic migration scripts
├── alembic.ini
├── pyproject.toml
└── tests/
```

## API Routes

All resource routes are prefixed with `/api/v1/` and require authentication (session cookie). Resource endpoints are scoped to the user's active workspace via `X-Workspace-Id` header or first workspace from session.

| Prefix | Router | Auth | Description |
|---|---|---|---|
| `/api/v1/auth` | `auth.py` | Public | Login/signup/logout/callback/me |
| `/api/v1/agents` | `agents.py` | Session + Workspace | Agent CRUD, API key gen, config fetch |
| `/api/v1/guardrails` | `guardrails.py` | Session + Workspace | Guardrail config CRUD |
| `/api/v1/mcp-servers` | `mcp_servers.py` | Session + Workspace | MCP server config CRUD |
| `/api/v1/observability` | `observability.py` | Session + Workspace | Observability config CRUD |
| `/api/v1/memory` | `memory.py` | Session + Workspace | Memory/checkpoint config CRUD |
| `/api/v1/workspaces` | `workspaces.py` | Session | Workspace CRUD |
| `/api/v1/agent-frameworks` | `agent_frameworks.py` | Session | List supported frameworks |
| `/api/v1` | `health.py` | Public | `/healthz`, `/readyz`, `/version` |

### Agent-Specific Endpoints

- `POST /agents/` — Create agent (stores full `EngineConfig` as JSONB)
- `GET /agents/` — List agents (paginated, workspace-scoped)
- `GET /agents/{id}` — Get agent by ID
- `PATCH /agents/{id}` — Update agent config
- `DELETE /agents/{id}` — Delete agent
- `GET /agents/key?agent_id=...` — Generate API key (hashed with `scrypt`, stored as `agent_hash`)
- `GET /agents/config` — Fetch config by API key (Bearer token auth, used by engine `--source manager`)

### CRUD Pattern

All resource routers (guardrails, MCP servers, observability, memory) follow the same pattern:
- `POST /` — Create (workspace-scoped)
- `GET /` — List with pagination (`limit`/`offset`, max 1000)
- `GET /{id}` — Get by ID
- `PATCH /{id}` — Update
- `DELETE /{id}` — Delete (204 No Content)
- Config stored as JSONB in PostgreSQL, validated through `idun_agent_schema` Pydantic models

## Authentication

Two modes, controlled by `AUTH__DISABLE_USERNAME_PASSWORD` env var:

### Username/Password (default, `AUTH__DISABLE_USERNAME_PASSWORD=false`)
- `POST /api/v1/auth/basic/signup` — Register with email/name/password
- `POST /api/v1/auth/basic/login` — Login with email/password
- Password hashed with bcrypt, stored in `users.password_hash`

### Google OIDC SSO (`AUTH__DISABLE_USERNAME_PASSWORD=true`)
- `GET /api/v1/auth/login` — Redirect to Google authorization
- `GET /api/v1/auth/callback` — Exchange code, upsert user, set session cookie
- Uses `authlib` OAuth client

### Session Management
- Session stored in signed HTTP-only cookie (`sid`)
- Signed with `itsdangerous.URLSafeTimedSerializer` using `AUTH__SESSION_SECRET`
- TTL: `AUTH__SESSION_TTL_SECONDS` (default 86400 = 24h)
- Cookie SameSite auto-derived from frontend/backend URL comparison
- Session payload: `{ provider, principal: { user_id, email, roles, workspace_ids }, expires_at }`

### First Login Flow
On first login (SSO or signup), the system automatically creates:
1. A `UserModel` record
2. A default `WorkspaceModel` (named after the user)
3. A `MembershipModel` linking user → workspace with `admin` role

## Multi-Tenancy (Workspaces)

- **WorkspaceModel**: `id`, `name`, `slug` (unique)
- **MembershipModel**: Links users to workspaces with a `role` (admin/member). Unique constraint on `(user_id, workspace_id)`.
- All managed resources (agents, guardrails, MCP servers, etc.) have a `workspace_id` FK → `workspaces.id` (CASCADE delete).
- Active workspace resolved via `require_workspace` dependency: reads `X-Workspace-Id` header, falls back to first workspace from session.

## Database

### Engine Setup
- **Async**: `asyncpg` driver, `create_async_engine` (singleton)
- **Sync**: `psycopg` driver (for Alembic migrations only)
- Session: `async_sessionmaker` with `expire_on_commit=False`, auto-commit on success, rollback on error

### Models (all extend `Base` from `session.py`)

| Table | Key Columns |
|---|---|
| `users` | `id` (UUID PK), `email` (unique), `name`, `provider`, `provider_sub`, `password_hash` |
| `workspaces` | `id` (UUID PK), `name`, `slug` (unique) |
| `memberships` | `id` (UUID PK), `user_id` FK, `workspace_id` FK, `role`. Unique: `(user_id, workspace_id)` |
| `managed_agents` | `id` (UUID PK), `name`, `status`, `engine_config` (JSONB), `agent_hash`, `workspace_id` FK |
| `managed_guardrails` | `id` (UUID PK), `name`, `guardrail_config` (JSONB), `workspace_id` FK |
| `managed_mcp_servers` | `id` (UUID PK), `name`, `mcp_server_config` (JSONB), `workspace_id` FK |
| `managed_observabilities` | `id` (UUID PK), `name`, `observability_config` (JSONB), `workspace_id` FK |
| `managed_memories` | `id` (UUID PK), `name`, `agent_framework`, `memory_config` (JSONB), `workspace_id` FK |

### Migrations
- Alembic, auto-run at startup via `auto_migrate()` in lifespan
- Uses PostgreSQL advisory lock (`pg_try_advisory_lock`) to prevent concurrent migration in multi-process dev
- Sync URL derived from async URL by replacing `+asyncpg` with `+psycopg`

```bash
# Create a new migration
cd services/idun_agent_manager && alembic revision --autogenerate -m "description"

# Run manually
alembic upgrade head
```

## Settings

Nested `pydantic-settings` with `env_nested_delimiter="__"`:

| Variable | Description | Default |
|---|---|---|
| `DATABASE__URL` | PostgreSQL async connection string | — (required) |
| `AUTH__DISABLE_USERNAME_PASSWORD` | When `true`, hides email/password auth and forces SSO only | `false` |
| `AUTH__GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (required for SSO) | — |
| `AUTH__GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret (required for SSO) | — |
| `AUTH__REDIRECT_URI` | OAuth callback URL (must match Google console) | `http://localhost:8000/api/v1/auth/callback` |
| `AUTH__FRONTEND_URL` | Frontend URL for post-login redirect | `http://localhost:5173` |
| `AUTH__SESSION_SECRET` | Secret key for signing session cookies (min 32 chars) | — (required) |
| `AUTH__SESSION_TTL_SECONDS` | Session cookie TTL | `86400` (24h) |
| `AUTH__COOKIE_SECURE` | Set `true` in production (HTTPS-only cookies) | `false` |
| `AUTH__SECRET_KEY` | Secret for scrypt hashing of agent API keys | — (required) |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | `http://localhost:3000,http://localhost:5173` |
| `ENVIRONMENT` | Runtime environment label | `development` |
| `DEBUG` | Enable debug mode | `false` |
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `8000` |

## Dependencies

- `idun_agent_schema` — Shared Pydantic models (local editable dep)
- `fastapi`, `uvicorn` — Web framework
- `sqlalchemy[asyncio]`, `asyncpg`, `psycopg` — Database (async + sync for migrations)
- `alembic` — Migrations
- `authlib`, `itsdangerous` — OIDC + session cookies
- `bcrypt` — Password hashing
- `pydantic-settings` — Configuration

## Development

```bash
# Run locally (requires PostgreSQL)
cd services/idun_agent_manager && make dev

# Or via docker compose (full stack)
docker compose -f docker-compose.dev.yml up --build

# Run tests
cd services/idun_agent_manager && uv run pytest tests/ -v
```

## Conventions

- All DB operations are async (`AsyncSession`)
- Config stored as JSONB, validated in/out via `idun_agent_schema` Pydantic models
- Router pattern: `_get_<resource>()` helper for fetch + 404, `_model_to_schema()` for DB model → response
- Workspace scoping via `require_workspace` dependency on all resource endpoints
- Guardrails from the frontend use simplified configs (`SimpleBanListConfig`, `SimplePIIConfig`) which are converted to full engine format via `convert_guardrail()` (adds `api_key` from `GUARDRAILS_API_KEY` env var)
