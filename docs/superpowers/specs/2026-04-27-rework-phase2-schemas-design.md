# Rework Phase 2 — Schema Namespace Completion

Date: 2026-04-27

Branch: `feat/rework-phase2-schemas` (off `feat/standalone-admin-db-rework` umbrella, branched from merged Phase 1 tip `f4bd5fde`)

Status: Brainstormed and locked. Implementation has not started.

Authoritative sources:
- `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md` — the rework spec.
- `docs/superpowers/specs/2026-04-27-rework-patterns.md` — the patterns reference (locked at Phase 1 close). Phase 2 ESTABLISHES sections marked FORWARD where collection schemas, runtime status, diagnostics, config, and enrollment are concerned.

When this doc and either authoritative source disagree, the spec wins for content; the patterns doc wins for shape.

## 1. Purpose

Phase 2 completes the `idun_agent_schema.standalone` namespace. Every public Pydantic contract that Phases 4–7 will consume must exist by the end of Phase 2. The namespace is the source of truth for the standalone admin surface; locking it before ORMs (Phase 4), routers (Phase 5), and the diagnostics surface (Phase 6) prevents shape churn during those phases.

Phase 2 does **not** add ORMs, routers, services, or non-schema runtime behavior. It is schema-only plus the unit tests that lock the contracts.

## 2. Deliverables

1. **10 new schema modules** at `libs/idun_agent_schema/src/idun_agent_schema/standalone/`:
   - Collection resources (5): `guardrails.py`, `mcp_servers.py`, `observability.py`, `integrations.py`, `prompts.py`
   - Operational + diagnostic (3): `runtime_status.py`, `operational.py`, `diagnostics.py`
   - Config + enrollment (2): `config.py`, `enrollment.py`
2. **Updated `__init__.py`** re-exporting every new public type, alphabetically grouped by module, mirroring the Phase 1 import block style.
3. **Schema unit tests** at `libs/idun_agent_schema/tests/standalone/` covering all 14 standalone schema modules (the 5 Phase 1 modules plus the 9 added in Phase 2). Cross-cutting `test_namespace.py` walks the public API and asserts every type inherits `_CamelModel` (or is a `StrEnum`).
4. **Patterns doc update** at the end of T4 flipping FORWARD sections to ESTABLISHED with new `file:line` refs:
   - §4.3 collection schemas
   - §6.4 DELETE wrapping example for collections
   - §11 cold-start states (`StandaloneRuntimeStatusKind` enum citation)
   - §14 manager mirror references for collection schemas

The patterns doc retains FORWARD tags for everything that Phases 3–7 will land (reload mutex, validation rounds, cold-start state machine implementation, slug rules, connection-check sub-routes, config hash).

## 3. Scope of changes

In scope:

- `libs/idun_agent_schema/src/idun_agent_schema/standalone/*.py` — add 9 new modules, update `__init__.py`.
- `libs/idun_agent_schema/tests/standalone/*.py` — create the test directory and 14 test files.
- `docs/superpowers/specs/2026-04-27-rework-patterns.md` — single follow-up commit at the end of T4 with FORWARD → ESTABLISHED transitions.

Out of scope:

- All paths under `libs/idun_agent_standalone/` (Phase 4+).
- All paths under `services/idun_agent_manager/`, `services/idun_agent_web/`, `services/idun_agent_standalone_ui/`, `libs/idun_agent_engine/`.
- ORMs, routers, services, FastAPI wiring.
- Reload mutex, 3-round validation, cold-start state machine, slug rules, connection-check sub-route handlers, config hash computation. Schemas exist (Phase 2); behavior lands in Phases 3 / 5 / 6.

## 4. Module specifications

### 4.1 Collection resource schemas (T1)

All 5 inherit `_CamelModel`. Read variants add `model_config = ConfigDict(from_attributes=True)`. PATCH validators reject explicit-null on required fields, mirroring Phase 1's `_no_null_name` pattern at `idun_agent_schema/standalone/agent.py:57-61`.

#### `guardrails.py`

Wraps `idun_agent_schema.manager.guardrail_configs.ManagerGuardrailConfig`. Folds the manager M:N junction columns (`position`, `sort_order`) into the row-level standalone shape.

```text
StandaloneGuardrailRead
  id: UUID
  slug: str
  name: str
  enabled: bool
  position: Literal["input", "output"]
  sort_order: int
  guardrail: ManagerGuardrailConfig
  created_at: datetime
  updated_at: datetime

StandaloneGuardrailCreate
  name: str
  enabled: bool = True
  position: Literal["input", "output"]
  sort_order: int = 0
  guardrail: ManagerGuardrailConfig

StandaloneGuardrailPatch
  name: str | None = None
  enabled: bool | None = None
  position: Literal["input", "output"] | None = None
  sort_order: int | None = None
  guardrail: ManagerGuardrailConfig | None = None
  validator: explicit-null on `name` rejects
```

#### `mcp_servers.py`

Wraps `idun_agent_schema.engine.mcp_server.MCPServer`. Manager uses the engine shape directly, so no conversion at assembly.

```text
StandaloneMCPServerRead
  id: UUID, slug: str, name: str, enabled: bool
  mcp_server: MCPServer
  created_at: datetime, updated_at: datetime

StandaloneMCPServerCreate
  name: str, enabled: bool = True
  mcp_server: MCPServer

StandaloneMCPServerPatch
  name: str | None = None
  enabled: bool | None = None
  mcp_server: MCPServer | None = None
  validator: explicit-null on `name` rejects
```

#### `observability.py`

Wraps `idun_agent_schema.engine.observability_v2.ObservabilityConfig`.

```text
StandaloneObservabilityRead
  id: UUID, slug: str, name: str, enabled: bool
  observability: ObservabilityConfig
  created_at: datetime, updated_at: datetime

StandaloneObservabilityCreate
  name: str, enabled: bool = True
  observability: ObservabilityConfig

StandaloneObservabilityPatch
  name: str | None = None
  enabled: bool | None = None
  observability: ObservabilityConfig | None = None
  validator: explicit-null on `name` rejects
```

#### `integrations.py`

Wraps `idun_agent_schema.engine.integrations.IntegrationConfig`. The standalone row's `enabled` is the single source of truth; the inner `IntegrationConfig.enabled` is overwritten at assembly (out of Phase 2 scope; Phase 4+ enforces it).

```text
StandaloneIntegrationRead
  id: UUID, slug: str, name: str, enabled: bool
  integration: IntegrationConfig
  created_at: datetime, updated_at: datetime

StandaloneIntegrationCreate
  name: str, enabled: bool = True
  integration: IntegrationConfig

StandaloneIntegrationPatch
  name: str | None = None
  enabled: bool | None = None
  integration: IntegrationConfig | None = None
  validator: explicit-null on `name` rejects
```

#### `prompts.py`

Versioned. Mirrors `idun_agent_schema.manager.managed_prompt`. **No `slug`, no `enabled`.** Append-only versioning (PATCH on tags only; content patches create a new version per spec §"Resource contracts → Prompts").

```text
StandalonePromptRead
  id: UUID
  prompt_id: str
  version: int
  content: str
  tags: list[str]
  created_at: datetime
  updated_at: datetime

StandalonePromptCreate
  prompt_id: str
  content: str
  tags: list[str] = []

StandalonePromptPatch
  tags: list[str] | None = None
  validator: explicit-null on `tags` rejects (clearing means empty list, not null)
```

### 4.2 Operational + diagnostic contracts (T2)

#### `runtime_status.py`

Top-level + nested per spec §"Runtime status" example payload. Imports `StandaloneEnrollmentInfo` from `enrollment.py` (which T3 lands; subagent must order T1 → T3 → T2 OR write the import as a forward reference and verify at T4).

```text
StandaloneRuntimeAgent
  id: UUID | None = None
  name: str | None = None
  framework: str | None = None
  version: str | None = None
  lifecycle_status: AgentStatus | None = None  # imports from idun_agent_schema.manager.managed_agent

StandaloneRuntimeConfigInfo
  hash: str | None = None
  last_applied_at: datetime | None = None

StandaloneEngineCapabilities
  streaming: bool
  history: bool
  thread_id: bool

StandaloneRuntimeEngine
  capabilities: StandaloneEngineCapabilities

StandaloneRuntimeReload
  last_status: StandaloneReloadStatus | None = None  # imports from .reload
  last_message: str | None = None
  last_error: str | None = None
  last_reloaded_at: datetime | None = None

StandaloneRuntimeMCP
  configured: int
  enabled: int
  failed: list[str]

StandaloneRuntimeObservability
  configured: int
  enabled: int

StandaloneRuntimeStatusKind (StrEnum)
  NOT_CONFIGURED = "not_configured"
  INITIALIZING   = "initializing"
  RUNNING        = "running"
  ERROR          = "error"

StandaloneRuntimeStatus
  status: StandaloneRuntimeStatusKind
  agent: StandaloneRuntimeAgent | None = None
  config: StandaloneRuntimeConfigInfo | None = None
  engine: StandaloneRuntimeEngine | None = None
  reload: StandaloneRuntimeReload | None = None
  mcp: StandaloneRuntimeMCP
  observability: StandaloneRuntimeObservability
  enrollment: StandaloneEnrollmentInfo  # imports from .enrollment
  updated_at: datetime
```

#### `operational.py`

Minimal placeholder per Q3 of the brainstorm. Module body is the docstring only. No public types yet.

```text
"""Reserved for operational schemas (audit events, rate-limit response details).

Pending audit-log implementation in a later version. The standalone error
envelope already covers rate-limit responses via StandaloneAdminError with
code = rate_limited (see errors.py). When audit ships, this module will
add structured audit event types per spec §"Operational hardening"."""
```

The implementer must NOT add stub types here; an empty module is intentional.

#### `diagnostics.py`

Connection check + readyz response.

```text
StandaloneConnectionCheck
  ok: bool
  details: dict[str, Any] | None = None
  error: str | None = None

StandaloneReadyzCheckStatus (StrEnum)
  OK   = "ok"
  FAIL = "fail"

StandaloneReadyzStatus (StrEnum)
  READY     = "ready"
  NOT_READY = "not_ready"

StandaloneReadyzResponse
  status: StandaloneReadyzStatus
  checks: dict[str, StandaloneReadyzCheckStatus]
```

### 4.3 Config + enrollment (T3)

#### `config.py`

Materialized config view returned by `GET /admin/api/v1/config/materialized`. The YAML export at `GET /admin/api/v1/config/export` is `text/yaml` content-negotiated; no Pydantic model required for that route.

```text
StandaloneMaterializedConfig
  config: EngineConfig                         # imports from idun_agent_schema.engine.engine
  hash: str                                    # JCS sha256; aligns with runtime_status.config.hash
```

#### `enrollment.py`

Placeholder shapes per spec §"Enrollment".

```text
StandaloneEnrollmentMode (StrEnum)
  LOCAL    = "local"
  ENROLLED = "enrolled"
  MANAGED  = "managed"

StandaloneEnrollmentStatus (StrEnum)
  NOT_ENROLLED = "not_enrolled"
  PENDING      = "pending"
  CONNECTED    = "connected"
  ERROR        = "error"

StandaloneEnrollmentInfo
  mode: StandaloneEnrollmentMode = StandaloneEnrollmentMode.LOCAL
  status: StandaloneEnrollmentStatus = StandaloneEnrollmentStatus.NOT_ENROLLED
  manager_url: str | None = None
  workspace_id: UUID | None = None
  managed_agent_id: UUID | None = None
  config_revision: int | None = None
```

### 4.4 Barrel update (T4)

`__init__.py` re-exports every new public type. Style mirrors the Phase 1 barrel (alphabetical within each module, modules in `from .x import (...)` blocks). Order of module imports in the barrel:

```text
from ._base import _CamelModel        (already there)
from .agent import (...)              (already there)
from .common import (...)             (already there)
from .config import (...)             NEW
from .diagnostics import (...)        NEW
from .enrollment import (...)         NEW
from .errors import (...)             (already there)
from .guardrails import (...)         NEW
from .integrations import (...)       NEW
from .mcp_servers import (...)        NEW
from .memory import (...)             (already there)
# operational.py exports nothing — no import line
from .observability import (...)      NEW
from .prompts import (...)            NEW
from .reload import (...)             (already there)
from .runtime_status import (...)     NEW
```

`_CamelModel` is intentionally not re-exported from the barrel (leading underscore = private to the namespace).

## 5. Test strategy (T4)

### 5.1 Layout

`libs/idun_agent_schema/tests/standalone/`:

```
__init__.py                # empty package marker
test_namespace.py          # cross-cutting
test_common.py             # P1 — envelope, delete results, identity
test_errors.py             # P1 — StandaloneAdminError, code enum
test_reload.py             # P1 — StandaloneReloadResult, status enum
test_agent.py              # P1 — round-trip, _no_null_name validator
test_memory.py             # P1 — round-trip
test_guardrails.py         # P2 T1
test_mcp_servers.py        # P2 T1
test_observability.py      # P2 T1
test_integrations.py       # P2 T1
test_prompts.py            # P2 T1 — versioning rules
test_runtime_status.py     # P2 T2
test_diagnostics.py        # P2 T2
test_config.py             # P2 T3
test_enrollment.py         # P2 T3
```

No `test_operational.py` (the module is empty by design).

### 5.2 Per-module test pattern

Each module test file follows this template (3–5 tests per module). Example for `test_mcp_servers.py`:

```python
def test_mcp_server_read_round_trip(): ...
def test_mcp_server_camel_case_outbound(): ...
def test_mcp_server_snake_case_inbound(): ...
def test_mcp_server_patch_explicit_null_name_rejects(): ...
```

Required test categories:

1. **Round-trip:** parse a sample payload (mix of snake_case and camelCase keys) → `model_dump(by_alias=True)` → reparse → equality. Asserts `populate_by_name=True` works in both directions.
2. **camelCase outbound:** `model.model_dump(by_alias=True)` produces camelCase keys for every field whose Python name has an underscore.
3. **snake_case inbound:** `Model.model_validate({"snake_case_field": ...})` parses without error.
4. **Validators (where present):** explicit-null on required fields rejects with a `ValidationError` containing the expected message; valid edge cases pass.
5. **Versioning (prompts only):** `StandalonePromptPatch` accepts only `tags`; `StandalonePromptCreate` does not auto-set `version` (the DB layer manages versioning at write time).

### 5.3 Cross-cutting `test_namespace.py`

```python
def test_every_public_type_is_camel_model_or_strenum():
    """Walk idun_agent_schema.standalone.__init__ and assert each public
    name is either a subclass of _CamelModel or StrEnum (or a TypeVar /
    Generic helper that we explicitly allowlist)."""

def test_envelope_round_trips_with_generic_payload():
    """StandaloneMutationResponse[StandaloneAgentRead] round-trips
    correctly (camelCase outbound, snake_case inbound, nested data and
    reload fields)."""

def test_error_envelope_round_trips():
    """StandaloneAdminError with field_errors round-trips; code enum
    serializes as snake_case string."""
```

### 5.4 Sample payloads

Test fixtures live inline in each test file (no shared `conftest.py` for now — each module's sample is local for clarity). Sample payloads cite real engine/manager shapes from existing usage where possible. The implementer may read existing engine/manager test fixtures as references but does not depend on them.

## 6. Acceptance criteria

Phase 2 is done when all of these hold:

1. All 10 new schema modules exist under `libs/idun_agent_schema/src/idun_agent_schema/standalone/` and each follows the shape locked in §4. (`operational.py` is the docstring-only placeholder; the other 9 contain types.)
2. `__init__.py` re-exports every new public type per §4.4 ordering.
3. `libs/idun_agent_schema/tests/standalone/` exists with 15 files (the 14 test files plus the package `__init__.py`).
4. `make lint` clean.
5. `uv run mypy --follow-imports=silent libs/idun_agent_schema/src/idun_agent_schema/standalone` clean.
6. `uv run pytest libs/idun_agent_schema -q` passes (~70 tests; exact count locked at Phase 2 close).
7. The narrowed Phase 1 standalone-backend pytest gate continues to pass (Phase 2 doesn't touch the standalone backend; this is a regression check).
8. `docs/superpowers/specs/2026-04-27-rework-patterns.md` updated to flip applicable FORWARD tags to ESTABLISHED with new `file:line` refs (§4.3, §6.4, §11 enum citation, §14 collection mirror references). Sections that remain FORWARD across Phase 2 (validation rounds, reload mutex, cold-start state machine implementation, slug rules, connection-check sub-routes implementation, config hash) keep their tags.
9. PR description summarizes which patterns moved from FORWARD to ESTABLISHED.

## 7. Branch and commit structure

Branch: `feat/rework-phase2-schemas`, branched from current tip of `feat/standalone-admin-db-rework`.

Commits, in order (matches dispatch order: T1 → T3 → T2 → T4 to satisfy the `runtime_status.py → enrollment.py` import dependency):

1. `docs(rework-phase2): add Phase 2 design doc` — drops THIS doc.
2. `docs(rework-phase2): add Phase 2 plan` — drops the implementation plan (writing-plans skill output).
3. `feat(rework-phase2): collection resource schemas` — T1 (5 modules).
4. `feat(rework-phase2): config and enrollment schemas` — T3 (2 modules; lands before T2 so `runtime_status.py` can import `StandaloneEnrollmentInfo`).
5. `feat(rework-phase2): operational and diagnostic schemas` — T2 (3 modules; `operational.py` is the placeholder).
6. `test(rework-phase2): standalone schema namespace tests` — T4 (test directory + 15 test files + `__init__.py` barrel update for the namespace).
7. `docs(rework-phase2): patterns reference — flip FORWARD sections to ESTABLISHED` — patterns doc update at the end of T4.

PR target: `feat/standalone-admin-db-rework` (the umbrella).

## 8. Non-goals

Phase 2 explicitly does NOT:

- Add ORMs, routers, services, or any code under `libs/idun_agent_standalone/`.
- Implement reload mutex, 3-round validation pipeline, slug rules, cold-start state machine, config hash computation, or connection-check route handlers (Phases 3 / 5 / 6).
- Touch legacy code in any tree.
- Add tests in `libs/idun_agent_standalone/tests/` (Phase 5+ adds router-level tests).
- Update FORWARD sections of the patterns doc that Phases 3–7 own (validation rounds, reload mutex, cold-start states, slug rules, connection-check sub-routes, config hash).
- Add audit-event schemas to `operational.py` (deferred per Phase 1 amendment).

## 9. Risks

- **Manager Pydantic shapes evolve and break standalone wrapper round-trip tests.**
  - Mitigation: round-trip tests use a known-good payload locked at Phase 2 close. If the manager schema changes after Phase 2, the standalone wrapper's tests catch it explicitly. The fix lives in the phase that touches the manager; no Phase 2 retro is required.
- **`runtime_status.py`'s nested-model count is large; subagent might lose track of nesting depth.**
  - Mitigation: T2 implementer prompt enumerates every nested type and field. Spec-compliance reviewer cross-checks against the example JSON in spec §"Runtime status".
- **`prompts.py` versioning semantics differ from the other 4 collection modules; implementer might over-generalize.**
  - Mitigation: T1 implementer prompt explicitly calls out the difference and instructs the subagent to read `idun_agent_schema/manager/managed_prompt.py` first. No `slug`, no `enabled`, no `Patch.content` — only `Patch.tags` per spec §"Resource contracts → Prompts".
- **Cross-module imports between `runtime_status.py` and `enrollment.py`/`reload.py` could cause circular-import issues if module order is wrong.**
  - Mitigation: T2 implementer dispatches AFTER T3 (enrollment exists first), OR uses `from idun_agent_schema.standalone.enrollment import StandaloneEnrollmentInfo` inside the function body / via TYPE_CHECKING. Plan §Task 4 in writing-plans output will pin the order T1 → T3 → T2.
- **Test count grows beyond the ~70 estimate, slowing the SDD review loop.**
  - Mitigation: per-module test budget (3–5 tests). Implementer subagent rejected if it ships 10+ tests for a single resource without explicit need.

## 10. Test gates this phase satisfies

From the rework spec §"Future implementation test gates" (cross-mapped in patterns doc §13.3):

- **Schema validation tests** (per resource) — partial. Phase 2 covers schema-shape validation (round-trip, case convention, validators). Assembled-EngineConfig validation (round 2 of the 3-round pipeline) is Phase 5+.

No other test gates are owned by Phase 2; subsequent phases own the rest.

## 11. Next step after approval

Once this doc is approved by the user:

1. Commit it as `docs(rework-phase2): add Phase 2 design doc`.
2. Invoke `superpowers:writing-plans` to produce a task-by-task plan at `docs/superpowers/plans/2026-04-27-rework-phase2.md`. Plan tasks follow §7's commit order.
3. Execute the plan via `superpowers:subagent-driven-development` (T1 → T3 → T2 → T4 dispatch order to handle the `runtime_status.py` ↔ `enrollment.py` import dependency).
