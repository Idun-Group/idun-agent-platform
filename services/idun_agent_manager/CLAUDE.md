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
│   │       ├── prompts.py         # Prompt CRUD + versioning + agent assignment
│   │       ├── guardrails.py      # Guardrail config CRUD
│   │       ├── mcp_servers.py     # MCP server config CRUD
│   │       ├── observability.py   # Observability config CRUD
│   │       ├── memory.py          # Memory/checkpoint config CRUD
│   │       ├── sso.py             # SSO/OIDC config CRUD
│   │       ├── integrations.py    # Messaging integration config CRUD
│   │       ├── workspaces.py      # Workspace CRUD
│   │       ├── agent_frameworks.py  # List supported frameworks (read-only)
│   │       └── health.py          # /healthz, /readyz, /version
│   ├── services/
│   │   └── engine_config.py       # Materialized engine_config: assemble, sync, recompute, extract
│   └── infrastructure/db/
│       ├── session.py             # SQLAlchemy async engine + session factory (singletons)
│       ├── migrate.py             # Alembic auto-migration at startup (with advisory lock)
│       ├── seed.py                # DB seeding
│       └── models/
│           ├── settings.py        # Pydantic Settings (nested: Database, Auth, Google)
│           ├── managed_agent.py   # ManagedAgentModel
│           ├── managed_prompt.py  # ManagedPromptModel (append-only versioned prompts)
│           ├── agent_prompt_assignment.py  # AgentPromptAssignmentModel (many-to-many junction)
│           ├── managed_guardrail.py
│           ├── managed_mcp_server.py
│           ├── managed_memory.py
│           ├── managed_observability.py
│           ├── agent_guardrail.py      # Junction: agent ↔ guardrail (M:N)
│           ├── agent_mcp_server.py     # Junction: agent ↔ MCP server (M:N)
│           ├── agent_observability.py  # Junction: agent ↔ observability (M:N)
│           ├── agent_integration.py    # Junction: agent ↔ integration (M:N)
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
| `/api/v1/prompts` | `prompts.py` | Session + Workspace | Prompt CRUD, versioning, agent assignment |
| `/api/v1/guardrails` | `guardrails.py` | Session + Workspace | Guardrail config CRUD |
| `/api/v1/mcp-servers` | `mcp_servers.py` | Session + Workspace | MCP server config CRUD |
| `/api/v1/observability` | `observability.py` | Session + Workspace | Observability config CRUD |
| `/api/v1/memory` | `memory.py` | Session + Workspace | Memory/checkpoint config CRUD |
| `/api/v1/sso` | `sso.py` | Session + Workspace | SSO/OIDC config CRUD |
| `/api/v1/integrations` | `integrations.py` | Session + Workspace | Messaging integration config CRUD |
| `/api/v1/workspaces` | `workspaces.py` | Session | Workspace CRUD |
| `/api/v1/agent-frameworks` | `agent_frameworks.py` | Session | List supported frameworks |
| `/api/v1` | `health.py` | Public | `/healthz`, `/readyz`, `/version` |

### Agent-Specific Endpoints

- `POST /agents/` — Create agent (accepts `resources` field with FK/junction IDs, materializes `engine_config` JSONB)
- `GET /agents/` — List agents (paginated, workspace-scoped)
- `GET /agents/{id}` — Get agent by ID (returns `resources` with explicit resource IDs)
- `PATCH /agents/{id}` — Update agent (syncs resource associations, recomputes materialized config)
- `DELETE /agents/{id}` — Delete agent (cascades junction rows)
- `GET /agents/key?agent_id=...` — Generate API key (hashed with `scrypt`, stored as `agent_hash`)
- `GET /agents/config` — Fetch config by API key (returns materialized `engine_config` JSONB directly, zero JOINs)

### Prompt-Specific Endpoints

Prompts use **append-only versioning** — content is immutable after creation. Version numbers auto-increment per `prompt_id` within a workspace. The `latest` tag is auto-managed server-side.

- `POST /prompts/` — Create new version (auto-increments version, shifts `latest` tag)
- `GET /prompts/` — List prompts (filterable by `prompt_id`, `tag`, `version`; paginated)
- `GET /prompts/{id}` — Get prompt by UUID
- `PATCH /prompts/{id}` — Update tags only (content immutable; `latest` re-derived server-side)
- `DELETE /prompts/{id}` — Delete version; promotes `latest` to next-highest if needed
- `GET /prompts/agent/{agent_id}` — List prompts assigned to an agent
- `POST /prompts/{id}/assign/{agent_id}` — Assign a prompt version to an agent
- `DELETE /prompts/{id}/assign/{agent_id}` — Unassign a prompt from an agent

Assigned prompts are injected into the `engine_config.prompts` list in the `GET /agents/config` endpoint.

### CRUD Pattern

All resource routers (guardrails, MCP servers, observability, memory, SSO, integrations) follow the same pattern:
- `POST /` — Create (workspace-scoped)
- `GET /` — List with pagination (`limit`/`offset`, max 1000). Returns `agent_count` per resource.
- `GET /{id}` — Get by ID (includes `agent_count`)
- `PATCH /{id}` — Update. **Cascade recomputes** `engine_config` for all agents referencing this resource.
- `DELETE /{id}` — **RESTRICT**: returns 409 Conflict if any agents reference the resource. Otherwise 204 No Content.
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
- Session payload: `{ provider, principal: { user_id, email, roles, workspace_ids, default_workspace_id }, expires_at }`
- The `/me` endpoint re-queries the database for fresh `workspace_ids` and `default_workspace_id`, and re-signs the cookie when data has changed (supports post-workspace-creation session refresh).

### Signup / First Login Flow
On signup (SSO or basic), the system:
1. Creates a `UserModel` record (no workspace is auto-created)
2. Consumes any pending `InvitationModel` records for the user's email → creates `MembershipModel` entries
3. Sets `default_workspace_id` to the first invited workspace (if any)
4. If no invitations exist, `workspace_ids` is empty and the frontend redirects to `/onboarding` where the user creates their first workspace

### Onboarding Flow
- Users with no workspaces are redirected to `/onboarding` by the frontend `RequireAuth` guard
- The onboarding page calls `POST /api/v1/workspaces/` (which only requires `get_current_user`, not `require_workspace`)
- After workspace creation, the frontend calls `/me` which refreshes the session cookie with the new workspace
- The `create_workspace` endpoint sets `default_workspace_id` on the user if it's their first workspace

## Multi-Tenancy (Workspaces)

- **WorkspaceModel**: `id`, `name`, `slug` (unique)
- **MembershipModel**: Links users to workspaces with a `role` (owner/admin/member/viewer via `WorkspaceRole` enum). Unique constraint on `(user_id, workspace_id)`.
- **InvitationModel**: Pending invitations (`email`, `workspace_id`, `role`). Consumed on signup.
- **UserModel.default_workspace_id**: FK to `workspaces.id` (SET NULL on delete). Set on first workspace creation or invitation consumption. Backfilled at login for users created before the migration.
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
| `managed_prompts` | `id` (UUID PK), `prompt_id`, `version`, `content` (Text), `tags` (JSONB), `workspace_id` FK. Unique: `(workspace_id, prompt_id, version)` |
| `agent_prompt_assignments` | `agent_id` FK (PK), `prompt_id` FK (PK). Composite PK, CASCADE delete on both FKs |
| `managed_guardrails` | `id` (UUID PK), `name`, `guardrail_config` (JSONB), `workspace_id` FK |
| `managed_mcp_servers` | `id` (UUID PK), `name`, `mcp_server_config` (JSONB), `workspace_id` FK |
| `managed_observabilities` | `id` (UUID PK), `name`, `observability_config` (JSONB), `workspace_id` FK |
| `managed_memories` | `id` (UUID PK), `name`, `agent_framework`, `memory_config` (JSONB), `workspace_id` FK |
| `managed_ssos` | `id` (UUID PK), `name`, `sso_config` (JSONB), `workspace_id` FK |
| `managed_integrations` | `id` (UUID PK), `name`, `integration_config` (JSONB), `workspace_id` FK |
| `agent_guardrails` | `id` (UUID PK), `agent_id` FK (CASCADE), `guardrail_id` FK (RESTRICT), `position`, `sort_order`. Unique: `(agent_id, guardrail_id, position)` |
| `agent_mcp_servers` | `id` (UUID PK), `agent_id` FK (CASCADE), `mcp_server_id` FK (RESTRICT). Unique: `(agent_id, mcp_server_id)` |
| `agent_observabilities` | `id` (UUID PK), `agent_id` FK (CASCADE), `observability_id` FK (RESTRICT). Unique: `(agent_id, observability_id)` |
| `agent_integrations` | `id` (UUID PK), `agent_id` FK (CASCADE), `integration_id` FK (RESTRICT). Unique: `(agent_id, integration_id)` |

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

## Agent Resource Relations & Materialized Config

Agents reference managed resources via FK columns (1:1) and junction tables (M:N). The `engine_config` JSONB column is a **materialized cache** — a pre-computed snapshot of the full assembled EngineConfig.

### Relationship Model

| Relation | Type | FK/Junction |
|---|---|---|
| Agent → Memory | 1:1 | `managed_agents.memory_id` FK |
| Agent → SSO | 1:1 | `managed_agents.sso_id` FK |
| Agent → Guardrails | M:N | `agent_guardrails` junction (with `position` + `sort_order`) |
| Agent → MCP Servers | M:N | `agent_mcp_servers` junction |
| Agent → Observability | M:N | `agent_observabilities` junction |
| Agent → Integrations | M:N | `agent_integrations` junction |

Delete policy: **ON DELETE RESTRICT** for resource FKs (prevents deleting a resource that agents reference). **ON DELETE CASCADE** for agent FKs in junction tables (deleting an agent removes its associations).

### Materialized Config Pattern

The `engine_config` JSONB column stores a fully assembled EngineConfig identical to what the engine expects. It is recomputed (not manually edited) whenever:

1. Agent resource associations change (`POST /agents/`, `PATCH /agents/{id}`)
2. A linked managed resource is updated (`PATCH /guardrails/{id}`, etc.)

**Service:** `src/app/services/engine_config.py` provides:
- `assemble_engine_config(session, model)` — Reads FK/junction associations, fetches referenced resource configs, assembles the full EngineConfig dict
- `recompute_engine_config(session, agent_id)` — Calls assemble + writes to `engine_config` JSONB
- `sync_resources(model, resources)` — Clears existing junction rows, re-creates from `AgentResourceIds` payload, sets 1:1 FKs
- `extract_resource_ids(model)` — Extracts `AgentResourceIds` from a loaded model's relationships

**Read path:** `GET /agents/config` returns `engine_config` JSONB directly — zero JOINs, instant reads. The engine is completely unaffected by the relational model.

**Write path:** Agent create/patch always calls `sync_resources()` + `recompute_engine_config()`. Resource PATCH endpoints query junction tables for referencing agents and recompute each one.

### Agent Count

All resource list/get endpoints return `agent_count` — the number of agents referencing each resource. Computed via batch `func.count()` queries (list) or single COUNT (get). Used by the frontend to show "Used by N agents" badges and prevent surprise RESTRICT failures.

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
- Guardrails from the frontend use simplified configs (`SimpleBanListConfig`, `SimplePIIConfig`, etc.) with `api_key` and `reject_message` included — stored directly in engine-ready format (no conversion step)
