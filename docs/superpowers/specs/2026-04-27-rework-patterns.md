# Standalone Admin/DB Rework — Patterns Reference

Date: 2026-04-27

Authoritative source: `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md` (the rework spec). When this doc and the spec disagree, the spec wins.

Audience: subagents executing Phases 2–7 of the standalone admin/db rework, plus future contributors. This doc is the ergonomic copy-paste form of the spec.

Status tags: each rule carries either **ESTABLISHED** (locked by working code in this branch) or **FORWARD** (locked by spec; reference snippet is the canonical skeleton; will be refined when the real code lands in its phase).

---

## 1. Purpose, audience, and how to use this doc

This doc sits between the rework spec (the law) and the per-phase implementation plans (the procedure). It exists because subagents executing Phases 2–7 should not have to re-derive patterns from prose every time they touch a new file.

How to read each rule:

- The **rule statement** is what the code must do.
- The **status tag** is one of:
  - `ESTABLISHED` — proven by code in this branch, with a reference snippet citing real `path:line` ranges.
  - `FORWARD` — locked by the spec, with a code skeleton derived from the spec; the real reference will land when its phase implements the pattern.
- The **reference snippet** is what to copy-modify-paste.
- The **why** line explains the constraint so you know how to handle edge cases.

What to do when ESTABLISHED rules disagree with the snippet: file an issue, then update both the rule and the snippet atomically in a single PR. Drift between rule and snippet is itself a pattern-breaker.

What to do when FORWARD reality differs from the spec: file an issue against the spec first; once the spec resolves, update this doc as part of the same phase that lands the real code.

How phases consume this doc:

- Phase 2 (schemas) refines §4.
- Phase 3 (plumbing) refines §7, §8, §10.
- Phase 4 (DB models) refines §5, §14.
- Phase 5 (collection routers) refines §6.1–6.6.
- Phase 6 (diagnostics) refines §11, §12.
- Phase 7 (auth hardening) feeds §15 (forbidden patterns).

## 2. Spec linkage

Authoritative source for every rule below: `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md`.

Maintenance ownership: each phase's PR updates this doc when it lands a forward pattern (replacing the skeleton with a real snippet, removing the FORWARD tag, anchoring file:line refs to the post-merge state). The phase's PR description explicitly lists which sections were updated.

Cross-doc references:

- Per-phase design docs at `docs/superpowers/specs/YYYY-MM-DD-phase-N-<topic>-design.md` may refer to specific sections here using `§4` or `§14.2` shorthand. Section numbering in this doc is stable across phases; use the numbers as durable anchors.
- Per-phase plans at `docs/superpowers/plans/YYYY-MM-DD-rework-phaseN.md` should reference this doc when a task copies a pattern.

When the rework spec is amended, this doc is amended alongside (one commit, both files staged).

---

## 3. File layout — ESTABLISHED

Phase 1 audit confirmed the rework slices follow the spec's "Proposed codebase organization." Subsequent phases add files in the same shape.

Tree excerpt of the new tree as of Phase 1 close:

```
libs/idun_agent_schema/src/idun_agent_schema/standalone/
├── __init__.py             # public re-exports
├── _base.py                # _CamelModel — shared Pydantic base
├── agent.py                # StandaloneAgentRead, StandaloneAgentPatch
├── common.py               # StandaloneMutationResponse[T], StandaloneDeleteResult,
│                           # StandaloneSingletonDeleteResult, StandaloneResourceIdentity
├── errors.py               # StandaloneErrorCode, StandaloneFieldError, StandaloneAdminError
├── memory.py               # StandaloneMemoryRead, StandaloneMemoryPatch
└── reload.py               # StandaloneReloadStatus, StandaloneReloadResult

libs/idun_agent_standalone/src/idun_agent_standalone/
├── api/                    # HTTP surface (singleton + future collection routers)
│   └── v1/
│       ├── __init__.py
│       ├── deps.py         # FastAPI dependencies (SessionDep, etc.)
│       ├── errors.py       # AdminAPIError + exception handlers + error mapper
│       └── routers/
│           ├── __init__.py
│           ├── agent.py    # /admin/api/v1/agent (singleton)
│           ├── auth.py     # auth router stub
│           └── memory.py   # /admin/api/v1/memory (singleton)
├── core/                   # cross-cutting helpers (no business logic)
│   ├── logging.py          # get_logger
│   └── settings.py         # Pydantic Settings
├── services/               # domain logic; called by routers
│   └── engine_config.py    # EngineConfig assembly
└── infrastructure/         # IO concerns
    ├── db/
    │   ├── session.py      # async engine, session factory, Base
    │   └── models/         # SQLAlchemy ORMs (one file per resource)
    │       ├── __init__.py
    │       ├── agent.py    # StandaloneAgentRow
    │       └── memory.py   # StandaloneMemoryRow
    └── scripts/
        └── seed.py         # YAML → DB seeding for first boot
```

File responsibilities:

| Path | Purpose | Must NOT contain |
| --- | --- | --- |
| `idun_agent_schema/standalone/*.py` | Public Pydantic contracts for the admin surface | SQLAlchemy code, FastAPI imports, business logic |
| `infrastructure/db/models/*.py` | SQLAlchemy declarative ORMs, one file per resource | Pydantic schemas, route handlers |
| `infrastructure/db/session.py` | `Base`, async engine factory, sessionmaker | Models (each model imports `Base` from here) |
| `services/engine_config.py` (and future siblings) | Domain logic: assembly, conversion, reload orchestration | FastAPI imports, raw SQL strings |
| `api/v1/routers/*.py` | HTTP routing thin layer; calls services | Inline SQL, inline EngineConfig assembly |
| `api/v1/errors.py` | Error → HTTP envelope mapper | Domain logic |
| `api/v1/deps.py` | FastAPI dependency providers | Domain logic, request parsing |
| `core/logging.py` | Structured logging setup | App composition |
| `core/settings.py` | Pydantic Settings | Hard-coded defaults that belong in env vars |

Forbidden imports (cross-cuts §15; listed here too because subagents read this section first):

- No `from app.*` imports anywhere in `idun_agent_standalone/`. The legacy `app.py` will be deleted in Phase 8.
- No `from app.infrastructure.db.models import ...` or any import from `services/idun_agent_manager/`. See §14 for the rationale.
- No `from idun_agent_standalone.admin.* import ...` or any import from the legacy `admin/` tree.

Reference snippet — the schema namespace barrel at `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py:1-25`:

```python
"""Standalone admin API contracts."""

from .agent import (
    StandaloneAgentPatch,
    StandaloneAgentRead,
)
from .common import (
    StandaloneDeleteResult,
    StandaloneMutationResponse,
    StandaloneResourceIdentity,
    StandaloneSingletonDeleteResult,
)
from .errors import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)
from .memory import (
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
)
from .reload import (
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
```

Why: collecting public types into a single import surface keeps router import lines compact and gives Phases 2–7 one place to extend.

---

## 4. Schema patterns

### 4.1 Shared base — ESTABLISHED

Every public Pydantic model in the standalone namespace inherits from `_CamelModel` so the wire format is camelCase by default and snake_case Python field names still parse on input.

Reference snippet at `libs/idun_agent_schema/src/idun_agent_schema/standalone/_base.py:14-20`:

```python
class _CamelModel(BaseModel):
    """Base class with camelCase aliases and snake_case input fallback."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

Why: spec §"Case convention" locks camelCase outbound, snake_case enums, kebab-case paths. `populate_by_name=True` lets Python code construct models with snake_case kwargs while the JSON wire format stays camelCase.

Subagents copying this pattern: `from ._base import _CamelModel` and inherit. Do not redeclare `model_config` unless you need to add `from_attributes=True` for ORM-projected reads (see §4.2).

### 4.2 Singleton resource schemas — ESTABLISHED

Singleton resources (agent, memory) follow the Read/Patch pattern. There is no Create model — the row is seeded from YAML at first boot. Read models opt into `from_attributes=True` so they project from SQLAlchemy rows directly via `Model.model_validate(row)`.

Reference snippet at `libs/idun_agent_schema/src/idun_agent_schema/standalone/agent.py:27-61`:

```python
class StandaloneAgentRead(_CamelModel):
    """GET response and the data payload of PATCH responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str | None = None
    name: str
    description: str | None = None
    version: str | None = None
    status: AgentStatus
    base_url: str | None = None
    base_engine_config: EngineConfig
    created_at: datetime
    updated_at: datetime


class StandaloneAgentPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/agent."""

    name: str | None = None
    description: str | None = None
    version: str | None = None
    base_url: str | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
```

Patterns to copy:

- All fields on Patch are `T | None = None`. The router uses `body.model_fields_set` to distinguish "explicit null" from "field absent."
- `_no_null_name`-style validators reject explicit null on fields that are non-nullable in the DB (clearing them is meaningless for a singleton).
- Read models inherit from `_CamelModel` AND set `model_config = ConfigDict(from_attributes=True)` (Pydantic ConfigDict overrides; `populate_by_name=True` and `alias_generator=to_camel` are inherited from `_CamelModel`).

Why: explicit-null rejection at the Pydantic layer keeps the router free of `if body.name is None: ...` boilerplate. Read models projecting from ORM rows avoid hand-written `to_dict()`-style converters.

### 4.3 Collection resource schemas — FORWARD

For Phase 5 collection resources (`mcp_servers`, `observability`, `integrations`, `prompts`, `guardrails`), the schema skeleton is:

```python
# FORWARD — skeleton derived from spec; refine in Phase 2 / Phase 5
class Standalone<Resource>Read(_CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    # position: Literal["input", "output"]   # guardrails only
    # sort_order: int                         # guardrails only
    <inner_field>: <ManagerShape>             # see Stored shape rule below
    created_at: datetime
    updated_at: datetime


class Standalone<Resource>Create(_CamelModel):
    name: str
    enabled: bool = True
    <inner_field>: <ManagerShape>


class Standalone<Resource>Patch(_CamelModel):
    name: str | None = None
    enabled: bool | None = None
    <inner_field>: <ManagerShape> | None = None  # full nested replace; see §6.3
```

Stored shape per resource (cite the manager Pydantic model, not the engine model — see §14):

| Resource | `<inner_field>` | `<ManagerShape>` | Source module |
| --- | --- | --- | --- |
| MCP servers | `mcp_server` | `MCPServer` | `idun_agent_schema.engine.mcp_server` (manager uses engine shape directly) |
| Observability | `observability` | `ObservabilityConfig` | `idun_agent_schema.engine.observability_v2` (manager uses engine shape directly) |
| Integrations | `integration` | `IntegrationConfig` | `idun_agent_schema.engine.integrations` (manager uses engine shape directly) |
| Guardrails | `guardrail` | `ManagerGuardrailConfig` | `idun_agent_schema.manager.guardrail_configs` (manager wraps; converted at assembly via `convert_guardrail`) |
| Prompts | versioned (`prompt_id`, `version`, `content`, `tags`) | `ManagedPromptCreate/Read/Patch` | `idun_agent_schema.manager.managed_prompt` (append-only versioning) |

Why: spec §"Stored shape rule" requires manager-shape JSON in the DB. Three of the five collections share the engine shape with the manager (no conversion needed at assembly). Two require a converter that already exists in the manager and is reused.

---

## 5. ORM patterns

### 5.1 Singleton ORM — ESTABLISHED

Reference snippet at `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/memory.py:14-32`:

```python
class StandaloneMemoryRow(Base):
    """The singleton memory row.

    Uses a fixed primary key (``"singleton"``) because the resource is
    addressed by route, not by id.
    """

    __tablename__ = "standalone_memory"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    agent_framework: Mapped[str] = mapped_column(String(50), nullable=False)
    memory_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
```

And the agent variant at `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/agent.py:19-46`:

```python
class StandaloneAgentRow(Base):
    """The singleton agent row.

    Singleton is enforced at app level (one row at a time). The UUID
    primary key is preserved for cross-system identity when the install
    is later enrolled into Governance Hub.
    """

    __tablename__ = "standalone_agent"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # ... description, version, status, base_url, base_engine_config ...
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
```

Patterns to copy:

- Table name prefix: `standalone_<resource>`.
- UUID columns: `String(36)`, default via `_new_uuid()` helper that returns `str(uuid.uuid4())`.
- JSON columns: `from sqlalchemy import JSON` (the engine-agnostic version), NOT `JSONB` from `sqlalchemy.dialects.postgresql`.
- Timestamps: `DateTime(timezone=True)` with `func.now()` server defaults; `onupdate=func.now()` on `updated_at`.
- Memory's PK is fixed (`"singleton"`) at write time; agent's PK is a UUID generated at write time. Both are singletons; the difference is whether the row needs cross-system identity for enrollment (agent yes, memory no).

Why: spec §"Manager schema mirror rule" requires engine-agnostic types so SQLite (laptop dev) and Postgres (Cloud Run) both work. See §14 for the full mirror table.

### 5.2 Collection ORM — FORWARD

For Phase 4 collection ORMs:

```python
# FORWARD — skeleton derived from spec; refine in Phase 4
class Standalone<Resource>Row(Base):
    __tablename__ = "standalone_<resource>"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # position: Mapped[str] = mapped_column(String(10), nullable=False)   # guardrails only
    # sort_order: Mapped[int] = mapped_column(Integer, nullable=False)    # guardrails only
    <inner_field>_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
```

Compared to manager ORMs:

- Same column names and same JSON content shape.
- `String(36)` instead of `UUID(as_uuid=True)`.
- `JSON` instead of `JSONB`.
- No `workspace_id` FK column.
- No M:N junction tables (junction columns `position`, `sort_order`, `enabled` fold into the resource row directly).

The full mirror mapping is in §14.

---

## 6. Router patterns

### 6.1 Singleton router — ESTABLISHED

Reference snippet at `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py:36-116`:

```python
router = APIRouter(prefix="/admin/api/v1/agent", tags=["admin", "agent"])

_SAVED_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RESTART_REQUIRED,
    message="Saved. Restart required to apply.",
)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


@router.get("", response_model=StandaloneAgentRead)
async def get_agent(session: SessionDep) -> StandaloneAgentRead:
    row = await _load_agent(session)
    return StandaloneAgentRead.model_validate(row)


@router.patch("", response_model=StandaloneMutationResponse[StandaloneAgentRead])
async def patch_agent(
    body: StandaloneAgentPatch, session: SessionDep
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    fields = body.model_fields_set
    row = await _load_agent(session)

    if not fields:
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=_NOOP_RELOAD,
        )

    for field in fields:
        setattr(row, field, getattr(body, field))

    await session.commit()
    await session.refresh(row)

    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=_SAVED_RELOAD,
    )
```

Patterns to copy:

- `prefix="/admin/api/v1/<resource>"`. Singleton routes have NO `{id}` segment.
- `tags=["admin", "<resource>"]` for OpenAPI organization.
- GET response_model is the bare Read model (not wrapped in mutation envelope; GET is not a mutation).
- PATCH response_model is `StandaloneMutationResponse[<ReadModel>]`.
- Empty PATCH body returns the current row with `_NOOP_RELOAD`. No `await session.commit()` on noop.
- `body.model_fields_set` distinguishes "field present in JSON" from "field absent" — only assign present fields.

### 6.2 Collection router — FORWARD

For Phase 5 collection resources:

```python
# FORWARD — skeleton derived from spec; refine in Phase 5
router = APIRouter(prefix="/admin/api/v1/<resources>", tags=["admin", "<resource>"])


@router.get("", response_model=list[Standalone<Resource>Read])
async def list_<resources>(session: SessionDep) -> list[Standalone<Resource>Read]:
    rows = (await session.execute(select(Standalone<Resource>Row))).scalars().all()
    return [Standalone<Resource>Read.model_validate(row) for row in rows]


@router.post(
    "",
    response_model=StandaloneMutationResponse[Standalone<Resource>Read],
    status_code=http_status.HTTP_201_CREATED,
)
async def create_<resource>(
    body: Standalone<Resource>Create, session: SessionDep
) -> StandaloneMutationResponse[Standalone<Resource>Read]:
    # 1. Generate slug (see §6.5)
    # 2. Build row, session.add, session.flush
    # 3. Run 3-round validation (§8) — assemble + validate EngineConfig
    # 4. Acquire reload mutex, attempt reload (§10)
    # 5. Commit DB on success; rollback on failure
    # 6. Return envelope with reload outcome
    ...


@router.get("/{id}", response_model=Standalone<Resource>Read)
async def get_<resource>(id: UUID, session: SessionDep) -> Standalone<Resource>Read:
    row = await _load_or_404(session, id)
    return Standalone<Resource>Read.model_validate(row)


@router.patch(
    "/{id}",
    response_model=StandaloneMutationResponse[Standalone<Resource>Read],
)
async def patch_<resource>(
    id: UUID,
    body: Standalone<Resource>Patch,
    session: SessionDep,
) -> StandaloneMutationResponse[Standalone<Resource>Read]:
    row = await _load_or_404(session, id)
    fields = body.model_fields_set
    if not fields:
        return StandaloneMutationResponse(
            data=Standalone<Resource>Read.model_validate(row),
            reload=_NOOP_RELOAD,
        )
    # apply fields, run 3-round validation, reload, commit/rollback
    ...


@router.delete(
    "/{id}",
    response_model=StandaloneMutationResponse[StandaloneDeleteResult],
)
async def delete_<resource>(
    id: UUID, session: SessionDep
) -> StandaloneMutationResponse[StandaloneDeleteResult]:
    row = await _load_or_404(session, id)
    await session.delete(row)
    # run 3-round validation, reload (deleting an enabled resource changes EngineConfig),
    # commit/rollback
    return StandaloneMutationResponse(
        data=StandaloneDeleteResult(id=row.id, deleted=True),
        reload=<reload_outcome>,
    )
```

Why: spec §"Admin API endpoint map" locks the five-endpoint shape (LIST, POST, GET {id}, PATCH {id}, DELETE {id}) for every collection.

### 6.3 PATCH semantics — FORWARD

PATCH replaces the inner nested config wholesale. Clients send the full nested object with any unchanged fields preserved client-side. No deep merge.

Reasoning (from spec §"Resource contracts" notes scattered across resource sections): deep merge is ambiguous when arrays are involved (replace vs concat) and surprises operators when nested defaults snap back. Shallow replace is predictable.

Skeleton:

```python
# FORWARD — refine in Phase 5
if body.mcp_server is not None:
    row.mcp_server_config = body.mcp_server.model_dump(exclude_none=True)
```

The router stores the JSON dump of the entire nested model. The client is responsible for round-tripping unchanged fields.

### 6.4 DELETE wrapping — FORWARD

DELETE responses wrap in the envelope just like POST/PATCH. The `data` payload is `StandaloneDeleteResult` (collections) or `StandaloneSingletonDeleteResult` (singletons).

Reference at `libs/idun_agent_schema/src/idun_agent_schema/standalone/common.py:20-34`:

```python
class StandaloneDeleteResult(_CamelModel):
    id: UUID
    deleted: Literal[True] = True


class StandaloneSingletonDeleteResult(_CamelModel):
    deleted: Literal[True] = True
```

Skeleton DELETE return:

```python
# FORWARD — refine in Phase 5
return StandaloneMutationResponse(
    data=StandaloneDeleteResult(id=row.id, deleted=True),
    reload=<reload_outcome>,
)
```

Why: DELETE on an enabled resource changes the assembled `EngineConfig`, so it goes through the same reload path as POST/PATCH. The spec locks one envelope across all mutations.

### 6.5 Slug rules — FORWARD

Slugs are auto-generated from `name` on POST. Routes use `{id}` for canonical lookup; an optional `/by-slug/{slug}` lookup is a Phase-5+ convenience.

Normalization pipeline (verbatim from spec §"Identity → Slug rules (locked)"):

```text
input name
  → trim whitespace
  → lowercase
  → ASCII-fold (NFKD + drop combining marks)
  → replace any char not in [a-z0-9] with "-"
  → collapse runs of "-"
  → trim leading/trailing "-"
  → truncate to 64 chars
```

Lifecycle constraints (locked):

- Required and non-null on every collection row at rest.
- Sticky: a `name` PATCH does NOT re-derive the slug. URLs do not change silently.
- Direct slug PATCH that conflicts returns 409 (`code = conflict`). No auto-suffix on operator-supplied slugs.
- POST collision auto-suffixes: `github-tools` → `github-tools-2` → `github-tools-3`.

Skeleton:

```python
# FORWARD — refine in Phase 5; helper lives in services/slugs.py (Phase 3)
from idun_agent_standalone.services.slugs import normalize_slug, ensure_unique_slug

slug = ensure_unique_slug(
    session,
    Standalone<Resource>Row,
    candidate=normalize_slug(body.name),
)
```

Singletons (`agent`, `memory`) do not have meaningful slugs because they are not addressed by id. Their rows may carry a slug field for future cross-system identity, but the admin API never uses it for lookup.

### 6.6 Connection-check sub-routes — FORWARD

Three connection-check endpoints are MVP scope (spec §"Connection checks"):

```text
POST /admin/api/v1/memory/check-connection
POST /admin/api/v1/observability/{id}/check-connection
POST /admin/api/v1/mcp-servers/{id}/tools
```

Locked response shape:

```python
# FORWARD — refine in Phase 6
class StandaloneConnectionCheck(_CamelModel):
    ok: bool
    details: dict[str, Any] | None = None
    error: str | None = None
```

Constraints:

- Time-bound their work (5s recommended).
- Never block reload.
- The MCP `tools` endpoint also serves as connection check (returns the tool list on success; error otherwise).

---

## 7. Mutation envelope + reload — ESTABLISHED with stub-reload caveat

### 7.1 Envelope

Every successful POST/PATCH/DELETE returns `StandaloneMutationResponse[T]`. Reference at `libs/idun_agent_schema/src/idun_agent_schema/standalone/common.py:40-44`:

```python
class StandaloneMutationResponse(_CamelModel, Generic[T]):
    """Envelope returned by every successful admin mutation."""

    data: T
    reload: StandaloneReloadResult
```

### 7.2 Reload outcome

Reference at `libs/idun_agent_schema/src/idun_agent_schema/standalone/reload.py:10-28`:

```python
class StandaloneReloadStatus(StrEnum):
    RELOADED = "reloaded"
    RESTART_REQUIRED = "restart_required"
    RELOAD_FAILED = "reload_failed"


class StandaloneReloadResult(_CamelModel):
    status: StandaloneReloadStatus
    message: str
    error: str | None = None
```

### 7.3 HTTP behavior

Locked from spec §"API response posture":

- HTTP 200 for both `reloaded` and `restart_required` — never 202.
- HTTP 200 for `noop` (where the envelope still carries `reload.status = "reloaded"`, message "No changes.").
- HTTP 201 for POST creating a new row (the envelope still rides on the body).
- HTTP 422 for round-1 / round-2 validation failures.
- HTTP 500 for round-3 reload init failure (DB rolls back).
- HTTP 429 for rate-limited login.

### 7.4 Stub-reload constants — TRANSIENT

Phase 1 routers use stub reload constants because the reload mutex + 3-round pipeline (§8, §10) lands in Phase 3. Reference at `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py:40-48`:

```python
_SAVED_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RESTART_REQUIRED,
    message="Saved. Restart required to apply.",
)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)
```

A `_DELETE_RELOAD` constant exists in `routers/memory.py` for the DELETE path. Same pattern.

These are NOT pattern-breakers. Phase 5+ collection routers may copy the stub pattern. Phase 3 retrofits all routers to use the real `commit_with_reload` service.

---

## 8. Validation rounds — FORWARD

Three explicit validation rounds wrap each mutation. Each has a fixed HTTP code and error code so the UI can branch reliably (verbatim from spec §"Validation rounds"):

| Round | What is validated | HTTP | Error code | Notes |
| --- | --- | --- | --- | --- |
| 1 | Request body shape (Pydantic) | 422 | `validation_failed` | Returns `field_errors`. FastAPI handles automatically via `RequestValidationError`. |
| 2 | Assembled `EngineConfig` (post-merge of staged DB state) | 422 | `validation_failed` | Catches cross-resource invalid combos (e.g. `LANGGRAPH + SessionServiceConfig`). |
| 3 | Engine reload init | 500 | `reload_failed` | DB rolls back; previous engine remains active. |

Skeleton (Phase 3 will land the real implementation in `services/reload.py`):

```python
# FORWARD — refine in Phase 3
async with reload_mutex:
    # Round 1 happens before the handler runs (FastAPI body validation).
    # Stage DB mutation in a transaction
    # Round 2: assemble EngineConfig and validate
    try:
        assembled = await assemble_engine_config(session)
        EngineConfig.model_validate(assembled.model_dump())
    except ValidationError as exc:
        await session.rollback()
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Assembled config failed validation.",
                field_errors=field_errors_from_validation_error(exc),
            ),
        )
    # Round 3: try runtime reload
    try:
        outcome = await reload_runtime(assembled)
    except ReloadInitFailed as exc:
        await session.rollback()
        raise AdminAPIError(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message="Engine reload failed; config not saved.",
                details={"recovered": True},
            ),
        ) from exc
    # On success: commit
    await session.commit()
    return StandaloneMutationResponse(data=..., reload=outcome)
```

`reload_mutex`, `assemble_engine_config`, `reload_runtime`, `ReloadInitFailed`, the real `_SAVED_RELOAD` outcome are all Phase 3.

---

## 9. Error mapping — ESTABLISHED partially

### 9.1 Error envelope

Reference at `libs/idun_agent_schema/src/idun_agent_schema/standalone/errors.py:11-43`:

```python
class StandaloneErrorCode(StrEnum):
    BAD_REQUEST = "bad_request"
    VALIDATION_FAILED = "validation_failed"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RELOAD_FAILED = "reload_failed"
    AUTH_REQUIRED = "auth_required"
    FORBIDDEN = "forbidden"
    UNSUPPORTED_MODE = "unsupported_mode"
    RATE_LIMITED = "rate_limited"
    INTERNAL_ERROR = "internal_error"


class StandaloneFieldError(_CamelModel):
    field: str
    message: str
    code: str | None = None


class StandaloneAdminError(_CamelModel):
    code: StandaloneErrorCode
    message: str
    details: dict[str, Any] | None = None
    field_errors: list[StandaloneFieldError] | None = None
```

### 9.2 HTTP status table

Locked from spec §"Error models":

| HTTP status | Error code | Typical trigger |
| --- | --- | --- |
| 400 | `bad_request` / `unsupported_mode` | Malformed request, unsupported feature mode |
| 401 | `auth_required` | Missing/invalid session |
| 403 | `forbidden` | Authenticated but not allowed |
| 404 | `not_found` | Resource missing |
| 409 | `conflict` | Slug or unique-constraint violation |
| 422 | `validation_failed` | Round 1 (Pydantic) or Round 2 (assembled EngineConfig) |
| 429 | `rate_limited` | Login throttle |
| 500 | `reload_failed` / `internal_error` | Round 3 reload init failure / unhandled exception |

Note: `restart_required` is NOT an error. It returns HTTP 200 with `reload.status = "restart_required"`.

### 9.3 Error mapper — ESTABLISHED

Reference at `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/errors.py:48-172`:

- `AdminAPIError(status_code, error)` is what routers raise. The handler renders `{"error": StandaloneAdminError}` JSON.
- `field_errors_from_validation_error` translates Pydantic `ValidationError` to `list[StandaloneFieldError]` for round-2 failures.
- `register_admin_exception_handlers(app)` wires three handlers: `AdminAPIError`, `RequestValidationError` (round 1), and `Exception` (catch-all → `internal_error`). The handler signatures are deliberately narrow (`(Request, AdminAPIError)`) and the registration site uses `# type: ignore[arg-type]` to satisfy mypy — see commit `9a3e6a26` for the rationale.

Pattern to copy in Phase 5 routers:

```python
raise AdminAPIError(
    status_code=http_status.HTTP_409_CONFLICT,
    error=StandaloneAdminError(
        code=StandaloneErrorCode.CONFLICT,
        message=f"Slug '{slug}' is already in use.",
    ),
)
```

---

## 10. Reload mutex — FORWARD

Single in-process `asyncio.Lock` held around the entire 3-round pipeline.

Skeleton (Phase 3 lands the real implementation):

```python
# FORWARD — refine in Phase 3
# libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py
import asyncio

_reload_mutex = asyncio.Lock()


async def commit_with_reload(...) -> StandaloneReloadResult:
    async with _reload_mutex:
        # Round 2 + Round 3 + commit/rollback (see §8)
        ...
```

Single-replica assumption: spec §"Save/reload posture" locks standalone as single-replica. Multi-replica deployment requires a DB-backed advisory lock; that work is out of scope until enrollment lands.

---

## 11. Cold-start states — FORWARD

The standalone may boot into one of these states. Reported by `GET /admin/api/v1/runtime/status` as the top-level `status` field (verbatim from spec §"Cold-start states"):

| State | Meaning | DB precondition | Engine precondition | Operator action |
| --- | --- | --- | --- | --- |
| `not_configured` | Fresh DB, no agent row, no YAML seed | `standalone_agent` missing | engine not booted | Submit YAML or PATCH `/agent` |
| `initializing` | Standalone is assembling config / starting engine | Agent row present | engine boot in progress | Wait |
| `running` | Engine serving | Agent row present + valid config | engine up | Operate normally |
| `error` | Engine failed to start; previous config (if any) is not running | Agent row present | engine boot failed | Inspect `runtime/status.reload.lastError`, fix and retry |

Boot path pseudocode (verbatim from spec):

```text
boot
  → open DB, run alembic upgrade head
  → if standalone_install_meta is fresh AND IDUN_CONFIG_PATH points to a YAML
       → import YAML into DB (manager-shape rows)
       → stamp install_meta.config_hash
  → read standalone_agent
  → if absent: state = not_configured; engine NOT booted; admin API serves
  → else:
       → assemble EngineConfig
       → validate (round 2)
       → boot engine (round 3)
       → on success: state = running
       → on failure: state = error; admin API still serves so the operator can fix the config
```

Invariant: the admin API and `/health` MUST come up even when the engine fails to start.

`GET /admin/api/v1/agent` when `state == not_configured` returns 404 (`code = not_found`) so the UI can render an onboarding prompt. Phase 1's `_load_agent` already does this (cite at `api/v1/routers/agent.py:51-68`).

---

## 12. Config hash — FORWARD

```text
config_hash = sha256(canonical_json(materialized EngineConfig))
```

Canonicalization: **JCS / RFC 8785** (sort keys, no whitespace, UTF-8, escape rules per spec). Implementation hint: `rfc8785` PyPI package; lock the choice in Phase 6.

Storage: `standalone_runtime_state.last_applied_config_hash`. Surfaced in `GET /runtime/status`.

The hash is recomputed on every successful reload and compared to the previous hash. Hash equality may be used to skip redundant reloads — but that is a Phase 6+ optimization, not part of MVP.

---

## 13. Test patterns

### 13.1 Layout — ESTABLISHED partially

```
libs/idun_agent_standalone/tests/
├── unit/
│   ├── api/
│   │   └── v1/
│   │       └── routers/
│   │           ├── test_agent.py
│   │           └── test_memory.py
│   ├── core/
│   │   └── test_settings.py
│   ├── db/
│   │   ├── test_base.py
│   │   └── test_models.py
│   └── services/
│       └── test_engine_config.py
└── integration/
    ├── test_agent_flow.py
    ├── test_memory_flow.py
    └── ... (per-resource flow tests)
```

Note: many of the existing files under `tests/unit/` and `tests/integration/` exercise the legacy tree and are slated for deletion in Phase 8. Phase 5+ adds the per-resource files above.

### 13.2 Fixtures

- Unit tests use in-memory SQLite via the standalone testing helper (Phase 1 has not yet locked the helper module name; Phase 5 will).
- Integration tests run against Postgres via testcontainers, gated on the `requires_postgres` pytest marker. Skipped in default `make ci`; required in nightly CI.

### 13.3 Test gates per phase

Lifted from spec §"Future implementation test gates", mapped to phases:

| Gate | Owning phase | Done when |
| --- | --- | --- |
| Rollback path | 3 | Reload init failure rolls back DB; active engine still serves prior config; HTTP 500 + `reload_failed` |
| `restart_required` path | 3 | Structural change commits DB; HTTP 200 + `reload.status = restart_required`; in-memory engine unchanged until restart |
| Reload callback survival | 3 | Trace observer re-attached after hot reload; chat completion produces trace events |
| YAML seed/export/seed roundtrip | 4 | Seed → export → seed-fresh-DB produces byte-equivalent EngineConfig |
| Real reload integration | 5 | LangGraph echo agent boots; admin edit reloads; chat returns expected echo with new config |
| Auth boundary | 7 | Login rate limit returns 429 after 5 failures; sliding session at 90% TTL; password rotation invalidates sessions; CSRF enforced on mutations |
| Schema validation (per resource) | 5 | Malformed payload returns 422 + `field_errors`; never writes to DB |
| Validation round 2 (cross-resource) | 5 | LANGGRAPH+SessionServiceConfig returns 422 + `field_errors` (not 500); DB unchanged |
| Runtime status / readiness | 6 | Failed MCPs in `runtime/status.mcp.failed`; DB outage flips `readyz` to not-ready |
| Concurrency (reload mutex) | 3 | Two simultaneous PATCHes serialize; neither corrupts the other's commit window |
| Cold-start states | 6 | Fresh DB serves `runtime/status.status = not_configured`; `GET /agent` returns 404; admin API still responsive |
| Fresh Alembic baseline | 4 | `alembic upgrade head` from empty DB produces every `standalone_*` table |
| SQLite + Postgres parity | 4 | Every migration runs identically on both engines; JSON columns store/retrieve the same canonical bytes |
| Concurrent admin mutation | 5 | Two simultaneous POSTs with same name → one success + one 409; no orphan rows |

---

## 14. Manager schema mirror rule — ESTABLISHED for singletons; FORWARD for collections

### 14.1 Mirror table

Verbatim from spec §"Manager schema mirror rule":

| Manager table | Standalone table | Notes |
| --- | --- | --- |
| `managed_agents` | `standalone_agent` | drop `workspace_id`, `memory_id` FK (memory is singleton on the agent), `sso_id` FK (SSO out of scope) |
| `managed_memories` | `standalone_memory` | drop `workspace_id`; singleton in standalone |
| `managed_mcp_servers` | `standalone_mcp_server` | drop `workspace_id`; add `enabled bool` |
| `managed_observabilities` | `standalone_observability` | drop `workspace_id`; add `enabled bool` |
| `managed_integrations` | `standalone_integration` | drop `workspace_id`; add `enabled bool` |
| `managed_guardrails` | `standalone_guardrail` | drop `workspace_id`; add `enabled bool`, `position`, `sort_order` (folded from junction) |
| `managed_prompts` | `standalone_prompt` | drop `workspace_id`; uniqueness becomes `(prompt_id, version)` |
| `agent_guardrails` (junction) | folded | `position` and `sort_order` move onto `standalone_guardrail` |
| `agent_mcp_servers` (junction) | folded | replaced by `standalone_mcp_server.enabled` |
| `agent_observabilities` (junction) | folded | replaced by `standalone_observability.enabled` |
| `agent_integrations` (junction) | folded | replaced by `standalone_integration.enabled` |
| `agent_prompt_assignments` (junction) | excluded | one agent in standalone; every prompt applies |
| `workspaces`, `users`, `memberships`, `invitations`, `managed_ssos`, `settings` | excluded | not a multi-tenant control plane |

### 14.2 Type substitutions

- `UUID(as_uuid=True)` (Postgres-only) → `String(36)` (engine-agnostic)
- `JSONB` (Postgres-only) → `JSON` (engine-agnostic)
- Drop every `workspace_id` column.
- Fold M:N junctions into row-level fields (`enabled`, `position`, `sort_order`).

### 14.3 Audit checklist (per ORM, Phase 4 implementers)

When adding any new collection ORM under `infrastructure/db/models/`, run through:

```
[ ] Same column names as the corresponding manager table?
[ ] Same JSON content shape (manager Pydantic model dumps)?
[ ] String(36) for UUID columns?
[ ] SQLAlchemy JSON for JSONB columns?
[ ] No `workspace_id` column?
[ ] No imports from services/idun_agent_manager/?
[ ] Junction columns folded into row-level fields (enabled / position / sort_order)?
[ ] Standalone `Base`, not manager `Base`?
[ ] Table name uses `standalone_` prefix?
```

ESTABLISHED references for the singleton variants:

- `standalone_agent` mirrors `managed_agents` minus `workspace_id` / `memory_id` / `sso_id`. See `infrastructure/db/models/agent.py:19-46`.
- `standalone_memory` mirrors `managed_memories` minus `workspace_id`, with PK fixed to `"singleton"`. See `infrastructure/db/models/memory.py:14-32`.

---

## 15. Forbidden patterns

Exhaustive list, one line per rule, cross-referenced to the spec section that locks it.

- No `from app.*` imports inside `idun_agent_standalone/`. (Spec §"Codebase organization" → Reuse boundaries)
- No imports of manager SQLAlchemy `*Model` classes anywhere in `idun_agent_standalone/`. (Spec §"Manager schema mirror rule")
- No SQLAlchemy `Base` shared with the manager. Standalone owns its own `Base` in `infrastructure/db/session.py`. (Spec §"Manager schema mirror rule" → Forbidden)
- No HTTP 202 for `restart_required`. Use HTTP 200 with `reload.status = "restart_required"`. (Spec §"API response posture")
- No deep-merge PATCH. Always shallow, full-object replace of nested configs. (Spec resource sections + §6.3 of this doc)
- No M:N association tables. Folded into row-level `enabled`, `position`, `sort_order`. (Spec §"DB posture")
- No `workspace_id` columns on standalone tables. (Spec §"DB posture")
- No engine-shape JSON in DB columns. Manager-shape only; engine-shape is built at assembly. (Spec §"Stored shape rule")
- No `UUID(as_uuid=True)` or `JSONB` SQLAlchemy types. Use `String(36)` and `JSON` for engine-agnostic storage. (Spec §"Manager schema mirror rule")
- No slug-based lookup for singletons. Singletons use no-`{id}` routes. (Spec §"API endpoint map")
- No inline schema definitions in routers. Always import from `idun_agent_schema.standalone.*`. (Spec §"Source-of-truth rule")
- No `enabled` flag on singleton resources (agent, memory). (Spec §"Enabled rule")
- No multi-replica assumptions in rate limit, reload mutex, or any in-process state. Standalone is single-replica. (Spec §"Save/reload posture")
- No bare DELETE response. Wrap in `StandaloneMutationResponse[StandaloneDeleteResult]` (collections) or `StandaloneMutationResponse[StandaloneSingletonDeleteResult]` (singletons). (Spec §"API response posture")
- No 200/202 mismatch in the envelope. Reload outcome is in the body, never on the HTTP status alone. (Spec §"API response posture")

---

## 16. Open issues / known caveats

No open issues at Phase 1 close. Phase 2+ implementers update this section if anything surfaces that doesn't fit cleanly under a Phase 3+ pattern class.
