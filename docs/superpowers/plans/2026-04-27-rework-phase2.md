# Phase 2 — Schema Namespace Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `idun_agent_schema.standalone` namespace by adding 10 schema modules (5 collection resources, 3 operational/diagnostic, 2 config+enrollment) plus inclusive schema unit tests for all 14 standalone schema modules, and flip the relevant FORWARD sections of the patterns doc to ESTABLISHED.

**Architecture:** Sequential SDD tasks. Schema-only — no SQLAlchemy, no FastAPI, no behavior change. Dispatch order is T1 → T3 → T2 → T4a → T4b so `runtime_status.py` can import `StandaloneEnrollmentInfo` from a committed `enrollment.py` without TYPE_CHECKING tricks.

**Tech Stack:** Python 3.12, Pydantic 2.11+, pytest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-27-rework-phase2-schemas-design.md`
**Patterns reference:** `docs/superpowers/specs/2026-04-27-rework-patterns.md`
**Rework spec:** `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md`

**Working branch:** `feat/rework-phase2-schemas` (off `feat/standalone-admin-db-rework`).
**PR target:** `feat/standalone-admin-db-rework`.

**Commit sequence (target):**
1. `52e2ad15 docs(rework-phase2): add Phase 2 design doc` — already landed (pre-plan).
2. `docs(rework-phase2): add Phase 2 plan` — Task 0 produces this.
3. `feat(rework-phase2): collection resource schemas` — Task 1 (T1).
4. `feat(rework-phase2): config and enrollment schemas` — Task 2 (T3, lands before T2 for import order).
5. `feat(rework-phase2): operational and diagnostic schemas` — Task 3 (T2).
6. `test(rework-phase2): standalone schema namespace tests` — Task 4 (T4a; also updates `__init__.py` barrel).
7. `docs(rework-phase2): patterns reference — flip FORWARD sections to ESTABLISHED` — Task 5 (T4b).

---

## Task 0: Pre-flight

**Files:** none (verification only).

- [ ] **Step 1: Verify the working branch and tip**

Run:
```bash
git status -sb && git log --oneline -1
```
Expected: `## feat/rework-phase2-schemas` and tip is `52e2ad15 docs(rework-phase2): add Phase 2 design doc`.

- [ ] **Step 2: Verify the umbrella tip is the merged Phase 1**

Run:
```bash
git log --oneline -2 feat/standalone-admin-db-rework
```
Expected: tip is `f4bd5fde Phase 1 — Foundation audit & patterns doc (#521)` (or a later commit if other phases have already merged into the umbrella).

- [ ] **Step 3: Verify the narrowed CI baseline is green**

Run:
```bash
make lint
```
Expected: exit 0.

```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected: `Success: no issues found in 28 source files`.

```bash
uv run pytest libs/idun_agent_schema -q
```
Expected: no tests yet (empty output) — Task 4 creates them.

```bash
uv run pytest libs/idun_agent_standalone -q \
  -m "not requires_postgres and not requires_langfuse and not requires_phoenix" \
  --ignore=libs/idun_agent_standalone/tests/unit/test_admin_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_reload.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_scaffold.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_cli.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_app_health.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_integrations_casing.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_structural_change_restart.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_auth_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_atomic.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_engine_reload_reattaches_observer.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_flow.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_bootstrap_hash.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_config_io.py
```
Expected: 64 passed (the Phase 1 close-state baseline; Phase 2 must not regress this).

If anything fails: STOP. The branch is in an unexpected state; investigate before proceeding.

- [ ] **Step 4: Commit this plan**

```bash
git add docs/superpowers/plans/2026-04-27-rework-phase2.md
git commit -m "$(cat <<'EOF'
docs(rework-phase2): add Phase 2 plan

Task-by-task implementation plan for Phase 2 of the standalone admin/db
rework. Five SDD-orchestrated tasks (collection schemas, config + enrollment,
ops + diagnostic, namespace tests + barrel, patterns doc update) plus
pre-flight, CI gate, and PR. Dispatch order T1 -> T3 -> T2 -> T4a -> T4b
satisfies the runtime_status.py -> enrollment.py import dependency without
TYPE_CHECKING tricks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit, branch tip moves forward by one.

---

## Task 1: Collection resource schemas (T1)

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/guardrails.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/observability.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/integrations.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/prompts.py`

**Subagent dispatch model:** standard (collection resources are well-spec'd but require care with the prompts versioning special case).

- [ ] **Step 1: Read the manager-shape sources the implementer will wrap**

Read these files in full to understand the wrapped types' shape:

- `libs/idun_agent_schema/src/idun_agent_schema/manager/guardrail_configs.py` — defines `ManagerGuardrailConfig` (the union over `SimpleBanListConfig`, `SimplePIIConfig`, etc.) and the `convert_guardrail()` function.
- `libs/idun_agent_schema/src/idun_agent_schema/engine/mcp_server.py` — defines `MCPServer` (manager uses engine shape directly).
- `libs/idun_agent_schema/src/idun_agent_schema/engine/observability_v2.py` — defines `ObservabilityConfig` (manager uses engine shape directly).
- `libs/idun_agent_schema/src/idun_agent_schema/engine/integrations/base.py` — defines `IntegrationConfig` (manager uses engine shape directly).
- `libs/idun_agent_schema/src/idun_agent_schema/manager/managed_prompt.py` — defines `ManagedPromptCreate`, `ManagedPromptRead`, `ManagedPromptPatch` (versioned, append-only).

This step is read-only context-gathering. No file changes.

- [ ] **Step 2: Create `guardrails.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/guardrails.py`:

```python
"""Standalone guardrail admin contracts.

Guardrails are a collection in standalone (one row per attached guard).
Routes use {id} for canonical lookup. The stored shape is manager-shape
(``ManagerGuardrailConfig``), and the manager's ``convert_guardrail`` is
reused at assembly time to translate to the engine guardrail shape.

The standalone row folds the manager M:N junction columns (``position``,
``sort_order``) into the row-level shape because standalone has one
agent and no junction tables.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.manager.guardrail_configs import ManagerGuardrailConfig

from ._base import _CamelModel


class StandaloneGuardrailRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    position: Literal["input", "output"]
    sort_order: int
    guardrail: ManagerGuardrailConfig
    created_at: datetime
    updated_at: datetime


class StandaloneGuardrailCreate(_CamelModel):
    """Body for POST /admin/api/v1/guardrails."""

    name: str
    enabled: bool = True
    position: Literal["input", "output"]
    sort_order: int = 0
    guardrail: ManagerGuardrailConfig


class StandaloneGuardrailPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/guardrails/{id}.

    All fields are optional; absence means no change. Sending null on
    ``name`` is rejected (clearing the row name is meaningless).
    """

    name: str | None = None
    enabled: bool | None = None
    position: Literal["input", "output"] | None = None
    sort_order: int | None = None
    guardrail: ManagerGuardrailConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
```

- [ ] **Step 3: Create `mcp_servers.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py`:

```python
"""Standalone MCP server admin contracts.

MCP servers are a collection in standalone. The manager uses the engine
``MCPServer`` shape directly, so no conversion is needed at assembly.

The standalone row's ``enabled`` flag replaces the manager's M:N junction
table for one-agent deployments.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.mcp_server import MCPServer

from ._base import _CamelModel


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

- [ ] **Step 4: Create `observability.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/observability.py`:

```python
"""Standalone observability admin contracts.

Observability providers are a collection in standalone. The manager uses
the engine ``ObservabilityConfig`` (V2) shape directly, so no conversion
is needed at assembly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.observability_v2 import ObservabilityConfig

from ._base import _CamelModel


class StandaloneObservabilityRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    observability: ObservabilityConfig
    created_at: datetime
    updated_at: datetime


class StandaloneObservabilityCreate(_CamelModel):
    """Body for POST /admin/api/v1/observability."""

    name: str
    enabled: bool = True
    observability: ObservabilityConfig


class StandaloneObservabilityPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/observability/{id}."""

    name: str | None = None
    enabled: bool | None = None
    observability: ObservabilityConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
```

- [ ] **Step 5: Create `integrations.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/integrations.py`:

```python
"""Standalone integration admin contracts.

Integrations are a collection in standalone. The manager uses the engine
``IntegrationConfig`` shape directly, so no conversion is needed at
assembly. The standalone row's ``enabled`` is the single source of
truth; the inner ``IntegrationConfig.enabled`` is overwritten at
assembly time (Phase 4+ enforces this; the schema does not).
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.integrations.base import IntegrationConfig

from ._base import _CamelModel


class StandaloneIntegrationRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    integration: IntegrationConfig
    created_at: datetime
    updated_at: datetime


class StandaloneIntegrationCreate(_CamelModel):
    """Body for POST /admin/api/v1/integrations."""

    name: str
    enabled: bool = True
    integration: IntegrationConfig


class StandaloneIntegrationPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/integrations/{id}."""

    name: str | None = None
    enabled: bool | None = None
    integration: IntegrationConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
```

- [ ] **Step 6: Create `prompts.py`**

Versioning is the special case. **No `slug`, no `enabled`.** PATCH only accepts `tags`. Content patches create a new version at the DB layer (Phase 4+ enforces this; the schema rejects content on PATCH by not declaring a `content` field).

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/prompts.py`:

```python
"""Standalone prompt admin contracts.

Prompts are a collection with append-only versioning, mirroring
``idun_agent_schema.manager.managed_prompt``. There is **no slug** and
**no enabled** — every prompt version is part of the active config.

PATCH only accepts ``tags``. Content changes create a new version,
which is enforced at the DB / router layer in Phase 4+. The
``StandalonePromptPatch`` shape simply does not declare ``content`` so
client attempts to PATCH content fail at request validation (round 1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ._base import _CamelModel


class StandalonePromptRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_id: str
    version: int
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class StandalonePromptCreate(_CamelModel):
    """Body for POST /admin/api/v1/prompts.

    Creating a prompt with an existing ``prompt_id`` creates a new
    version at the DB layer (Phase 4+); the schema does not enforce
    uniqueness.
    """

    prompt_id: str
    content: str
    tags: list[str] = Field(default_factory=list)


class StandalonePromptPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/prompts/{id}.

    Only ``tags`` is patchable. Sending null on ``tags`` is rejected
    (clearing tags means an empty list, not null). Content changes are
    not accepted on PATCH — clients POST a new version instead.
    """

    tags: list[str] | None = None

    @model_validator(mode="after")
    def _no_null_tags(self) -> Self:
        if "tags" in self.model_fields_set and self.tags is None:
            raise ValueError("tags cannot be null; send [] for empty")
        return self
```

- [ ] **Step 7: Run mypy on the 5 new modules**

Run:
```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/guardrails.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/observability.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/integrations.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/prompts.py
```
Expected: `Success: no issues found in 5 source files`.

If errors appear, fix them before commit. Common pitfalls:
- Missing import — add to the import block.
- `model_validator(mode="after")` requires `Self` import from `typing`.
- `Literal["input", "output"]` requires `Literal` from `typing`.

- [ ] **Step 8: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/guardrails.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/observability.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/integrations.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/prompts.py
git commit -m "$(cat <<'EOF'
feat(rework-phase2): collection resource schemas

Adds the five collection resource contracts to
idun_agent_schema.standalone per Phase 2 design doc §4.1:

- guardrails.py wraps ManagerGuardrailConfig with row-level position +
  sort_order (folded from the manager M:N junction).
- mcp_servers.py wraps the engine MCPServer shape (manager uses engine
  shape directly).
- observability.py wraps engine ObservabilityConfig V2.
- integrations.py wraps engine IntegrationConfig.
- prompts.py mirrors manager managed_prompt with append-only versioning;
  no slug, no enabled, PATCH only accepts tags (content patches create
  a new version at the DB layer in Phase 4+).

All five Read variants set from_attributes=True so they project from
SQLAlchemy rows directly. PATCH variants reject explicit-null on the
non-nullable name (and tags for prompts) to mirror the agent schema's
_no_null_name validator at agent.py:57-61.

The barrel re-export and schema unit tests land in Task 4 (T4); Task 2
adds config+enrollment next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit on the working branch.

---

## Task 2: Config + enrollment schemas (T3)

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/config.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/enrollment.py`

T3 lands before T2 because `runtime_status.py` (T2) imports `StandaloneEnrollmentInfo` from `enrollment.py`.

**Subagent dispatch model:** cheap (small modules, well-spec'd, no nested types).

- [ ] **Step 1: Create `enrollment.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/enrollment.py`:

```python
"""Standalone enrollment admin contracts.

Enrollment is the placeholder for future Governance Hub integration.
The DB tables and runtime behavior are deferred (spec §"Enrollment");
this module only defines the schema vocabulary so ``runtime_status``
and future enrollment routes can reference stable types.

MVP always reports ``mode = local`` and ``status = not_enrolled``.
"""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from ._base import _CamelModel


class StandaloneEnrollmentMode(StrEnum):
    """Top-level enrollment posture."""

    LOCAL = "local"
    ENROLLED = "enrolled"
    MANAGED = "managed"


class StandaloneEnrollmentStatus(StrEnum):
    """Connection state to Governance Hub when enrolled."""

    NOT_ENROLLED = "not_enrolled"
    PENDING = "pending"
    CONNECTED = "connected"
    ERROR = "error"


class StandaloneEnrollmentInfo(_CamelModel):
    """Enrollment payload returned in runtime status."""

    mode: StandaloneEnrollmentMode = StandaloneEnrollmentMode.LOCAL
    status: StandaloneEnrollmentStatus = StandaloneEnrollmentStatus.NOT_ENROLLED
    manager_url: str | None = None
    workspace_id: UUID | None = None
    managed_agent_id: UUID | None = None
    config_revision: int | None = None
```

- [ ] **Step 2: Create `config.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/config.py`:

```python
"""Standalone materialized config admin contract.

``GET /admin/api/v1/config/materialized`` returns the assembled
``EngineConfig`` plus the JCS sha256 hash that aligns with
``StandaloneRuntimeStatus.config.hash``. The YAML export at
``GET /admin/api/v1/config/export`` is content-negotiated as
``text/yaml`` and does not need a Pydantic model — the body is the
``EngineConfig`` dumped to YAML directly.
"""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig

from ._base import _CamelModel


class StandaloneMaterializedConfig(_CamelModel):
    """Body of GET /admin/api/v1/config/materialized."""

    config: EngineConfig
    hash: str
```

- [ ] **Step 3: Run mypy on the 2 new modules**

Run:
```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/config.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/enrollment.py
```
Expected: `Success: no issues found in 2 source files`.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/config.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/enrollment.py
git commit -m "$(cat <<'EOF'
feat(rework-phase2): config and enrollment schemas

Adds:

- enrollment.py — three placeholder types per spec §"Enrollment":
  StandaloneEnrollmentMode (local/enrolled/managed),
  StandaloneEnrollmentStatus (not_enrolled/pending/connected/error),
  StandaloneEnrollmentInfo (mode, status, manager_url, workspace_id,
  managed_agent_id, config_revision). MVP always reports mode=local
  and status=not_enrolled; the runtime DB tables are deferred to a
  later phase.

- config.py — StandaloneMaterializedConfig wraps EngineConfig + the JCS
  sha256 hash, returned by GET /admin/api/v1/config/materialized. The
  YAML export at GET /admin/api/v1/config/export is content-negotiated
  text/yaml and needs no Pydantic model.

Lands before the operational + diagnostic schemas (T2) so
runtime_status.py can import StandaloneEnrollmentInfo from a committed
enrollment.py.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit on the working branch.

---

## Task 3: Operational + diagnostic schemas (T2)

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/operational.py`
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/diagnostics.py`

**Subagent dispatch model:** standard (`runtime_status.py` has many nested types; the implementer must hold the whole shape in mind).

- [ ] **Step 1: Read `idun_agent_schema/manager/managed_agent.py` for `AgentStatus`**

`runtime_status.py` imports `AgentStatus`. Read the manager module to confirm the enum's values match the spec (`draft`, `active`, `inactive`, `deprecated`, `error`).

- [ ] **Step 2: Create `runtime_status.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py`:

```python
"""Standalone runtime status admin contract.

Body of GET /admin/api/v1/runtime/status. Provides operational
evidence the admin UI and operators need to understand what the
process is doing right now: which agent is loaded, what the engine
capabilities are, the last reload outcome, and the current MCP /
observability / enrollment posture.

Top-level ``status`` is the cold-start state machine
(not_configured / initializing / running / error). Nested fields are
all nullable so an early-boot or error-state response can omit
sections that aren't ready yet.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from idun_agent_schema.manager.managed_agent import AgentStatus

from ._base import _CamelModel
from .enrollment import StandaloneEnrollmentInfo
from .reload import StandaloneReloadStatus


class StandaloneRuntimeStatusKind(StrEnum):
    """Top-level cold-start state."""

    NOT_CONFIGURED = "not_configured"
    INITIALIZING = "initializing"
    RUNNING = "running"
    ERROR = "error"


class StandaloneRuntimeAgent(_CamelModel):
    """Agent identity slice of the runtime status payload."""

    id: UUID | None = None
    name: str | None = None
    framework: str | None = None
    version: str | None = None
    lifecycle_status: AgentStatus | None = None


class StandaloneRuntimeConfigInfo(_CamelModel):
    """Active config identity (hash + last-applied timestamp)."""

    hash: str | None = None
    last_applied_at: datetime | None = None


class StandaloneEngineCapabilities(_CamelModel):
    """Capability flags surfaced by the engine adapter."""

    streaming: bool
    history: bool
    thread_id: bool


class StandaloneRuntimeEngine(_CamelModel):
    """Engine slice of the runtime status payload."""

    capabilities: StandaloneEngineCapabilities


class StandaloneRuntimeReload(_CamelModel):
    """Last reload outcome."""

    last_status: StandaloneReloadStatus | None = None
    last_message: str | None = None
    last_error: str | None = None
    last_reloaded_at: datetime | None = None


class StandaloneRuntimeMCP(_CamelModel):
    """MCP servers slice of the runtime status payload."""

    configured: int
    enabled: int
    failed: list[str]


class StandaloneRuntimeObservability(_CamelModel):
    """Observability providers slice of the runtime status payload."""

    configured: int
    enabled: int


class StandaloneRuntimeStatus(_CamelModel):
    """Top-level runtime status payload."""

    status: StandaloneRuntimeStatusKind
    agent: StandaloneRuntimeAgent | None = None
    config: StandaloneRuntimeConfigInfo | None = None
    engine: StandaloneRuntimeEngine | None = None
    reload: StandaloneRuntimeReload | None = None
    mcp: StandaloneRuntimeMCP
    observability: StandaloneRuntimeObservability
    enrollment: StandaloneEnrollmentInfo
    updated_at: datetime
```

- [ ] **Step 3: Create `operational.py`**

This is the docstring-only placeholder per Phase 2 design doc §4.2 / Q3 of brainstorm. **Do NOT add types yet.**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/operational.py`:

```python
"""Reserved for operational schemas.

Pending audit-log implementation in a later version of the standalone
admin/db rework. The standalone error envelope already covers
rate-limit responses via ``StandaloneAdminError`` with
``code = rate_limited`` (see ``errors.py``). When audit ships, this
module will define structured audit event types per spec
§"Operational hardening".

This module intentionally has no public types so its import path is
reserved without locking content.
"""

from __future__ import annotations

# No public types yet. See module docstring.
```

- [ ] **Step 4: Create `diagnostics.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/diagnostics.py`:

```python
"""Standalone diagnostics admin contracts.

Connection-check responses and the readyz probe response. Connection
checks are MVP scope per the rework spec — the admin UI uses them to
validate provider reachability before saving a config.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from ._base import _CamelModel


class StandaloneConnectionCheck(_CamelModel):
    """Body of POST /admin/api/v1/<resource>/check-connection.

    ``ok = True`` means the provider responded as expected. ``details``
    carries provider-specific information (e.g. tool list for an MCP
    server). ``error`` is set only when ``ok = False``.
    """

    ok: bool
    details: dict[str, Any] | None = None
    error: str | None = None


class StandaloneReadyzCheckStatus(StrEnum):
    """Per-check readiness state in a readyz response."""

    OK = "ok"
    FAIL = "fail"


class StandaloneReadyzStatus(StrEnum):
    """Overall readiness state."""

    READY = "ready"
    NOT_READY = "not_ready"


class StandaloneReadyzResponse(_CamelModel):
    """Body of GET /admin/api/v1/readyz."""

    status: StandaloneReadyzStatus
    checks: dict[str, StandaloneReadyzCheckStatus]
```

- [ ] **Step 5: Run mypy on the 3 new modules**

Run:
```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/operational.py \
  libs/idun_agent_schema/src/idun_agent_schema/standalone/diagnostics.py
```
Expected: `Success: no issues found in 3 source files`.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/operational.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/diagnostics.py
git commit -m "$(cat <<'EOF'
feat(rework-phase2): operational and diagnostic schemas

Adds:

- runtime_status.py — eight types for GET /admin/api/v1/runtime/status:
  StandaloneRuntimeStatusKind (cold-start state enum), StandaloneRuntimeAgent,
  StandaloneRuntimeConfigInfo, StandaloneEngineCapabilities,
  StandaloneRuntimeEngine, StandaloneRuntimeReload, StandaloneRuntimeMCP,
  StandaloneRuntimeObservability, plus the top-level StandaloneRuntimeStatus
  composing them. Imports StandaloneEnrollmentInfo (Task 2) and
  StandaloneReloadStatus (Phase 1).

- operational.py — docstring-only placeholder. Reserved for audit event
  types when audit logs ship; the rate_limited error code lives on
  StandaloneAdminError already.

- diagnostics.py — StandaloneConnectionCheck (ok/details/error) shared by
  the three MVP connection-check endpoints, plus StandaloneReadyzResponse
  with check-status enum.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit on the working branch.

---

## Task 4: Barrel update + namespace tests (T4a)

**Files:**
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`
- Create: `libs/idun_agent_schema/tests/__init__.py`
- Create: `libs/idun_agent_schema/tests/standalone/__init__.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_namespace.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_common.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_errors.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_reload.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_agent.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_memory.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_guardrails.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_mcp_servers.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_observability.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_integrations.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_prompts.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_runtime_status.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_diagnostics.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_config.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_enrollment.py`

**Subagent dispatch model:** standard (large surface area but each test file is small and follows a fixed template).

This is the largest task. It has three logical parts:
- Part A: barrel update.
- Part B: cross-cutting `test_namespace.py`.
- Part C: per-module tests (14 files).

All parts ship in one commit so the patterns doc update in Task 5 references a single Phase 2 close state.

### 4.1 Barrel update

- [ ] **Step 1: Update `__init__.py`**

Write to `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`:

```python
"""Standalone admin API contracts."""

from .agent import (  # noqa: F401
    StandaloneAgentPatch,
    StandaloneAgentRead,
)
from .common import (  # noqa: F401
    StandaloneDeleteResult,
    StandaloneMutationResponse,
    StandaloneResourceIdentity,
    StandaloneSingletonDeleteResult,
)
from .config import (  # noqa: F401
    StandaloneMaterializedConfig,
)
from .diagnostics import (  # noqa: F401
    StandaloneConnectionCheck,
    StandaloneReadyzCheckStatus,
    StandaloneReadyzResponse,
    StandaloneReadyzStatus,
)
from .enrollment import (  # noqa: F401
    StandaloneEnrollmentInfo,
    StandaloneEnrollmentMode,
    StandaloneEnrollmentStatus,
)
from .errors import (  # noqa: F401
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)
from .guardrails import (  # noqa: F401
    StandaloneGuardrailCreate,
    StandaloneGuardrailPatch,
    StandaloneGuardrailRead,
)
from .integrations import (  # noqa: F401
    StandaloneIntegrationCreate,
    StandaloneIntegrationPatch,
    StandaloneIntegrationRead,
)
from .mcp_servers import (  # noqa: F401
    StandaloneMCPServerCreate,
    StandaloneMCPServerPatch,
    StandaloneMCPServerRead,
)
from .memory import (  # noqa: F401
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
)
from .observability import (  # noqa: F401
    StandaloneObservabilityCreate,
    StandaloneObservabilityPatch,
    StandaloneObservabilityRead,
)
from .prompts import (  # noqa: F401
    StandalonePromptCreate,
    StandalonePromptPatch,
    StandalonePromptRead,
)
from .reload import (  # noqa: F401
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from .runtime_status import (  # noqa: F401
    StandaloneEngineCapabilities,
    StandaloneRuntimeAgent,
    StandaloneRuntimeConfigInfo,
    StandaloneRuntimeEngine,
    StandaloneRuntimeMCP,
    StandaloneRuntimeObservability,
    StandaloneRuntimeReload,
    StandaloneRuntimeStatus,
    StandaloneRuntimeStatusKind,
)
```

`operational.py` has no exports.

### 4.2 Test directory + cross-cutting test

- [ ] **Step 2: Create `tests/__init__.py`**

Write to `libs/idun_agent_schema/tests/__init__.py`:

```python
"""Tests for idun_agent_schema."""
```

- [ ] **Step 3: Create `tests/standalone/__init__.py`**

Write to `libs/idun_agent_schema/tests/standalone/__init__.py`:

```python
"""Tests for the idun_agent_schema.standalone namespace."""
```

- [ ] **Step 4: Create `test_namespace.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_namespace.py`:

```python
"""Cross-cutting tests for the standalone namespace surface."""

from __future__ import annotations

import enum
import inspect

from pydantic import BaseModel
from pydantic.alias_generators import to_camel

from idun_agent_schema import standalone
from idun_agent_schema.standalone._base import _CamelModel


def test_every_public_type_is_camel_model_or_strenum() -> None:
    """Every name re-exported from the standalone barrel must be a
    _CamelModel subclass, a StrEnum, or an explicitly allow-listed
    helper. Catches new modules that forget to inherit _CamelModel."""

    allowed_helpers: set[str] = set()  # extend if helpers are added later

    public_names = [
        name for name in dir(standalone) if not name.startswith("_")
    ]

    for name in public_names:
        if name in allowed_helpers:
            continue
        obj = getattr(standalone, name)
        if not inspect.isclass(obj):
            continue
        is_camel = issubclass(obj, _CamelModel) and obj is not _CamelModel
        is_strenum = issubclass(obj, enum.StrEnum)
        assert is_camel or is_strenum, (
            f"{name} must inherit _CamelModel or StrEnum; "
            f"got bases {[b.__name__ for b in obj.__bases__]}"
        )


def test_camel_model_round_trips_with_alias_and_field_name() -> None:
    """The shared _CamelModel base must accept both camelCase and
    snake_case keys on input, and emit camelCase on dump(by_alias=True)."""

    class _Sample(_CamelModel):
        first_name: str
        retry_count: int

    via_camel = _Sample.model_validate({"firstName": "ada", "retryCount": 3})
    via_snake = _Sample.model_validate({"first_name": "ada", "retry_count": 3})
    assert via_camel == via_snake

    dumped = via_camel.model_dump(by_alias=True)
    assert dumped == {"firstName": "ada", "retryCount": 3}


def test_envelope_round_trips_with_generic_payload() -> None:
    """StandaloneMutationResponse[StandaloneAgentRead] round-trips
    correctly with camelCase outbound and a nested reload field."""

    from datetime import datetime, timezone
    from uuid import uuid4

    from idun_agent_schema.engine.engine import EngineConfig
    from idun_agent_schema.manager.managed_agent import AgentStatus
    from idun_agent_schema.standalone import (
        StandaloneAgentRead,
        StandaloneMutationResponse,
        StandaloneReloadResult,
        StandaloneReloadStatus,
    )

    engine_config = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )
    agent = StandaloneAgentRead(
        id=uuid4(),
        slug="ada",
        name="Ada",
        description=None,
        version="1.0.0",
        status=AgentStatus.ACTIVE,
        base_url=None,
        base_engine_config=engine_config,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    reload = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
    )
    envelope = StandaloneMutationResponse[StandaloneAgentRead](
        data=agent, reload=reload
    )

    dumped = envelope.model_dump(by_alias=True, mode="json")
    parsed = StandaloneMutationResponse[StandaloneAgentRead].model_validate(
        dumped
    )
    assert parsed.data.id == agent.id
    assert parsed.reload.status == StandaloneReloadStatus.RELOADED
    assert "data" in dumped and "reload" in dumped


def test_camel_alias_generator_is_idempotent() -> None:
    """Sanity-check that to_camel produces stable camelCase from the
    snake_case fields used across standalone schemas."""

    assert to_camel("agent_framework") == "agentFramework"
    assert to_camel("last_reloaded_at") == "lastReloadedAt"
    assert to_camel("name") == "name"
```

### 4.3 Per-module tests

The following 13 test files share a common pattern. Each implements three test categories at minimum:

- `test_<module>_round_trip` — parse a sample payload (mixing camelCase + snake_case keys), `dump(by_alias=True, mode="json")`, reparse, equality.
- `test_<module>_camel_case_outbound` — assert `dump(by_alias=True)` keys match expected camelCase forms.
- `test_<module>_snake_case_inbound` — assert `model_validate({"snake_case_field": ...})` parses.

Plus module-specific tests where validators or special semantics apply.

- [ ] **Step 5: Create `test_common.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_common.py`:

```python
"""Tests for idun_agent_schema.standalone.common."""

from __future__ import annotations

from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneDeleteResult,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
    StandaloneResourceIdentity,
    StandaloneSingletonDeleteResult,
)


def test_resource_identity_round_trip() -> None:
    rid = uuid4()
    parsed = StandaloneResourceIdentity.model_validate(
        {"id": str(rid), "slug": "ada", "name": "Ada"}
    )
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneResourceIdentity.model_validate(dumped)
    assert reparsed == parsed
    assert dumped["id"] == str(rid)


def test_delete_result_round_trip() -> None:
    rid = uuid4()
    parsed = StandaloneDeleteResult.model_validate(
        {"id": str(rid), "deleted": True}
    )
    dumped = parsed.model_dump(by_alias=True, mode="json")
    assert dumped == {"id": str(rid), "deleted": True}


def test_singleton_delete_result_round_trip() -> None:
    parsed = StandaloneSingletonDeleteResult.model_validate({"deleted": True})
    dumped = parsed.model_dump(by_alias=True)
    assert dumped == {"deleted": True}


def test_mutation_response_wraps_delete_result() -> None:
    rid = uuid4()
    envelope = StandaloneMutationResponse[StandaloneDeleteResult](
        data=StandaloneDeleteResult(id=rid),
        reload=StandaloneReloadResult(
            status=StandaloneReloadStatus.RELOADED,
            message="Removed and reloaded",
        ),
    )
    dumped = envelope.model_dump(by_alias=True, mode="json")
    assert dumped["data"]["deleted"] is True
    assert dumped["reload"]["status"] == "reloaded"
```

- [ ] **Step 6: Create `test_errors.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_errors.py`:

```python
"""Tests for idun_agent_schema.standalone.errors."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)


def test_error_code_includes_phase1_codes() -> None:
    """All ten codes locked in the rework spec must exist."""

    expected = {
        "bad_request",
        "validation_failed",
        "not_found",
        "conflict",
        "reload_failed",
        "auth_required",
        "forbidden",
        "unsupported_mode",
        "rate_limited",
        "internal_error",
    }
    actual = {member.value for member in StandaloneErrorCode}
    assert actual == expected


def test_field_error_round_trip() -> None:
    err = StandaloneFieldError(
        field="agent.config.name", message="required", code="missing"
    )
    dumped = err.model_dump(by_alias=True)
    assert dumped == {
        "field": "agent.config.name",
        "message": "required",
        "code": "missing",
    }
    assert StandaloneFieldError.model_validate(dumped) == err


def test_admin_error_round_trip_with_field_errors() -> None:
    err = StandaloneAdminError(
        code=StandaloneErrorCode.VALIDATION_FAILED,
        message="Body failed validation.",
        field_errors=[
            StandaloneFieldError(field="name", message="required", code="missing"),
        ],
    )
    dumped = err.model_dump(by_alias=True, exclude_none=True)
    assert dumped["code"] == "validation_failed"
    assert dumped["fieldErrors"][0]["field"] == "name"
    assert StandaloneAdminError.model_validate(dumped) == err


def test_admin_error_camel_case_outbound() -> None:
    err = StandaloneAdminError(
        code=StandaloneErrorCode.RATE_LIMITED,
        message="Too many login attempts.",
        details={"retry_after_seconds": 30},
    )
    dumped = err.model_dump(by_alias=True, exclude_none=True)
    assert "fieldErrors" not in dumped
    assert dumped["details"] == {"retry_after_seconds": 30}
```

- [ ] **Step 7: Create `test_reload.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_reload.py`:

```python
"""Tests for idun_agent_schema.standalone.reload."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneReloadResult,
    StandaloneReloadStatus,
)


def test_reload_status_values() -> None:
    expected = {"reloaded", "restart_required", "reload_failed"}
    actual = {member.value for member in StandaloneReloadStatus}
    assert actual == expected


def test_reload_result_round_trip_success() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved and reloaded",
    )
    dumped = result.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"status": "reloaded", "message": "Saved and reloaded"}
    assert StandaloneReloadResult.model_validate(dumped) == result


def test_reload_result_round_trip_restart_required() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RESTART_REQUIRED,
        message="Saved. Restart required to apply.",
    )
    dumped = result.model_dump(by_alias=True, exclude_none=True)
    assert dumped["status"] == "restart_required"


def test_reload_result_round_trip_failure() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Engine reload failed; config not saved.",
        error="ImportError: graph module not found",
    )
    dumped = result.model_dump(by_alias=True)
    assert dumped["error"] == "ImportError: graph module not found"
    assert StandaloneReloadResult.model_validate(dumped) == result
```

- [ ] **Step 8: Create `test_agent.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_agent.py`:

```python
"""Tests for idun_agent_schema.standalone.agent."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.manager.managed_agent import AgentStatus
from idun_agent_schema.standalone import (
    StandaloneAgentPatch,
    StandaloneAgentRead,
)


def _sample_engine_config() -> EngineConfig:
    return EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )


def test_agent_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ada",
        "name": "Ada",
        "description": "Research helper",
        "version": "1.0.0",
        "status": "active",
        "baseUrl": "https://localhost:8000",
        "baseEngineConfig": _sample_engine_config().model_dump(mode="json"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneAgentRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneAgentRead.model_validate(dumped)
    assert reparsed.id == rid
    assert reparsed.status == AgentStatus.ACTIVE
    assert "baseUrl" in dumped
    assert "createdAt" in dumped


def test_agent_read_snake_case_inbound() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ada",
        "name": "Ada",
        "status": "active",
        "base_url": None,
        "base_engine_config": _sample_engine_config().model_dump(mode="json"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneAgentRead.model_validate(payload)
    assert parsed.id == rid


def test_agent_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneAgentPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_agent_patch_omitted_name_accepts() -> None:
    patch = StandaloneAgentPatch.model_validate({"description": "new"})
    assert patch.name is None
    assert patch.description == "new"


def test_agent_patch_explicit_string_name_accepts() -> None:
    patch = StandaloneAgentPatch.model_validate({"name": "Renamed"})
    assert patch.name == "Renamed"
```

- [ ] **Step 9: Create `test_memory.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_memory.py`:

```python
"""Tests for idun_agent_schema.standalone.memory."""

from __future__ import annotations

from datetime import datetime, timezone

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.standalone import (
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
)


def test_memory_read_round_trip_langgraph() -> None:
    payload = {
        "agentFramework": "LANGGRAPH",
        "memory": {"type": "memory"},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneMemoryRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneMemoryRead.model_validate(dumped)
    assert reparsed.agent_framework == AgentFramework.LANGGRAPH
    assert "agentFramework" in dumped
    assert "updatedAt" in dumped


def test_memory_read_snake_case_inbound() -> None:
    payload = {
        "agent_framework": "LANGGRAPH",
        "memory": {"type": "memory"},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneMemoryRead.model_validate(payload)
    assert parsed.agent_framework == AgentFramework.LANGGRAPH


def test_memory_patch_accepts_partial() -> None:
    patch = StandaloneMemoryPatch.model_validate({"agentFramework": "ADK"})
    assert patch.agent_framework == AgentFramework.ADK
    assert patch.memory is None


def test_memory_patch_accepts_empty() -> None:
    patch = StandaloneMemoryPatch.model_validate({})
    assert patch.agent_framework is None
    assert patch.memory is None
```

- [ ] **Step 10: Create `test_guardrails.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_guardrails.py`:

```python
"""Tests for idun_agent_schema.standalone.guardrails."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneGuardrailCreate,
    StandaloneGuardrailPatch,
    StandaloneGuardrailRead,
)


def _sample_manager_guardrail() -> dict:
    """Manager-shape SimpleBanListConfig payload."""

    return {
        "type": "ban_list",
        "ban_list": ["badword"],
    }


def test_guardrail_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ban-secrets",
        "name": "Ban secrets",
        "enabled": True,
        "position": "input",
        "sortOrder": 0,
        "guardrail": _sample_manager_guardrail(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneGuardrailRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneGuardrailRead.model_validate(dumped)
    assert reparsed == parsed
    assert "sortOrder" in dumped
    assert "createdAt" in dumped


def test_guardrail_create_default_enabled_true() -> None:
    payload = {
        "name": "Ban secrets",
        "position": "input",
        "guardrail": _sample_manager_guardrail(),
    }
    parsed = StandaloneGuardrailCreate.model_validate(payload)
    assert parsed.enabled is True
    assert parsed.sort_order == 0


def test_guardrail_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneGuardrailPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_guardrail_patch_position_invalid_value() -> None:
    with pytest.raises(ValidationError):
        StandaloneGuardrailPatch.model_validate({"position": "middle"})
```

- [ ] **Step 11: Create `test_mcp_servers.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_mcp_servers.py`:

```python
"""Tests for idun_agent_schema.standalone.mcp_servers."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneMCPServerCreate,
    StandaloneMCPServerPatch,
    StandaloneMCPServerRead,
)


def _sample_mcp_server() -> dict:
    return {
        "transport": "stdio",
        "command": "python",
        "args": ["server.py"],
    }


def test_mcp_server_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "github-tools",
        "name": "GitHub Tools",
        "enabled": True,
        "mcpServer": _sample_mcp_server(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneMCPServerRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneMCPServerRead.model_validate(dumped)
    assert reparsed == parsed
    assert "mcpServer" in dumped


def test_mcp_server_create_default_enabled_true() -> None:
    payload = {"name": "GitHub Tools", "mcpServer": _sample_mcp_server()}
    parsed = StandaloneMCPServerCreate.model_validate(payload)
    assert parsed.enabled is True


def test_mcp_server_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneMCPServerPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_mcp_server_snake_case_inbound() -> None:
    payload = {"name": "GH", "mcp_server": _sample_mcp_server()}
    parsed = StandaloneMCPServerCreate.model_validate(payload)
    assert parsed.mcp_server.transport == "stdio"
```

- [ ] **Step 12: Create `test_observability.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_observability.py`:

```python
"""Tests for idun_agent_schema.standalone.observability."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneObservabilityCreate,
    StandaloneObservabilityPatch,
    StandaloneObservabilityRead,
)


def _sample_observability() -> dict:
    return {
        "provider": "LANGFUSE",
        "enabled": True,
        "config": {
            "public_key": "pk-x",
            "secret_key": "sk-x",
            "host": "https://cloud.langfuse.com",
        },
    }


def test_observability_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "langfuse",
        "name": "Langfuse",
        "enabled": True,
        "observability": _sample_observability(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneObservabilityRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneObservabilityRead.model_validate(dumped)
    assert reparsed == parsed
    assert "observability" in dumped


def test_observability_create_default_enabled_true() -> None:
    payload = {"name": "Langfuse", "observability": _sample_observability()}
    parsed = StandaloneObservabilityCreate.model_validate(payload)
    assert parsed.enabled is True


def test_observability_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneObservabilityPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)
```

- [ ] **Step 13: Create `test_integrations.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_integrations.py`:

```python
"""Tests for idun_agent_schema.standalone.integrations."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneIntegrationCreate,
    StandaloneIntegrationPatch,
    StandaloneIntegrationRead,
)


def _sample_integration() -> dict:
    return {
        "provider": "WHATSAPP",
        "enabled": True,
        "config": {
            "access_token": "atk-x",
            "phone_number_id": "pn-1",
            "verify_token": "vt-1",
        },
    }


def test_integration_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "whatsapp",
        "name": "WhatsApp",
        "enabled": True,
        "integration": _sample_integration(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneIntegrationRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneIntegrationRead.model_validate(dumped)
    assert reparsed == parsed


def test_integration_create_default_enabled_true() -> None:
    payload = {"name": "WhatsApp", "integration": _sample_integration()}
    parsed = StandaloneIntegrationCreate.model_validate(payload)
    assert parsed.enabled is True


def test_integration_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneIntegrationPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)
```

- [ ] **Step 14: Create `test_prompts.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_prompts.py`:

```python
"""Tests for idun_agent_schema.standalone.prompts."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandalonePromptCreate,
    StandalonePromptPatch,
    StandalonePromptRead,
)


def test_prompt_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "promptId": "system-prompt",
        "version": 1,
        "content": "You are an Idun agent.",
        "tags": ["latest"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandalonePromptRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandalonePromptRead.model_validate(dumped)
    assert reparsed == parsed
    assert "promptId" in dumped


def test_prompt_create_defaults_tags_to_empty_list() -> None:
    parsed = StandalonePromptCreate.model_validate(
        {"promptId": "system-prompt", "content": "You are an Idun agent."}
    )
    assert parsed.tags == []


def test_prompt_patch_accepts_tags_only() -> None:
    parsed = StandalonePromptPatch.model_validate({"tags": ["latest", "draft"]})
    assert parsed.tags == ["latest", "draft"]


def test_prompt_patch_rejects_content_field() -> None:
    """PATCH does not accept content; clients POST a new version instead."""

    parsed = StandalonePromptPatch.model_validate(
        {"tags": ["latest"], "content": "ignored"}
    )
    # content is silently dropped (not a declared field on Patch)
    assert not hasattr(parsed, "content") or parsed.model_dump(
        exclude_none=True
    ) == {"tags": ["latest"]}


def test_prompt_patch_explicit_null_tags_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandalonePromptPatch.model_validate({"tags": None})
    assert "tags cannot be null" in str(exc_info.value)


def test_prompt_patch_empty_tags_list_accepts() -> None:
    parsed = StandalonePromptPatch.model_validate({"tags": []})
    assert parsed.tags == []
```

- [ ] **Step 15: Create `test_runtime_status.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_runtime_status.py`:

```python
"""Tests for idun_agent_schema.standalone.runtime_status."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneEnrollmentInfo,
    StandaloneEngineCapabilities,
    StandaloneRuntimeAgent,
    StandaloneRuntimeConfigInfo,
    StandaloneRuntimeEngine,
    StandaloneRuntimeMCP,
    StandaloneRuntimeObservability,
    StandaloneRuntimeReload,
    StandaloneRuntimeStatus,
    StandaloneRuntimeStatusKind,
)


def test_runtime_status_kind_values() -> None:
    expected = {"not_configured", "initializing", "running", "error"}
    actual = {member.value for member in StandaloneRuntimeStatusKind}
    assert actual == expected


def test_runtime_status_running_round_trip() -> None:
    payload = {
        "status": "running",
        "agent": {
            "id": str(uuid4()),
            "name": "Ada",
            "framework": "LANGGRAPH",
            "version": "1.0.0",
            "lifecycleStatus": "active",
        },
        "config": {
            "hash": "abc123",
            "lastAppliedAt": datetime.now(timezone.utc).isoformat(),
        },
        "engine": {
            "capabilities": {"streaming": True, "history": True, "threadId": True}
        },
        "reload": {
            "lastStatus": "reloaded",
            "lastMessage": "Saved and reloaded",
            "lastError": None,
            "lastReloadedAt": datetime.now(timezone.utc).isoformat(),
        },
        "mcp": {"configured": 3, "enabled": 2, "failed": []},
        "observability": {"configured": 2, "enabled": 1},
        "enrollment": {"mode": "local", "status": "not_enrolled"},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneRuntimeStatus.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json", exclude_none=True)
    reparsed = StandaloneRuntimeStatus.model_validate(dumped)
    assert reparsed.status == StandaloneRuntimeStatusKind.RUNNING
    assert reparsed.agent is not None
    assert reparsed.engine is not None
    assert reparsed.engine.capabilities.streaming is True


def test_runtime_status_not_configured_round_trip() -> None:
    """Cold-start payload has only the required nested sections."""

    payload = {
        "status": "not_configured",
        "mcp": {"configured": 0, "enabled": 0, "failed": []},
        "observability": {"configured": 0, "enabled": 0},
        "enrollment": {"mode": "local", "status": "not_enrolled"},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    parsed = StandaloneRuntimeStatus.model_validate(payload)
    assert parsed.status == StandaloneRuntimeStatusKind.NOT_CONFIGURED
    assert parsed.agent is None
    assert parsed.engine is None


def test_engine_capabilities_camel_case_outbound() -> None:
    caps = StandaloneEngineCapabilities(
        streaming=True, history=False, thread_id=True
    )
    dumped = caps.model_dump(by_alias=True)
    assert dumped == {"streaming": True, "history": False, "threadId": True}


def test_runtime_agent_partial_fields_accepted() -> None:
    agent = StandaloneRuntimeAgent.model_validate({"name": "Ada"})
    assert agent.name == "Ada"
    assert agent.id is None
```

- [ ] **Step 16: Create `test_diagnostics.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_diagnostics.py`:

```python
"""Tests for idun_agent_schema.standalone.diagnostics."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneConnectionCheck,
    StandaloneReadyzCheckStatus,
    StandaloneReadyzResponse,
    StandaloneReadyzStatus,
)


def test_connection_check_ok_round_trip() -> None:
    check = StandaloneConnectionCheck(ok=True, details={"tools": ["add", "subtract"]})
    dumped = check.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"ok": True, "details": {"tools": ["add", "subtract"]}}
    assert StandaloneConnectionCheck.model_validate(dumped) == check


def test_connection_check_failure_round_trip() -> None:
    check = StandaloneConnectionCheck(
        ok=False, error="Connection refused: localhost:5432"
    )
    dumped = check.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"ok": False, "error": "Connection refused: localhost:5432"}


def test_readyz_response_round_trip() -> None:
    response = StandaloneReadyzResponse(
        status=StandaloneReadyzStatus.READY,
        checks={
            "database": StandaloneReadyzCheckStatus.OK,
            "engine": StandaloneReadyzCheckStatus.OK,
            "trace_writer": StandaloneReadyzCheckStatus.OK,
        },
    )
    dumped = response.model_dump(by_alias=True, mode="json")
    assert dumped["status"] == "ready"
    assert dumped["checks"]["database"] == "ok"
    reparsed = StandaloneReadyzResponse.model_validate(dumped)
    assert reparsed == response


def test_readyz_response_not_ready() -> None:
    response = StandaloneReadyzResponse(
        status=StandaloneReadyzStatus.NOT_READY,
        checks={"database": StandaloneReadyzCheckStatus.FAIL},
    )
    dumped = response.model_dump(by_alias=True, mode="json")
    assert dumped == {
        "status": "not_ready",
        "checks": {"database": "fail"},
    }
```

- [ ] **Step 17: Create `test_config.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_config.py`:

```python
"""Tests for idun_agent_schema.standalone.config."""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import StandaloneMaterializedConfig


def _sample_engine_config() -> EngineConfig:
    return EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )


def test_materialized_config_round_trip() -> None:
    materialized = StandaloneMaterializedConfig(
        config=_sample_engine_config(),
        hash="abc123def456",
    )
    dumped = materialized.model_dump(by_alias=True, mode="json")
    assert dumped["hash"] == "abc123def456"
    assert "config" in dumped
    reparsed = StandaloneMaterializedConfig.model_validate(dumped)
    assert reparsed.hash == materialized.hash
    assert reparsed.config.agent.config.name == "ada"


def test_materialized_config_camel_case_outbound() -> None:
    materialized = StandaloneMaterializedConfig(
        config=_sample_engine_config(),
        hash="abc",
    )
    dumped = materialized.model_dump(by_alias=True, mode="json")
    # Top-level fields don't have snake_case forms; this asserts the dump
    # doesn't accidentally introduce extra keys.
    assert set(dumped.keys()) == {"config", "hash"}
```

- [ ] **Step 18: Create `test_enrollment.py`**

Write to `libs/idun_agent_schema/tests/standalone/test_enrollment.py`:

```python
"""Tests for idun_agent_schema.standalone.enrollment."""

from __future__ import annotations

from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneEnrollmentInfo,
    StandaloneEnrollmentMode,
    StandaloneEnrollmentStatus,
)


def test_enrollment_mode_values() -> None:
    expected = {"local", "enrolled", "managed"}
    actual = {member.value for member in StandaloneEnrollmentMode}
    assert actual == expected


def test_enrollment_status_values() -> None:
    expected = {"not_enrolled", "pending", "connected", "error"}
    actual = {member.value for member in StandaloneEnrollmentStatus}
    assert actual == expected


def test_enrollment_info_default_local_not_enrolled() -> None:
    info = StandaloneEnrollmentInfo()
    assert info.mode == StandaloneEnrollmentMode.LOCAL
    assert info.status == StandaloneEnrollmentStatus.NOT_ENROLLED
    assert info.manager_url is None
    assert info.workspace_id is None
    assert info.managed_agent_id is None
    assert info.config_revision is None


def test_enrollment_info_round_trip_connected() -> None:
    workspace_id = uuid4()
    managed_agent_id = uuid4()
    info = StandaloneEnrollmentInfo(
        mode=StandaloneEnrollmentMode.ENROLLED,
        status=StandaloneEnrollmentStatus.CONNECTED,
        manager_url="https://hub.example.com",
        workspace_id=workspace_id,
        managed_agent_id=managed_agent_id,
        config_revision=42,
    )
    dumped = info.model_dump(by_alias=True, mode="json")
    assert dumped["mode"] == "enrolled"
    assert dumped["status"] == "connected"
    assert dumped["managerUrl"] == "https://hub.example.com"
    assert dumped["managedAgentId"] == str(managed_agent_id)
    assert dumped["configRevision"] == 42
    reparsed = StandaloneEnrollmentInfo.model_validate(dumped)
    assert reparsed == info


def test_enrollment_info_snake_case_inbound() -> None:
    info = StandaloneEnrollmentInfo.model_validate(
        {
            "mode": "enrolled",
            "status": "pending",
            "manager_url": "https://hub.example.com",
            "config_revision": 1,
        }
    )
    assert info.mode == StandaloneEnrollmentMode.ENROLLED
    assert info.status == StandaloneEnrollmentStatus.PENDING
    assert info.manager_url == "https://hub.example.com"
```

### 4.4 Run + commit

- [ ] **Step 19: Run the schema test suite**

Run:
```bash
uv run pytest libs/idun_agent_schema -q
```
Expected: ~70 tests pass (exact count depends on parametrization). All in `tests/standalone/`. Zero failures.

If any fail, fix the schema module or the test (whichever is wrong) before commit.

- [ ] **Step 20: Run mypy on the full new tree**

Run:
```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected: `Success: no issues found in <N> source files` where N is the post-Phase-2 count (was 28 at Phase 1 close; will be ~38 after Phase 2 adds 10 modules — rough number, don't gate on the exact value).

- [ ] **Step 21: Run lint**

Run:
```bash
make lint
```
Expected: exit 0.

- [ ] **Step 22: Commit barrel + tests**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py \
        libs/idun_agent_schema/tests
git commit -m "$(cat <<'EOF'
test(rework-phase2): standalone schema namespace tests

Adds the cross-cutting namespace test plus per-module tests for all 14
standalone schema modules with content (5 Phase 1 modules:
agent/memory/common/errors/reload, plus 9 Phase 2 modules:
guardrails/mcp_servers/observability/integrations/prompts/runtime_status/
diagnostics/config/enrollment). operational.py has no test by design;
it is a docstring-only placeholder.

Test pattern per module: round-trip (mixed camelCase + snake_case keys
in, camelCase out, reparse equality), camelCase outbound, snake_case
inbound (populate_by_name), validators where present (_no_null_name on
agent/guardrail/mcp_server/observability/integration patches,
_no_null_tags on prompt patch), enum value coverage where applicable.

Cross-cutting test_namespace.py walks every public name from
idun_agent_schema.standalone.__init__ and asserts each is either a
_CamelModel subclass or a StrEnum. This catches new modules that
forget to inherit _CamelModel — the most likely drift class as the
namespace grows.

Also updates idun_agent_schema/standalone/__init__.py to re-export
every new public type alphabetically grouped by module, mirroring the
Phase 1 barrel style. operational.py exports nothing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit; full test suite green.

---

## Task 5: Patterns reference doc — flip FORWARD sections to ESTABLISHED (T4b)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-27-rework-patterns.md`

**Subagent dispatch model:** cheap (mechanical doc edit; no code).

The patterns doc has FORWARD-tagged sections that Phase 2 has now ESTABLISHED. This task transitions them with new file:line refs to the post-Phase-2 modules.

Sections to update:

- §4.3 Collection resource schemas — flip from FORWARD to ESTABLISHED, replace skeleton with reference snippets from the new modules.
- §6.4 DELETE wrapping — keep FORWARD for the router pattern (Phase 5) but add ESTABLISHED reference for `StandaloneDeleteResult` shape (already done in Phase 1; spot-check the citation).
- §11 Cold-start states — flip the `StandaloneRuntimeStatusKind` enum citation to ESTABLISHED, citing `runtime_status.py:NN-NN`.
- §14 Manager schema mirror rule — add ESTABLISHED references for the 5 collection schema modules' wrapping behavior (each cites the matching manager-shape source).
- §16 Open issues / known caveats — confirm still empty (no surprises in Phase 2).

- [ ] **Step 1: Compute the post-Phase-2 line refs**

The implementer MUST grep the post-Task-4 files for actual line ranges before writing the doc edit. Do not estimate. For each updated reference:

```bash
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/guardrails.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/observability.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/integrations.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/prompts.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/diagnostics.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/config.py
grep -n "^class Standalone" libs/idun_agent_schema/src/idun_agent_schema/standalone/enrollment.py
```
Capture each (class, line) pair. Use them in the next steps.

- [ ] **Step 2: Update §4.3 Collection resource schemas — FORWARD → ESTABLISHED**

The current §4.3 carries a FORWARD skeleton ending with the line `<inner_field>: <ManagerShape>`. Replace it with concrete reference snippets:

Open `docs/superpowers/specs/2026-04-27-rework-patterns.md` and locate the line beginning `### 4.3 Collection resource schemas — FORWARD`.

Replace the section (from `### 4.3` heading through end of subsection, before `## 5. ORM patterns`) with:

```markdown
### 4.3 Collection resource schemas — ESTABLISHED

Five collection resources land in Phase 2. Each follows the same Read/Create/Patch pattern and is anchored to the manager-shape config it wraps.

| Module | Read shape ref | Wraps | Conversion at assembly |
| --- | --- | --- | --- |
| `guardrails.py` | (cite line range from grep) | `ManagerGuardrailConfig` | `convert_guardrail()` reused from manager |
| `mcp_servers.py` | (cite line range) | `MCPServer` (engine) | none |
| `observability.py` | (cite line range) | `ObservabilityConfig` (V2 engine) | none |
| `integrations.py` | (cite line range) | `IntegrationConfig` (engine) | inner `enabled` overwritten at assembly to match standalone row |
| `prompts.py` | (cite line range) | `ManagedPromptCreate/Read/Patch` (manager) | content-vs-tags split (PATCH only `tags`; content patches POST a new version) |

Reference snippet for the standard collection shape (mcp_servers as the cleanest example), at `libs/idun_agent_schema/src/idun_agent_schema/standalone/mcp_servers.py:<line range from grep>`:

(paste the actual class definitions after grepping)

Patterns to copy in Phase 5+ collection routers:

- Read variants set `model_config = ConfigDict(from_attributes=True)`.
- Create variants default `enabled=True`.
- Patch variants reject explicit-null on `name` via `_no_null_name`.
- Inner config field (`mcp_server`, `observability`, `integration`, `guardrail`) accepts the wrapped shape unchanged on input; outbound wire format follows the wrapped shape's own aliasing rules.

Special case — guardrails fold M:N junction columns:

- `position: Literal["input", "output"]` and `sort_order: int` live on the row, not in a junction table.

Special case — prompts skip slug + enabled:

- `prompts.py` has neither `slug` nor `enabled`.
- `StandalonePromptPatch` declares only `tags`. Posting a new version is the way to change content; the schema makes that explicit by not declaring a `content` field on Patch.
```

**Important:** the implementer must replace `(cite line range from grep)` placeholders with actual line numbers from Step 1's grep. Do not commit with placeholders.

- [ ] **Step 3: Update §11 Cold-start states — add ESTABLISHED enum reference**

Current §11 has the cold-start state table and boot-path pseudocode but no concrete enum reference. Add a sentence pointing at the new enum.

After the boot-path pseudocode block (before "Invariant: the admin API and `/health` MUST come up..."), insert:

```markdown
The cold-start state values are defined as the `StandaloneRuntimeStatusKind` enum at `libs/idun_agent_schema/src/idun_agent_schema/standalone/runtime_status.py:<NN-NN>` (cite line range from grep). The full runtime status payload that surfaces the state at `GET /admin/api/v1/runtime/status` is `StandaloneRuntimeStatus` in the same module.
```

Replace `<NN-NN>` with the actual range.

- [ ] **Step 4: Update §14 Manager schema mirror rule — add per-module references**

Below the existing §14.3 "Audit checklist" subsection, add:

```markdown
### 14.4 ESTABLISHED references — Phase 2 collections

Each collection schema in `idun_agent_schema/standalone/` wraps a manager-shape config. The wrapping is direct (no field renaming, no nested transformation); only the standalone row-level fields (`id`, `slug`, `name`, `enabled`, plus per-resource specials) sit alongside the inner config.

| Standalone schema | File:line | Wraps | Source path |
| --- | --- | --- | --- |
| `StandaloneGuardrailRead/Create/Patch` | (cite from grep) | `ManagerGuardrailConfig` | `idun_agent_schema/manager/guardrail_configs.py` |
| `StandaloneMCPServerRead/Create/Patch` | (cite from grep) | `MCPServer` | `idun_agent_schema/engine/mcp_server.py` |
| `StandaloneObservabilityRead/Create/Patch` | (cite from grep) | `ObservabilityConfig` (V2) | `idun_agent_schema/engine/observability_v2.py` |
| `StandaloneIntegrationRead/Create/Patch` | (cite from grep) | `IntegrationConfig` | `idun_agent_schema/engine/integrations/base.py` |
| `StandalonePromptRead/Create/Patch` | (cite from grep) | (mirrors) `ManagedPromptCreate/Read/Patch` | `idun_agent_schema/manager/managed_prompt.py` |

Phase 4 ORM modules apply the §14.3 audit checklist to the corresponding `StandaloneXRow` SQLAlchemy declarations; the wrapping shape lands here at the schema layer.
```

Replace `(cite from grep)` placeholders with actual line ranges.

- [ ] **Step 5: Verify §16 Open issues / known caveats remains accurate**

§16 currently says "No open issues at Phase 1 close." Phase 2 should not add issues. Confirm the section reads:

```markdown
## 16. Open issues / known caveats

No open issues at Phase 1 close. Phase 2+ implementers update this section if anything surfaces that doesn't fit cleanly under a Phase 3+ pattern class.
```

If the implementer subagent surfaced any concerns during Phase 2 (audit-style observations that didn't fit a pattern-breaker class but are worth tracking), add them here with the phase that will resolve them. Otherwise leave as-is.

- [ ] **Step 6: Commit the patterns doc update**

```bash
git add docs/superpowers/specs/2026-04-27-rework-patterns.md
git commit -m "$(cat <<'EOF'
docs(rework-phase2): patterns reference — flip FORWARD sections to ESTABLISHED

Phase 2 lands the schema layer for all standalone resources, so the
patterns reference doc transitions:

- §4.3 Collection resource schemas — FORWARD -> ESTABLISHED, with
  per-module references to the new schema files
  (guardrails.py, mcp_servers.py, observability.py, integrations.py,
  prompts.py) and a table mapping each to its wrapped manager-shape
  source.

- §11 Cold-start states — adds ESTABLISHED reference for the
  StandaloneRuntimeStatusKind enum at runtime_status.py.

- §14.4 Manager schema mirror rule — adds an ESTABLISHED references
  table for the 5 collection schemas, each citing file:line and the
  wrapped manager-shape source.

Sections that remain FORWARD: §6.2 Collection router pattern (Phase 5),
§6.3 PATCH semantics (Phase 5), §6.4 DELETE wrapping router-side
(Phase 5; the StandaloneDeleteResult shape was already ESTABLISHED in
Phase 1), §6.5 Slug rules (Phase 5), §6.6 Connection-check sub-routes
(Phase 6), §8 Validation rounds (Phase 3), §10 Reload mutex (Phase 3),
§11 Cold-start state machine implementation (Phase 6), §12 Config hash
(Phase 6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: clean commit on the working branch.

---

## Task 6: CI gate

**Files:** none.

- [ ] **Step 1: Run lint**

Run: `make lint`
Expected: exit 0.

- [ ] **Step 2: Run mypy on the new tree**

Run:
```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected: `Success: no issues found in <N> source files` (N grew from 28 to ~38 in Phase 2 — exact count depends on Pydantic-generated submodules).

- [ ] **Step 3: Run pytest schema**

Run: `uv run pytest libs/idun_agent_schema -q`
Expected: ~70 tests pass.

- [ ] **Step 4: Run pytest standalone narrowed (regression check)**

Run:
```bash
uv run pytest libs/idun_agent_standalone -q \
  -m "not requires_postgres and not requires_langfuse and not requires_phoenix" \
  --ignore=libs/idun_agent_standalone/tests/unit/test_admin_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_reload.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_scaffold.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_cli.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_app_health.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_integrations_casing.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_structural_change_restart.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_auth_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_atomic.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_engine_reload_reattaches_observer.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_flow.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_bootstrap_hash.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_config_io.py
```
Expected: 64 tests pass (Phase 1 close-state baseline; Phase 2 must not regress).

- [ ] **Step 5: Verify Phase 2 acceptance criteria**

Cross-check against design doc §6:

```bash
ls libs/idun_agent_schema/src/idun_agent_schema/standalone/
ls libs/idun_agent_schema/tests/standalone/
git log --oneline 52e2ad15^..HEAD | grep -E "rework-phase2"
```

Expected:
- `standalone/` contains: `__init__.py`, `_base.py`, `agent.py`, `common.py`, `config.py`, `diagnostics.py`, `enrollment.py`, `errors.py`, `guardrails.py`, `integrations.py`, `mcp_servers.py`, `memory.py`, `observability.py`, `operational.py`, `prompts.py`, `reload.py`, `runtime_status.py` (16 files + `__init__.py` = 17 entries; `_base.py` is private but counts as a file).
- `tests/standalone/` contains 15 entries: `__init__.py`, `test_namespace.py`, plus 13 per-module test files.
- Commit log shows 5 Phase 2 commits (plan + 4 feat/test/docs commits, see header).

---

## Task 7: Open the PR

**Files:** none.

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feat/rework-phase2-schemas
```
Expected: branch pushed; PR creation link returned.

- [ ] **Step 2: Build the PR description**

Use the template below. Fill `<...>` slots from the actual commits and tests count.

```markdown
## Phase 2 — Schema Namespace Completion

Closes Phase 2 of the standalone admin/db rework.

### What this PR does
- Adds 10 schema modules to `idun_agent_schema.standalone` (5 collection resources, 3 operational/diagnostic, 2 config+enrollment).
- Adds inclusive schema unit tests for all 14 standalone schema modules (5 Phase 1 + 9 Phase 2 with content; `operational.py` is a docstring-only placeholder).
- Flips the relevant FORWARD sections of the patterns reference doc to ESTABLISHED.

### Modules added
- Collection resources (T1): `guardrails.py`, `mcp_servers.py`, `observability.py`, `integrations.py`, `prompts.py`.
- Config + enrollment (T3): `config.py`, `enrollment.py`.
- Operational + diagnostic (T2): `runtime_status.py`, `operational.py` (placeholder), `diagnostics.py`.

Dispatch order T1 → T3 → T2 satisfies the `runtime_status.py → enrollment.py` import dependency without TYPE_CHECKING tricks.

### Tests
- `libs/idun_agent_schema/tests/standalone/` created with 14 test files plus a cross-cutting `test_namespace.py`.
- `<N> tests pass` (replace with actual count from Task 6 Step 3).
- Test pattern per module: round-trip (mixed camelCase + snake_case keys in, camelCase out, reparse equality), case convention, validators where present.

### Patterns now ESTABLISHED
- §4.3 Collection resource schemas (was FORWARD)
- §11 Cold-start states — `StandaloneRuntimeStatusKind` enum
- §14.4 Manager schema mirror — per-module references for the 5 collection schemas

### Patterns still FORWARD
- §6.2 Collection router pattern (Phase 5)
- §6.3 PATCH semantics (Phase 5)
- §6.5 Slug rules (Phase 5)
- §6.6 Connection-check sub-routes (Phase 6)
- §8 Validation rounds (Phase 3)
- §10 Reload mutex (Phase 3)
- §11 Cold-start state machine implementation (Phase 6)
- §12 Config hash (Phase 6)

### Test plan
- [x] `make lint` passes
- [x] `uv run mypy --follow-imports=silent <new-tree>` passes
- [x] `uv run pytest libs/idun_agent_schema -q` passes (<N> tests)
- [x] Phase 1 narrowed pytest gate still passes (64 tests, no regression)

### Next phase
Phase 3 (`feat/rework-phase3-plumbing`): build the cross-cutting plumbing — reload mutex, 3-round validation pipeline, error-envelope mapper, slug rules helpers, cold-start state machine, config hash. Branches off the umbrella after this PR merges.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: Create the PR**

```bash
gh pr create \
  --base feat/standalone-admin-db-rework \
  --head feat/rework-phase2-schemas \
  --title "Phase 2 — Schema namespace completion" \
  --body "$(cat <<'EOF'
<paste the filled-in description from Step 2>
EOF
)"
```
Expected: PR URL returned. Hand back to user.

- [ ] **Step 4: Report PR URL**

Provide the PR URL, the test count, the patterns-doc transitions, and a one-line note that Phase 3 is the next phase. Phase 2 is complete after the user confirms they have reviewed the PR.

---

## Acceptance summary (cross-references design doc §6)

1. 10 new schema modules under `libs/idun_agent_schema/src/idun_agent_schema/standalone/` — Tasks 1, 2, 3.
2. `__init__.py` re-exports every new public type — Task 4.1.
3. `libs/idun_agent_schema/tests/standalone/` with 15 files — Task 4.2 + 4.3.
4. `make lint` clean — Task 6.
5. `uv run mypy --follow-imports=silent` clean — Task 6.
6. `uv run pytest libs/idun_agent_schema -q` passes — Task 6.
7. Phase 1 narrowed standalone-backend pytest gate continues to pass — Task 6.
8. Patterns doc FORWARD → ESTABLISHED transitions — Task 5.
9. PR description summarizes pattern transitions — Task 7.
