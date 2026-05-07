# Rework Phase 3 — Cross-Cutting Plumbing

Date: 2026-04-27

Branch: `feat/rework-phase3-plumbing` (off `feat/standalone-admin-db-rework` umbrella, branched from merged Phase 2 tip `53342bd6`)

Status: Brainstormed and locked. Implementation has not started.

Authoritative sources:
- `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md` — the rework spec.
- `docs/superpowers/specs/2026-04-27-rework-patterns.md` — the patterns reference. Phase 3 ESTABLISHES the sections currently FORWARD for slug rules (§6.5), validation rounds (§8), reload mutex (§10), and config hash (§12), and partial-ESTABLISHES §11 (cold-start states — storage layer only; boot-path state machine is Phase 6).

When this doc and either authoritative source disagree, the spec wins for content; the patterns doc wins for shape.

## 1. Purpose

Phase 3 builds the cross-cutting plumbing every later phase needs. Without it, Phase 5 collection routers would each reinvent the reload mutex, the 3-round validation pipeline, the slug normalization, and the structural-change detection — drift would compound across five resources.

The phase delivers:

1. The **reload pipeline** — single asyncio mutex around a `commit_with_reload` orchestrator that runs round 2 (assembled `EngineConfig` validation) and round 3 (engine reload), commits or rolls back the DB based on outcomes, and records the result for diagnostics.
2. The **slug rules** helper used by every Phase 5 collection router on POST.
3. The **config hash** computed via RFC 8785 / JCS canonicalization, stored on the runtime state row.
4. The **runtime state** persistence layer — singleton `standalone_runtime_state` ORM and service that records the last reload outcome (status, message, error, timestamp, applied config hash). The boot-path state machine that derives `StandaloneRuntimeStatusKind` from this record is Phase 6.
5. The **retrofit** of Phase 1's agent + memory routers from stub reload constants to the real pipeline.

Phase 3 does NOT add the `/runtime/status` endpoint, does NOT build the boot-path state machine, does NOT add Alembic migrations (Phase 4 picks up the new ORM in its fresh baseline), and does NOT touch collection resources.

## 2. Deliverables

1. **Cross-cutting helpers** (T2):
   - `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py` — `StandaloneRuntimeStateRow` ORM.
   - `libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py` — `get`, `record_reload_outcome`, `clear`.
   - `libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py` — `normalize_slug`, `ensure_unique_slug`.
   - `libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py` — `compute_config_hash`.

2. **Reload pipeline** (T1):
   - `libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py` — `validate_assembled_config`, `RoundTwoValidationFailed`.
   - `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py` — module-level `_reload_mutex`, `commit_with_reload`, `ReloadInitFailed`, `_is_structural_change`.

3. **Retrofit** (T3):
   - `api/v1/routers/agent.py` — replace stub reload constants with real `commit_with_reload` calls; wrap mutating handlers in `async with _reload_mutex:`.
   - `api/v1/routers/memory.py` — same retrofit; memory framework changes route through structural-change detection → `restart_required`.
   - `app.py` — wire the engine reload callable as a FastAPI dependency / startup hook so routers receive the real reloader.

4. **Patterns doc transitions** (T4): six section transitions in `docs/superpowers/specs/2026-04-27-rework-patterns.md`.

5. **Tests**: ~42 unit + ~18 integration = ~60 new tests under `libs/idun_agent_standalone/tests/` (unit/services/, unit/db/, integration/api/v1/).

6. **Runtime dependency**: `rfc8785>=0.1` added to `libs/idun_agent_standalone/pyproject.toml`. The package is pure-Python, ~200 lines, single-purpose (RFC 8785 canonicalization), stable. Placement is in standalone (not schema lib) because it's a runtime hash concern, not a schema concern.

## 3. Scope of changes

In scope:

- `libs/idun_agent_standalone/src/idun_agent_standalone/services/*.py` — 5 new modules.
- `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py` — 1 new module.
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py` — modified.
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py` — modified.
- `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` — modified to wire the engine reload callable.
- `libs/idun_agent_standalone/pyproject.toml` — adds `rfc8785>=0.1`.
- `libs/idun_agent_standalone/tests/` — new unit + integration test files (one `conftest.py` for shared fixtures).
- `docs/superpowers/specs/2026-04-27-rework-patterns.md` — single follow-up commit at the end of T4 with FORWARD → ESTABLISHED transitions.

Out of scope:

- All paths under `libs/idun_agent_schema/` (Phase 2 close-state).
- All paths under `services/idun_agent_manager/`, `services/idun_agent_web/`, `services/idun_agent_standalone_ui/`, `libs/idun_agent_engine/`.
- Collection resource ORMs, routers, services (Phase 4–5).
- Alembic migrations for `standalone_runtime_state` (Phase 4 picks up the ORM in its fresh baseline).
- The `/runtime/status`, `/readyz`, `/health`, connection-check route handlers (Phase 6).
- Boot-path state machine that derives `StandaloneRuntimeStatusKind` from agent presence + engine state + last reload outcome (Phase 6).
- Smart per-field hot-reload classification (deferred to next version per spec).
- Audit-event logging (deferred per Phase 1 amendment).
- Legacy code at `admin/`, root-level legacy modules, or legacy `db/`.

## 4. Module specifications

### 4.1 Runtime state ORM (T2)

`libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py`

```text
StandaloneRuntimeStateRow (Base)
  __tablename__ = "standalone_runtime_state"

  id: str                               String(32)  primary_key  default="singleton"
  last_status: str | None               String(20)  nullable
  last_message: str | None              String(255) nullable
  last_error: str | None                Text        nullable
  last_reloaded_at: datetime | None     DateTime(timezone=True)  nullable
  last_applied_config_hash: str | None  String(64)  nullable
  updated_at: datetime                  DateTime(timezone=True)  server_default=func.now()  onupdate=func.now()
```

Type substitutions per §14 manager mirror rule: `String(32)` for the fixed PK, `String(20)` to fit `restart_required` value, `String(64)` for the sha256 hex digest, `Text` for the unbounded error message, engine-agnostic `DateTime` everywhere.

### 4.2 Runtime state service (T2)

`libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py`

```text
async def get(session: AsyncSession) -> StandaloneRuntimeStateRow | None
    """Return the singleton state row, or None on first boot."""

async def record_reload_outcome(
    session: AsyncSession,
    *,
    status: StandaloneReloadStatus,
    message: str,
    error: str | None,
    config_hash: str | None,
    reloaded_at: datetime,
) -> StandaloneRuntimeStateRow
    """Upsert the singleton row with the given outcome.

    Caller controls the transaction boundary. The pattern in
    commit_with_reload is: rollback user's mutation first, then
    record outcome via this service, then commit.
    """

async def clear(session: AsyncSession) -> None
    """Delete the singleton row (test helper)."""
```

The service does NOT manage commits or rollbacks itself — the caller (the reload pipeline) controls transaction boundaries. This is the same pattern as Phase 1's `_load_agent` helper at `api/v1/routers/agent.py:51-68`.

### 4.3 Slugs (T2)

`libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py`

```text
def normalize_slug(name: str) -> str
    """Per spec §"Identity → Slug rules (locked)":

    input name
      -> trim whitespace
      -> NFKD ascii-fold
      -> lowercase
      -> regex sub [^a-z0-9] -> "-"
      -> collapse runs of "-"
      -> trim leading/trailing "-"
      -> truncate to 64 chars

    Raises ValueError if the result is empty.
    """

async def ensure_unique_slug(
    session: AsyncSession,
    model_class: type[Base],
    slug_column: InstrumentedAttribute,
    candidate: str,
) -> str
    """Return candidate if not in use; else suffix until unique.

    candidate -> candidate-2 -> candidate-3 -> ... -> candidate-99

    After 99 collisions, raises ConflictError. This is a defensive
    upper bound; a workspace with 99+ resources sharing a slug stem
    would already have an upstream UX problem.
    """
```

The implementer must not hard-code which model classes are slug-bearing — `model_class` and `slug_column` are passed in by the caller (Phase 5 routers).

### 4.4 Config hash (T2)

`libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py`

```text
def compute_config_hash(engine_config: EngineConfig) -> str
    """Compute a deterministic hash of the materialized config.

    Implementation: sha256(rfc8785.canonicalize(engine_config.model_dump(mode="json")))
    Returns: 64-character lowercase hex digest.

    Determinism guarantee: two semantically-equal EngineConfig values
    produce the same hash regardless of dict key insertion order or
    Python representation differences. Backed by RFC 8785 JCS.
    """
```

### 4.5 Validation (T1)

`libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py`

```text
class RoundTwoValidationFailed(Exception):
    """Raised when the assembled EngineConfig fails Pydantic validation."""

    field_errors: list[StandaloneFieldError]

    def __init__(self, validation_error: ValidationError) -> None:
        self.field_errors = field_errors_from_validation_error(validation_error)
        super().__init__("Assembled EngineConfig failed validation.")


def validate_assembled_config(engine_config: EngineConfig) -> None:
    """Run Pydantic validation on the assembled config.

    Phase 1's assemble_engine_config returns an already-typed
    EngineConfig instance, but cross-resource invalid combinations
    (e.g. LANGGRAPH framework + ADK SessionServiceConfig memory) are
    only caught when the config is re-validated. This is round 2 of
    the 3-round pipeline.
    """
    try:
        EngineConfig.model_validate(engine_config.model_dump())
    except ValidationError as exc:
        raise RoundTwoValidationFailed(exc) from exc
```

The `field_errors_from_validation_error` import comes from the existing Phase 1 helper at `api/v1/errors.py:57-72`.

### 4.6 Reload pipeline (T1)

`libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`

```text
import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

_reload_mutex = asyncio.Lock()


class ReloadInitFailed(Exception):
    """Raised when round 3 (engine reload) fails."""


async def commit_with_reload(
    session: AsyncSession,
    *,
    reload_callable: Callable[[EngineConfig], Awaitable[None]],
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> StandaloneReloadResult:
    """Run the 3-round pipeline.

    Caller must:
      - acquire _reload_mutex via `async with _reload_mutex:`
      - stage DB mutation (e.g. add/modify ORM rows)
      - call session.flush()

    This function:
      1. Assembles EngineConfig from staged session state.
      2. Round 2: validates the assembled config.
      3. Detects structural-change vs prior runtime_state.
      4. If structural: commits DB, records outcome, returns restart_required.
      5. Else: round 3 invokes reload_callable.
         - On success: commits DB, records outcome, returns reloaded.
         - On ReloadInitFailed: rolls back user mutation, records failure
           outcome (in a fresh session-level write), commits the outcome,
           raises AdminAPIError(500, code=reload_failed).
      6. Round 1 is FastAPI's request body validation (happens before
         the handler runs).
    """
    # See §4.6.1 below for the full algorithm.


def _is_structural_change(
    assembled: EngineConfig,
    prior: StandaloneRuntimeStateRow | None,
) -> bool:
    """Detect changes that require process restart.

    Structural fields (per spec §"Save/reload posture" + legacy reload.py):
      - agent.framework (LANGGRAPH ↔ ADK ↔ HAYSTACK ↔ ...)
      - agent.config.graph_definition (LangGraph entry point)

    Returns True iff any of these changed since the last successfully-
    applied config. On first boot (prior is None or last_applied_config_hash
    is None), returns False — first config is never structural.
    """
```

#### 4.6.1 Algorithm

```python
# Caller has already: acquired _reload_mutex, staged DB mutation, called flush.

assembled = await assemble_engine_config(session)

try:
    validate_assembled_config(assembled)
except RoundTwoValidationFailed as exc:
    await session.rollback()
    raise AdminAPIError(
        status_code=422,
        error=StandaloneAdminError(
            code=StandaloneErrorCode.VALIDATION_FAILED,
            message="Assembled config failed validation.",
            field_errors=exc.field_errors,
        ),
    ) from exc

config_hash = compute_config_hash(assembled)
prior_state = await runtime_state.get(session)
structural = _is_structural_change(assembled, prior_state)

if structural:
    await session.commit()
    await runtime_state.record_reload_outcome(
        session,
        status=StandaloneReloadStatus.RESTART_REQUIRED,
        message="Saved. Restart required to apply.",
        error=None,
        config_hash=config_hash,
        reloaded_at=now(),
    )
    await session.commit()  # the runtime_state write
    return StandaloneReloadResult(
        status=StandaloneReloadStatus.RESTART_REQUIRED,
        message="Saved. Restart required to apply.",
    )

try:
    await reload_callable(assembled)
except ReloadInitFailed as exc:
    await session.rollback()
    await runtime_state.record_reload_outcome(
        session,
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Engine reload failed; config not saved.",
        error=str(exc),
        config_hash=None,
        reloaded_at=now(),
    )
    await session.commit()  # the runtime_state failure record
    raise AdminAPIError(
        status_code=500,
        error=StandaloneAdminError(
            code=StandaloneErrorCode.RELOAD_FAILED,
            message="Engine reload failed; config not saved.",
            details={"recovered": True},
        ),
    ) from exc

await session.commit()
await runtime_state.record_reload_outcome(
    session,
    status=StandaloneReloadStatus.RELOADED,
    message="Saved and reloaded.",
    error=None,
    config_hash=config_hash,
    reloaded_at=now(),
)
await session.commit()  # the runtime_state success record
return StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="Saved and reloaded.",
)
```

The repeated `await session.commit()` on the runtime_state row after the user's commit is intentional — the runtime_state record is its own transaction so a failed user-mutation rollback doesn't lose the failure outcome record. SQLite + Postgres both support this.

### 4.7 Retrofit (T3)

#### `api/v1/routers/agent.py`

Replace:

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

With:

```python
from idun_agent_standalone.services.reload import _reload_mutex, commit_with_reload

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)
```

`_NOOP_RELOAD` survives because empty PATCH bodies skip the pipeline entirely (no DB write, no reload). Only `_SAVED_RELOAD` (the restart_required stub) is removed.

The PATCH handler becomes:

```python
@router.patch("", response_model=StandaloneMutationResponse[StandaloneAgentRead])
async def patch_agent(
    body: StandaloneAgentPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    fields = body.model_fields_set
    row = await _load_agent(session)

    if not fields:
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=_NOOP_RELOAD,
        )

    async with _reload_mutex:
        for field in fields:
            setattr(row, field, getattr(body, field))
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )
```

`ReloadCallableDep` is a new FastAPI dependency defined in `api/v1/deps.py` that returns the engine reload callable (real in production, `AsyncMock` in tests).

#### `api/v1/routers/memory.py`

Same retrofit pattern. Memory PATCH framework changes flow through `_is_structural_change` → `restart_required`. DELETE flows through the pipeline too.

#### `app.py`

The engine reload callable is wired into FastAPI's dependency-injection scope via a startup hook. Pseudocode:

```python
from typing import Annotated
from fastapi import Depends
from idun_agent_engine.server.engine_app import EngineApp  # or equivalent

async def _engine_reload_callable(engine_app: EngineApp = ...) -> Callable[[EngineConfig], Awaitable[None]]:
    async def _reload(config: EngineConfig) -> None:
        try:
            await engine_app.reconfigure(config)
        except Exception as exc:
            raise ReloadInitFailed(str(exc)) from exc
    return _reload

ReloadCallableDep = Annotated[Callable[[EngineConfig], Awaitable[None]], Depends(_engine_reload_callable)]
```

The exact engine integration depends on what `idun_agent_engine` exposes. The implementer reads the engine's reconfigure interface during T3 and adapts. If the engine doesn't expose a clean reconfigure entry point yet, T3 implements a minimal "rebuild app + swap" inside `_engine_reload_callable` — the legacy `reload.py` does this; the new code can borrow the technique without importing legacy.

### 4.8 Patterns doc transitions (T4)

`docs/superpowers/specs/2026-04-27-rework-patterns.md`

| Section | Transition | Notes |
|---|---|---|
| §6.5 Slug rules | FORWARD → ESTABLISHED | Cite `services/slugs.py:N` for `normalize_slug`, `ensure_unique_slug`. Replace skeleton with real reference snippet. |
| §7.4 Stub reload caveat | REMOVE | Stubs are gone after T3. |
| §8 Validation rounds | FORWARD → ESTABLISHED | Cite `services/reload.py:N` for the 3-round dispatch and `services/validation.py:N` for round 2 implementation. |
| §10 Reload mutex | FORWARD → ESTABLISHED | Cite `services/reload.py:N` for `_reload_mutex` and `commit_with_reload`. |
| §11 Cold-start states | partial ESTABLISHED | Storage layer now exists. Add: "ESTABLISHED references — runtime_state ORM at `infrastructure/db/models/runtime_state.py:N` and service at `services/runtime_state.py:N`. The boot-path state machine that derives `StandaloneRuntimeStatusKind` from agent presence + engine state + last reload outcome lands in Phase 6." |
| §12 Config hash | FORWARD → ESTABLISHED | Cite `services/config_hash.py:N`. Lock the `rfc8785` package as the JCS implementation. |

Sections that remain FORWARD across Phase 3:
- §6.2 Collection router pattern (Phase 5)
- §6.3 PATCH semantics (Phase 5)
- §6.6 Connection-check sub-routes (Phase 6)
- §11 Cold-start state machine implementation (Phase 6)

## 5. Test strategy

### 5.1 Layout

```
libs/idun_agent_standalone/tests/
├── conftest.py                      # async_session, stub_reload_callable, frozen_now
├── unit/
│   ├── db/
│   │   └── test_runtime_state_model.py
│   ├── services/
│   │   ├── test_runtime_state.py
│   │   ├── test_slugs.py
│   │   ├── test_config_hash.py
│   │   ├── test_validation.py
│   │   └── test_reload.py
│   └── ... (existing)
└── integration/
    ├── api/
    │   └── v1/
    │       ├── test_agent_flow.py
    │       └── test_memory_flow.py
    └── ... (existing)
```

The existing legacy-tied test files in the standalone tests/ tree continue to be ignored via the Phase 1 narrowed pytest gate — Phase 3 doesn't touch them.

### 5.2 Unit tests (~42)

Per-component coverage:

| File | Tests | Purpose |
|---|---|---|
| `tests/unit/db/test_runtime_state_model.py` | 3 | ORM column types, default PK, server-default timestamps |
| `tests/unit/services/test_runtime_state.py` | 6 | get on empty, record then get, record overwrites, clear, no leak between transactions, structural fields preserved across writes |
| `tests/unit/services/test_slugs.py` | 12 | normalize: ascii-fold, lowercase, regex, collapse, trim, truncate, all-special chars (raises), unicode, empty (raises); ensure_unique: no collision, 1 collision, 99 collisions raise |
| `tests/unit/services/test_config_hash.py` | 5 | deterministic, JCS canonical (key order doesn't matter), distinct configs distinct hashes, sha256 hex length, EngineConfig integration |
| `tests/unit/services/test_validation.py` | 4 | valid passes, LANGGRAPH+SessionService fails (1 field error), multiple errors collected, RoundTwoValidationFailed wraps ValidationError |
| `tests/unit/services/test_reload.py` | 12 | mutex serializes 2 concurrent acquires; happy path returns reloaded; round 2 fail rolls back; round 3 fail rolls back AND records failure outcome; structural change returns restart_required; fresh state (no prior) treats first config as non-structural; reload_callable injected and called once; hash propagated to runtime_state on success; hash NOT propagated on failure; dependency-injected `now` for deterministic timestamps; ReloadInitFailed raises 500 AdminAPIError; structural skip on graph_definition change |

### 5.3 Integration tests (~18)

Tests that drive the agent + memory routers through the full pipeline:

| File | Tests | Test gates covered |
|---|---|---|
| `tests/integration/api/v1/test_agent_flow.py` | 8 | GET → 200; PATCH happy → 200 reloaded; empty PATCH → 200 noop (no DB write, no reload); PATCH name change → 200 reloaded (non-structural); two concurrent PATCHes serialize through mutex; reload outcome appears in runtime_state row; round 2 validation 422; round 3 reload failure → 500 + DB rolled back |
| `tests/integration/api/v1/test_memory_flow.py` | 10 | GET on empty → 404; PATCH first-write missing field → 422; PATCH happy → 200 reloaded; PATCH framework switch (LANGGRAPH↔ADK) → 200 restart_required; framework/memory mismatch → 422 + DB unchanged; DELETE → 200 with reload outcome; DELETE on empty → 404; two concurrent PATCHes serialize; reload fail rolls back DB unchanged; runtime_state recorded with correct status |

These cover the spec-locked Phase 3 test gates from `2026-04-27-rework-patterns.md §13.3`:
- Rollback path (round 2 + round 3 failure)
- `restart_required` path
- Reload callback survival (reload_callable invoked exactly once on happy path)
- Concurrency (mutex serializes)
- Cold-start state recording (runtime_state row written after every outcome)

### 5.4 Test fixtures (`tests/conftest.py`)

```python
@pytest.fixture
async def async_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def stub_reload_callable() -> AsyncMock:
    """An AsyncMock with configurable side effects for round 3."""
    return AsyncMock()


@pytest.fixture
def frozen_now() -> Callable[[], datetime]:
    """Fixed datetime so reload outcome timestamps are deterministic."""
    fixed = datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc)
    return lambda: fixed
```

### 5.5 Total

~60 new tests on top of Phase 2's 64. Standalone test count grows to ~124.

## 6. Acceptance criteria

Phase 3 is done when all of these hold:

1. T2 helpers exist at the locked file paths and pass their unit tests.
2. T1 reload pipeline exists at the locked file paths and passes unit + integration tests.
3. T3 retrofit removes `_SAVED_RELOAD` constant from `api/v1/routers/agent.py` and `_SAVED_RELOAD` / `_DELETE_RELOAD` constants from `api/v1/routers/memory.py`. (`_NOOP_RELOAD` survives in both as it's the empty-body fast-path.) Verify via `grep -rn "_SAVED_RELOAD\|_DELETE_RELOAD" api/v1/`.
4. T4 patterns doc transitions land per §4.8.
5. `make lint` clean.
6. `uv run mypy --follow-imports=silent <new-tree>` clean (~50 source files).
7. `uv run pytest libs/idun_agent_schema -q` passes (62 tests; not regressed).
8. `uv run pytest libs/idun_agent_standalone -q --ignore=...` passes (≥120 tests).
9. The 5 spec-locked Phase 3 test gates pass: rollback path, `restart_required` path, reload callback survival, concurrency, cold-start state recording.
10. PR description summarizes which patterns moved from FORWARD to ESTABLISHED.

## 7. Branch and commit structure

Branch: `feat/rework-phase3-plumbing`, branched from current tip of `feat/standalone-admin-db-rework`.

Commits, in order (matches dispatch order T2 → T1 → T3 → T4):

1. `docs(rework-phase3): add Phase 3 design doc` — drops THIS doc.
2. `docs(rework-phase3): add Phase 3 plan` — writing-plans output.
3. `feat(rework-phase3): cross-cutting helpers (slugs, config hash, runtime state)` — T2: 4 service modules + 1 ORM + ~26 unit tests.
4. `feat(rework-phase3): reload pipeline + 3-round validation` — T1: 2 service modules + ~16 unit tests.
5. `refactor(rework-phase3): agent + memory routers use real reload pipeline` — T3: 2 router edits + 1 app.py edit + ~18 integration tests.
6. `docs(rework-phase3): patterns reference — flip FORWARD sections to ESTABLISHED` — T4.

PR target: `feat/standalone-admin-db-rework`.

## 8. Non-goals

Phase 3 explicitly does NOT:

- Add the `/admin/api/v1/runtime/status` endpoint (Phase 6).
- Build the cold-start state machine boot path that derives `StandaloneRuntimeStatusKind` (Phase 6 — Phase 3 only provides storage + service helpers).
- Add the `/health` or `/readyz` endpoints (Phase 6).
- Add connection-check sub-routes (Phase 6).
- Touch any collection-resource ORM, schema, or router (Phases 4–5).
- Add Alembic migrations for `standalone_runtime_state` (Phase 4 picks up the ORM in its fresh baseline).
- Replace the existing `services/engine_config.py` (Phase 5 extends it for collection resources).
- Touch legacy code at `admin/`, root-level legacy modules, or legacy `db/`.
- Implement smart per-field hot-reload classification (deferred to next version per spec).
- Add audit-event logging (deferred per Phase 1 amendment).
- Update FORWARD sections of the patterns doc that Phases 4–7 own (§6.2 collection routers, §6.3 PATCH semantics, §6.6 connection-check sub-routes, §11 boot-path state machine).

## 9. Risks

- **`rfc8785` package dependency.** New runtime dep on a small package. **Mitigation:** lock `rfc8785>=0.1` minimum version in `pyproject.toml`; T2 unit tests assert canonicalization is deterministic across re-encodings of the same logical config. The package is pure-Python and self-contained, so install footprint is trivial.
- **Structural-change detection logic is subtle.** The detector compares structural slices of assembled configs. Edge cases: ADK `agent.config.agent` changes (NOT structural unless framework changed), agent `name` changes (NOT structural), graph_definition path changes (structural). **Mitigation:** T1 implementer prompt enumerates exactly which fields trigger structural; spec reviewer cross-checks against spec §"Save/reload posture"; integration test for memory framework switch is one of the locked gates (`test_memory_flow.py` line "PATCH framework switch → 200 restart_required").
- **Reload callable dependency injection threads through several layers.** Routers receive it via FastAPI `Depends`; `commit_with_reload` accepts it as a parameter; tests use `AsyncMock`; production wires the real engine reconfigure. **Mitigation:** T3 implementer prompt explicitly walks the wiring; the `ReloadCallableDep` typing alias makes the contract explicit.
- **Mutex contention in production.** Single asyncio.Lock means concurrent admin PATCHes serialize. For single-replica standalone this is intentional (the spec locks single-replica). **Mitigation:** documented in `services/reload.py` docstring; one integration test verifies serialization.
- **Runtime state record-then-rollback ordering.** On round 3 reload failure, we rollback the user's DB mutation but still want to record the failure outcome to runtime_state. The pattern is: rollback, then runtime_state.record_reload_outcome, then commit (the outcome record). Subtle but the test gate enforces it. **Mitigation:** T1 unit test `test_round_3_fail_rolls_back_AND_records_failure_outcome` exercises this exact sequence; algorithm pseudocode in §4.6.1 is reviewer-checkable.
- **Engine reconfigure interface may not exist cleanly in idun_agent_engine.** If the engine doesn't expose a public reconfigure entry point, T3's `_engine_reload_callable` has to do a "rebuild app + swap" technique borrowed from the legacy `reload.py`. **Mitigation:** T3 implementer reads the engine code first; if a clean entry point is missing, the PR description flags this and the rebuild technique gets a comment block explaining the situation. If the engine refactor is non-trivial, escalate to user (not in Phase 3 scope to refactor the engine).
- **Test count growth and run time.** ~60 new tests on top of 64. Most are unit and run in milliseconds; integration tests use in-memory SQLite. **Mitigation:** in-memory SQLite per session; mocks elsewhere. Total `pytest libs/idun_agent_standalone` should stay <30 seconds.

## 10. Test gates this phase satisfies

From the rework spec §"Future implementation test gates" (cross-mapped in `2026-04-27-rework-patterns.md §13.3` as Phase 3 deliverables):

- **Rollback path** — round 2 + round 3 failure both rollback DB; integration test asserts active engine still serves prior config (where applicable).
- **`restart_required` path** — structural changes commit DB but reload_callable is NOT invoked; integration test asserts engine still uses old config until restart.
- **Reload callback survival** — reload_callable is invoked exactly once on happy path; integration test asserts AsyncMock call count.
- **Concurrency (reload mutex)** — two simultaneous PATCHes serialize; neither corrupts the other's commit window. Integration test uses `asyncio.gather` with two PATCHes.
- **Cold-start state recording** — runtime_state row written after every outcome (success, restart_required, failure). Unit + integration coverage.

Gates NOT owned by Phase 3 (still future work):
- YAML seed/export/seed roundtrip — Phase 4
- Real reload integration with a LangGraph echo agent — Phase 5
- Auth boundary (rate limiting, CSRF) — Phase 7
- Schema validation per resource — Phase 5

## 11. Next step after approval

Once this doc is approved:

1. Commit it as `docs(rework-phase3): add Phase 3 design doc`.
2. Invoke `superpowers:writing-plans` to produce a task-by-task plan at `docs/superpowers/plans/2026-04-27-rework-phase3.md`. Plan tasks follow §7's commit order.
3. Execute the plan via `superpowers:subagent-driven-development` (T2 → T1 → T3 → T4 dispatch order).
