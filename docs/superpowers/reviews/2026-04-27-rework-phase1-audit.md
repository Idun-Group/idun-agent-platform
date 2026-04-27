# Phase 1 Audit Findings — Standalone Admin/DB Rework

Date: 2026-04-27
Audited: commits 10018468..fd90d8bb on feat/standalone-admin-db-rework
Spec: docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md

## Summary
- 8 findings total
- 8 classed as pattern-breakers (must fix in Phase 1)
- 0 classed as deferred (will roll into a later phase)

## Findings

### P1-AF-001 — Incorrect exception handler type signature for AdminAPIError — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/errors.py:158
**Drift:** The `admin_api_error_handler` function has signature `Callable[[Request, AdminAPIError], Coroutine[Any, Any, JSONResponse]]` but FastAPI's `add_exception_handler` expects `Callable[[Request, Exception], Response | Awaitable[Response] | Callable[[WebSocket, Exception], Awaitable[None]]`. The exception type parameter must be compatible with the base `Exception` type that Starlette knows about.
**Impact:** Type-checking CI will fail. More critically, the handler registration may fail at runtime if Starlette/FastAPI does strict type checking on exception handler signatures, potentially leaving the admin error handling path unregistered.

### P1-AF-002 — Incorrect exception handler type signature for RequestValidationError — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/errors.py:160
**Drift:** The `admin_request_validation_handler` function has signature `Callable[[Request, RequestValidationError], Coroutine[Any, Any, JSONResponse]]` but FastAPI's `add_exception_handler` expects a compatible signature matching Starlette's base `Exception` handler protocol.
**Impact:** Type-checking CI will fail. The validation error handler may not be properly registered.

### P1-AF-003 — None-check missing before _to_read call in memory patch noop path — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:159
**Drift:** At line 159, `_to_read(row)` is called where `row` can be `StandaloneMemoryRow | None` (from line 124 where `row` is assigned from `_load_row`). The function `_to_read` expects a non-None `StandaloneMemoryRow`. The code path at lines 156-160 is inside the `else` block (when an existing row is found), but the type checker cannot prove that `row is not None` at line 159 because the assignment at line 124 gave `row` a union type and there is no type guard between lines 156 and 159.
**Impact:** Cold-start assertion or runtime crash on a missing memory row (contradicting the control flow assumption). Downstream phases copying this pattern into collection routers would propagate the same class of bugs.

### P1-AF-004 — None-check missing before accessing row.agent_framework in memory patch — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:162
**Drift:** At line 162, `row.agent_framework = body.agent_framework.value` accesses `row` which has union type `StandaloneMemoryRow | None` (from line 124). The code is inside the `else` block (lines 155-164), but mypy cannot narrow the type without an explicit `assert row is not None` or `if row is not None:` check.
**Impact:** Potential runtime AttributeError if a race condition causes the row to vanish between line 124 and line 162, or if control flow assumptions are violated.

### P1-AF-005 — None-check missing before accessing row.memory_config in memory patch — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:164
**Drift:** At line 164, `row.memory_config = body.memory.model_dump(...)` accesses `row.memory_config` on a union type `StandaloneMemoryRow | None`. Same root cause as P1-AF-004.
**Impact:** Runtime AttributeError under edge conditions.

### P1-AF-006 — None-check missing before accessing row.agent_framework in memory patch exception handler — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:184
**Drift:** At line 184, inside the `except AssemblyError` block, the code accesses `framework = row.agent_framework` where `row` is still of union type `StandaloneMemoryRow | None` (from line 124). By control flow, this line is only reachable if assembly succeeded (or if an exception other than AgentNotConfiguredError occurred), but the type checker does not track this.
**Impact:** Runtime AttributeError in the exception handler itself, potentially masking the original AssemblyError.

### P1-AF-007 — None-check missing before accessing row.agent_framework in memory patch log — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:210
**Drift:** At line 210, the log statement accesses `row.agent_framework` where `row` is union type `StandaloneMemoryRow | None`. By control flow, `row` is guaranteed to be non-None at this point (because we've either set it at line 149 or updated it at lines 162-164 and then committed), but the type checker cannot prove it.
**Impact:** Type-checking failure. In a stricter type-checking mode, this would block CI.

### P1-AF-008 — None-check missing before _to_read call in memory patch success path — pattern-breaker
**Spec section:** §6 pattern-breaker class 11 (Type safety in new-tree files)
**Pattern-breaker class:** 11
**File(s):** libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py:213
**Drift:** At line 213, `_to_read(row)` is called where `row` is still union type `StandaloneMemoryRow | None`. By control flow, `row` is guaranteed to be non-None at this point (it was either created at line 149 or it existed and was not deleted), but mypy cannot track the constraint.
**Impact:** Type-checking failure blocks CI. Runtime crash possible if assumptions are violated.

## Patterns confirmed correct
- Mutation envelope shape: StandaloneMutationResponse wraps all POST/PATCH/DELETE responses with data and reload fields; DELETE is wrapped, not bare.
- Reload status enum: StandaloneReloadStatus defines reloaded, restart_required, reload_failed exactly as specified.
- HTTP behavior on mutations: All successful mutations return HTTP 200; no 202 used for restart_required.
- Error envelope: StandaloneAdminError includes code enum (with bad_request and rate_limited), message, details, and field_errors, all implemented correctly.
- Case convention: JSON keys are camelCase outbound (via _CamelModel base with alias_generator=to_camel and populate_by_name=True); enum values are snake_case; path segments are kebab-case.
- File layout: Schemas in idun_agent_schema/standalone/; ORMs in infrastructure/db/models/; routers in api/v1/routers/; services in services/; core helpers in core/.
- Manager schema mirror rule: ORMs use String(36) for UUID and JSON (SQLAlchemy engine-agnostic) for JSONB; no imports from services/idun_agent_manager/ ORM classes; no shared SQLAlchemy Base; no workspace_id columns.
- Stored shape rule: Memory JSON column stores manager-shape MemoryConfig (CheckpointConfig | SessionServiceConfig) via model_dump(); agent base_engine_config stores EngineConfig.
- Singleton route shape: Agent and memory use no-{id} routes (/admin/api/v1/agent, /admin/api/v1/memory); DB row PKs are fixed (agent has UUID, memory has "singleton" string).
- Schema namespace usage: Routers import request/response shapes from idun_agent_schema.standalone.*.
- Forbidden patterns: No from app.* imports; no 202 status codes; no deep-merge PATCH (fields are replaced wholesale); no association/junction tables; no workspace_id columns; no engine-shape JSON stored in DB columns.
