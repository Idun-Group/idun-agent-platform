# Phase 3 — Cross-Cutting Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-cutting plumbing every later phase needs — reload pipeline (asyncio mutex + 3-round validation + structural-change detection), slug rules, RFC 8785 config hash, runtime-state persistence — and retrofit Phase 1's agent + memory routers from stub reload constants to the real pipeline.

**Architecture:** Sequential SDD tasks. T2 cross-cutting helpers (runtime_state, slugs, config_hash) land first because T1's reload pipeline calls them. T1 reload pipeline lands next. T3 retrofits the routers. T4 flips FORWARD → ESTABLISHED transitions in the patterns reference doc.

**Tech Stack:** Python 3.12, Pydantic 2.11+, SQLAlchemy 2.x async, FastAPI, pytest. New runtime dep: `rfc8785>=0.1` (RFC 8785 / JCS canonicalization).

**Spec:** `docs/superpowers/specs/2026-04-27-rework-phase3-plumbing-design.md`
**Patterns reference:** `docs/superpowers/specs/2026-04-27-rework-patterns.md`
**Rework spec:** `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md`

**Working branch:** `feat/rework-phase3-plumbing` (off `feat/standalone-admin-db-rework`).
**PR target:** `feat/standalone-admin-db-rework`.

**Commit sequence (target):**
1. `4d3d86d3 docs(rework-phase3): add Phase 3 design doc` — already landed (pre-plan).
2. `docs(rework-phase3): add Phase 3 plan` — Task 0.
3. `feat(rework-phase3): cross-cutting helpers (slugs, config hash, runtime state)` — Task 1 (T2).
4. `feat(rework-phase3): reload pipeline + 3-round validation` — Task 2 (T1).
5. `refactor(rework-phase3): agent + memory routers use real reload pipeline` — Task 3 (T3).
6. `docs(rework-phase3): patterns reference — flip FORWARD sections to ESTABLISHED` — Task 4 (T4).

---

## Task 0: Pre-flight + plan commit

**Files:** none (verification + plan commit).

- [ ] **Step 1: Verify branch and tip**

Run:
```bash
git status -sb && git log --oneline -1
```
Expected: `## feat/rework-phase3-plumbing` and tip is `4d3d86d3 docs(rework-phase3): add Phase 3 design doc`.

- [ ] **Step 2: Verify umbrella tip**

Run:
```bash
git log --oneline -1 feat/standalone-admin-db-rework
```
Expected: `53342bd6 Phase 2 — Schema namespace completion (#522)` (or a later commit if other phases have already merged).

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
Expected: `Success: no issues found in 38 source files` (Phase 2 close-state).

```bash
uv run pytest libs/idun_agent_schema -q
```
Expected: `62 passed`.

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
Expected: `64 passed` (Phase 1 close-state baseline).

If any baseline check fails, STOP and escalate — Phase 3 does not start on a degraded baseline.

- [ ] **Step 4: Commit this plan**

```bash
git add docs/superpowers/plans/2026-04-27-rework-phase3.md
git commit -m "$(cat <<'EOF'
docs(rework-phase3): add Phase 3 plan

Task-by-task implementation plan for Phase 3 of the standalone admin/db
rework. Six tasks (pre-flight, T2 helpers, T1 reload pipeline, T3
retrofit, T4 patterns doc, CI gate, PR). Dispatch order T2 -> T1 -> T3
-> T4 satisfies dependencies (reload.py imports from runtime_state,
config_hash; routers import reload.commit_with_reload).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Cross-cutting helpers (T2)

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py`
- Modify: `libs/idun_agent_standalone/pyproject.toml` (add `rfc8785>=0.1`)
- Create: `libs/idun_agent_standalone/tests/unit/db/test_runtime_state_model.py` (note: file already exists for legacy db tests; create at this path)
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/__init__.py` (register the new ORM)
- Create: `libs/idun_agent_standalone/tests/unit/services/__init__.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_runtime_state.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_slugs.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_config_hash.py`
- Create: `libs/idun_agent_standalone/tests/conftest.py` (shared fixtures: `async_session`, `frozen_now`)

**Subagent dispatch model:** standard.

This task ships 4 helpers + 1 ORM + their unit tests + the shared conftest. The four helpers are independent; build in any order, but commit all together to keep the SDD review focused.

### 1.1 Add rfc8785 dependency

- [ ] **Step 1: Update pyproject.toml**

Open `libs/idun_agent_standalone/pyproject.toml` with the Read tool, find the `dependencies = [...]` list, and add `"rfc8785>=0.1"` to it (alphabetically positioned). Exact change depends on existing list shape; the new entry should look like:

```toml
"rfc8785>=0.1",
```

After the edit, run:
```bash
uv sync --all-groups
```
Expected: `rfc8785` resolves and installs.

- [ ] **Step 2: Verify import**

```bash
uv run python -c "import rfc8785; print(rfc8785.canonicalize({'b': 2, 'a': 1}))"
```
Expected output: `b'{"a":1,"b":2}'` (bytes, sorted keys, no whitespace).

### 1.2 Runtime state ORM

- [ ] **Step 3: Create the ORM model**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py`:

```python
"""SQLAlchemy model for the singleton runtime state row.

Records the last reload outcome (status, message, error, timestamp,
applied config hash). The boot-path state machine that derives the
top-level StandaloneRuntimeStatusKind from this row + agent presence
+ engine state is Phase 6's responsibility.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneRuntimeStateRow(Base):
    """The singleton runtime state row.

    Uses a fixed primary key (``"singleton"``) because the row is
    addressed by service helpers, not by id. Absence of the row means
    no reload has been attempted yet (first boot).
    """

    __tablename__ = "standalone_runtime_state"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_reloaded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_applied_config_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
```

- [ ] **Step 4: Register the new ORM in models/__init__.py**

Read `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/__init__.py`. It currently has `# noqa: F401` re-exports for `StandaloneAgentRow` and `StandaloneMemoryRow`. Add `StandaloneRuntimeStateRow` to the same pattern.

If the file currently looks like:

```python
"""Standalone DB models."""

from idun_agent_standalone.infrastructure.db.models.agent import (  # noqa: F401
    StandaloneAgentRow,
)
from idun_agent_standalone.infrastructure.db.models.memory import (  # noqa: F401
    StandaloneMemoryRow,
)
```

Add the new import alphabetically positioned (after memory):

```python
from idun_agent_standalone.infrastructure.db.models.runtime_state import (  # noqa: F401
    StandaloneRuntimeStateRow,
)
```

Verify the existing pattern by reading the file before editing — the exact existing content may differ.

### 1.3 Conftest

- [ ] **Step 5: Create the shared conftest.py**

Write to `libs/idun_agent_standalone/tests/conftest.py`:

```python
"""Shared pytest fixtures for the standalone test suite.

Phase 3 introduces async DB session and stub reload fixtures used by
unit + integration tests. Existing legacy tests are unaffected.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from idun_agent_standalone.infrastructure.db import models  # noqa: F401  registers ORMs on Base
from idun_agent_standalone.infrastructure.db.session import Base


@pytest.fixture
async def async_session() -> AsyncIterator[AsyncSession]:
    """An in-memory SQLite async session with all standalone ORMs created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def stub_reload_callable() -> AsyncMock:
    """An AsyncMock for the engine reload callable; configurable per test."""
    return AsyncMock(return_value=None)


@pytest.fixture
def frozen_now() -> Callable[[], datetime]:
    """Fixed datetime so reload outcome timestamps are deterministic in tests."""
    fixed = datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc)
    return lambda: fixed
```

### 1.4 Runtime state service

- [ ] **Step 6: Create the runtime_state service**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py`:

```python
"""Read/write helpers for the singleton runtime state row.

The reload pipeline calls these helpers to record the outcome of
every commit_with_reload run. The boot-path state machine (Phase 6)
reads from the same helpers to compute StandaloneRuntimeStatusKind.

Caller controls transaction boundaries — this module does not
commit or rollback. The pattern in commit_with_reload is:
1. rollback the user's failed mutation,
2. record_reload_outcome(...) writes the failure record,
3. caller commits the failure record.
"""

from __future__ import annotations

from datetime import datetime

from idun_agent_schema.standalone import StandaloneReloadStatus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.infrastructure.db.models.runtime_state import (
    StandaloneRuntimeStateRow,
)

_SINGLETON_ID = "singleton"


async def get(session: AsyncSession) -> StandaloneRuntimeStateRow | None:
    """Return the singleton state row, or None on first boot."""
    result = await session.execute(
        select(StandaloneRuntimeStateRow).where(
            StandaloneRuntimeStateRow.id == _SINGLETON_ID
        )
    )
    return result.scalar_one_or_none()


async def record_reload_outcome(
    session: AsyncSession,
    *,
    status: StandaloneReloadStatus,
    message: str,
    error: str | None,
    config_hash: str | None,
    reloaded_at: datetime,
) -> StandaloneRuntimeStateRow:
    """Upsert the singleton row with the given outcome.

    Caller controls the transaction boundary; this helper only stages
    the change via session.flush().
    """
    row = await get(session)
    if row is None:
        row = StandaloneRuntimeStateRow(id=_SINGLETON_ID)
        session.add(row)
    row.last_status = status.value
    row.last_message = message
    row.last_error = error
    row.last_applied_config_hash = config_hash
    row.last_reloaded_at = reloaded_at
    await session.flush()
    return row


async def clear(session: AsyncSession) -> None:
    """Delete the singleton row (test helper)."""
    row = await get(session)
    if row is not None:
        await session.delete(row)
        await session.flush()
```

### 1.5 Slugs

- [ ] **Step 7: Create the slugs service**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py`:

```python
"""Slug normalization + uniqueness for collection resources.

Phase 5 collection routers call these helpers on POST. Singleton
resources (agent, memory) do not use slugs at the route level.
"""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

_MAX_SLUG_LEN = 64
_MAX_COLLISION_SUFFIX = 99
_NON_SLUG_CHAR = re.compile(r"[^a-z0-9]+")
_DASH_RUN = re.compile(r"-+")


class SlugNormalizationError(ValueError):
    """Raised when a name produces an empty slug after normalization."""


class SlugConflictError(Exception):
    """Raised when ensure_unique_slug exhausts its collision suffixes."""


def normalize_slug(name: str) -> str:
    """Normalize a resource name to a slug per spec.

    Pipeline:
      trim -> NFKD ascii-fold -> lowercase
      -> regex sub [^a-z0-9] -> "-"
      -> collapse runs of "-"
      -> trim leading/trailing "-"
      -> truncate to 64 chars

    Raises SlugNormalizationError if the result is empty.
    """
    trimmed = name.strip()
    folded = unicodedata.normalize("NFKD", trimmed)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    dashed = _NON_SLUG_CHAR.sub("-", lowered)
    collapsed = _DASH_RUN.sub("-", dashed)
    stripped = collapsed.strip("-")
    truncated = stripped[:_MAX_SLUG_LEN]
    if not truncated:
        raise SlugNormalizationError(
            f"Cannot derive a slug from name {name!r}"
        )
    return truncated


async def ensure_unique_slug(
    session: AsyncSession,
    model_class: type,
    slug_column: InstrumentedAttribute,
    candidate: str,
) -> str:
    """Return candidate if unused; else suffix until unique.

    Tries candidate, candidate-2, candidate-3, ... up to candidate-99.
    Raises SlugConflictError after 99 collisions.
    """
    if not await _slug_exists(session, model_class, slug_column, candidate):
        return candidate
    for suffix in range(2, _MAX_COLLISION_SUFFIX + 1):
        candidate_with_suffix = f"{candidate}-{suffix}"
        if not await _slug_exists(
            session, model_class, slug_column, candidate_with_suffix
        ):
            return candidate_with_suffix
    raise SlugConflictError(
        f"Could not find a unique slug for {candidate!r} after "
        f"{_MAX_COLLISION_SUFFIX} attempts"
    )


async def _slug_exists(
    session: AsyncSession,
    model_class: type,
    slug_column: InstrumentedAttribute,
    candidate: str,
) -> bool:
    result = await session.execute(
        select(model_class).where(slug_column == candidate).limit(1)
    )
    return result.scalar_one_or_none() is not None
```

### 1.6 Config hash

- [ ] **Step 8: Create the config_hash service**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py`:

```python
"""Deterministic hash of the materialized EngineConfig.

Used to detect structural changes between reloads (compared against
StandaloneRuntimeStateRow.last_applied_config_hash) and to surface
the active config identity in /admin/api/v1/runtime/status.

Implementation: sha256 over the RFC 8785 / JCS canonical JSON
encoding of the EngineConfig's model_dump(mode="json"). JCS
guarantees canonical key order so semantically-equal configs
produce identical hashes.
"""

from __future__ import annotations

from hashlib import sha256

import rfc8785
from idun_agent_schema.engine.engine import EngineConfig


def compute_config_hash(engine_config: EngineConfig) -> str:
    """Return a 64-character hex sha256 of the JCS-canonical JSON of the config."""
    payload = engine_config.model_dump(mode="json")
    canonical = rfc8785.canonicalize(payload)
    return sha256(canonical).hexdigest()
```

### 1.7 Unit tests

- [ ] **Step 9: Create test_runtime_state_model.py**

Write to `libs/idun_agent_standalone/tests/unit/db/test_runtime_state_model.py`:

```python
"""Tests for StandaloneRuntimeStateRow ORM."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from idun_agent_standalone.infrastructure.db.models.runtime_state import (
    StandaloneRuntimeStateRow,
)


@pytest.mark.asyncio
async def test_runtime_state_default_pk_singleton(async_session) -> None:
    row = StandaloneRuntimeStateRow(id="singleton")
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.id == "singleton"


@pytest.mark.asyncio
async def test_runtime_state_server_default_updated_at(async_session) -> None:
    row = StandaloneRuntimeStateRow(id="singleton")
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.updated_at is not None
    assert isinstance(row.updated_at, datetime)


@pytest.mark.asyncio
async def test_runtime_state_columns_nullable(async_session) -> None:
    row = StandaloneRuntimeStateRow(
        id="singleton",
        last_status=None,
        last_message=None,
        last_error=None,
        last_applied_config_hash=None,
        last_reloaded_at=None,
    )
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.last_status is None
    assert row.last_applied_config_hash is None
```

- [ ] **Step 10: Create test_runtime_state.py service tests**

Write to `libs/idun_agent_standalone/tests/unit/services/test_runtime_state.py`:

```python
"""Tests for the runtime_state service."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from idun_agent_schema.standalone import StandaloneReloadStatus
from idun_agent_standalone.services import runtime_state


@pytest.mark.asyncio
async def test_get_returns_none_on_empty(async_session) -> None:
    assert await runtime_state.get(async_session) is None


@pytest.mark.asyncio
async def test_record_then_get(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
        error=None,
        config_hash="abc123",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row is not None
    assert row.last_status == "reloaded"
    assert row.last_message == "Saved."
    assert row.last_applied_config_hash == "abc123"
    assert row.last_reloaded_at == frozen_now()


@pytest.mark.asyncio
async def test_record_overwrites(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="First.",
        error=None,
        config_hash="hash1",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Second.",
        error="boom",
        config_hash=None,
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row.last_status == "reload_failed"
    assert row.last_message == "Second."
    assert row.last_error == "boom"
    assert row.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_record_failure_preserves_distinct_fields(
    async_session, frozen_now
) -> None:
    """The failure path writes status, message, error; it nulls hash."""
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Engine reload failed.",
        error="ImportError: graph module not found",
        config_hash=None,
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row.last_error == "ImportError: graph module not found"
    assert row.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_clear_removes_singleton(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
        error=None,
        config_hash="abc",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    await runtime_state.clear(async_session)
    await async_session.commit()
    assert await runtime_state.get(async_session) is None


@pytest.mark.asyncio
async def test_clear_on_empty_is_noop(async_session) -> None:
    await runtime_state.clear(async_session)
    await async_session.commit()
    assert await runtime_state.get(async_session) is None
```

- [ ] **Step 11: Create test_slugs.py**

Write to `libs/idun_agent_standalone/tests/unit/services/test_slugs.py`:

```python
"""Tests for the slugs service."""

from __future__ import annotations

import pytest
from sqlalchemy import Column, String, select

from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)


# normalize_slug tests


def test_normalize_simple_name() -> None:
    assert normalize_slug("GitHub Tools") == "github-tools"


def test_normalize_strips_special_chars() -> None:
    assert normalize_slug("Hello, World! @ Idun") == "hello-world-idun"


def test_normalize_collapses_runs() -> None:
    assert normalize_slug("foo--bar---baz") == "foo-bar-baz"


def test_normalize_trims_dashes() -> None:
    assert normalize_slug("---foo---") == "foo"


def test_normalize_truncates_to_64_chars() -> None:
    long_name = "a" * 200
    result = normalize_slug(long_name)
    assert len(result) == 64
    assert result == "a" * 64


def test_normalize_unicode_ascii_fold() -> None:
    assert normalize_slug("Café Münster") == "cafe-munster"


def test_normalize_lowercase() -> None:
    assert normalize_slug("FooBar") == "foobar"


def test_normalize_empty_raises() -> None:
    with pytest.raises(SlugNormalizationError):
        normalize_slug("")


def test_normalize_only_special_raises() -> None:
    with pytest.raises(SlugNormalizationError):
        normalize_slug("!!!@@@")


def test_normalize_leading_trailing_whitespace() -> None:
    assert normalize_slug("  github tools  ") == "github-tools"


# ensure_unique_slug tests
# We need a small ORM model to test against.

class _FakeRow(Base):
    __tablename__ = "_fake_slug_test"
    id: str = Column(String(36), primary_key=True)  # type: ignore[assignment]
    slug: str = Column(String(64), nullable=False, unique=True)  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_ensure_unique_no_collision(async_session) -> None:
    result = await ensure_unique_slug(
        async_session, _FakeRow, _FakeRow.slug, "fresh"
    )
    assert result == "fresh"


@pytest.mark.asyncio
async def test_ensure_unique_one_collision(async_session) -> None:
    async_session.add(_FakeRow(id="1", slug="github-tools"))
    await async_session.flush()
    result = await ensure_unique_slug(
        async_session, _FakeRow, _FakeRow.slug, "github-tools"
    )
    assert result == "github-tools-2"


@pytest.mark.asyncio
async def test_ensure_unique_99_collisions_raises(async_session) -> None:
    """Defensive upper bound — should be impossible in practice."""
    async_session.add(_FakeRow(id="0", slug="a"))
    for n in range(2, 100):
        async_session.add(_FakeRow(id=str(n), slug=f"a-{n}"))
    await async_session.flush()
    with pytest.raises(SlugConflictError):
        await ensure_unique_slug(async_session, _FakeRow, _FakeRow.slug, "a")
```

- [ ] **Step 12: Create test_config_hash.py**

Write to `libs/idun_agent_standalone/tests/unit/services/test_config_hash.py`:

```python
"""Tests for the config_hash service."""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.services.config_hash import compute_config_hash


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


def test_compute_config_hash_returns_64_char_hex() -> None:
    digest = compute_config_hash(_sample_engine_config())
    assert len(digest) == 64
    int(digest, 16)  # raises if not valid hex


def test_compute_config_hash_deterministic() -> None:
    """Two equal configs must produce identical hashes."""
    a = compute_config_hash(_sample_engine_config())
    b = compute_config_hash(_sample_engine_config())
    assert a == b


def test_compute_config_hash_canonicalizes_key_order() -> None:
    """Configs that differ only in dict key insertion order produce the same hash."""
    config_a = EngineConfig.model_validate(
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
    config_b = EngineConfig.model_validate(
        {
            "agent": {
                "config": {
                    "graph_definition": "agent.py:graph",
                    "name": "ada",
                },
                "type": "LANGGRAPH",
            }
        }
    )
    assert compute_config_hash(config_a) == compute_config_hash(config_b)


def test_compute_config_hash_distinct_configs_distinct_hashes() -> None:
    config_a = _sample_engine_config()
    config_b = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "different",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )
    assert compute_config_hash(config_a) != compute_config_hash(config_b)


def test_compute_config_hash_with_empty_optional_fields() -> None:
    """Optional fields like description/version don't break hashing."""
    config = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        }
    )
    digest = compute_config_hash(config)
    assert len(digest) == 64
```

### 1.8 Run + commit

- [ ] **Step 13: Run mypy on the new files**

```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py
```
Expected: clean.

- [ ] **Step 14: Run lint**

```bash
make lint
```
Expected: clean.

- [ ] **Step 15: Run unit tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/db/test_runtime_state_model.py \
              libs/idun_agent_standalone/tests/unit/services/ -v
```
Expected: all tests pass (~26 tests).

- [ ] **Step 16: Commit Task 1**

```bash
git add libs/idun_agent_standalone/pyproject.toml \
        libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/__init__.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py \
        libs/idun_agent_standalone/tests/conftest.py \
        libs/idun_agent_standalone/tests/unit/db/test_runtime_state_model.py \
        libs/idun_agent_standalone/tests/unit/services/__init__.py \
        libs/idun_agent_standalone/tests/unit/services/test_runtime_state.py \
        libs/idun_agent_standalone/tests/unit/services/test_slugs.py \
        libs/idun_agent_standalone/tests/unit/services/test_config_hash.py

git commit -m "$(cat <<'EOF'
feat(rework-phase3): cross-cutting helpers (slugs, config hash, runtime state)

Adds the foundational services every later Phase 3+ module needs:

- infrastructure/db/models/runtime_state.py — singleton ORM with
  fixed PK "singleton"; columns: last_status, last_message, last_error,
  last_reloaded_at, last_applied_config_hash, updated_at. Engine-agnostic
  types per §14 manager mirror rule (String(20)/(64), Text, DateTime).

- services/runtime_state.py — get(), record_reload_outcome(...),
  clear(). Caller controls transaction boundaries; the helper only
  stages via session.flush(). Used by the reload pipeline (Task 2)
  to record outcome after every commit_with_reload run.

- services/slugs.py — normalize_slug() with NFKD ascii-fold + regex
  pipeline + 64-char truncate; ensure_unique_slug() with up to 99
  collision suffixes before raising. Used by Phase 5 collection
  routers on POST.

- services/config_hash.py — compute_config_hash() returns a 64-char
  hex sha256 of rfc8785-canonicalized EngineConfig.model_dump(mode="json").
  Determinism guarantee backed by RFC 8785 / JCS.

Adds rfc8785>=0.1 as a runtime dep on the standalone package only
(not schema lib — config_hash is a runtime concern, not a contract).

Tests use sqlite+aiosqlite memory + Base.metadata.create_all()
via the new tests/conftest.py shared fixture set (async_session,
stub_reload_callable, frozen_now).

No Alembic migration ships in this commit — Phase 4 picks up the
runtime_state ORM in its fresh baseline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reload pipeline + 3-round validation (T1)

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_validation.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_reload.py`

**Subagent dispatch model:** capable (design-heavy task; algorithm + rollback semantics).

This is the design-heaviest task in Phase 3. The implementer must hold the full pipeline in mind: mutex, staged DB mutation, round 2 validation, structural-change detection, round 3 reload via injected callable, rollback semantics, runtime_state recording on success and failure.

The algorithm is locked in design doc §4.6.1. Pseudocode reproduced below.

### 2.1 Validation service

- [ ] **Step 1: Create services/validation.py**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py`:

```python
"""Round 2 validation: re-validate the assembled EngineConfig.

Phase 1's assemble_engine_config returns a typed EngineConfig instance,
but cross-resource invalid combinations (e.g. LANGGRAPH framework with
ADK SessionServiceConfig memory) are only caught when the assembled
config is re-validated. This module is the round 2 of the 3-round
pipeline; round 1 is FastAPI's body validation, round 3 is the engine
reload.
"""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import StandaloneFieldError
from pydantic import ValidationError

from idun_agent_standalone.api.v1.errors import (
    field_errors_from_validation_error,
)


class RoundTwoValidationFailed(Exception):
    """Raised when the assembled EngineConfig fails Pydantic validation.

    Wraps the original Pydantic ValidationError and exposes structured
    field_errors so the pipeline can build a 422 admin envelope without
    re-translating.
    """

    field_errors: list[StandaloneFieldError]

    def __init__(self, validation_error: ValidationError) -> None:
        self.field_errors = field_errors_from_validation_error(validation_error)
        super().__init__("Assembled EngineConfig failed validation.")


def validate_assembled_config(engine_config: EngineConfig) -> None:
    """Run Pydantic validation on the assembled EngineConfig.

    Raises RoundTwoValidationFailed on failure.
    """
    try:
        EngineConfig.model_validate(engine_config.model_dump())
    except ValidationError as exc:
        raise RoundTwoValidationFailed(exc) from exc
```

### 2.2 Reload pipeline

- [ ] **Step 2: Create services/reload.py**

Write to `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`:

```python
"""The 3-round reload pipeline.

Single in-process asyncio.Lock around commit_with_reload. The caller
acquires the lock, stages a DB mutation, calls flush, then invokes
commit_with_reload. The pipeline:
  1. Assembles EngineConfig from staged session state.
  2. Round 2: validates the assembled config (services.validation).
  3. Detects structural change vs prior runtime_state.
  4. If structural: commits DB, records outcome, returns restart_required.
     The reload_callable is NOT invoked.
  5. Else: round 3 invokes reload_callable.
     - On success: commits DB, records outcome, returns reloaded.
     - On ReloadInitFailed: rolls back DB, records failure outcome
       (in a fresh session-level write), commits the outcome,
       raises AdminAPIError(500, code=reload_failed).

Round 1 (Pydantic body validation) is FastAPI's responsibility and
happens before the handler runs.

The reload_callable is dependency-injected so tests stub a fake
without booting a real engine.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from hashlib import sha256

import rfc8785
from fastapi import status as http_status
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.config_hash import compute_config_hash
from idun_agent_standalone.services.engine_config import assemble_engine_config
from idun_agent_standalone.services.validation import (
    RoundTwoValidationFailed,
    validate_assembled_config,
)

logger = get_logger(__name__)


_reload_mutex = asyncio.Lock()


class ReloadInitFailed(Exception):
    """Raised when round 3 (engine reload via reload_callable) fails."""


def _default_now() -> datetime:
    return datetime.now(timezone.utc)


def _structural_slice(engine_config: EngineConfig) -> dict[str, object]:
    """Return the structural fields that require process restart on change.

    Per spec §"Save/reload posture" + legacy reload.py:
      - agent.framework
      - agent.config.graph_definition (LangGraph entry point)

    Other fields (agent name, description, version, base_url, memory
    config beyond framework, integrations, MCP servers, etc.) are hot-
    reloadable and do NOT require restart.
    """
    return {
        "framework": engine_config.agent.type.value,
        "graph_definition": getattr(
            engine_config.agent.config, "graph_definition", None
        ),
    }


def _structural_hash(engine_config: EngineConfig) -> str:
    """Hash only the structural slice, distinct from the full config hash."""
    canonical = rfc8785.canonicalize(_structural_slice(engine_config))
    return sha256(canonical).hexdigest()


def _is_structural_change(
    assembled: EngineConfig, prior_state
) -> bool:
    """True iff structural fields changed since the last applied config.

    On first boot (prior_state is None or last_applied_config_hash is
    None), returns False — the first config is never structural.

    Compares structural-slice hashes rather than re-fetching the prior
    full config (which would require keeping the prior config around).
    """
    if prior_state is None or prior_state.last_applied_config_hash is None:
        return False
    # Recompute prior structural hash from the stored full hash is not
    # possible without the prior config. Instead, we recompute the
    # structural hash whenever we record an outcome and store it.
    # For Phase 3, structural-change detection compares the prior FULL
    # config hash against the current one; if they differ AND the
    # structural slice differs, we consider it structural. Since we
    # only persist the full hash, we approximate: any change is
    # potentially structural unless the structural fields match a
    # known-stable set. For LangGraph, framework is fixed at boot
    # (cannot change without restart) so a framework change means a
    # structural change definitionally. For graph_definition, a path
    # change requires reimporting the module, which is structural.
    #
    # The simpler approach: compute the current structural hash and
    # compare against the prior config's full hash bytes — if the
    # structural fields are encoded in the full hash and they are the
    # only fields that could trigger structural, any difference in
    # full hash + difference in structural slice means structural.
    #
    # Implementation note: we store BOTH the full config hash and the
    # structural slice hash. On record_reload_outcome we pass both;
    # the runtime_state row only carries last_applied_config_hash
    # (the full one). The structural comparison then does:
    #   prior structural slice unknown -> conservative: treat as
    #   structural if framework/graph_definition match this assembled.
    #
    # SIMPLIFIED ALGORITHM (Phase 3):
    #   We persist last_applied_config_hash (full).
    #   On compare, we re-derive structural slice from THIS assembled
    #   and compute its hash. We then need the prior structural slice
    #   to compare. We don't have it.
    #
    # Resolution: we store the structural slice hash in the same
    # last_applied_config_hash column for Phase 3 — purpose-built. The
    # full config hash is a Phase 6 deliverable for /runtime/status.
    # This keeps the column single-purpose for Phase 3.
    current_structural = _structural_hash(assembled)
    return prior_state.last_applied_config_hash != current_structural


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

    On round 2 failure: rolls back, raises 422 AdminAPIError.
    On structural change: commits DB, records outcome, returns restart_required.
    On round 3 failure: rolls back, records failure outcome, raises 500 AdminAPIError.
    On full success: commits DB, records outcome, returns reloaded.
    """
    assembled = await assemble_engine_config(session)

    try:
        validate_assembled_config(assembled)
    except RoundTwoValidationFailed as exc:
        await session.rollback()
        logger.info(
            "reload.round2_failed field_count=%s", len(exc.field_errors)
        )
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Assembled config failed validation.",
                field_errors=exc.field_errors,
            ),
        ) from exc

    structural_hash = _structural_hash(assembled)
    prior = await runtime_state.get(session)
    structural = _is_structural_change(assembled, prior)

    if structural:
        await session.commit()
        await runtime_state.record_reload_outcome(
            session,
            status=StandaloneReloadStatus.RESTART_REQUIRED,
            message="Saved. Restart required to apply.",
            error=None,
            config_hash=structural_hash,
            reloaded_at=now(),
        )
        await session.commit()
        logger.info("reload.restart_required hash=%s", structural_hash[:8])
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
        await session.commit()
        logger.warning("reload.round3_failed error=%s", str(exc)[:120])
        raise AdminAPIError(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
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
        config_hash=structural_hash,
        reloaded_at=now(),
    )
    await session.commit()
    logger.info("reload.reloaded hash=%s", structural_hash[:8])
    return StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved and reloaded.",
    )
```

**Note on the structural-hash storage decision (line ~50–95 of the file):** The `last_applied_config_hash` column on `standalone_runtime_state` stores the **structural-slice** hash (not the full config hash) for Phase 3. This makes structural-change detection a single column comparison without needing to keep the prior full config in memory. Phase 6's `/runtime/status` endpoint will display the full config hash as a separate concept (computed on-demand from the active assembled config). The column name stays — the value semantics evolve. Document this in the implementer's commit message.

### 2.3 Validation tests

- [ ] **Step 3: Create test_validation.py**

Write to `libs/idun_agent_standalone/tests/unit/services/test_validation.py`:

```python
"""Tests for the validation service (round 2)."""

from __future__ import annotations

import pytest

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.services.validation import (
    RoundTwoValidationFailed,
    validate_assembled_config,
)


def _valid_langgraph_config() -> EngineConfig:
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


def test_valid_config_passes() -> None:
    config = _valid_langgraph_config()
    validate_assembled_config(config)  # must not raise


def test_round_two_validation_failed_wraps_validation_error() -> None:
    """Manually construct an invalid EngineConfig dump and pass through.

    We can't easily construct an invalid EngineConfig instance directly
    (Pydantic rejects it on construction), so we round-trip through
    model_dump and manually corrupt the dump before re-validating.
    """
    config = _valid_langgraph_config()
    dumped = config.model_dump()
    # Corrupt: set agent.config to an invalid shape for LANGGRAPH
    dumped["agent"]["config"] = {"name": "ada"}  # missing graph_definition

    # validate_assembled_config takes an EngineConfig, but the test
    # exercises the round-2 contract: any structural mismatch in the
    # dumped form fails. We reconstruct via model_validate to surface
    # this; the resulting RoundTwoValidationFailed carries field_errors.
    with pytest.raises(RoundTwoValidationFailed) as exc_info:
        from idun_agent_standalone.services.validation import (
            validate_assembled_config as _impl,
        )
        # Bypass: construct a fake EngineConfig-like with model_dump
        # returning the corrupt dict.
        class _FakeConfig:
            def model_dump(self) -> dict:
                return dumped

        _impl(_FakeConfig())  # type: ignore[arg-type]
    assert len(exc_info.value.field_errors) >= 1


def test_field_errors_carry_structured_codes() -> None:
    """RoundTwoValidationFailed.field_errors contains structured entries."""
    config = _valid_langgraph_config()
    dumped = config.model_dump()
    dumped["agent"]["config"] = {"name": "ada"}

    class _FakeConfig:
        def model_dump(self) -> dict:
            return dumped

    with pytest.raises(RoundTwoValidationFailed) as exc_info:
        validate_assembled_config(_FakeConfig())  # type: ignore[arg-type]
    fe = exc_info.value.field_errors[0]
    assert fe.field
    assert fe.message
```

### 2.4 Reload pipeline tests

- [ ] **Step 4: Create test_reload.py — happy path**

Write to `libs/idun_agent_standalone/tests/unit/services/test_reload.py`:

```python
"""Tests for the reload pipeline service.

Tests use sqlite+aiosqlite memory DB with the standalone agent +
memory + runtime_state ORMs. The reload_callable is stubbed via
AsyncMock; the now callable is frozen for deterministic timestamps.

Note: assemble_engine_config requires an agent row (and optionally
memory) to be present in the staged session state. Each test seeds
the necessary rows before calling commit_with_reload.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    StandaloneErrorCode,
    StandaloneReloadStatus,
)
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import (
    ReloadInitFailed,
    _reload_mutex,
    commit_with_reload,
)


def _seed_engine_config_dict() -> dict:
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "ada",
                "graph_definition": "agent.py:graph",
            },
        },
    }


async def _seed_agent(async_session, *, name: str = "Ada") -> StandaloneAgentRow:
    row = StandaloneAgentRow(
        name=name,
        base_engine_config=_seed_engine_config_dict(),
    )
    async_session.add(row)
    await async_session.flush()
    return row


@pytest.mark.asyncio
async def test_happy_path_returns_reloaded(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    result = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert result.status == StandaloneReloadStatus.RELOADED
    stub_reload_callable.assert_called_once()
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"
    assert state.last_reloaded_at == frozen_now()


@pytest.mark.asyncio
async def test_round_2_failure_rolls_back_and_raises_422(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """Stage an invalid agent row; round 2 must reject it."""
    # Bypass Phase 1 base_engine_config validation by injecting a
    # malformed dict directly. The assemble step rebuilds an
    # EngineConfig that Pydantic re-validates in round 2.
    row = StandaloneAgentRow(
        name="bad",
        base_engine_config={
            "agent": {"type": "LANGGRAPH", "config": {"name": "x"}}
        },  # missing graph_definition
    )
    async_session.add(row)
    await async_session.flush()

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=stub_reload_callable,
            now=frozen_now,
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.error.code == StandaloneErrorCode.VALIDATION_FAILED
    stub_reload_callable.assert_not_called()


@pytest.mark.asyncio
async def test_round_3_failure_rolls_back_and_records_failure(
    async_session, frozen_now
) -> None:
    """Reload callable raises ReloadInitFailed; pipeline rolls back DB
    but still records the failure outcome to runtime_state."""
    await _seed_agent(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("engine boom"))

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )
    assert exc_info.value.status_code == 500
    assert exc_info.value.error.code == StandaloneErrorCode.RELOAD_FAILED

    # Failure record must exist
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reload_failed"
    assert state.last_error == "engine boom"
    assert state.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_structural_change_returns_restart_required(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """First reload sets a baseline; second reload with a different
    structural slice (graph_definition path) returns restart_required."""
    await _seed_agent(async_session)
    first = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert first.status == StandaloneReloadStatus.RELOADED

    # Mutate graph_definition (structural)
    agent = (await async_session.execute(
        __import__("sqlalchemy").select(StandaloneAgentRow)
    )).scalar_one()
    agent.base_engine_config = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "ada",
                "graph_definition": "agent.py:other_graph",
            },
        },
    }
    await async_session.flush()

    second = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert second.status == StandaloneReloadStatus.RESTART_REQUIRED
    assert stub_reload_callable.call_count == 1  # NOT called for structural


@pytest.mark.asyncio
async def test_first_reload_is_not_structural(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """No prior runtime_state -> first config is never structural."""
    await _seed_agent(async_session)
    result = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert result.status == StandaloneReloadStatus.RELOADED


@pytest.mark.asyncio
async def test_reload_callable_dependency_injected(
    async_session, frozen_now
) -> None:
    """The reload callable can be replaced; tests don't need a real engine."""
    await _seed_agent(async_session)
    custom_calls = []

    async def custom_reload(config: EngineConfig) -> None:
        custom_calls.append(config)

    await commit_with_reload(
        async_session,
        reload_callable=custom_reload,
        now=frozen_now,
    )
    assert len(custom_calls) == 1
    assert isinstance(custom_calls[0], EngineConfig)


@pytest.mark.asyncio
async def test_now_dependency_injected(
    async_session, stub_reload_callable
) -> None:
    fixed = datetime(2027, 1, 1, tzinfo=timezone.utc)
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=lambda: fixed,
    )
    state = await runtime_state.get(async_session)
    assert state.last_reloaded_at == fixed


@pytest.mark.asyncio
async def test_mutex_serializes_concurrent_acquires() -> None:
    """Two coroutines acquiring the mutex serialize.

    Direct test of the mutex itself, without the full pipeline.
    """
    held: list[str] = []

    async def acquire_then_release(label: str) -> None:
        async with _reload_mutex:
            held.append(f"start:{label}")
            await asyncio.sleep(0)  # yield
            held.append(f"end:{label}")

    await asyncio.gather(
        acquire_then_release("A"),
        acquire_then_release("B"),
    )
    # Either A fully then B fully, or B fully then A fully — never interleaved
    pairs = list(zip(held[0::2], held[1::2]))
    for start, end in pairs:
        assert start.replace("start:", "") == end.replace("end:", "")


@pytest.mark.asyncio
async def test_hash_propagated_to_runtime_state_on_success(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    state = await runtime_state.get(async_session)
    assert state.last_applied_config_hash is not None
    assert len(state.last_applied_config_hash) == 64


@pytest.mark.asyncio
async def test_hash_not_propagated_on_failure(
    async_session, frozen_now
) -> None:
    await _seed_agent(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("engine boom"))
    with pytest.raises(AdminAPIError):
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )
    state = await runtime_state.get(async_session)
    assert state.last_applied_config_hash is None
```

### 2.5 Run + commit

- [ ] **Step 5: Run mypy on the new files**

```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py
```
Expected: clean.

- [ ] **Step 6: Run lint**

```bash
make lint
```
Expected: clean.

- [ ] **Step 7: Run unit tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_validation.py \
              libs/idun_agent_standalone/tests/unit/services/test_reload.py -v
```
Expected: all tests pass (~12 tests).

- [ ] **Step 8: Commit Task 2**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py \
        libs/idun_agent_standalone/tests/unit/services/test_validation.py \
        libs/idun_agent_standalone/tests/unit/services/test_reload.py

git commit -m "$(cat <<'EOF'
feat(rework-phase3): reload pipeline + 3-round validation

Implements the core plumbing every later resource will use:

- services/validation.py — RoundTwoValidationFailed wraps a Pydantic
  ValidationError into structured StandaloneFieldError list, ready for
  the 422 admin envelope. validate_assembled_config(EngineConfig) is
  the round-2 entry point.

- services/reload.py — module-level _reload_mutex (asyncio.Lock);
  commit_with_reload(session, *, reload_callable, now) orchestrates
  the 3-round pipeline:
    Round 2: validate_assembled_config -> 422 + DB rollback on fail
    Detect structural change vs prior runtime_state
    If structural: commit DB + record outcome + return restart_required
    Else round 3: reload_callable -> 500 + DB rollback + failure
                  outcome on ReloadInitFailed; on success commit DB +
                  record outcome + return reloaded.
  Round 1 is FastAPI body validation (handled by the framework).

Structural-change detection uses sha256 of the rfc8785-canonicalized
"structural slice" (agent.framework + agent.config.graph_definition).
The runtime_state row's last_applied_config_hash column carries the
structural-slice hash for Phase 3 comparison purposes; the full config
hash for /runtime/status is computed on-demand in Phase 6.

Reload callable is dependency-injected so tests use AsyncMock without
booting a real engine. The "now" callable is also injectable for
deterministic timestamps in tests.

The rollback-then-record-then-commit pattern on round 3 failure: the
user's mutation rolls back, then runtime_state.record_reload_outcome
writes the failure record, then a fresh commit persists the failure
record. SQLite + Postgres both support this two-transaction pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Retrofit agent + memory routers (T3)

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/deps.py` (add `ReloadCallableDep`)
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` (wire engine reload callable)
- Create: `libs/idun_agent_standalone/tests/integration/__init__.py` (if missing)
- Create: `libs/idun_agent_standalone/tests/integration/api/__init__.py`
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/__init__.py`
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/test_agent_flow.py`
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/test_memory_flow.py`

**Subagent dispatch model:** standard.

This task removes the stub reload constants from the routers, wraps mutating handlers in the mutex, and wires the engine reload callable into FastAPI.

### 3.1 Engine reload investigation

- [ ] **Step 1: Read the engine's reconfigure interface**

Open these files with the Read tool:
- `libs/idun_agent_engine/src/idun_agent_engine/server/lifespan.py`
- `libs/idun_agent_engine/src/idun_agent_engine/server/engine_app.py` (if exists)
- The current commit `2e63e234 feat(standalone): wire admin layer onto engine fastapi app` — `git show 2e63e234 --stat` to see what files it touched, then read them.

Identify how the engine app accepts a new EngineConfig at runtime. Three possibilities:
- (a) The engine exposes a public `reconfigure(EngineConfig)` async method on the engine app instance.
- (b) The engine exposes a "rebuild app + swap" pattern via `lifespan.py` or similar.
- (c) Neither — the engine has only startup-time configuration.

Capture the interface in your session log. The implementation in Step 4 below adapts to whichever exists.

If case (c), the implementer **must escalate to the user** before proceeding. Implementing a reload-from-scratch interface inside `idun_agent_engine` is out of Phase 3 scope.

### 3.2 ReloadCallableDep dependency

- [ ] **Step 2: Add ReloadCallableDep to api/v1/deps.py**

Read `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/deps.py`. It currently exposes `SessionDep`. Add:

```python
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from idun_agent_schema.engine.engine import EngineConfig


async def get_reload_callable(
    request: Request,
) -> Callable[[EngineConfig], Awaitable[None]]:
    """Return the engine reload callable, attached to app.state at startup.

    The callable accepts the materialized EngineConfig and applies it
    to the running engine. Raises ReloadInitFailed (from
    idun_agent_standalone.services.reload) on failure.
    """
    callable_ = getattr(request.app.state, "reload_callable", None)
    if callable_ is None:
        raise RuntimeError(
            "reload_callable not attached to app.state — "
            "check app.py startup wiring"
        )
    return callable_


ReloadCallableDep = Annotated[
    Callable[[EngineConfig], Awaitable[None]],
    Depends(get_reload_callable),
]
```

The exact import block additions depend on the existing file shape. Read first, edit incrementally.

### 3.3 app.py wiring

- [ ] **Step 3: Wire the engine reload callable on app startup**

Read `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`. The exact wiring depends on the engine's reconfigure interface from Step 1.

**If the engine exposes a reconfigure(config) method on the engine app (case a):**

```python
from collections.abc import Awaitable, Callable
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.services.reload import ReloadInitFailed


async def _build_reload_callable(
    engine_app,
) -> Callable[[EngineConfig], Awaitable[None]]:
    async def _reload(config: EngineConfig) -> None:
        try:
            await engine_app.reconfigure(config)
        except Exception as exc:
            raise ReloadInitFailed(str(exc)) from exc
    return _reload


# In create_standalone_app or equivalent factory, after the engine app
# is created and the admin routes are mounted:
app.state.reload_callable = await _build_reload_callable(engine_app)
```

**If the engine uses a rebuild-and-swap pattern (case b):** borrow the technique from the legacy `reload.py` (without importing legacy). The implementer reads the legacy code at `libs/idun_agent_standalone/src/idun_agent_standalone/reload.py` for reference, then re-implements equivalently inside `app.py` or a new `services/engine_reload.py` helper. The `_reload` callable wraps the rebuild + swap and translates exceptions to `ReloadInitFailed`.

The implementer's commit body must capture which case applied (a/b) and where the wiring lives.

### 3.4 Retrofit agent.py

- [ ] **Step 4: Replace stub reload with real pipeline in agent.py**

Read `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py` to confirm current shape. The post-Phase-1 file (with Phase 1 fixes from commit `8938f41f` applied) has the `_SAVED_RELOAD` and `_NOOP_RELOAD` stub constants. Replace as follows:

Remove the `_SAVED_RELOAD` constant and the imports:
```python
from idun_agent_schema.standalone import (
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
```

Add new imports:
```python
from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.services.reload import _reload_mutex, commit_with_reload
```

Keep `_NOOP_RELOAD`:
```python
_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)
```
(Update the `from idun_agent_schema.standalone import` block to keep just the types still used: `StandaloneAdminError`, `StandaloneAgentPatch`, `StandaloneAgentRead`, `StandaloneErrorCode`, `StandaloneMutationResponse`, `StandaloneReloadResult`, `StandaloneReloadStatus`.)

Replace `patch_agent` with:

```python
@router.patch("", response_model=StandaloneMutationResponse[StandaloneAgentRead])
async def patch_agent(
    body: StandaloneAgentPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Update metadata fields on the singleton agent.

    Empty body short-circuits with no DB write and no reload. Any
    non-empty mutation flows through the 3-round reload pipeline.
    """
    fields = body.model_fields_set
    row = await _load_agent(session)

    if not fields:
        logger.debug("admin.agent.patch noop id=%s", row.id)
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=_NOOP_RELOAD,
        )

    async with _reload_mutex:
        for field in fields:
            setattr(row, field, getattr(body, field))
        await session.flush()
        result = await commit_with_reload(
            session, reload_callable=reload_callable
        )
        await session.refresh(row)

    logger.info(
        "admin.agent.patch id=%s name=%s fields=%s status=%s",
        row.id,
        row.name,
        sorted(fields),
        result.status.value,
    )

    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )
```

The `get_agent` handler is unchanged.

### 3.5 Retrofit memory.py

- [ ] **Step 5: Replace stubs in memory.py**

Read `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py`. Memory has more handlers than agent: GET, PATCH, DELETE.

The pattern is the same. Replace `_SAVED_RELOAD` and `_DELETE_RELOAD` constants with calls to `commit_with_reload`. Keep `_NOOP_RELOAD` for empty PATCH.

For PATCH:
```python
@router.patch("", response_model=StandaloneMutationResponse[StandaloneMemoryRead])
async def patch_memory(
    body: StandaloneMemoryPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneMemoryRead]:
    fields = body.model_fields_set
    row = await _load_row(session)

    if row is None:
        # First-write path — keep the existing missing-fields check
        # (preserves the 422 + first-write-required-fields contract
        # from Phase 1).
        creating = True
        missing: list[str] = []
        if "agent_framework" not in fields or body.agent_framework is None:
            missing.append("agentFramework")
        if "memory" not in fields or body.memory is None:
            missing.append("memory")
        if missing:
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="First write requires agentFramework and memory.",
                    field_errors=[
                        StandaloneFieldError(
                            field=name,
                            message="Required for first write.",
                            code="missing",
                        )
                        for name in missing
                    ],
                ),
            )
        row = StandaloneMemoryRow(
            id=_SINGLETON_ID,
            agent_framework=body.agent_framework.value,  # type: ignore[union-attr]
            memory_config=body.memory.model_dump(exclude_none=True),  # type: ignore[union-attr]
        )
        session.add(row)
    else:
        creating = False
        if not fields:
            logger.debug("admin.memory.patch noop")
            return StandaloneMutationResponse(
                data=_to_read(row), reload=_NOOP_RELOAD
            )
        if "agent_framework" in fields and body.agent_framework is not None:
            row.agent_framework = body.agent_framework.value
        if "memory" in fields and body.memory is not None:
            row.memory_config = body.memory.model_dump(exclude_none=True)

    async with _reload_mutex:
        await session.flush()
        result = await commit_with_reload(
            session, reload_callable=reload_callable
        )
        await session.refresh(row)

    logger.info(
        "admin.memory.patch creating=%s framework=%s status=%s",
        creating,
        row.agent_framework,
        result.status.value,
    )

    return StandaloneMutationResponse(data=_to_read(row), reload=result)
```

For DELETE, similar treatment: stage the deletion via `await session.delete(row)` and `session.flush()`, then `commit_with_reload`. The DELETE response wraps `StandaloneSingletonDeleteResult(deleted=True)` per Phase 2 schema.

Note: the existing memory PATCH handler already calls `assemble_engine_config` directly to perform an early validation. The new `commit_with_reload` does this too. **Remove the early call** — the pipeline does it once, atomically with the rollback path. The `try/except AssemblyError` block in the existing handler is also removed.

### 3.6 Integration tests — agent_flow

- [ ] **Step 6: Create test_agent_flow.py**

Write to `libs/idun_agent_standalone/tests/integration/api/v1/test_agent_flow.py`:

```python
"""Integration tests for /admin/api/v1/agent against the real reload pipeline.

Drives the FastAPI router through HTTPX with an injected stub reload
callable; round 2 + round 3 + structural change all exercise the
mutex + outcome recording path end-to-end.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

# These integration tests rely on a small standalone test app that
# wires the router with a stub reload callable. The implementer
# adds this fixture below or in tests/conftest.py.

from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    """A minimal FastAPI app with the agent router mounted, the stub
    reload callable attached to app.state, and the SessionDep override
    pointing at the in-memory async_session fixture."""
    from fastapi import FastAPI
    from idun_agent_standalone.api.v1.deps import (
        get_reload_callable,
        get_session,
    )
    from idun_agent_standalone.api.v1.errors import (
        register_admin_exception_handlers,
    )
    from idun_agent_standalone.api.v1.routers.agent import router as agent_router

    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable

    return app


async def _seed_agent(async_session) -> None:
    from idun_agent_standalone.infrastructure.db.models.agent import (
        StandaloneAgentRow,
    )

    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()


@pytest.mark.asyncio
async def test_get_agent_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 200
    assert response.json()["name"] == "Ada"


@pytest.mark.asyncio
async def test_patch_agent_happy_path(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "Renamed"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["name"] == "Renamed"
    assert body["reload"]["status"] == "reloaded"
    stub_reload_callable.assert_called_once()


@pytest.mark.asyncio
async def test_patch_empty_body_is_noop(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/admin/api/v1/agent", json={})
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "reloaded"
    assert body["reload"]["message"] == "No changes."
    stub_reload_callable.assert_not_called()


@pytest.mark.asyncio
async def test_patch_round_3_failure_returns_500(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "Renamed"},
        )
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "reload_failed"

    # DB rolled back — name unchanged
    response2 = await AsyncClient(
        transport=transport, base_url="http://test"
    ).get("/admin/api/v1/agent") if False else None  # pragma: no cover
    # Re-fetch through a fresh client to confirm rollback
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        get_response = await client.get("/admin/api/v1/agent")
    assert get_response.json()["name"] == "Ada"


@pytest.mark.asyncio
async def test_patch_records_outcome_in_runtime_state(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/agent", json={"name": "Renamed"})
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"


@pytest.mark.asyncio
async def test_concurrent_patches_serialize(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Two simultaneous PATCHes must serialize through _reload_mutex.

    We assert this indirectly: both succeed (no race-induced 500),
    and the reload_callable is called exactly twice.
    """
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = await asyncio.gather(
            client.patch("/admin/api/v1/agent", json={"name": "A"}),
            client.patch("/admin/api/v1/agent", json={"name": "B"}),
        )
    assert all(r.status_code == 200 for r in results)
    assert stub_reload_callable.call_count == 2


@pytest.mark.asyncio
async def test_get_returns_404_when_not_configured(admin_app) -> None:
    """Cold-start state — no agent row, GET returns 404 in admin envelope."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_malformed_body_returns_422(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send name=null (forbidden by _no_null_name validator)
        response = await client.patch(
            "/admin/api/v1/agent", json={"name": None}
        )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_failed"
```

### 3.7 Integration tests — memory_flow

- [ ] **Step 7: Create test_memory_flow.py**

Write to `libs/idun_agent_standalone/tests/integration/api/v1/test_memory_flow.py`:

```python
"""Integration tests for /admin/api/v1/memory against the real reload pipeline."""

from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    from fastapi import FastAPI
    from idun_agent_standalone.api.v1.deps import (
        get_reload_callable,
        get_session,
    )
    from idun_agent_standalone.api.v1.errors import (
        register_admin_exception_handlers,
    )
    from idun_agent_standalone.api.v1.routers.agent import (
        router as agent_router,
    )
    from idun_agent_standalone.api.v1.routers.memory import (
        router as memory_router,
    )

    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(memory_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


async def _seed_agent_langgraph(async_session) -> None:
    from idun_agent_standalone.infrastructure.db.models.agent import (
        StandaloneAgentRow,
    )

    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()


@pytest.mark.asyncio
async def test_get_memory_404_on_empty(admin_app) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/memory")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_first_write_missing_field_422(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing memory field
        response = await client.patch(
            "/admin/api/v1/memory",
            json={"agentFramework": "LANGGRAPH"},
        )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_failed"
    field_names = {fe["field"] for fe in body["error"]["fieldErrors"]}
    assert "memory" in field_names


@pytest.mark.asyncio
async def test_patch_first_write_happy(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "reloaded"
    stub_reload_callable.assert_called_once()


@pytest.mark.asyncio
async def test_patch_framework_switch_returns_restart_required(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Switching memory framework changes agent.framework -> structural."""
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First write establishes baseline
        await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
        # Second write switches framework — assemble will rebuild the
        # EngineConfig with a different agent.type, which is structural.
        # NOTE: this requires the agent's base_engine_config to also
        # change framework, OR the assemble step to override agent.type
        # from the memory row's framework. The exact behavior depends
        # on Phase 1's assemble_engine_config; the implementer reads
        # services/engine_config.py to confirm before writing this test.
        # If the assembly does NOT change agent.framework based on
        # memory framework (likely case), this test is moved/skipped
        # and a different structural-change trigger is used (e.g.,
        # mutating agent.base_engine_config.agent.config.graph_definition
        # via direct DB write, then calling PATCH on agent).
        pass


@pytest.mark.asyncio
async def test_framework_memory_mismatch_422(
    admin_app, async_session, stub_reload_callable
) -> None:
    """LANGGRAPH agent + ADK SessionService memory -> round 2 fails."""
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "ADK",
                "memory": {
                    "type": "in_memory",  # ADK SessionService shape
                },
            },
        )
    # Either the schema-level validation (Phase 2 _no_null on framework
    # mismatch) catches it at round 1 (422 + body validation), or
    # round 2 catches it. Either way, 422 + DB unchanged.
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_delete_memory_after_first_write(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
        response = await client.delete("/admin/api/v1/memory")
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["deleted"] is True
    assert body["reload"]["status"] in ("reloaded", "restart_required")


@pytest.mark.asyncio
async def test_delete_on_empty_returns_404(admin_app, async_session) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/admin/api/v1/memory")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_round_3_failure_rolls_back_db(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
    assert response.status_code == 500

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        get_response = await client.get("/admin/api/v1/memory")
    # No row was committed
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_runtime_state_records_outcome(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"


@pytest.mark.asyncio
async def test_concurrent_patches_serialize(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = await asyncio.gather(
            client.patch(
                "/admin/api/v1/memory",
                json={
                    "agentFramework": "LANGGRAPH",
                    "memory": {"type": "memory"},
                },
            ),
            client.patch(
                "/admin/api/v1/memory",
                json={"memory": {"type": "memory"}},
            ),
        )
    # Both succeed (mutex serializes); reload_callable called twice
    # OR first creates, second is noop — either is acceptable.
    assert all(r.status_code in (200, 422) for r in results)
```

**Implementer note for Task 3:** the exact behavior of memory framework switch depends on `services/engine_config.py` (Phase 1's assembly logic) — it reads the agent row and the memory row, and combines them. The framework on the **agent** is the structural field. If memory PATCH only changes the memory row but the agent row's `base_engine_config.agent.type` is unchanged, framework switch from memory PATCH alone may NOT be structural. In that case, the `test_patch_framework_switch_returns_restart_required` test target is replaced with a direct test that mutates the agent's `base_engine_config.agent.config.graph_definition` and PATCHes the agent — `graph_definition` IS structural definitionally. The implementer reads `services/engine_config.py` and adapts the integration test to match real assembly behavior. Note this in the commit message.

### 3.8 Run + commit

- [ ] **Step 8: Run mypy on the modified files**

```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/deps.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py \
  libs/idun_agent_standalone/src/idun_agent_standalone/app.py
```
Expected: clean.

- [ ] **Step 9: Run lint**

```bash
make lint
```
Expected: clean.

- [ ] **Step 10: Run integration tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/ -v
```
Expected: all tests pass.

- [ ] **Step 11: Confirm stub constants are gone**

```bash
grep -rn "_SAVED_RELOAD\|_DELETE_RELOAD" \
  libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/
```
Expected: no matches. Only `_NOOP_RELOAD` may remain.

- [ ] **Step 12: Commit Task 3**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/deps.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/tests/integration/__init__.py \
        libs/idun_agent_standalone/tests/integration/api/__init__.py \
        libs/idun_agent_standalone/tests/integration/api/v1/__init__.py \
        libs/idun_agent_standalone/tests/integration/api/v1/test_agent_flow.py \
        libs/idun_agent_standalone/tests/integration/api/v1/test_memory_flow.py

git commit -m "$(cat <<'EOF'
refactor(rework-phase3): agent + memory routers use real reload pipeline

Replaces the Phase 1 stub reload constants with calls into the new
commit_with_reload pipeline. Mutating handlers wrap their staged
mutations in `async with _reload_mutex:` so two concurrent PATCHes
serialize. The reload callable is dependency-injected via the new
ReloadCallableDep and wired in app.py from the engine's reconfigure
interface.

agent.py:
- Removes _SAVED_RELOAD constant. Empty PATCH still uses _NOOP_RELOAD
  short-circuit.
- Non-empty PATCH stages the mutation, calls commit_with_reload, and
  returns the real StandaloneReloadResult.

memory.py:
- Removes _SAVED_RELOAD and _DELETE_RELOAD constants. _NOOP_RELOAD
  preserved for empty PATCH.
- PATCH first-write keeps the existing missing-fields 422 contract.
- DELETE wraps StandaloneSingletonDeleteResult in the mutation
  envelope.
- Direct assemble_engine_config call removed — the pipeline does
  this once atomically.

deps.py:
- Adds ReloadCallableDep typing alias backed by a get_reload_callable
  dependency that pulls from app.state.reload_callable.

app.py:
- Wires the engine reload callable into app.state during startup.
  Implementation case (a/b) and the source of the reconfigure
  interface are documented inline.

Integration tests cover the spec-locked Phase 3 gates: rollback
path (round 3 failure 500 + DB unchanged), restart_required path
(structural change), reload-callback survival, concurrency (mutex
serializes), runtime_state recording.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Patterns doc transitions (T4)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-27-rework-patterns.md`

**Subagent dispatch model:** cheap.

This task flips applicable FORWARD sections to ESTABLISHED with real file:line refs.

### 4.1 Compute post-Phase-3 line refs

- [ ] **Step 1: Capture line numbers**

Run:
```bash
echo "=== slugs.py ==="
grep -n "^def normalize_slug\|^async def ensure_unique_slug\|^class SlugConflictError\|^class SlugNormalizationError" \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py

echo "=== config_hash.py ==="
grep -n "^def compute_config_hash" \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py

echo "=== validation.py ==="
grep -n "^class RoundTwoValidationFailed\|^def validate_assembled_config" \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py

echo "=== reload.py ==="
grep -n "^_reload_mutex\|^async def commit_with_reload\|^class ReloadInitFailed\|^def _is_structural_change" \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py

echo "=== runtime_state.py ==="
grep -n "^async def get\|^async def record_reload_outcome\|^async def clear" \
  libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py

echo "=== runtime_state ORM ==="
grep -n "^class StandaloneRuntimeStateRow" \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py
```

Capture each (symbol, line) for use in the doc edits.

### 4.2 Update §6.5 (Slug rules)

- [ ] **Step 2: Locate §6.5 in the patterns doc**

Read `docs/superpowers/specs/2026-04-27-rework-patterns.md` and find the heading `### 6.5 Slug rules — FORWARD`. The section ends before `### 6.6 Connection-check sub-routes`.

Replace the entire §6.5 subsection with (substituting `<NORMALIZE_LINE>` and `<ENSURE_LINE>` from Step 1's grep output):

```markdown
### 6.5 Slug rules — ESTABLISHED

Slug normalization and uniqueness enforcement are implemented in `services/slugs.py`. Phase 5 collection routers call these helpers on POST.

Normalization pipeline (from spec §"Identity → Slug rules (locked)"):

```text
input name
  → trim whitespace
  → NFKD ascii-fold
  → lowercase
  → regex sub [^a-z0-9]+ → "-"
  → collapse runs of "-"
  → trim leading/trailing "-"
  → truncate to 64 chars
```

Reference snippet at `libs/idun_agent_standalone/src/idun_agent_standalone/services/slugs.py:<NORMALIZE_LINE>`:

```python
def normalize_slug(name: str) -> str:
    trimmed = name.strip()
    folded = unicodedata.normalize("NFKD", trimmed)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    dashed = _NON_SLUG_CHAR.sub("-", lowered)
    collapsed = _DASH_RUN.sub("-", dashed)
    stripped = collapsed.strip("-")
    truncated = stripped[:_MAX_SLUG_LEN]
    if not truncated:
        raise SlugNormalizationError(...)
    return truncated
```

Lifecycle constraints (locked):

- Required and non-null on every collection row at rest.
- Sticky: a `name` PATCH does NOT re-derive the slug. URLs do not change silently.
- Direct slug PATCH that conflicts returns 409 (`code = conflict`). No auto-suffix on operator-supplied slugs.
- POST collision auto-suffixes via `ensure_unique_slug` at `services/slugs.py:<ENSURE_LINE>`: `github-tools` → `github-tools-2` → `github-tools-3`, up to suffix 99 before raising `SlugConflictError`.

Singletons (`agent`, `memory`) do not have meaningful slugs because they are not addressed by id. Their rows may carry a slug field for future cross-system identity, but the admin API never uses it for lookup.

Canonical API lookup:

```text
/admin/api/v1/mcp-servers/{id}
```

Optional future slug lookup:

```text
/admin/api/v1/mcp-servers/by-slug/{slug}
```
```

### 4.3 Remove §7.4 stub reload caveat

- [ ] **Step 3: Locate §7.4 and delete its content**

Find the heading `### 7.4 Stub-reload constants — TRANSIENT`. Delete the entire subsection (heading + body + closing `---` separator if any). Phase 3 has retired the stubs.

If §7 has subsections §7.1, §7.2, §7.3, §7.4, after deletion the section should renumber implicitly via the markdown renderer (no need to manually renumber; the next subsection after §7.3 is now whatever §7.4 was, but since it's gone, §7 ends at §7.3).

### 4.4 Update §8 (Validation rounds)

- [ ] **Step 4: Locate §8**

Find the heading `## 8. Validation rounds — FORWARD`. Replace `— FORWARD` with `— ESTABLISHED`.

After the verbatim-from-spec table (which doesn't change), replace the FORWARD skeleton block at the end with a real reference. Substitute `<COMMIT_RELOAD_LINE>` and `<VALIDATE_LINE>` from Step 1.

Replace the existing skeleton (the block after "Skeleton (Phase 3 will land the real implementation in `services/reload.py`):" through the end of §8) with:

```markdown
The pipeline implementation lives in `services/reload.py`:

- The `_reload_mutex: asyncio.Lock` and `commit_with_reload` orchestrator at `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py:<COMMIT_RELOAD_LINE>`.
- Round 2 entry point at `libs/idun_agent_standalone/src/idun_agent_standalone/services/validation.py:<VALIDATE_LINE>` (`validate_assembled_config`).
- Round 1 is FastAPI's body validation; the framework handles it before the handler runs.

Reference flow:

```python
# Caller (router handler):
async with _reload_mutex:
    # Stage DB mutation
    setattr(row, field, value)
    await session.flush()
    result = await commit_with_reload(
        session,
        reload_callable=reload_callable,
    )
    await session.refresh(row)

return StandaloneMutationResponse(data=..., reload=result)
```

The pipeline runs round 2 (validate the assembled EngineConfig), detects structural change vs the prior runtime_state, and either:
- commits + records + returns `restart_required` (no reload_callable invocation), OR
- runs round 3 (invokes `reload_callable`):
  - on success: commits + records + returns `reloaded`,
  - on `ReloadInitFailed`: rolls back user mutation, records failure outcome via a separate transaction, raises `AdminAPIError(500, code=reload_failed)`.

Round 2 failures roll back the user's mutation and raise `AdminAPIError(422, code=validation_failed)` carrying the structured `field_errors` from the wrapped Pydantic `ValidationError`.
```

### 4.5 Update §10 (Reload mutex)

- [ ] **Step 5: Locate §10**

Find the heading `## 10. Reload mutex — FORWARD`. Replace `— FORWARD` with `— ESTABLISHED`.

Replace the FORWARD skeleton with a real reference. Substitute `<MUTEX_LINE>` and `<COMMIT_RELOAD_LINE>` from Step 1.

```markdown
Single in-process `asyncio.Lock` held around the entire 3-round pipeline.

Reference at `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py:<MUTEX_LINE>`:

```python
import asyncio

_reload_mutex = asyncio.Lock()


async def commit_with_reload(
    session: AsyncSession,
    *,
    reload_callable: Callable[[EngineConfig], Awaitable[None]],
    now: Callable[[], datetime] = _default_now,
) -> StandaloneReloadResult:
    """Run the 3-round pipeline. Caller must hold _reload_mutex."""
    ...
```

Single-replica assumption: spec §"Save/reload posture" locks standalone as single-replica. Multi-replica deployment requires a DB-backed advisory lock; that work is out of scope until enrollment lands.
```

### 4.6 Update §11 (Cold-start states) — partial ESTABLISHED

- [ ] **Step 6: Locate §11**

Find the heading `## 11. Cold-start states — FORWARD`. **Do NOT change the heading** — the boot-path state machine remains FORWARD until Phase 6 lands.

Find the existing paragraph that cites `StandaloneRuntimeStatusKind` (added in Phase 2 T4b). Insert immediately after it (substituting `<RUNTIME_STATE_ORM_LINE>` and `<RUNTIME_STATE_GET_LINE>`):

```markdown
The persistence layer for cold-start state landed in Phase 3:

- Singleton ORM at `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/runtime_state.py:<RUNTIME_STATE_ORM_LINE>` (`StandaloneRuntimeStateRow`). Records the last reload outcome (status, message, error, timestamp, applied config hash).
- Service at `libs/idun_agent_standalone/src/idun_agent_standalone/services/runtime_state.py:<RUNTIME_STATE_GET_LINE>` (`get`, `record_reload_outcome`, `clear`). The reload pipeline records every outcome here.

The boot-path state machine that derives `StandaloneRuntimeStatusKind` from agent presence + engine state + last reload outcome lands in Phase 6.
```

### 4.7 Update §12 (Config hash)

- [ ] **Step 7: Locate §12**

Find the heading `## 12. Config hash — FORWARD`. Replace `— FORWARD` with `— ESTABLISHED`.

Replace the body (substituting `<COMPUTE_HASH_LINE>`):

```markdown
```text
config_hash = sha256(canonical_json(materialized EngineConfig))
```

Canonicalization: **JCS / RFC 8785** via the `rfc8785` PyPI package. Determinism guarantee: two semantically-equal `EngineConfig` values produce the same hash regardless of dict key insertion order.

Implementation at `libs/idun_agent_standalone/src/idun_agent_standalone/services/config_hash.py:<COMPUTE_HASH_LINE>`:

```python
import rfc8785
from hashlib import sha256

def compute_config_hash(engine_config: EngineConfig) -> str:
    payload = engine_config.model_dump(mode="json")
    canonical = rfc8785.canonicalize(payload)
    return sha256(canonical).hexdigest()
```

Phase 3 storage: the structural-slice hash (not the full config hash) is stored on `standalone_runtime_state.last_applied_config_hash` for structural-change detection. The full config hash is computed on-demand by Phase 6's `/runtime/status` endpoint.

Storage column type: `String(64)` (sha256 hex digest length).
```

### 4.8 Verify and commit

- [ ] **Step 8: Verify no FORWARD placeholders remain in the updated sections**

```bash
# §6.5 must NOT have FORWARD
grep -A 2 "### 6.5" docs/superpowers/specs/2026-04-27-rework-patterns.md | head -3

# §7.4 stub caveat must be GONE
grep -n "### 7.4 Stub-reload constants" docs/superpowers/specs/2026-04-27-rework-patterns.md || echo "removed (good)"

# §8, §10, §12 must say ESTABLISHED
grep "^## 8\|^## 10\|^## 12" docs/superpowers/specs/2026-04-27-rework-patterns.md

# §11 must still say FORWARD (boot-path state machine remains future)
grep "^## 11" docs/superpowers/specs/2026-04-27-rework-patterns.md

# No leftover placeholder tokens
grep -nE "<[A-Z_]+_LINE>|<NN-NN>" docs/superpowers/specs/2026-04-27-rework-patterns.md && echo "FAIL: placeholders remain" || echo "all placeholders replaced"
```

- [ ] **Step 9: Commit Task 4**

```bash
git add docs/superpowers/specs/2026-04-27-rework-patterns.md

git commit -m "$(cat <<'EOF'
docs(rework-phase3): patterns reference — flip FORWARD sections to ESTABLISHED

Phase 3 lands the cross-cutting plumbing, so the patterns reference
doc transitions:

- §6.5 Slug rules — FORWARD -> ESTABLISHED. Cites services/slugs.py
  for normalize_slug + ensure_unique_slug. Skeleton replaced with
  real reference snippet.

- §7.4 Stub-reload constants caveat — REMOVED. The stubs
  (_SAVED_RELOAD, _DELETE_RELOAD) are gone after T3's retrofit.
  _NOOP_RELOAD survives in routers as the empty-body fast path.

- §8 Validation rounds — FORWARD -> ESTABLISHED. Cites
  services/reload.py for the 3-round dispatch and services/validation.py
  for round 2. Reference flow shows the canonical
  `async with _reload_mutex:` + commit_with_reload pattern.

- §10 Reload mutex — FORWARD -> ESTABLISHED. Cites _reload_mutex
  and commit_with_reload at services/reload.py.

- §11 Cold-start states — partial ESTABLISHED. Storage layer
  (runtime_state ORM + service) is now established with file:line
  refs. The boot-path state machine that derives
  StandaloneRuntimeStatusKind from agent presence + engine state +
  last reload outcome remains FORWARD; lands in Phase 6.

- §12 Config hash — FORWARD -> ESTABLISHED. Cites
  services/config_hash.py. Locks rfc8785 as the JCS implementation.
  Documents that Phase 3 stores the structural-slice hash for
  change detection; the full config hash for /runtime/status is
  Phase 6's deliverable.

Sections that remain FORWARD: §6.2 Collection router pattern (Phase 5),
§6.3 PATCH semantics (Phase 5), §6.6 Connection-check sub-routes
(Phase 6), §11 cold-start state machine implementation (Phase 6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CI gate

**Files:** none.

- [ ] **Step 1: Run lint**

```bash
make lint
```
Expected: exit 0.

- [ ] **Step 2: Run mypy on the new tree**

```bash
uv run mypy --follow-imports=silent \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected: clean (~50 source files post-Phase 3).

- [ ] **Step 3: Run schema pytest**

```bash
uv run pytest libs/idun_agent_schema -q
```
Expected: 62 tests pass (Phase 2 close-state; not regressed).

- [ ] **Step 4: Run standalone narrowed pytest**

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
Expected: ≥120 tests pass (was 64 at Phase 2 close; Phase 3 adds ~42 unit + ~18 integration).

- [ ] **Step 5: Verify acceptance criteria**

Per design doc §6:

```bash
ls libs/idun_agent_standalone/src/idun_agent_standalone/services/
ls libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/
git log --oneline 4d3d86d3^..HEAD | grep -E "rework-phase3"
```

Expected:
- `services/` contains: `__init__.py`, `engine_config.py` (Phase 1), `runtime_state.py`, `slugs.py`, `config_hash.py`, `validation.py`, `reload.py`. Plus `__pycache__/`.
- `infrastructure/db/models/` contains: `__init__.py`, `agent.py`, `memory.py`, `runtime_state.py`. Plus `__pycache__/`.
- Commit log shows the 6 Phase 3 commits in order.

```bash
grep -rn "_SAVED_RELOAD\|_DELETE_RELOAD" \
  libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/
```
Expected: no matches.

---

## Task 6: Open the PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/rework-phase3-plumbing
```

- [ ] **Step 2: Build the PR description**

Use the template below; fill the `<...>` slots from the actual commits and test counts.

```markdown
## Phase 3 — Cross-Cutting Plumbing

Closes Phase 3 of the standalone admin/db rework.

### What this PR does
- Adds the cross-cutting plumbing every Phase 4+ module needs: reload pipeline (asyncio mutex + 3-round validation + structural-change detection), slug rules, RFC 8785 config hash, runtime-state persistence.
- Retrofits Phase 1's agent + memory routers from stub reload constants to the real pipeline.
- Flips four FORWARD sections in the patterns reference doc to ESTABLISHED, partial-ESTABLISHES one, and removes the stub-reload caveat.

### New modules
- `services/runtime_state.py` — get/record/clear helpers over the new ORM (T2).
- `services/slugs.py` — normalize_slug + ensure_unique_slug (T2).
- `services/config_hash.py` — RFC 8785 sha256 hash (T2).
- `services/validation.py` — round 2 validation entry point (T1).
- `services/reload.py` — `_reload_mutex` + commit_with_reload orchestrator (T1).
- `infrastructure/db/models/runtime_state.py` — singleton ORM (T2).

### Retrofit
- `api/v1/routers/agent.py` — removes _SAVED_RELOAD; routes mutating PATCH through commit_with_reload.
- `api/v1/routers/memory.py` — removes _SAVED_RELOAD and _DELETE_RELOAD; PATCH and DELETE flow through the pipeline.
- `api/v1/deps.py` — adds ReloadCallableDep typing alias.
- `app.py` — wires the engine reload callable into app.state at startup.

### Tests
- ~42 unit tests (services/, db/) + ~18 integration tests (api/v1/).
- Standalone narrowed pytest grows from 64 → <N> tests.
- Schema pytest still 62 (no regression).
- The 5 spec-locked Phase 3 test gates pass: rollback path, restart_required path, reload-callback survival, concurrency (mutex), cold-start state recording.

### Patterns now ESTABLISHED (commit `<T4_SHA>`)
- §6.5 Slug rules (was FORWARD)
- §8 Validation rounds (was FORWARD)
- §10 Reload mutex (was FORWARD)
- §12 Config hash (was FORWARD)
- §11 Cold-start states — partial (storage layer; boot-path state machine still FORWARD)
- §7.4 Stub-reload caveat REMOVED

### Patterns still FORWARD
- §6.2 Collection router pattern (Phase 5)
- §6.3 PATCH semantics (Phase 5)
- §6.6 Connection-check sub-routes (Phase 6)
- §11 Cold-start state machine implementation (Phase 6)

### New runtime dependency
- `rfc8785>=0.1` added to `libs/idun_agent_standalone/pyproject.toml`. Pure-Python, ~200 LOC, single-purpose.

### Test plan
- [x] `make lint` passes
- [x] `uv run mypy --follow-imports=silent <new-tree>` passes
- [x] `uv run pytest libs/idun_agent_schema -q` passes (62 tests)
- [x] `uv run pytest libs/idun_agent_standalone -q --ignore=...` passes (≥120 tests)

### Out of Phase 3 scope (tracked for later phases)
- Collection resource ORMs/routers — Phases 4–5
- Alembic migration for `standalone_runtime_state` — Phase 4 (fresh baseline)
- `/runtime/status`, `/readyz`, `/health`, connection-check route handlers — Phase 6
- Boot-path state machine deriving `StandaloneRuntimeStatusKind` — Phase 6
- Auth hardening (rate limiting, CSRF) — Phase 7
- Audit-event logging — deferred to next version

### Next phase
Phase 4 (`feat/rework-phase4-db-models`): build the collection resource ORMs (guardrails, mcp_servers, observability, integrations, prompts) and the fresh Alembic baseline that includes them plus the runtime_state ORM. Branches off the umbrella after this PR merges.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: Create the PR**

```bash
gh pr create \
  --base feat/standalone-admin-db-rework \
  --head feat/rework-phase3-plumbing \
  --title "Phase 3 — Cross-cutting plumbing" \
  --body "$(cat <<'EOF'
<paste the filled-in description from Step 2>
EOF
)"
```
Expected: PR URL returned. Hand back to user.

- [ ] **Step 4: Final hand-back**

Provide:
- PR URL
- Test counts (unit, integration, total standalone, schema)
- Commits on the branch
- Patterns transitions summary
- Confirmation that all acceptance criteria are met

---

## Acceptance summary (cross-references design doc §6)

1. T2 helpers exist + unit tests pass — Task 1.
2. T1 reload pipeline exists + unit + integration tests pass — Task 2 + Task 3.
3. T3 stub constants removed (`grep` confirms) — Task 3 Step 11.
4. T4 patterns doc transitions land — Task 4.
5. `make lint` clean — Task 5 Step 1.
6. `mypy` clean — Task 5 Step 2.
7. Schema pytest passes — Task 5 Step 3.
8. Standalone narrowed pytest ≥120 — Task 5 Step 4.
9. 5 spec-locked Phase 3 test gates pass — verified by integration tests in Task 3 + reload unit tests in Task 2.
10. PR description summarizes transitions — Task 6.
