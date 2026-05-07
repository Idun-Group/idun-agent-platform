# Standalone Admin API and Config DB Design

Date: 2026-04-27

Status: Design locked through product brainstorming. No implementation changes have been made by this document.

Scope:

- Define the functional product model for `idun_agent_standalone` Admin API and Config DB.
- Capture all locked decisions from the refinement session.
- Define what is in scope now, what is explicitly deferred, and why.
- Align standalone with `idun_agent_schema` and the manager resource model while preserving single-agent simplicity.

## Executive summary

`idun_agent_standalone` should expose a **governance-ready local control plane** for one deployed agent.

The product should feel simple:

> Configure and operate this agent.

But internally it should be modeled cleanly:

> A single-agent local control plane using schema-shaped resource blocks that can later be imported or enrolled into centralized governance.

This means:

- There is only one agent.
- There is only one active configuration.
- The saved configuration is the live configuration.
- The DB commits only if runtime reload succeeds.
- Structural changes may commit and return `restart_required`, because they apply on process restart.
- Standalone manages only blocks currently attached to this one agent.
- Standalone does not manage a reusable local resource catalog.
- Standalone does not include workspace, RBAC, members, organizations, or fleet concepts.
- All resource contracts must reuse `idun_agent_schema`.
- New standalone API wrappers belong in `idun_agent_schema.standalone`.

## Product definition

`idun_agent_standalone` Admin API + Config DB is:

> A governance-ready local control plane for one deployable Idun agent.

It owns the local operational configuration for one agent:

- agent identity and base runtime config
- memory
- guardrails
- MCP servers
- observability
- integrations
- prompts
- runtime/reload diagnostics
- operational hardening and audit logs
- readiness and diagnostics endpoints
- materialized config export
- local traces
- local admin auth
- bootstrap metadata

It does not own:

- workspaces
- users/members beyond local admin auth
- RBAC
- shared resource catalogs
- many-agent associations
- enterprise SSO governance
- fleet policy
- centralized audit

Those belong to the future enterprise Governance Hub.

## Source-of-truth rule

`idun_agent_schema` is the single source of truth for all supported config and API contracts.

Standalone must reuse schema from:

- `idun_agent_schema.engine`
- `idun_agent_schema.manager`
- new `idun_agent_schema.standalone`

Standalone must not invent parallel ad hoc config shapes for resources that already exist in `idun_agent_schema`.

Good:

```text
mcp_server: MCPServer
observability: ObservabilityConfig
integration: IntegrationConfig
memory: manager-style memory union
```

Bad:

```text
mcp_server_config: dict[str, Any]
observability_config: dict[str, Any]
integration_config: dict[str, Any]
```

The DB may store JSON, but the JSON must be the normalized dump of a schema model.

### Stored shape rule

Locked:

- Each standalone resource stores **manager-shape JSON** in the DB.
- "Manager-shape" means the same Pydantic model the manager router accepts on input and persists.
- For resources where the manager already uses an engine model directly (`mcp_servers`, `observability`, `integrations`), manager-shape and engine-shape coincide and no conversion is needed at assembly.
- For resources where the manager wraps the engine model (`memory`, `guardrails`, `prompts`), the wrapper shape is stored. `EngineConfig` assembly converts wrapper rows to engine-shape models, reusing existing manager converters (e.g. `idun_agent_schema.manager.guardrail_configs.convert_guardrail`).
- Standalone never invents a third shape for a resource that already has a manager shape.

### Manager schema mirror rule

Locked:

Standalone DB tables **mirror manager column shapes 1:1** at the schema level. They do **not** import manager SQLAlchemy `*Model` classes.

This rule maximizes reuse without inheriting manager's tenancy graph:

- The Pydantic schemas in `idun_agent_schema.manager.*` are the shared layer (already required by the Stored shape rule).
- The SQLAlchemy models in `services/idun_agent_manager/src/app/infrastructure/db/models/` are **not** imported. They use Postgres-only types (`UUID`, `JSONB`) and `workspace_id NOT NULL` FK chains that don't fit standalone's SQLite-first, single-agent profile.
- Standalone defines its own SQLAlchemy models under `idun_agent_standalone/db/models/`. Each model uses the **same column names and same JSON content** as the corresponding manager model, with two engine-agnostic substitutions:
  - `UUID(as_uuid=True)` -> `String(36)` (UUID stored as string; works on SQLite and Postgres)
  - `JSONB` -> SQLAlchemy `JSON` (engine-agnostic; Postgres still stores it as JSONB under the hood when desired)
- Standalone tables drop `workspace_id` (no tenancy) and replace M:N junctions with row-level fields (`enabled`, `position`, `sort_order`).

Mirror table:

| Manager table | Standalone table | Notes |
| --- | --- | --- |
| `managed_agents` | `standalone_agent` | drop `workspace_id`, `memory_id` FK (memory is singleton on the agent), `sso_id` FK (SSO out of scope) |
| `managed_memories` | `standalone_memory` | drop `workspace_id`; singleton in standalone |
| `managed_mcp_servers` | `standalone_mcp_server` | drop `workspace_id`; add `enabled bool` |
| `managed_observabilities` | `standalone_observability` | drop `workspace_id`; **singleton in standalone** (id fixed to `"singleton"`, no `enabled`, no `name`/`slug`); see §"Observability" |
| `managed_integrations` | `standalone_integration` | drop `workspace_id`; add `enabled bool` |
| `managed_guardrails` | `standalone_guardrail` | drop `workspace_id`; add `enabled bool`, `position`, `sort_order` (folded from junction) |
| `managed_prompts` | `standalone_prompt` | drop `workspace_id`; uniqueness becomes `(prompt_id, version)` |
| `agent_guardrails` (junction) | folded | `position` and `sort_order` move onto `standalone_guardrail` |
| `agent_mcp_servers` (junction) | folded | replaced by `standalone_mcp_server.enabled` |
| `agent_observabilities` (junction) | excluded | observability is a singleton in standalone; the row is the active provider |
| `agent_integrations` (junction) | folded | replaced by `standalone_integration.enabled` |
| `agent_prompt_assignments` (junction) | excluded | one agent in standalone; every prompt applies |
| `workspaces`, `users`, `memberships`, `invitations`, `managed_ssos`, `settings` | excluded | not a multi-tenant control plane |

Why this matters:

- Standalone stays SQLite-compatible (laptop dev, single-binary distribution).
- Standalone does not have to seed a placeholder workspace/user/membership graph just to satisfy NOT NULL FKs.
- The `engine_config` JSONB content on `managed_agents` is byte-identical to standalone's assembled `EngineConfig` (same Pydantic `model_dump_json()`).
- Enrollment to Governance Hub becomes a near-mechanical SQL transform; see §"Governance Hub mapping".

Forbidden:

- `from app.infrastructure.db.models import ...` inside `idun_agent_standalone/`.
- Sharing the SQLAlchemy `Base` across the two services. Each service owns its own metadata.

## Standalone is not a local catalog

Important product distinction:

> Standalone uses resource-shaped schemas for compatibility, but product-wise it manages only the active components of one agent, not a reusable local resource catalog.

For example:

```text
standalone_mcp_server
```

means:

> MCP server currently configured for this agent.

It does not mean:

> MCP server available in a reusable workspace/local catalog.

Manager/Governance Hub may have reusable resource catalogs. Standalone should not.

## Rework posture

This is a **greenfield rework**, not a migration.

Locked:

- Existing `idun_agent_standalone` DB tables, SQLAlchemy models, admin routers, and request/response shapes are removed.
- No data migration. Pre-rework standalone installs reset on upgrade. Existing rows in the current `agent`, `guardrail`, `memory`, `observability`, `mcp_server`, `prompt`, `integration`, `session`, `trace_event`, `admin_user`, and `bootstrap_meta` tables are not preserved.
- Existing UI consumers will break. The UI rework is the next workstream, planned **after** this API + DB lock.
- A fresh Alembic baseline is created under `idun_agent_standalone/db/migrations/` with `0001_initial.py` as the new starting point. The current `0001_initial.py` and `0002_bootstrap_meta.py` are deleted with the rest of the legacy code.
- From this baseline forward, Alembic discipline matches the manager: every schema change ships a new revision; revisions are append-only; no autosquashes after release.
- Theme code and the `theme` table are the only legacy survivors of this rework; see §"Theme" deferral.

This decision keeps the design clean instead of carrying transitional shapes. The cost is one breaking upgrade for any pre-rework installs, which is acceptable pre-1.0.

## Locked design decisions

### Control-plane posture

Locked:

- The standalone Admin API + Config DB is a **Governance-Ready Local Control Plane**.
- It remains local-first and single-agent.
- It must be easy to import/enroll into Governance Hub later.

### Schema posture

Locked:

- Reuse `idun_agent_schema` for all existing resource types.
- Add `idun_agent_schema.standalone` wrappers now.
- Add full standalone admin API contracts to `idun_agent_schema.standalone`.
- Theme, traces, logs, local admin auth internals, and enrollment DB are deferred or local-only until a proper schema design exists.

### DB posture

Locked:

- Use a hybrid DB model.
- Use explicit `standalone_*` table names.
- Use manager-like resource-shaped tables.
- Do not use association tables while standalone has one agent.
- Do not create detached/reusable local catalogs.
- Use UUID primary keys plus auto-generated human-readable slugs where useful.
- Slugs are generated from `name` and editable later.

### Save/reload posture

Locked:

- No draft/apply in MVP.
- Every save immediately attempts to become active.
- DB commits only if runtime reload succeeds.
- If reload/init fails, rollback DB.
- If the change is structural and requires process restart, commit DB and return `reload.status = restart_required` with HTTP 200.
- There is no separate desired config versus live config in MVP.
- Reload mutations serialize through a single in-process asyncio lock. Standalone is single-replica by design; documented and assumed throughout the rest of this design (rate limiting, audit, login throttling).
- All save operations attempt reload, including pure-metadata changes (e.g., agent name). Smart reload classification (per-field `no_reload` / `hot_reload` / `restart_required`) is **future work for the next version** and is not part of MVP.

### API response posture

Locked:

- Mutating admin endpoints (POST, PATCH, DELETE) return a standard envelope:

```text
{ data, reload }
```

- DELETE returns `data = { id, deleted: true }` wrapped in the same envelope as POST/PATCH (DELETE also triggers reload because removing an enabled resource changes `EngineConfig`).
- All successful mutations return **HTTP 200 OK**. The `reload.status` field carries the runtime outcome (`reloaded`, `restart_required`, `reload_failed`).
- HTTP 202 is **not** used for `restart_required`. 202 is reserved for genuinely async work (e.g., a future job-queued bundle import). `restart_required` is synchronous: the DB commit happened, the operator just needs to restart the process.
- Validation failure returns 422 (see §"Validation rounds").
- Reload init failure returns 500.
- Admin API errors use a custom standalone error shape.
- The custom error shape applies only to `/admin/api/v1/*`, not `/agent/*`, `/health`, static UI routes, or `/runtime-config.js`.

### Validation rounds

Locked:

Three explicit validation rounds wrap each mutation. Each round has a fixed HTTP code and error code so the UI can branch reliably.

| Round | What is validated | HTTP | Error code | Notes |
| --- | --- | --- | --- | --- |
| 1 | Request body shape (Pydantic) | 422 | `validation_failed` | Returns `field_errors` |
| 2 | Assembled `EngineConfig` (post-merge of staged DB state) | 422 | `validation_failed` | Catches cross-resource invalid combos (e.g. `LANGGRAPH + SessionServiceConfig`) |
| 3 | Engine reload init | 500 | `reload_failed` | DB rolls back; previous engine remains active |

Round 2 is where most user-visible "this combination isn't supported" errors live; round 2 must surface structured `field_errors`, not opaque 500s.

### Case convention

Locked:

- JSON keys outbound: **camelCase** (Pydantic `alias_generator=to_camel`, `populate_by_name=True`).
- Enum values: **snake_case** (`reloaded`, `restart_required`, `validation_failed`).
- Path segments: **kebab-case** (`/admin/api/v1/mcp-servers`).
- Python field names: **snake_case** (default Pydantic).

### Route posture

Locked:

- Standalone admin endpoint names should mirror manager route names exactly where possible.
- They remain under the standalone admin prefix:

```text
/admin/api/v1/*
```

### Operational hardening posture

Locked:

- Production hardening is part of the backend target design, not a separate product.
- Admin mutations and auth events must be auditable.
- Reload success, rollback, and restart-required outcomes must be visible in structured logs.
- Request IDs must flow through logs.
- Login must be rate limited in password mode.
- Admin routes must have explicit CORS and CSRF posture.

This hardening belongs to standalone because customers may deploy one standalone agent directly to Cloud Run or another hosted runtime.

### Diagnostics posture

Locked:

- `/health` stays shallow and unauthenticated. **Cloud Run uses `/health` for both liveness and readiness probes** (it cannot authenticate as an admin).
- Admin-only `/admin/api/v1/readyz` provides deep readiness for operators (DB, engine, trace writer, external providers, MCP tools).
- Connection-check endpoints for MCP servers, observability providers, and memory backends are **MVP scope** — they prevent the silent-failure trap of saving a config that can't actually connect.
- Diagnostics should not require the enterprise Governance Hub.

## `idun_agent_schema.standalone`

Create a new schema namespace:

```text
idun_agent_schema/standalone/
  __init__.py
  common.py
  errors.py
  reload.py
  agent.py
  memory.py
  guardrails.py
  mcp_servers.py
  observability.py
  integrations.py
  prompts.py
  runtime_status.py
  operational.py
  diagnostics.py
  config.py
  enrollment.py
```

This namespace defines public API contracts for the standalone admin surface.

It should wrap existing engine/manager contracts. It should not duplicate their inner fields manually.

### Common models

Conceptual models:

```text
StandaloneMutationResponse[T]
  data: T
  reload: StandaloneReloadResult

StandaloneDeleteResult
  id: UUID
  deleted: true

# DELETE responses use the same mutation envelope:
#   StandaloneMutationResponse[StandaloneDeleteResult]
#     data: { id, deleted: true }
#     reload: StandaloneReloadResult

StandaloneResourceIdentity
  id: UUID
  slug: string | null
  name: string
```

Not every resource needs all common fields. Common models should help consistency without forcing false symmetry.

### Reload models

Conceptual models:

```text
StandaloneReloadStatus
  reloaded
  restart_required
  reload_failed

StandaloneReloadResult
  status: StandaloneReloadStatus
  message: string
  error: string | null
```

Meaning:

| Status | Meaning |
| --- | --- |
| `reloaded` | DB committed and runtime now uses the new config |
| `restart_required` | DB committed; process restart is required before config is active |
| `reload_failed` | DB rolled back; runtime remains unchanged |

### Error models

Conceptual models:

```text
StandaloneErrorCode
  bad_request
  validation_failed
  not_found
  conflict
  reload_failed
  auth_required
  forbidden
  unsupported_mode
  rate_limited
  internal_error

StandaloneFieldError
  field: string
  message: string
  code: string | null

StandaloneAdminError
  code: StandaloneErrorCode
  message: string
  details: object | null
  field_errors: list[StandaloneFieldError] | null
```

HTTP mapping:

| HTTP status | Code |
| --- | --- |
| 400 | `bad_request` / `unsupported_mode` |
| 401 | `auth_required` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 422 | `validation_failed` |
| 429 | `rate_limited` |
| 500 | `reload_failed` / `internal_error` |

`restart_required` is not an error. It returns `200` with `{ data, reload }` where `reload.status = "restart_required"`.

## Resource contracts

### Agent

Locked:

- Agent is a **singleton** in standalone because the product manages one agent.
- Routes are no-`{id}` (`/admin/api/v1/agent`).
- Agent uses a hybrid base `EngineConfig`.
- The stored base config contains `server` + `agent` only. Other resources are layered during assembly.
- Agent status reuses manager `AgentStatus`.

Conceptual model:

```text
StandaloneAgent  (singleton)
  id: UUID                          # exists for cross-system identity (future Governance Hub import); not used in URLs
  slug: string | null               # informational only; not used for lookup
  name: string
  description: string | null
  version: string | null
  status: AgentStatus
  base_url: string | null
  base_engine_config: EngineConfig
  created_at: datetime
  updated_at: datetime
```

Schema sources:

- `idun_agent_schema.engine.EngineConfig`
- `idun_agent_schema.engine.AgentConfig`
- `idun_agent_schema.engine.AgentFramework`
- `idun_agent_schema.manager.managed_agent.AgentStatus`

Agent lifecycle statuses:

| Status | Meaning in standalone |
| --- | --- |
| `draft` | Config exists but agent is not ready to run yet |
| `active` | Agent config is valid and runtime is serving |
| `inactive` | Agent is configured but intentionally not serving |
| `deprecated` | Agent is runnable but marked for replacement |
| `error` | Agent failed validation/start/reload |

MVP will mostly use:

- `active`
- `error`

Important distinction:

- `AgentStatus` is lifecycle state.
- `StandaloneReloadResult` is the result of the last admin operation.

Agent base config must not embed resource fields owned by other tables:

- memory/checkpointer/session service
- guardrails
- MCP servers
- observability
- integrations
- prompts

If these appear in imported YAML, import/assembly should decompose them into resource tables or reject/strip them according to the import rules.

### Memory

Locked:

- Memory is a **singleton** in standalone because one agent has one memory.
- Stored shape is **manager-shape** (`ManagedMemoryRead/Patch` from `idun_agent_schema.manager.managed_memory`).
- Routes are no-`{id}` (`/admin/api/v1/memory`).

Conceptual model:

```text
StandaloneMemory  (singleton)
  agent_framework: AgentFramework
  memory: ManagedMemoryConfig    # manager-shape; converts to CheckpointConfig | SessionServiceConfig at assembly
  updated_at: datetime
```

Notes on identity:

- Singleton row uses a fixed PK (e.g. `"singleton"`) at the DB layer.
- No slug, no name. The resource is addressed by route, not by id.

Schema sources:

- `idun_agent_schema.manager.managed_memory`  (storage shape)
- `idun_agent_schema.engine.agent_framework.AgentFramework`
- `idun_agent_schema.engine.langgraph.CheckpointConfig`  (assembly target for LangGraph)
- `idun_agent_schema.engine.adk.SessionServiceConfig`  (assembly target for ADK)

Rules:

- Memory is singleton.
- Memory has no `enabled`.
- Absence/default means no custom memory configuration.
- Mismatched framework/memory pairs fail validation round 2 (422 + field_errors).

Examples:

```text
LANGGRAPH + CheckpointConfig -> valid
ADK + SessionServiceConfig -> valid
LANGGRAPH + SessionServiceConfig -> invalid (round 2)
ADK + CheckpointConfig -> invalid (round 2)
```

Assembly (manager-shape -> engine-shape):

- LangGraph memory is converted to `agent.config.checkpointer`.
- ADK memory is converted to `agent.config.session_service`.

### Guardrails

Locked:

- Standalone guardrails use manager-style individual guardrail resources.
- Each guardrail has `position` and `sort_order`.
- Admin API does not edit one big `GuardrailsV2` blob directly.

Conceptual model:

```text
StandaloneGuardrail
  id: UUID
  slug: string | null
  name: string
  enabled: bool
  position: input | output
  sort_order: int
  guardrail: ManagerGuardrailConfig
  created_at: datetime
  updated_at: datetime
```

Schema sources:

- `idun_agent_schema.manager.guardrail_configs.ManagerGuardrailConfig`
- `idun_agent_schema.engine.guardrails_v2.GuardrailsV2`

Rules:

- Guardrails are a collection.
- Guardrails may be disabled.
- Disabled guardrails are not included in `EngineConfig`.
- Sort order controls evaluation order.
- `position` decides whether the guardrail applies to input or output.

Assembly:

```text
enabled standalone_guardrail rows
  -> grouped by position
  -> sorted by sort_order
  -> converted to engine guardrails
  -> EngineConfig.guardrails
```

### MCP servers

Locked:

- Standalone MCP servers use manager-like individual resources.
- Inner config is `MCPServer` from `idun_agent_schema`.

Conceptual model:

```text
StandaloneMCPServer
  id: UUID
  slug: string | null
  name: string
  enabled: bool
  mcp_server: MCPServer
  created_at: datetime
  updated_at: datetime
```

Schema source:

- `idun_agent_schema.engine.mcp_server.MCPServer`

Rules:

- MCP servers are a collection.
- MCP servers may be disabled.
- Disabled MCP servers are not included in `EngineConfig`.
- Validation comes from `MCPServer`.

Assembly:

```text
enabled standalone_mcp_server rows
  -> list[MCPServer]
  -> EngineConfig.mcp_servers
```

### Observability

Locked:

- Standalone observability is a **singleton**, one provider per install.
- Inner config is `ObservabilityConfig` V2 — same shape as manager.

Deviation from manager: manager allows multiple observability rows per agent through `managed_observabilities` plus the `agent_observabilities` junction. Standalone has one agent and a single active provider, so the junction is excluded and the row is identified by a fixed `"singleton"` id (no slug, no name, no enabled flag). Absence of the row means no observability is configured.

Conceptual model:

```text
StandaloneObservability
  id: "singleton"
  observability: ObservabilityConfig
  updated_at: datetime
```

Schema source:

- `idun_agent_schema.engine.observability_v2.ObservabilityConfig`

Rules:

- Exactly zero or one observability row at any time.
- Absence of the row = engine runs without an observability provider.
- Validation comes from `ObservabilityConfig`.
- API addressed without `{id}` (consistent with other singletons; see §"Singleton vs collection blocks").

Assembly:

```text
standalone_observability row (if present)
  -> ObservabilityConfig
  -> [ObservabilityConfig]              # one-element list
  -> EngineConfig.observability
```

The one-element list at assembly preserves the engine's existing `EngineConfig.observability: list[ObservabilityConfig]` shape; the standalone runtime materializes the singleton into that list rather than reshaping the engine config.

### Integrations

Locked:

- Standalone integrations use `name` + `integration: IntegrationConfig`, plus local `enabled`.

Conceptual model:

```text
StandaloneIntegration
  id: UUID
  slug: string | null
  name: string
  enabled: bool
  integration: IntegrationConfig
  created_at: datetime
  updated_at: datetime
```

Schema source:

- `idun_agent_schema.engine.integrations.IntegrationConfig`

Rules:

- Integrations are a collection.
- Integrations may be disabled.
- Disabled integrations are not included in `EngineConfig`.
- `StandaloneIntegration.enabled` is the **single source of truth** for whether an integration is active.
- `IntegrationConfig.enabled` (the inner field) is **not** edited by admins. It is overwritten at assembly time to match the standalone row's `enabled`.

Assembly:

```text
enabled standalone_integration rows
  -> IntegrationConfig with enabled=true
  -> EngineConfig.integrations
```

### Prompts

Locked:

- Standalone prompts match manager prompt model exactly.
- Prompts use `prompt_id`, `content`, `tags`, append-only versions.

Conceptual model:

```text
StandalonePrompt
  id: UUID
  prompt_id: string
  version: int
  content: string
  tags: list[string]
  created_at: datetime
  updated_at: datetime
```

Schema sources:

- `idun_agent_schema.manager.managed_prompt`
- `idun_agent_schema.engine.prompt.PromptConfig`

Rules:

- Prompts are a collection.
- Prompts have no `enabled`.
- Creating a prompt with an existing `prompt_id` creates a new version.
- Prompt content changes create a new version.
- Tag patches may update the current version, matching manager behavior.
- Unique constraint: `(prompt_id, version)`.

Assembly:

```text
latest version per prompt_id
  -> list[PromptConfig]
  -> EngineConfig.prompts
```

## Explicit deferrals and exclusions

### Theme

Deferred from this rework. Theme is the only legacy survivor.

Reason:

- Theme is not yet part of `idun_agent_schema`.
- Theme is UI/runtime presentation config, not engine config.
- It needs a separate schema design later.

For now:

- The current `theme` table, SQLAlchemy model, admin route, and frontend bindings stay **as-is**.
- The table is **not renamed** to `standalone_theme` in this rework. It remains `theme`.
- Marked **TODO for the next version**: design `idun_agent_schema.standalone.theme`, rename the table to `standalone_theme` via Alembic, fold theme into the same envelope/error/case conventions as the rest of the admin API.
- Theme should not block core Admin API/Config DB cleanup.

### Traces

Deferred from schema-driven config contracts.

Reason:

- Traces are runtime/debug data, not config.
- Trace storage and API can remain standalone-local for now.
- A future shared trace schema can be designed if traces are sent to Governance Hub.

For now:

- Keep local trace/session tables.
- Keep local traces UI/API.
- Do not include trace data in `EngineConfig`.

### Logs

Deferred.

Reason:

- Logs API/schema is not stable.
- Current logs product surface is not core to config DB cleanup.

For now:

- Either keep logs out of this rework or implement later with its own schema.

### Local admin auth

Deferred from shared schema standardization.

Reason:

- Local admin auth is standalone-specific operational security.
- It is not an engine resource.
- It should not map to Governance Hub users/RBAC.

For now:

- Keep password/none auth local.
- Do not import/export local admin secrets.

### OIDC and SSO

Out of standalone MVP.

Locked:

- Do not add SSO tables or routers to standalone MVP.
- Do not copy manager SSO into standalone during the config DB cleanup.
- OIDC/SSO is future work and should be shaped deliberately when standalone enrollment and enterprise governance are clearer.

Reason:

- OIDC/SSO is an enterprise governance capability, not a requirement for the OSS standalone MVP.
- The standalone should remain easy to run locally and on Cloud Run with password or no-auth modes.
- Adding SSO parity now would make the product feel like a mini enterprise manager.

Future posture:

- A future standalone OIDC mode may mirror manager/Authlib patterns.
- It should integrate with local admin auth without importing workspace/RBAC concepts.
- Governance Hub enrollment may later control identity policy centrally.

### Enrollment DB

Deferred.

Locked:

- Add enrollment schema placeholders now.
- Do not add unused enrollment DB tables yet.

Reason:

- Enrollment is a future feature.
- Schema placeholders document future vocabulary without adding unused persistence.

## Standalone DB target model

### Naming

Locked:

- Use explicit `standalone_*` table names.

Core tables:

```text
standalone_agent
standalone_memory
standalone_guardrail
standalone_mcp_server
standalone_observability
standalone_integration
standalone_prompt
standalone_runtime_state
standalone_install_meta            # renamed from current bootstrap_meta; broader semantics that survive enrollment
standalone_admin_user
standalone_session
standalone_trace_event
```

Carried forward as legacy (NOT renamed in this rework):

```text
theme                              # current table; see §"Theme" deferral. TODO for next version.
```

Deferred (not added now):

```text
standalone_log_event
standalone_enrollment
standalone_audit_event             # added when audit is implemented; see §"Audit logs"
```

### Alembic discipline

Locked:

- Standalone owns its own Alembic environment under `idun_agent_standalone/db/migrations/`.
- The rework starts at a fresh `0001_initial.py` baseline. The current `0001_initial.py` and `0002_bootstrap_meta.py` are deleted.
- Going forward, every schema change ships a new revision file. Revisions are append-only after a tagged release.
- Migrations target SQLite and Postgres parity. JSON columns use SQLAlchemy `JSON` (engine-agnostic); Postgres-specific types (JSONB) may be used opportunistically with explicit type-decorator fallbacks.
- Migration tests run against both SQLite and Postgres in CI before merge.

### Identity

Locked:

- Resources use UUID primary keys plus optional human-readable slugs.
- Slugs are auto-generated from `name`.
- Slugs are editable later.
- UUID is the canonical API identifier.

Slug rules (locked):

Normalization pipeline:

```text
input name
  -> trim whitespace
  -> lowercase
  -> ASCII-fold (NFKD + drop combining marks)
  -> replace any char not in [a-z0-9] with "-"
  -> collapse runs of "-"
  -> trim leading/trailing "-"
  -> truncate to 64 chars
```

Constraints:

- lowercase
- letters, numbers, hyphens only
- non-empty
- unique per resource type (cross-resource collisions are allowed: an MCP server slug `foo` and an integration slug `foo` are independent)

Lifecycle:

- Generated from `name` on POST. **Required and non-null** on every row at rest.
- Sticky: a `name` PATCH does **not** re-derive the slug. URLs do not change silently.
- A direct slug PATCH that conflicts with an existing slug returns 409 (`code = conflict`). No auto-suffixing of operator-supplied slugs.
- POST collision (auto-derived slug already exists) is auto-suffixed: `github-tools` → `github-tools-2` → `github-tools-3`, etc.

Singletons (`agent`, `memory`) do not have meaningful slugs because they are not addressed by id. Their rows may carry a slug field for future cross-system identity, but the admin API never uses it for lookup.

Canonical API lookup:

```text
/admin/api/v1/mcp-servers/{id}
```

Optional future slug lookup:

```text
/admin/api/v1/mcp-servers/by-slug/{slug}
```

### Timestamp rule

Locked:

- Use timestamps only for resources shown in UI or useful to users/operators.

Guidance:

| Table | Timestamp guidance |
| --- | --- |
| `standalone_agent` | `created_at`, `updated_at` |
| `standalone_memory` | `updated_at` is enough unless UI needs history |
| `standalone_guardrail` | `created_at`, `updated_at` |
| `standalone_mcp_server` | `created_at`, `updated_at` |
| `standalone_observability` | `created_at`, `updated_at` |
| `standalone_integration` | `created_at`, `updated_at` |
| `standalone_prompt` | `created_at`, `updated_at` |
| `standalone_runtime_state` | `updated_at` |
| `standalone_install_meta` | `bootstrapped_at`, `last_seen_at` |
| `standalone_admin_user` | `password_rotated_at` |
| `standalone_session` | trace/session timestamps |
| `standalone_trace_event` | trace event timestamps |

### Enabled rule

Locked:

- `enabled` exists only for collection blocks where users may temporarily turn off attached components.

| Block | `enabled`? |
| --- | --- |
| Agent | no |
| Memory | no |
| Guardrails | yes |
| MCP servers | yes |
| Observability | yes |
| Integrations | yes |
| Prompts | no |
| Runtime state | no |
| Install meta | no |
| Admin auth | no |
| Traces | no |
| Theme | legacy; see §"Theme" deferral |
| Enrollment | mode/status later, not `enabled` |

Meaning:

```text
disabled = configured but not applied to EngineConfig
```

Only collection config blocks can be disabled.

## Singleton vs collection blocks

Locked classification:

### Singleton blocks

```text
agent
memory
observability
runtime_state
install_meta
admin_auth
```

Rules:

- no `enabled`
- no association tables
- either configured or absent/default
- API addressed without `{id}` (e.g. `GET /admin/api/v1/memory`, `PATCH /admin/api/v1/agent`)
- DB rows may carry a UUID for future cross-system identity, but the URL never uses it

`observability` was originally classified as a collection (mirroring manager). Standalone scopes the install to one agent and one active provider, so the table folds to a singleton. See §"Observability" for the assembly rule that wraps the row into the engine's existing list shape.

### Collection blocks

```text
guardrails
mcp_servers
integrations
prompts
trace_sessions
trace_events
```

Rules:

- attached to the one standalone agent by product scope
- no association tables
- not reusable catalogs

### Deferred/local-later blocks

```text
theme        # current code/table is preserved as legacy; TODO for next version
logs
enrollment
audit
```

## Admin API endpoint map

Locked:

- Mirror manager route names exactly where possible.
- Use standalone admin prefix.

Prefix:

```text
/admin/api/v1
```

### Agent (singleton)

Standalone semantics: one agent. Routes are no-`{id}`.

```text
GET   /admin/api/v1/agent
PATCH /admin/api/v1/agent
```

Standalone deviates from manager's `/agents` (plural with id) here on purpose: manager has a list of agents to address; standalone does not. The mirroring rule is **name-mirror, not shape-mirror** for singleton resources.

There is no `POST /admin/api/v1/agent`. The agent row is created on first boot from YAML seed or first-write PATCH; see §"Cold-start states".

### Memory (singleton)

```text
GET    /admin/api/v1/memory
PATCH  /admin/api/v1/memory
DELETE /admin/api/v1/memory
POST   /admin/api/v1/memory/check-connection    # MVP connection check; see §"Connection checks"
```

`PATCH /memory` is upsert: if no memory row exists, create it; otherwise update.

### Guardrails

Manager route name: `guardrails`.

```text
GET    /admin/api/v1/guardrails
POST   /admin/api/v1/guardrails
GET    /admin/api/v1/guardrails/{id}
PATCH  /admin/api/v1/guardrails/{id}
DELETE /admin/api/v1/guardrails/{id}
```

### MCP servers

Manager route name: `mcp-servers`.

```text
GET    /admin/api/v1/mcp-servers
POST   /admin/api/v1/mcp-servers
GET    /admin/api/v1/mcp-servers/{id}
PATCH  /admin/api/v1/mcp-servers/{id}
DELETE /admin/api/v1/mcp-servers/{id}
POST   /admin/api/v1/mcp-servers/{id}/tools         # MVP: discover tools; doubles as connection check
```

PATCH semantics: the inner `mcp_server` config is replaced wholesale, not deep-merged. Clients send the full `MCPServer` object with any unchanged fields preserved. This keeps client logic simple and avoids merge surprises.

### Observability (singleton)

Manager route name: `observability`. Standalone deviates to no-`{id}` routes; see §"Singleton vs collection blocks" for why.

```text
GET    /admin/api/v1/observability
PATCH  /admin/api/v1/observability
DELETE /admin/api/v1/observability
POST   /admin/api/v1/observability/check-connection        # MVP connection check
```

`PATCH /observability` is upsert: if no row exists, create it; otherwise update. First write requires the `observability` field; subsequent PATCHes can be partial. PATCH semantics for the inner `observability` config are shallow replace, same rule as MCP servers.

### Integrations

Manager route name: `integrations`.

```text
GET    /admin/api/v1/integrations
POST   /admin/api/v1/integrations
GET    /admin/api/v1/integrations/{id}
PATCH  /admin/api/v1/integrations/{id}
DELETE /admin/api/v1/integrations/{id}
```

PATCH semantics: shallow replace of the inner `integration` config. The standalone row's `enabled` is the single source of truth; the inner `IntegrationConfig.enabled` is overwritten at assembly.

### Prompts

Manager route name: `prompts`.

```text
GET    /admin/api/v1/prompts
POST   /admin/api/v1/prompts
GET    /admin/api/v1/prompts/{id}
PATCH  /admin/api/v1/prompts/{id}
DELETE /admin/api/v1/prompts/{id}
```

Versioning semantics (mirrors manager):

- POST with an existing `prompt_id` creates a new version.
- PATCH on `content` creates a new version (append-only).
- PATCH on `tags` updates the current version in place.
- DELETE removes the entire `prompt_id` chain (all versions). Single-version deletion is not supported in MVP.

Optional later:

```text
GET /admin/api/v1/prompts/{prompt_id}/versions
GET /admin/api/v1/prompts/by-id/{prompt_id}
```

### Runtime and config

Standalone-specific:

```text
GET /admin/api/v1/runtime/status      # operator dashboard view; see §"Runtime status"
GET /admin/api/v1/readyz              # admin-only deep readiness; see §"Readiness"
GET /admin/api/v1/config/materialized # JSON of the current EngineConfig (UI consumption)
GET /admin/api/v1/config/export       # YAML download of the current EngineConfig (file/curl)
```

`materialized` and `export` differ only in format and content negotiation. Both return the same materialized `EngineConfig`. `materialized` is JSON for the admin UI; `export` is `text/yaml` for downloads.

Later:

```text
POST /admin/api/v1/config/import
GET  /admin/api/v1/config/bundle
POST /admin/api/v1/config/bundle/import
```

## Proposed codebase organization

This is a recommended implementation structure, not a product requirement.

Goal:

- make the standalone backend easier to review
- reduce router-level schema drift
- keep runtime services separate from API wiring
- mirror manager organization where it helps comprehension
- avoid importing enterprise concepts into standalone

Recommended package shape:

```text
idun_agent_standalone/
  app.py
  cli.py
  core/
    settings.py
    security.py
    middleware.py
    errors.py
    logging.py
  api/
    v1/
      deps.py
      routers/
        agents.py
        memory.py
        guardrails.py
        mcp_servers.py
        observability.py
        integrations.py
        prompts.py
        runtime.py
        config.py
        auth.py
        traces.py
      schemas/
        # thin aliases/wrappers around idun_agent_schema.standalone
  services/
    bootstrap.py
    engine_config.py
    config_io.py
    reload.py
    reload_hook.py
    runtime.py
    diagnostics.py
    normalize.py
  infrastructure/
    db/
      models/
      migrations/
      session.py
  traces/
  theme/
  _testing/
```

Guidance:

- `app.py` should become composition and wiring, not business logic.
- Admin routers should call services and schemas, not assemble engine config inline.
- `services/engine_config.py` should own materialized `EngineConfig` assembly.
- `services/reload.py` and `services/reload_hook.py` should own reload orchestration and mutation transaction behavior.
- `core/logging.py` should own structured logging setup.
- `core/security.py` should own local auth primitives, session signing, CSRF helpers, and password utilities.
- Test-only helpers should move under `_testing/` so runtime code is easier to scan.

Reuse boundaries:

- Standalone reuses the manager **schema layer** (`idun_agent_schema.manager.*`) and **converters** (e.g. `convert_guardrail`).
- Standalone does **not** import manager SQLAlchemy models or services. No `from app...` imports inside `idun_agent_standalone/`. See §"Manager schema mirror rule".
- The manager service and standalone library evolve independently. Their only shared code lives in `idun_agent_schema/`.

Post-MVP refactor (deferred, but worth tracking):

- `services/idun_agent_manager/src/app/services/engine_config.py` and `idun_agent_standalone/services/engine_config.py` will end up doing the same job: materializing `EngineConfig` from manager-shape rows. Once both are stable, extract the assembly logic into a shared module under `idun_agent_schema.manager.assembly` (or a new `idun_agent_engine.assembly` package) so both control planes invoke a single implementation. Treat this as a refactor in a release that follows the standalone rework, not part of MVP.

This organization can be implemented gradually. It should not block the product model work unless current file size or coupling makes a safe migration hard to review.

## Admin write flow

Locked flow:

```text
Admin API request
  -> acquire reload mutex (single in-process asyncio lock, single-replica assumption)
  -> [round 1] validate request body with idun_agent_schema / standalone wrappers
       on failure: 422 + field_errors  (code = validation_failed)
  -> stage DB mutation in transaction
  -> assemble EngineConfig from staged DB state
       (apply manager -> engine converters: convert_guardrail, memory framework mapping, prompt latest-version selection)
  -> [round 2] validate assembled EngineConfig
       on failure: 422 + field_errors  (code = validation_failed)
       typical examples: framework/memory mismatch, invalid integration combo
  -> [round 3] try runtime reload
       on success: commit DB; reload.status = "reloaded"; HTTP 200
       on structural change: commit DB; reload.status = "restart_required"; HTTP 200
       on init failure: rollback DB; HTTP 500 (code = reload_failed)
  -> release reload mutex
```

Invariant:

```text
Saved config == active config
```

Exception:

```text
restart_required means saved config will become active after restart
```

No desired-vs-live divergence in MVP.

Concurrency note: the asyncio lock is per-process. Standalone is single-replica. If multi-replica deployment is ever supported, a DB-backed advisory lock will be required.

## Operational hardening

Locked:

- Operational hardening is required for production-ready standalone deployments.
- This does not turn standalone into an enterprise control plane.
- These requirements protect and explain one locally deployed agent.

### Audit logs

**Deferred to the next version.**

Reason:

- Audit logging requires a stable destination (DB-backed `standalone_audit_event` table or structured-log shipping) and clear retention semantics.
- The MVP focuses on config-level correctness, reload safety, and login throttling. A useful audit story comes after.
- Reload visibility (below) plus structured request/login logs cover the operator's needs for v1.

When implemented later, audit events should:

- be emitted as structured logs first, with an optional `standalone_audit_event` DB table when the admin UI needs to query them
- never include plaintext secrets, password hashes, session secrets, provider API keys, or full prompt content
- include a session **fingerprint** (truncated HMAC, e.g. first 8 chars), not the full session ID, to prevent forgery if logs leak
- include request ID, resource type/id, operation, outcome, reload status, timestamp, and trusted-proxy-derived client address

### Structured logging

Standalone should define a logging setup for both CLI and server startup.

Target behavior:

- configurable log level
- optional JSON logs
- request ID attached to all request-scoped log records
- structured admin audit event fields
- structured reload lifecycle fields

Request IDs:

- incoming `x-request-id` may be honored if trusted
- otherwise standalone generates a request ID
- response includes the request ID
- logs include the same request ID

### Reload visibility

Reload must log every meaningful outcome.

Required events:

```text
reload.started
reload.reloaded
reload.restart_required
reload.init_failed_recovered
reload.init_failed_unrecovered
reload.rollback_committed
reload.rollback_failed
```

Reload logs should include:

- request ID
- resource type and resource ID that triggered reload
- previous config hash
- attempted config hash
- elapsed time
- reload status
- recovery outcome
- sanitized error summary

The known kill window between DB flush and commit should be documented during implementation. If needed later, add a persistent pending-write marker to reconcile after restart, but that is not required for the initial design.

### Login rate limiting

Password-mode login must be rate limited.

Baseline target:

```text
5 failed attempts per 5 minutes per client key
```

Client key may be:

- IP address for simple deployments
- trusted proxy client address when configured
- username/admin subject if standalone later supports named local admins

Storage:

- In-memory counter is sufficient because standalone is single-replica.
- If multi-replica deployment is enabled later, the counter must move to the standalone DB or a shared store.

Rate limit responses use the admin error shape with `code = rate_limited` and HTTP 429. They must not disclose whether the password or account state was the problem.

### CORS and CSRF

Admin routes must have explicit browser security posture.

Rules:

- `/admin/api/v1/*` should not rely on wildcard CORS.
- Credentialed admin requests should be same-origin by default.
- If cross-origin admin access is explicitly configured, allowed origins must be explicit.
- Password-mode cookie auth should use CSRF protection for mutating admin routes.
- CSRF protection can use a signed double-submit token or equivalent framework-supported pattern.

Non-browser clients may use future token-based admin auth, but that is not part of MVP.

## Mutation response envelope

Locked:

```text
StandaloneMutationResponse[T]
  data: T
  reload: StandaloneReloadResult
```

Example success:

```json
{
  "data": {
    "id": "8d4f2f0c-...",
    "slug": "github-tools",
    "name": "GitHub Tools"
  },
  "reload": {
    "status": "reloaded",
    "message": "Saved and reloaded",
    "error": null
  }
}
```

Example restart required:

```json
{
  "data": {
    "id": "8d4f2f0c-...",
    "slug": "default-agent",
    "name": "Support Agent"
  },
  "reload": {
    "status": "restart_required",
    "message": "Saved. Restart required to apply.",
    "error": null
  }
}
```

Example reload failure:

```json
{
  "error": {
    "code": "reload_failed",
    "message": "Config was not saved because the agent failed to reload.",
    "details": {
      "recovered": true
    },
    "fieldErrors": null
  }
}
```

HTTP behavior:

- validation error before reload (round 1 or round 2): `422`  (`code = validation_failed`)
- reload/init failure: `500`  (`code = reload_failed`)
- restart required: `200`  (`reload.status = "restart_required"`)
- reload success: `200`  (`reload.status = "reloaded"`)
- rate-limited login: `429`  (`code = rate_limited`)

Successful DELETE example:

```json
{
  "data": {
    "id": "8d4f2f0c-...",
    "deleted": true
  },
  "reload": {
    "status": "reloaded",
    "message": "Removed and reloaded",
    "error": null
  }
}
```

## EngineConfig assembly

Locked:

```text
base_engine_config.server
+ base_engine_config.agent
+ standalone_memory                    -> convert manager-shape ManagedMemory to engine CheckpointConfig | SessionServiceConfig
+ enabled standalone_guardrails         -> convert ManagerGuardrailConfig to engine guardrail (idun_agent_schema.manager.guardrail_configs.convert_guardrail)
+ enabled standalone_mcp_servers        -> stored as MCPServer; no conversion
+ enabled standalone_observability      -> stored as ObservabilityConfig; no conversion
+ enabled standalone_integrations       -> stored as IntegrationConfig; force inner enabled=true at assembly
+ latest standalone_prompts             -> convert ManagedPrompt to PromptConfig (latest version per prompt_id)
= full EngineConfig
```

Then:

```text
EngineConfig.model_validate(full_config)
```

Assembly rules:

- Agent is always included.
- Memory included if configured. Framework/memory mismatch fails round 2 validation.
- Guardrails included only if enabled. Sort by `position` then `sort_order`.
- MCP servers included only if enabled.
- Observability providers included only if enabled.
- Integrations included only if enabled. The standalone row's `enabled` overwrites the inner `IntegrationConfig.enabled` at assembly.
- Prompts included as latest version per `prompt_id`.
- Disabled collection blocks are skipped.
- Theme, traces, logs, auth, and enrollment are not included in `EngineConfig`.

### Config hash

Locked:

```text
config_hash = sha256(canonical_json(materialized EngineConfig))
```

Canonicalization: **JCS / RFC 8785** (sort keys, no whitespace, UTF-8, escape rules per spec). This must be deterministic across implementations or hashes diverge.

The hash is recomputed on every successful reload and stored on `standalone_runtime_state` as `last_applied_config_hash`. It surfaces in `GET /runtime/status`.

Framework-specific memory mapping:

| Framework | Memory maps to |
| --- | --- |
| LangGraph | `agent.config.checkpointer` |
| ADK | `agent.config.session_service` |

## Cold-start states

Locked:

Standalone may boot into one of these top-level states. The state is reported by `GET /admin/api/v1/runtime/status` as the top-level `status` field.

| State | Meaning | DB precondition | Engine precondition | Operator action |
| --- | --- | --- | --- | --- |
| `not_configured` | Fresh DB, no agent row, no YAML seed | `standalone_agent` row missing | engine not booted | Submit YAML or PATCH `/agent` to seed |
| `initializing` | Standalone is assembling config / starting engine | Agent row present | engine boot in progress | Wait |
| `running` | Engine serving | Agent row present + valid config | engine up | Operate normally |
| `error` | Engine failed to start; previous config (if any) is not running | Agent row present | engine boot failed | Inspect `runtime/status.reload.lastError`, fix and retry |

Boot path:

```text
boot
  -> open DB, run alembic upgrade head
  -> if standalone_install_meta is fresh AND IDUN_CONFIG_PATH points to a YAML
       -> import YAML into DB (manager-shape rows)
       -> stamp install_meta.config_hash
  -> read standalone_agent
  -> if absent: state = not_configured; engine NOT booted; admin API serves
  -> else:
       -> assemble EngineConfig
       -> validate (round 2)
       -> boot engine (round 3)
       -> on success: state = running
       -> on failure: state = error; admin API still serves so the operator can fix the config
```

Important: the admin API and `/health` MUST come up even when the engine fails to start. Operators need to fix bad configs through the admin UI; refusing to serve admin routes traps them out of recovery.

`GET /admin/api/v1/agent` when `state == not_configured` returns 404 (`code = not_found`) so the UI can render an onboarding prompt.

## Runtime status

Locked:

- Runtime status includes full diagnostic info.
- Endpoint is admin-only.

Endpoint:

```text
GET /admin/api/v1/runtime/status
```

Conceptual response:

```text
StandaloneRuntimeStatus
  status
  agent
  config
  engine
  reload
  mcp
  observability
  enrollment
  updated_at
```

Include:

- config hash
- engine capabilities
- failed MCP servers
- observability status
- enrollment info placeholder

Public `/health` remains simple and separate.

### `/health`

For Cloud Run and uptime:

```json
{
  "status": "ok"
}
```

No auth-required diagnostics.

### `/admin/api/v1/runtime/status`

For operators/admin UI:

```json
{
  "status": "running",
  "agent": {
    "id": "8d4f2f0c-...",
    "name": "Support Agent",
    "framework": "LANGGRAPH",
    "version": "1.0.0",
    "lifecycleStatus": "active"
  },
  "config": {
    "hash": "abc123",
    "lastAppliedAt": "2026-04-27T09:30:00Z"
  },
  "engine": {
    "capabilities": {
      "streaming": true,
      "history": true,
      "threadId": true
    }
  },
  "reload": {
    "lastStatus": "reloaded",
    "lastMessage": "Saved and reloaded",
    "lastError": null,
    "lastReloadedAt": "2026-04-27T09:30:00Z"
  },
  "mcp": {
    "configured": 3,
    "enabled": 2,
    "failed": []
  },
  "observability": {
    "configured": 2,
    "enabled": 1
  },
  "enrollment": {
    "mode": "local",
    "status": "not_enrolled",
    "managerUrl": null,
    "managedAgentId": null
  }
}
```

Config hash:

```text
sha256(canonical_json(materialized EngineConfig))
```

## Readiness and diagnostics endpoints

Locked:

- Add admin-only readiness and diagnostics endpoints.
- Keep public `/health` as liveness only.
- Diagnostics must help operators understand whether the standalone can serve traffic safely.

### Liveness

Endpoint:

```text
GET /health
```

Behavior:

- unauthenticated
- shallow
- suitable for Cloud Run liveness checks
- should not expose internals

### Readiness

Endpoint:

```text
GET /admin/api/v1/readyz
```

Behavior:

- authenticated admin endpoint
- checks whether the process is ready to serve real traffic

Required checks:

- database connectivity
- current engine config exists and validates
- agent runtime is configured
- trace writer is running when traces are enabled
- last reload did not leave the runtime in unrecovered error state

Conceptual response:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "engine": "ok",
    "traceWriter": "ok",
    "reload": "ok"
  }
}
```

Failure response should use the admin error shape or a structured readiness response with failed checks, depending on what is more useful to the UI and Cloud Run probes.

### Connection checks

Operators need to validate external dependencies before or after enabling them.

**MVP-required endpoints**:

```text
POST /admin/api/v1/observability/{id}/check-connection
POST /admin/api/v1/memory/check-connection
POST /admin/api/v1/mcp-servers/{id}/tools
```

Purpose:

- observability check validates provider reachability/configuration
- memory check validates SQLite/Postgres/in-memory configuration as applicable
- MCP tools endpoint discovers tools exposed by a configured MCP server before relying on it in the agent

These are MVP because saving a config that fails silently at runtime is worse than no admin UI. They are operational diagnostics, not a standalone resource catalog.

Each check returns:

```text
{
  "ok": bool,
  "details": object | null,
  "error": string | null
}
```

Checks must time-bound their work (5s recommended) and never block reload.

### Metrics endpoint

Required future endpoint:

```text
GET /admin/api/v1/metrics
```

Initial metrics should include:

- reload count by status
- last reload timestamp
- trace writer queue depth
- trace writer dropped/failed event count if available
- retention purge count if trace retention is enabled
- admin login failure count if available

Prometheus text format is preferred for infrastructure compatibility, but JSON may be acceptable for a first UI-facing implementation.

## Export/import

Locked:

- Export simple materialized `EngineConfig` YAML now.
- Add richer standalone bundle later for Governance Hub import.

### MVP export

Command:

```bash
idun-standalone export --out config.yaml
```

Output:

```text
EngineConfig YAML
```

This is the runtime view:

```text
what the engine runs
```

It is useful for:

- debugging
- backups
- support
- engine file mode
- local inspection

It does not preserve:

- disabled resources
- resource UUIDs/slugs
- prompt history beyond assembled latest prompts
- standalone metadata
- local admin auth
- traces

### Later bundle export

Command:

```bash
idun-standalone export-bundle --out agent.idun.zip
```

Conceptual bundle:

```text
manifest.json
agent.json
memory.json
guardrails.json
mcp_servers.json
observability.json
integrations.json
prompts.json
theme.json optional later
metadata.json
```

This is the control-plane view:

```text
what the local standalone control plane knows
```

Use cases:

- Governance Hub import
- migration
- backup/restore with resource identity
- disabled resource preservation
- prompt history preservation

### Future sync snapshot/import surface

Locked:

- Keep simple `EngineConfig` YAML export now.
- Keep richer standalone bundle import/export later.
- Treat sync snapshot/import as future work, not MVP.

Future endpoints:

```text
GET  /admin/api/v1/sync/snapshot
POST /admin/api/v1/sync/import
```

Purpose:

- `sync/snapshot` returns a Governance Hub import-ready representation of the standalone agent.
- `sync/import` accepts a Governance Hub-shaped payload for controlled import/update.

Constraints:

- Must respect the standalone product boundary: one agent, no workspace/RBAC/fleet management locally.
- Must not require standalone to adopt association tables in MVP.
- Must not export local admin auth secrets.
- Must not export traces by default.
- Must preserve enough source metadata for Governance Hub to create its own managed resource IDs.

This surface should be designed when Governance Hub enrollment/import is actively implemented.

## Enrollment

Locked:

- Add enrollment schema wrappers now.
- Do not add enrollment DB tables or behavior yet.

Schema placeholders:

```text
StandaloneEnrollmentMode
  local
  enrolled
  managed

StandaloneEnrollmentStatus
  not_enrolled
  pending
  connected
  error

StandaloneEnrollmentInfo
  mode
  status
  manager_url
  workspace_id
  managed_agent_id
  config_revision
```

MVP always reports:

```text
mode = local
status = not_enrolled
```

Future DB table:

```text
standalone_enrollment
  id
  mode
  manager_url
  workspace_id
  managed_agent_id
  agent_api_key_ref
  config_revision
  last_synced_at
  status
```

No secrets in export/enrollment info:

- no agent API key
- no admin password hash
- no session secret
- provider secrets redacted unless explicitly requested by a secure export mode

## Governance Hub mapping

Standalone is designed to map cleanly into manager later. Because of the §"Manager schema mirror rule", enrollment is a near-mechanical SQL transform per resource: copy columns, inject `workspace_id`, rebuild junctions from `enabled` flags. The JSONB content does not need to be transformed because the Pydantic shapes are identical.

| Standalone block | Governance Hub mapping |
| --- | --- |
| `standalone_agent` | `managed_agents` (inject `workspace_id`; reattach `memory_id` FK from imported memory row) |
| `standalone_memory` | `managed_memories` (inject `workspace_id`) |
| `standalone_guardrail` | `managed_guardrails` (inject `workspace_id`) + one `agent_guardrails` row per `enabled = true` (carrying `position`, `sort_order`) |
| `standalone_mcp_server` | `managed_mcp_servers` (inject `workspace_id`) + one `agent_mcp_servers` row per `enabled = true` |
| `standalone_observability` | `managed_observabilities` (inject `workspace_id`) + one `agent_observabilities` row per `enabled = true` |
| `standalone_integration` | `managed_integrations` (inject `workspace_id`) + one `agent_integrations` row per `enabled = true` |
| `standalone_prompt` | `managed_prompts` (inject `workspace_id`; preserve `(prompt_id, version)`) |
| local traces | local only initially; optional summaries later |
| admin auth | not imported |
| install metadata | not imported (provenance only; standalone-local) |

### Enrollment SQL transform sketch

Reference shape for the import job. `$WS` = enrolling workspace UUID, `$AID` = newly-created `managed_agents.id` mapped to this standalone install.

```sql
-- Resources: 1:1 column copy, inject workspace_id
INSERT INTO managed_memories (id, name, agent_framework, memory_config, workspace_id, created_at, updated_at)
SELECT id, COALESCE(name, 'standalone-memory'), agent_framework, memory_config, $WS, created_at, updated_at
FROM staging.standalone_memory;

INSERT INTO managed_mcp_servers (id, name, mcp_server_config, workspace_id, created_at, updated_at)
SELECT id, name, mcp_server_config, $WS, created_at, updated_at
FROM staging.standalone_mcp_server;

INSERT INTO managed_observabilities (id, name, observability_config, workspace_id, created_at, updated_at)
SELECT id, name, observability_config, $WS, created_at, updated_at
FROM staging.standalone_observability;

INSERT INTO managed_integrations (id, name, integration_config, workspace_id, created_at, updated_at)
SELECT id, name, integration_config, $WS, created_at, updated_at
FROM staging.standalone_integration;

INSERT INTO managed_guardrails (id, name, guardrail_config, workspace_id, created_at, updated_at)
SELECT id, name, guardrail_config, $WS, created_at, updated_at
FROM staging.standalone_guardrail;

INSERT INTO managed_prompts (id, prompt_id, version, content, tags, workspace_id, created_at, updated_at)
SELECT id, prompt_id, version, content, tags, $WS, created_at, updated_at
FROM staging.standalone_prompt;

-- Agent: inject workspace_id, point memory_id at the imported memory row
INSERT INTO managed_agents (id, name, base_url, status, version, engine_config, workspace_id, memory_id, created_at, updated_at)
SELECT $AID, name, base_url, status, version, engine_config, $WS,
       (SELECT id FROM staging.standalone_memory LIMIT 1),
       created_at, updated_at
FROM staging.standalone_agent;

-- Junctions: rebuild from enabled = true rows
INSERT INTO agent_mcp_servers (id, agent_id, mcp_server_id)
SELECT gen_random_uuid(), $AID, id
FROM staging.standalone_mcp_server WHERE enabled;

INSERT INTO agent_observabilities (id, agent_id, observability_id)
SELECT gen_random_uuid(), $AID, id
FROM staging.standalone_observability WHERE enabled;

INSERT INTO agent_integrations (id, agent_id, integration_id)
SELECT gen_random_uuid(), $AID, id
FROM staging.standalone_integration WHERE enabled;

INSERT INTO agent_guardrails (id, agent_id, guardrail_id, position, sort_order)
SELECT gen_random_uuid(), $AID, id, position, sort_order
FROM staging.standalone_guardrail WHERE enabled;
```

Identity policy:

- Standalone UUIDs **may** be preserved as managed UUIDs if the workspace is fresh and there are no collisions. The default is to re-issue manager UUIDs and store the standalone UUID on the imported row as `source_standalone_id` metadata.
- This policy is finalized when the enrollment job is built; the schema mirror keeps both options open.

Conflict handling (later, when enrollment is implemented):

- Prompt collisions on `(workspace_id, prompt_id, version)` are rejected; the operator is asked to resolve.
- Guardrail/MCP/observability/integration name collisions inside the workspace are rejected unless the operator opts in to merge.
- The `engine_config` JSONB on `managed_agents` is recomputed by the manager assembly service after import, not copied verbatim, so it always matches the imported junction rows.

## Non-goals

This design does not include:

- workspace model
- multi-agent management
- RBAC
- user/member management
- shared reusable resource catalog
- organization-level policy
- enterprise OIDC for standalone MVP
- two-way sync with Governance Hub
- draft/apply config workflow
- desired/live config divergence
- UI redesign
- theme schema standardization
- trace schema standardization
- logs schema/API
- enrollment DB/behavior

## Future implementation test gates

These tests should be treated as implementation gates when the Admin API and Config DB rework starts.

Required backend tests (each line states the gate's "done when" criterion):

- **Rollback path** — induce a reload init failure on PATCH `/mcp-servers/{id}`; gate: DB row is unchanged, active engine still serves prior config, response is 500 + `code = reload_failed`.
- **`restart_required` path** — change `agent.framework`; gate: DB row is updated, response is 200 + `reload.status = "restart_required"`, in-memory engine still uses old framework until process restart.
- **Reload callback survival** — assert that the trace observer is re-attached to the engine after a hot reload; gate: a chat completion after reload produces trace events.
- **YAML seed/export/seed roundtrip** — seed YAML covering every active resource → export to YAML → seed a fresh DB from that export; gate: byte-equivalent EngineConfig across both seeds.
- **Real reload integration** — boot a LangGraph echo agent, edit config through admin, reload, run a chat turn; gate: chat returns expected echo with the new config applied.
- **Auth boundary tests** — gate: login rate limit returns 429 after 5 failures; sliding-session renewal occurs at 90% TTL; password rotation invalidates outstanding sessions; CSRF token enforced on mutating routes.
- **Schema validation tests** — gate: malformed payloads for guardrail/memory/MCP/observability/integration each return 422 + `field_errors` and never write to DB.
- **Validation round 2 tests** — gate: invalid framework/memory pair returns 422 + `field_errors` (not 500), DB unchanged.
- **Runtime status/readiness tests** — gate: failed MCPs appear in `runtime/status.mcp.failed`; DB outage flips `readyz` to not-ready with the failed check named.
- **Concurrency test** — gate: two simultaneous PATCH requests to different resources serialize through the reload mutex; neither corrupts the other's commit window.
- **Cold-start states** — gate: fresh DB serves `runtime/status.status = "not_configured"`; `GET /agent` returns 404; admin API remains responsive.

Required UI/E2E tests:

- admin CRUD flows for active resources
- reload-after-edit behavior
- restart-required state display
- login flow and session renewal behavior
- diagnostics/readiness display for degraded states

Required database/migration tests:

- **Fresh Alembic baseline** — gate: `alembic upgrade head` from empty DB produces every `standalone_*` table (and the legacy `theme` table) with correct columns and constraints.
- **SQLite + Postgres parity** — gate: every migration runs identically on both engines in CI; JSON columns store and retrieve the same canonical bytes.
- **Migration roundtrip** — gate: `upgrade head` → `downgrade -1` → `upgrade head` for every revision is non-destructive (where downgrade is supported).
- **Concurrent admin mutation** — gate: two simultaneous POSTs to `/mcp-servers` with the same name produce one success + one 409 conflict; no orphan rows.

Note: this is a **greenfield rework** (see §"Rework posture"). There are no upgrade migrations from the pre-rework schema. Existing local installs reset on upgrade.

These tests do not change the product model. They make the locked model safe to implement.

## Future documentation and operations work

These items are explicit future work. They should not block the Admin API/Config DB design, but they should be tracked before a public production release.

Documentation gaps:

- migration-to-Governance-Hub/SaaS guide
- security mode comparison: `auth_mode=none`, password mode, future OIDC/SSO
- `/runtime-config.js` shape and UI consumption contract
- supported frameworks: LangGraph, ADK, Haystack, and templates
- admin API reference for resources, errors, reload envelope, readiness, diagnostics, and export
- Cloud Run deployment operations guide
- backup/restore guide for SQLite/Postgres plus config export
- what is and is not exported: theme, admin auth, traces, logs, disabled resources, prompt versions

Operations gaps:

- trace purge command, e.g. `idun-standalone traces purge --before <date>`
- config validation CLI, e.g. `idun-standalone validate config.yaml`
- read-only/admin-lock mode that disables mutating admin routes
- trace-writer failure counters and diagnostics
- optional backup/restore workflow beyond YAML export

## Acceptance criteria for future implementation

When implemented, the design is successful if:

1. Core standalone admin resources use `idun_agent_schema.standalone` wrappers.
2. Inner configs reuse `idun_agent_schema.engine` and `idun_agent_schema.manager` models. Stored shape is manager-shape; conversion happens at assembly.
3. DB tables use explicit `standalone_*` names (except `theme`, which is preserved as legacy).
4. Core config rows store schema-normalized JSON, not arbitrary dicts.
5. Standalone has no workspace/RBAC/fleet concepts.
6. Collection blocks may be disabled; singleton blocks do not use `enabled` and are addressed without `{id}` in URLs.
7. Mutations (POST, PATCH, DELETE) return `{ data, reload }`.
8. Validation failures do not save. Both validation rounds (request body, assembled EngineConfig) return 422 + `field_errors`.
9. Reload failures roll back DB and return 500 + `code = reload_failed`.
10. Restart-required structural changes commit and return **200** + `reload.status = "restart_required"`. (202 is reserved for future async work.)
11. Materialized config export produces a valid `EngineConfig`. JSON view at `/config/materialized`, YAML download at `/config/export`.
12. Runtime status exposes config hash, capabilities, failed MCP servers, observability status, and local enrollment placeholder.
13. Cold-start states (`not_configured`, `initializing`, `running`, `error`) are reported correctly; the admin API serves even when the engine fails to start.
14. Existing standalone behavior remains single-agent and single-replica, and deployable to Cloud Run.
15. Reload mutations serialize through a single in-process asyncio lock.
16. Login rate limiting (429 + `code = rate_limited`), explicit admin CORS, and CSRF posture are implemented for password-mode admin routes.
17. `/admin/api/v1/readyz`, connection checks (memory, observability, MCP-tools-discover), and `runtime/status` have locked contracts. Cloud Run uses `/health` for both probes.
18. Old standalone admin/db code is fully removed. No deprecation aliases. Fresh Alembic baseline at `0001_initial.py`.
19. Test gates listed in §"Future implementation test gates" all pass with their stated done-when criteria.
20. OIDC/SSO, sync snapshot/import, audit logs, theme rename, docs/ops cleanup, and Governance Hub enrollment remain future work unless explicitly pulled into scope.
21. Standalone DB tables mirror manager column shapes 1:1 (per §"Manager schema mirror rule"). No imports of manager SQLAlchemy `*Model` classes in `idun_agent_standalone/`.
22. Shared assembly extraction (manager + standalone using one implementation) is tracked as a post-MVP refactor.

## Summary

The refined standalone backend model is:

> A schema-driven, governance-ready local control plane for one active Idun agent.

It should reuse manager/engine schemas, mirror manager route names where possible, and keep local product semantics simple:

```text
Configure this agent.
Reload this agent.
Debug this agent.
Export this agent's runtime config.
```

It should not become:

```text
a workspace
a fleet manager
a reusable local catalog
a mini enterprise control plane
```

This gives Idun the best foundation for both OSS adoption and future Governance Hub enrollment.
