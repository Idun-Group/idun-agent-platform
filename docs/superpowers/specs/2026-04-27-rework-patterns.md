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

### 4.3 Collection resource schemas — ESTABLISHED

Five collection resources land in Phase 2. Each follows the same Read/Create/Patch pattern and is anchored to the manager-shape config it wraps.

| Module | Read class line | Wraps | Conversion at assembly |
| --- | --- | --- | --- |
| `guardrails.py` | `26` | `ManagerGuardrailConfig` | `convert_guardrail()` reused from manager |
| `mcp_servers.py` | `23` | `MCPServer` (engine) | none |
| `observability.py` | `21` | `ObservabilityConfig` (V2 engine) | none |
| `integrations.py` | `23` | `IntegrationConfig` (engine) | inner `enabled` overwritten at assembly to match standalone row |
| `prompts.py` | `24` | `ManagedPromptCreate/Read/Patch` (manager) | content-vs-tags split (PATCH only `tags`; content patches POST a new version) |

Reference snippet — the standard collection shape (mcp_servers as the cleanest example), at `libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py`:

```python
class StandaloneMCPServerRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    mcp_server: MCPServer
    created_at: datetime
    updated_at: datetime


class StandaloneMCPServerCreate(_CamelModel):
    """Body for POST /admin/api/v1/mcp-servers."""

    name: str
    enabled: bool = True
    mcp_server: MCPServer


class StandaloneMCPServerPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/mcp-servers/{id}."""

    name: str | None = None
    enabled: bool | None = None
    mcp_server: MCPServer | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
```

Patterns to copy in Phase 5+ collection routers:

- Read variants set `model_config = ConfigDict(from_attributes=True)` so they project from SQLAlchemy rows directly via `Model.model_validate(row)`.
- Create variants default `enabled=True`.
- Patch variants reject explicit-null on `name` via `_no_null_name` (mirrors agent.py:57-61). Prompts uses `_no_null_tags` instead because the null-vs-empty-list ambiguity on `tags` warrants explicit disambiguation.
- Inner config field (`mcp_server`, `observability`, `integration`, `guardrail`) accepts the wrapped shape unchanged on input; outbound wire format follows the wrapped shape's own aliasing rules.

Special case — guardrails fold M:N junction columns:

- `position: Literal["input", "output"]` and `sort_order: int` (with `Field(ge=0)`) live on the row, not in a junction table.

Special case — prompts skip slug + enabled:

- `prompts.py` has neither `slug` nor `enabled`.
- `StandalonePromptPatch` declares only `tags`. Posting a new version is the way to change content; the schema makes that explicit by not declaring a `content` field on Patch (Pydantic silently drops unknown keys).

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

### 6.5 Slug rules — ESTABLISHED

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

Reference snippet — Phase 3 service. `normalize_slug` at `libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py:31` and `ensure_unique_slug` at the same file `:58`:

```python
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)

# Phase 5 router POST flow
candidate = normalize_slug(body.name)
slug = await ensure_unique_slug(
    session,
    StandaloneMCPServerRow,           # the ORM class
    StandaloneMCPServerRow.slug,      # the slug column on that ORM
    candidate,
)
row = StandaloneMCPServerRow(name=body.name, slug=slug, ...)

# PATCH-of-slug flow (collision check only — no auto-suffix on operator-supplied slugs)
# FORWARD — Phase 5 collection routers will refine
if existing.slug != body.slug:
    if await ensure_unique_slug(
        session,
        StandaloneMCPServerRow,
        StandaloneMCPServerRow.slug,
        body.slug,
    ) != body.slug:
        raise AdminAPIError(
            status_code=409,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.CONFLICT,
                message=f"Slug {body.slug!r} is already in use.",
            ),
        )
    existing.slug = body.slug
```

`SlugNormalizationError` (subclass of `ValueError`) and `SlugConflictError` are defined alongside the helpers; routers map them to 422 `validation_failed` and 409 `conflict` respectively (see §9).

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

---

## 8. Validation rounds — ESTABLISHED

Three explicit validation rounds wrap each mutation. Each has a fixed HTTP code and error code so the UI can branch reliably (verbatim from spec §"Validation rounds"):

| Round | What is validated | HTTP | Error code | Notes |
| --- | --- | --- | --- | --- |
| 1 | Request body shape (Pydantic) | 422 | `validation_failed` | Returns `field_errors`. FastAPI handles automatically via `RequestValidationError`. |
| 2 | Assembled `EngineConfig` (post-merge of staged DB state) | 422 | `validation_failed` | Catches cross-resource invalid combos (e.g. `LANGGRAPH + SessionServiceConfig`). |
| 3 | Engine reload init | 500 | `reload_failed` | DB rolls back; previous engine remains active. |

Reference flow — `commit_with_reload` at `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py:134` is the canonical orchestrator. Round-2 validation is `validate_assembled_config` at `libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py:39`:

```python
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import (
    ReloadInitFailed,
    commit_with_reload,
)

# Inside the router handler, after staging DB writes via session.add / setattr.
# `reload_callable` is FastAPI-injected via `ReloadCallableDep` (see api/v1/deps.py).
async with reload_service._reload_mutex:
    # Stage DB mutation
    setattr(row, field, value)
    await session.flush()
    # Round 1 already ran (FastAPI Pydantic body validation, 422 on failure).
    # commit_with_reload internally:
    #   - assembles EngineConfig from staged session state
    #   - runs Round 2: validate_assembled_config → 422 on failure (rollback)
    #   - runs Round 3: engine reload init → 500 on failure (rollback)
    #   - commits the session on success
    #   - records outcome to standalone_runtime_state
    reload_result = await commit_with_reload(
        session,
        reload_callable=reload_callable,
    )
    await session.refresh(row)

return StandaloneMutationResponse(data=..., reload=reload_result)
```

The `reload_callable` parameter is supplied by FastAPI dependency injection — routers declare a `ReloadCallableDep` parameter (added in `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/deps.py`) which resolves to the engine's reload coroutine. `commit_with_reload` does NOT acquire the mutex itself; the caller must wrap the entire stage-flush-commit sequence in `async with reload_service._reload_mutex:` (see §10).

Round-2 raises `RoundTwoValidationFailed` carrying a Pydantic `ValidationError`; the router error mapper translates it to 422 with `field_errors`. Round-3 raises `ReloadInitFailed`; the mapper translates it to 500 with `code = reload_failed`. In both error paths `commit_with_reload` rolls back the session before re-raising.

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

## 10. Reload mutex — ESTABLISHED

Single in-process `asyncio.Lock` held by the **router** around the entire 3-round pipeline. The pipeline orchestrator (`commit_with_reload`) does NOT acquire the mutex — the caller must.

Reference at `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py:64`:

```python
import asyncio

_reload_mutex = asyncio.Lock()


async def commit_with_reload(
    session: AsyncSession,
    *,
    reload_callable: Callable[[EngineConfig], Awaitable[None]],
    now: Callable[[], datetime] = _default_now,
) -> StandaloneReloadResult:
    """Run the 3-round pipeline.

    Caller must:
      - acquire _reload_mutex via `async with _reload_mutex:`
      - stage DB mutation (e.g. add/modify ORM rows)
      - call session.flush()
    """
    ...
```

Routers reach the mutex via the module-attribute path:

```python
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload

async with reload_service._reload_mutex:
    await session.flush()
    result = await commit_with_reload(session, reload_callable=reload_callable)
    await session.refresh(row)
```

Module-attribute access (`reload_service._reload_mutex`) instead of direct import lets test fixtures swap a fresh `asyncio.Lock` per pytest-asyncio event loop. In production (single event loop) this is irrelevant.

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

The cold-start state values are defined as the `StandaloneRuntimeStatusKind` enum at `libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py:28`. The full runtime status payload that surfaces the state at `GET /admin/api/v1/runtime/status` is `StandaloneRuntimeStatus` in the same module.

Storage layer — ESTABLISHED. Phase 3 lands the persistence side: the singleton ORM `StandaloneRuntimeStateRow` at `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py:19` holds `last_applied_config_hash`, `last_reload_status`, `last_reload_error`, and `last_reload_at`. The service-layer accessor `get` at `libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py:29` reads the row (returning `None` on a fresh DB), and `record_reload_outcome` writes it transactionally inside `commit_with_reload`. The boot-path state machine that derives `StandaloneRuntimeStatusKind` from agent presence + engine state + last reload outcome remains FORWARD; Phase 6 lands `GET /admin/api/v1/runtime/status` and the cold-start dispatch logic.

Invariant: the admin API and `/health` MUST come up even when the engine fails to start.

`GET /admin/api/v1/agent` when `state == not_configured` returns 404 (`code = not_found`) so the UI can render an onboarding prompt. Phase 1's `_load_agent` already does this (cite at `api/v1/routers/agent.py:51-68`).

---

## 12. Config hash — ESTABLISHED

```text
config_hash = sha256(canonical_json(materialized EngineConfig))
```

Canonicalization: **JCS / RFC 8785** (sort keys, no whitespace, UTF-8, escape rules per spec). Implementation: `rfc8785` PyPI package, locked in Phase 3.

Reference at `libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py:21`:

```python
import rfc8785
from hashlib import sha256
from idun_agent_schema.engine.engine import EngineConfig


def compute_config_hash(engine_config: EngineConfig) -> str:
    """Return a 64-character hex sha256 of the JCS-canonical JSON of the config."""
    payload = engine_config.model_dump(mode="json")
    canonical = rfc8785.dumps(payload)
    return sha256(canonical).hexdigest()
```

Storage: `standalone_runtime_state.last_applied_config_hash` (see §11 for the ORM ref). Phase 3 hashes the **structural slice** of the assembled config (the parts whose change forces a hot reload vs `restart_required`) and stores it after each successful reload — `_is_structural_change` at `services/reload.py:115` consumes it for change detection. Phase 6 will additionally hash the full materialized `EngineConfig` and surface it at `GET /admin/api/v1/runtime/status`.

The hash is recomputed on every successful reload and compared to the previous stored value. Hash equality lets `commit_with_reload` short-circuit redundant reloads when the structural slice is unchanged.

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

### 14.4 ESTABLISHED references — Phase 2 collections

Each collection schema in `idun_agent_schema/standalone/` wraps a manager-shape config. The wrapping is direct (no field renaming, no nested transformation); only the standalone row-level fields (`id`, `slug`, `name`, `enabled`, plus per-resource specials) sit alongside the inner config.

| Standalone schema | File:line | Wraps | Source path |
| --- | --- | --- | --- |
| `StandaloneGuardrailRead/Create/Patch` | `guardrails.py:26` | `ManagerGuardrailConfig` | `idun_agent_schema/manager/guardrail_configs.py` |
| `StandaloneMCPServerRead/Create/Patch` | `mcp_servers.py:23` | `MCPServer` | `idun_agent_schema/engine/mcp_server.py` |
| `StandaloneObservabilityRead/Create/Patch` | `observability.py:21` | `ObservabilityConfig` (V2) | `idun_agent_schema/engine/observability_v2.py` |
| `StandaloneIntegrationRead/Create/Patch` | `integrations.py:23` | `IntegrationConfig` | `idun_agent_schema/engine/integrations` |
| `StandalonePromptRead/Create/Patch` | `prompts.py:24` | (mirrors) `ManagedPromptCreate/Read/Patch` | `idun_agent_schema/manager/managed_prompt.py` |

Phase 4 ORM modules apply the §14.3 audit checklist to the corresponding `StandaloneXRow` SQLAlchemy declarations; the wrapping shape lands here at the schema layer.

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
