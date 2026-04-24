# Standalone Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `idun-agent-standalone` — a single-process, single-tenant deployment of one Idun agent that ships with an embedded chat UI, admin panel, first-party traces viewer, and UI shells (labeled "coming soon") for dashboard + logs. Deployable as one Docker image on Cloud Run, a VM, or a laptop.

**Architecture:** New Python package `libs/idun_agent_standalone/` that composes the existing `idun_agent_engine` + a local SQLite/Postgres store + a Next.js 15 static-export UI bundled into the wheel. Shares `idun_agent_schema` with the governance hub; otherwise independent. Three small additive hooks upstream into `idun_agent_engine`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x (async), Alembic, bcrypt, itsdangerous, Pydantic 2. Next.js 15 (static export), React 19, Tailwind v4, shadcn/ui, TanStack Query, Zustand, react-hook-form + zod, @ag-ui/client, @monaco-editor/react, Recharts, lucide-react, sonner. pnpm. Docker. Published as `idun-agent-standalone` wheel + `ghcr.io/idun-group/idun-agent-standalone` image.

**Spec:** `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`

**Phases:**
- Phase 0 — Upstream engine hooks (can ship ahead of the rest)
- Phase 1 — Standalone package skeleton
- Phase 2 — Database layer (SQLAlchemy + Alembic)
- Phase 3 — Config bootstrap (DB ← YAML, export/import)
- Phase 4 — Auth (password + sessions)
- Phase 5 — Admin REST surface
- Phase 6 — Engine integration + reload orchestrator
- Phase 7 — Traces capture
- Phase 8 — Runtime config + static UI mount
- Phase 9 — Next.js skeleton + theme
- Phase 10 — Chat UI
- Phase 11 — Admin UI editors
- Phase 12 — Traces UI
- Phase 13 — Dashboard + Logs shells (mocked per §9 of spec)
- Phase 14 — Docker + packaging
- Phase 15 — E2E tests + docs

**Conventions:**
- One concern per commit. Commit after each task.
- TDD: write the failing test, run it red, implement, run green, commit.
- `make lint` before each commit.
- Python: Black format, Ruff lint, mypy for new code. Line length 88.
- TypeScript: Biome format/lint (shadcn default). Strict mode.
- No `Any` in Python; use `TypedDict`, dataclasses, or Pydantic models.
- No comments stating what well-named code does.

---

## Phase 0 — Upstream Engine Hooks

Additive changes to `libs/idun_agent_engine`. These can ship as an independent PR and bump the engine version.

### Task 0.1: Add run-event observer registry to engine

**Files:**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/agent/observers.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py`
- Test: `libs/idun_agent_engine/tests/unit/agent/test_observers.py`

- [ ] **Step 1: Write the failing test**

```python
# libs/idun_agent_engine/tests/unit/agent/test_observers.py
import pytest
from idun_agent_engine.agent.observers import RunEventObserverRegistry, RunContext


class FakeEvent:
    def __init__(self, type: str):
        self.type = type


@pytest.mark.asyncio
async def test_registry_dispatches_events_to_observers():
    registry = RunEventObserverRegistry()
    received: list[tuple[str, str]] = []

    async def obs(event, ctx: RunContext) -> None:
        received.append((event.type, ctx.thread_id))

    registry.register(obs)
    await registry.dispatch(FakeEvent("RunStarted"), RunContext(thread_id="t1", run_id="r1"))
    assert received == [("RunStarted", "t1")]


@pytest.mark.asyncio
async def test_registry_isolates_observer_failures(caplog):
    registry = RunEventObserverRegistry()

    async def broken(event, ctx):
        raise RuntimeError("boom")

    async def healthy(event, ctx):
        healthy.calls.append(event.type)
    healthy.calls = []  # type: ignore[attr-defined]

    registry.register(broken)
    registry.register(healthy)
    await registry.dispatch(FakeEvent("RunFinished"), RunContext(thread_id="t", run_id="r"))
    assert healthy.calls == ["RunFinished"]  # type: ignore[attr-defined]
    assert any("observer failed" in r.message for r in caplog.records)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_observers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'idun_agent_engine.agent.observers'`

- [ ] **Step 3: Write minimal implementation**

```python
# libs/idun_agent_engine/src/idun_agent_engine/agent/observers.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RunContext:
    thread_id: str
    run_id: str


RunEventObserver = Callable[[Any, RunContext], Awaitable[None]]


class RunEventObserverRegistry:
    def __init__(self) -> None:
        self._observers: list[RunEventObserver] = []

    def register(self, observer: RunEventObserver) -> None:
        self._observers.append(observer)

    def clear(self) -> None:
        self._observers.clear()

    async def dispatch(self, event: Any, context: RunContext) -> None:
        for obs in self._observers:
            try:
                await obs(event, context)
            except Exception:
                logger.exception("run-event observer failed")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_observers.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Attach registry to the engine's BaseAgent**

Read `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py`. Add a `run_event_observers: RunEventObserverRegistry` attribute in `BaseAgent.__init__` and a public helper:

```python
# at the top of base.py
from idun_agent_engine.agent.observers import RunEventObserverRegistry

# inside BaseAgent.__init__
self.run_event_observers = RunEventObserverRegistry()

# public method on BaseAgent
def register_run_event_observer(self, observer) -> None:
    self.run_event_observers.register(observer)
```

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/observers.py \
        libs/idun_agent_engine/src/idun_agent_engine/agent/base.py \
        libs/idun_agent_engine/tests/unit/agent/test_observers.py
git commit -m "feat(engine): add run-event observer registry on BaseAgent"
```

### Task 0.2: Wire observers into `/agent/run` SSE yielder

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py` (or wherever `/agent/run` is defined — find via `rg "agent/run" libs/idun_agent_engine/src`)
- Test: `libs/idun_agent_engine/tests/integration/server/test_agent_run_observers.py`

- [ ] **Step 1: Locate the SSE yielder**

Run: `rg -n "agent/run" libs/idun_agent_engine/src` — identify the file that registers `/agent/run` and contains the `async def` generator that yields AG-UI events.

- [ ] **Step 2: Write the failing integration test**

```python
# libs/idun_agent_engine/tests/integration/server/test_agent_run_observers.py
import pytest
from httpx import AsyncClient
from idun_agent_engine.server.app_factory import create_app
from idun_agent_engine.agent.observers import RunContext


@pytest.mark.asyncio
async def test_observers_called_before_sse_encoding(echo_agent_config):
    app = create_app(echo_agent_config)
    captured: list = []

    async def obs(event, ctx: RunContext):
        captured.append((type(event).__name__, ctx.thread_id, ctx.run_id))

    app.state.engine.register_run_event_observer(obs)

    async with AsyncClient(app=app, base_url="http://t") as client:
        resp = await client.post(
            "/agent/run",
            json={
                "threadId": "tid_1",
                "runId": "rid_1",
                "messages": [{"role": "user", "content": "hi"}],
                "state": {},
            },
            headers={"accept": "text/event-stream"},
        )
        assert resp.status_code == 200
        # drain the stream
        await resp.aread()

    types = {t for (t, _tid, _rid) in captured}
    assert "RunStartedEvent" in types or any("RunStarted" in t for t in types)
    assert all(tid == "tid_1" and rid == "rid_1" for (_, tid, rid) in captured)
```

Note: `echo_agent_config` is a fixture that returns an `EngineConfig` wrapping a trivial echo agent — see Task 1.5 for its implementation. For now, add a `conftest.py` stub that `xfail`s the test if the fixture is missing, so this task is runnable independently:

```python
# libs/idun_agent_engine/tests/integration/server/conftest.py
import pytest

@pytest.fixture
def echo_agent_config():
    pytest.importorskip("idun_agent_standalone.testing")  # provided in Task 1.5
    from idun_agent_standalone.testing import echo_agent_config
    return echo_agent_config()
```

- [ ] **Step 3: Modify the SSE yielder**

In the `/agent/run` handler, find the loop that iterates over agent events and encodes them. Add observer dispatch before encoding:

```python
# before the for-loop
from idun_agent_engine.agent.observers import RunContext

# inside the generator, for each yielded event:
async for event in agent.run_stream(input_payload):
    await request.app.state.engine.run_event_observers.dispatch(
        event, RunContext(thread_id=input_payload.threadId, run_id=input_payload.runId)
    )
    yield encoder.encode(event)
```

Adjust attribute access to match the actual engine plumbing (`app.state.engine` is the `BaseAgent`; confirm via the file you found in Step 1).

- [ ] **Step 4: Run existing engine tests and the new test**

Run:
```
uv run pytest libs/idun_agent_engine/tests/unit -v
uv run pytest libs/idun_agent_engine/tests/integration/server/test_agent_run_observers.py -v
```

If the new integration test is skipped (fixture missing), that's expected — it'll be enabled after Task 1.5. Unit tests must pass.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server \
        libs/idun_agent_engine/tests/integration/server
git commit -m "feat(engine): dispatch run events to observers before SSE encoding"
```

### Task 0.3: Pluggable reload auth

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/app_factory.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py`
- Test: `libs/idun_agent_engine/tests/integration/server/test_reload_auth.py`

- [ ] **Step 1: Write the failing test**

```python
# libs/idun_agent_engine/tests/integration/server/test_reload_auth.py
import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from idun_agent_engine.server.app_factory import create_app


@pytest.mark.asyncio
async def test_reload_unprotected_when_no_auth_dep(echo_agent_config):
    app = create_app(echo_agent_config)
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/reload")
        assert r.status_code in (200, 204)


@pytest.mark.asyncio
async def test_reload_blocked_when_auth_dep_rejects(echo_agent_config):
    def deny() -> None:
        raise HTTPException(status_code=401, detail="nope")

    app = create_app(echo_agent_config, reload_auth=deny)
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/reload")
        assert r.status_code == 401
```

- [ ] **Step 2: Run test (skipped on missing fixture for now is OK)**

Run: `uv run pytest libs/idun_agent_engine/tests/integration/server/test_reload_auth.py -v`
Expected: if fixture is missing, skip; otherwise FAIL because `create_app` doesn't accept `reload_auth`.

- [ ] **Step 3: Add `reload_auth` kwarg to `create_app`**

Modify `app_factory.py`:

```python
from typing import Callable

def create_app(
    engine_config,
    *,
    reload_auth: Callable[..., None] | None = None,
) -> FastAPI:
    # existing body ...
    app.state.reload_auth = reload_auth
    return app
```

- [ ] **Step 4: Wire into the `/reload` route**

Modify `routers/base.py` around line 42:

```python
from fastapi import Depends, Request

def _resolve_reload_auth(request: Request):
    auth = getattr(request.app.state, "reload_auth", None)
    if auth is None:
        return lambda: None
    return auth

@router.post("/reload")
async def reload(
    request: Request,
    _auth: None = Depends(_resolve_reload_auth),
):
    ...  # existing reload body unchanged
```

- [ ] **Step 5: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/integration/server/test_reload_auth.py -v`
Expected: PASS for the "no auth" case; PASS for the "deny" case.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/app_factory.py \
        libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py \
        libs/idun_agent_engine/tests/integration/server/test_reload_auth.py
git commit -m "feat(engine): accept pluggable auth dependency for /reload"
```

### Task 0.4: Static UI mount via `IDUN_UI_DIR`

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/app_factory.py`
- Test: `libs/idun_agent_engine/tests/integration/server/test_static_ui_mount.py`

- [ ] **Step 1: Write the failing test**

```python
# libs/idun_agent_engine/tests/integration/server/test_static_ui_mount.py
import os
import pytest
from httpx import AsyncClient
from idun_agent_engine.server.app_factory import create_app


@pytest.mark.asyncio
async def test_root_serves_info_when_no_ui_dir(monkeypatch, echo_agent_config):
    monkeypatch.delenv("IDUN_UI_DIR", raising=False)
    app = create_app(echo_agent_config)
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/")
        assert r.status_code == 200
        assert "application/json" in r.headers["content-type"]


@pytest.mark.asyncio
async def test_root_serves_static_index_when_ui_dir_set(monkeypatch, tmp_path, echo_agent_config):
    (tmp_path / "index.html").write_text("<!doctype html><title>TEST</title>")
    monkeypatch.setenv("IDUN_UI_DIR", str(tmp_path))
    app = create_app(echo_agent_config)

    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/")
        assert r.status_code == 200
        assert "TEST" in r.text

        r2 = await c.get("/_engine/info")
        assert r2.status_code == 200
        assert "application/json" in r2.headers["content-type"]
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_engine/tests/integration/server/test_static_ui_mount.py -v`
Expected: FAIL — `/_engine/info` 404 and root doesn't serve static.

- [ ] **Step 3: Modify `app_factory.py`**

Find the route registration for `/`. Move its handler onto `/_engine/info` and conditionally mount static files at `/`:

```python
from pathlib import Path
from fastapi.staticfiles import StaticFiles

# rename existing @app.get("/") → @app.get("/_engine/info")
# then:
def _maybe_mount_static_ui(app: FastAPI) -> None:
    ui_dir = os.environ.get("IDUN_UI_DIR")
    if not ui_dir:
        return
    ui_path = Path(ui_dir)
    if not ui_path.is_dir():
        logger.warning("IDUN_UI_DIR=%s does not exist; skipping static UI mount", ui_dir)
        return
    app.mount("/", StaticFiles(directory=str(ui_path), html=True), name="ui")
    logger.info("mounted static UI at / from %s", ui_dir)


# at the END of create_app, after all routers registered:
_maybe_mount_static_ui(app)
```

Important: if static is mounted, keep the `/_engine/info` explicit route — FastAPI's route lookup runs before the catch-all mount at `/`.

- [ ] **Step 4: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/integration/server -v`
Expected: PASS — both static and no-static cases.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/app_factory.py \
        libs/idun_agent_engine/tests/integration/server/test_static_ui_mount.py
git commit -m "feat(engine): mount static UI from IDUN_UI_DIR when set"
```

### Task 0.5: Bump engine version + changelog

**Files:**
- Modify: `libs/idun_agent_engine/pyproject.toml` (bump version)
- Modify: `libs/idun_agent_engine/CHANGELOG.md` (if present) or add one

- [ ] **Step 1: Bump version**

Edit `libs/idun_agent_engine/pyproject.toml`: `version = "0.5.4"` → `"0.6.0"`.

- [ ] **Step 2: Write changelog entry**

Create or prepend `libs/idun_agent_engine/CHANGELOG.md`:

```markdown
## 0.6.0 — 2026-04-24

### Added
- `BaseAgent.register_run_event_observer()` — async callbacks receive each AG-UI event from `/agent/run` before SSE encoding. Observer failures are isolated from the stream.
- `create_app(..., reload_auth=...)` — pluggable FastAPI dependency for the `/reload` endpoint. `None` (default) keeps previous unprotected behavior.
- `IDUN_UI_DIR` env var — when set to a directory, mounts it as the static UI at `/`. The engine's former `/` info route moves to `/_engine/info`.

### Non-breaking
- Existing consumers see no behavior change unless they opt in via the new APIs or env var.
```

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_engine/pyproject.toml libs/idun_agent_engine/CHANGELOG.md
git commit -m "chore(engine): bump to 0.6.0 with observer + reload-auth + static-UI hooks"
```

**Phase 0 done.** The engine now exposes everything the standalone needs. This phase can be PR'd independently.

---

## Phase 1 — Standalone Package Skeleton

Create `libs/idun_agent_standalone/` with the minimum structure to install, import, and boot a FastAPI app that only serves `/health`. Everything else accretes around this skeleton in later phases.

### Task 1.1: Create package directory + `pyproject.toml`

**Files:**
- Create: `libs/idun_agent_standalone/pyproject.toml`
- Create: `libs/idun_agent_standalone/README.md`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/__init__.py`
- Create: `libs/idun_agent_standalone/tests/__init__.py`
- Create: `libs/idun_agent_standalone/tests/conftest.py`

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p libs/idun_agent_standalone/src/idun_agent_standalone
mkdir -p libs/idun_agent_standalone/tests/unit
mkdir -p libs/idun_agent_standalone/tests/integration
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
# libs/idun_agent_standalone/pyproject.toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "idun-agent-standalone"
version = "0.1.0"
description = "Single-process, single-tenant Idun agent with embedded UI, admin panel, and traces viewer."
readme = "README.md"
requires-python = ">=3.12"
authors = [{ name = "Idun Group" }]
license = { text = "Apache-2.0" }
dependencies = [
  "idun-agent-engine>=0.6.0",
  "idun-agent-schema",
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "sqlalchemy[asyncio]>=2.0",
  "alembic>=1.13",
  "aiosqlite>=0.20",
  "asyncpg>=0.29",
  "bcrypt>=4.0",
  "itsdangerous>=2.2",
  "pydantic>=2.11",
  "pydantic-settings>=2.0",
  "click>=8.1",
  "rich>=13.0",
  "httpx>=0.27",
  "pyyaml>=6.0",
  "apscheduler>=3.10",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "pytest-asyncio>=0.23",
  "pytest-httpx>=0.30",
  "mypy>=1.10",
  "ruff>=0.5",
  "black>=24.0",
]

[project.scripts]
idun-standalone = "idun_agent_standalone.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["src/idun_agent_standalone"]

[tool.hatch.build.targets.wheel.force-include]
"src/idun_agent_standalone/static" = "idun_agent_standalone/static"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Write `README.md`**

```markdown
# idun-agent-standalone

Self-sufficient Idun agent: one agent, one process, embedded chat UI + admin panel + traces viewer.

See `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md` for the design.
```

- [ ] **Step 4: Write `__init__.py` and conftest**

```python
# src/idun_agent_standalone/__init__.py
__version__ = "0.1.0"
```

```python
# tests/conftest.py
import asyncio
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 5: Add to UV workspace**

Modify `pyproject.toml` at repo root — find `[tool.uv.workspace]` `members` array and add `"libs/idun_agent_standalone"`. Then run:

```bash
uv sync --all-groups
```

Expected: package installs cleanly; `idun-standalone` entry point available (will error on run until Task 1.3).

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone pyproject.toml uv.lock
git commit -m "feat(standalone): scaffold idun-agent-standalone package"
```

### Task 1.2: Settings module (Pydantic BaseSettings)

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/settings.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_settings.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_settings.py
import pytest
from idun_agent_standalone.settings import StandaloneSettings, AuthMode


def test_defaults(monkeypatch):
    monkeypatch.delenv("IDUN_ADMIN_AUTH_MODE", raising=False)
    monkeypatch.delenv("IDUN_IN_CONTAINER", raising=False)
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.NONE
    assert s.host == "0.0.0.0"
    assert s.port == 8000
    assert s.database_url.startswith("sqlite+aiosqlite://")
    assert s.session_ttl_seconds == 86400
    assert s.traces_retention_days == 30


def test_password_mode_default_in_container(monkeypatch):
    monkeypatch.setenv("IDUN_IN_CONTAINER", "1")
    monkeypatch.delenv("IDUN_ADMIN_AUTH_MODE", raising=False)
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.PASSWORD


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("IDUN_PORT", "9001")
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.PASSWORD
    assert s.database_url == "postgresql+asyncpg://u:p@h/db"
    assert s.port == 9001


def test_password_mode_requires_secret_and_hash(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.delenv("IDUN_SESSION_SECRET", raising=False)
    monkeypatch.delenv("IDUN_ADMIN_PASSWORD_HASH", raising=False)
    with pytest.raises(ValueError) as exc:
        StandaloneSettings().validate_for_runtime()
    assert "IDUN_SESSION_SECRET" in str(exc.value) or "IDUN_ADMIN_PASSWORD_HASH" in str(exc.value)
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_settings.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `settings.py`**

```python
# src/idun_agent_standalone/settings.py
from __future__ import annotations

import os
import secrets
from enum import Enum
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthMode(str, Enum):
    NONE = "none"
    PASSWORD = "password"
    OIDC = "oidc"  # reserved for MVP-2


def _default_auth_mode() -> AuthMode:
    return AuthMode.PASSWORD if os.environ.get("IDUN_IN_CONTAINER") == "1" else AuthMode.NONE


class StandaloneSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    config_path: Path = Field(default=Path("./config.yaml"), alias="IDUN_CONFIG_PATH")
    host: str = Field(default="0.0.0.0", alias="IDUN_HOST")
    port: int = Field(default=8000, alias="IDUN_PORT")
    database_url: str = Field(
        default="sqlite+aiosqlite:///./idun_standalone.db",
        alias="DATABASE_URL",
    )
    ui_dir: Path | None = Field(default=None, alias="IDUN_UI_DIR")

    auth_mode: AuthMode = Field(default_factory=_default_auth_mode, alias="IDUN_ADMIN_AUTH_MODE")
    admin_password_hash: str | None = Field(default=None, alias="IDUN_ADMIN_PASSWORD_HASH")
    session_secret: str | None = Field(default=None, alias="IDUN_SESSION_SECRET")
    session_ttl_seconds: int = Field(default=86400, alias="IDUN_SESSION_TTL_SECONDS")

    traces_retention_days: int = Field(default=30, alias="IDUN_TRACES_RETENTION_DAYS")

    def resolved_session_secret(self) -> str:
        if self.session_secret:
            return self.session_secret
        if self.auth_mode == AuthMode.NONE:
            return secrets.token_urlsafe(48)
        raise ValueError(
            "IDUN_SESSION_SECRET is required when IDUN_ADMIN_AUTH_MODE=password"
        )

    def validate_for_runtime(self) -> None:
        if self.auth_mode == AuthMode.PASSWORD:
            if not self.admin_password_hash:
                raise ValueError(
                    "IDUN_ADMIN_PASSWORD_HASH is required when IDUN_ADMIN_AUTH_MODE=password. "
                    "Generate one with: idun-standalone hash-password"
                )
            if not self.session_secret:
                raise ValueError(
                    "IDUN_SESSION_SECRET is required when IDUN_ADMIN_AUTH_MODE=password"
                )
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_settings.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/settings.py \
        libs/idun_agent_standalone/tests/unit/test_settings.py
git commit -m "feat(standalone): settings module with env-driven config + auth-mode validation"
```

### Task 1.3: CLI skeleton (click)

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_cli.py
from click.testing import CliRunner
from idun_agent_standalone.cli import main


def test_cli_prints_help():
    r = CliRunner().invoke(main, ["--help"])
    assert r.exit_code == 0
    assert "serve" in r.output
    assert "hash-password" in r.output
    assert "export" in r.output
    assert "import" in r.output
    assert "db" in r.output
    assert "init" in r.output


def test_hash_password_produces_bcrypt_hash():
    r = CliRunner().invoke(main, ["hash-password", "--password", "hunter2"])
    assert r.exit_code == 0
    out = r.output.strip()
    assert out.startswith("$2")  # bcrypt prefix
    assert len(out) >= 59
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_cli.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `cli.py`**

```python
# src/idun_agent_standalone/cli.py
from __future__ import annotations

import sys

import bcrypt
import click


@click.group()
def main() -> None:
    """Idun Agent Standalone — self-sufficient single-agent deployment."""


@main.command("serve")
@click.option("--config", "config_path", type=click.Path(), default=None)
@click.option("--host", default=None)
@click.option("--port", default=None, type=int)
@click.option("--auth-mode", default=None, type=click.Choice(["none", "password", "oidc"]))
@click.option("--ui-dir", default=None, type=click.Path())
@click.option("--database-url", default=None)
def serve(
    config_path: str | None,
    host: str | None,
    port: int | None,
    auth_mode: str | None,
    ui_dir: str | None,
    database_url: str | None,
) -> None:
    """Run the standalone server."""
    from idun_agent_standalone.runtime import run_server

    run_server(
        config_path=config_path,
        host=host,
        port=port,
        auth_mode=auth_mode,
        ui_dir=ui_dir,
        database_url=database_url,
    )


@main.command("hash-password")
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=False)
def hash_password(password: str) -> None:
    """Print a bcrypt hash for IDUN_ADMIN_PASSWORD_HASH."""
    h = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    click.echo(h.decode("utf-8"))


@main.command("export")
@click.option("--config", "config_path", default=None)
def export_cmd(config_path: str | None) -> None:
    """Dump current DB state as YAML to stdout."""
    from idun_agent_standalone.config_io import export_to_yaml

    sys.stdout.write(export_to_yaml(config_path=config_path))


@main.command("import")
@click.argument("file", type=click.Path(exists=True))
def import_cmd(file: str) -> None:
    """Load a YAML file into the DB (replaces current state)."""
    from idun_agent_standalone.config_io import import_from_yaml

    import_from_yaml(file)
    click.echo("Imported.")


@main.group("db")
def db_group() -> None:
    """Database administration."""


@db_group.command("migrate")
def db_migrate() -> None:
    """Run Alembic migrations to the latest head."""
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    click.echo("DB migrated.")


@main.command("init")
@click.argument("name", required=False)
def init_cmd(name: str | None) -> None:
    """Scaffold a new agent project directory."""
    from idun_agent_standalone.scaffold import scaffold_project

    scaffold_project(name or "my-agent")
    click.echo(f"Scaffolded {name or 'my-agent'}/")
```

Note: this file imports modules that don't exist yet (`runtime`, `config_io`, `db.migrate`, `scaffold`). Those subcommands will fail at runtime until later tasks. Only `hash-password` works now.

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_cli.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
        libs/idun_agent_standalone/tests/unit/test_cli.py
git commit -m "feat(standalone): CLI skeleton with hash-password implemented"
```

### Task 1.4: App factory skeleton with `/health`

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/__init__.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/__init__.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/health.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_app_health.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_app_health.py
import pytest
from httpx import AsyncClient
from idun_agent_standalone.app import create_standalone_app_for_testing


@pytest.mark.asyncio
async def test_health_returns_ok():
    app = await create_standalone_app_for_testing()
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/admin/api/v1/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_app_health.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement health router**

```python
# src/idun_agent_standalone/admin/routers/health.py
from fastapi import APIRouter

router = APIRouter(prefix="/admin/api/v1", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

```python
# src/idun_agent_standalone/admin/routers/__init__.py
from idun_agent_standalone.admin.routers import health

__all__ = ["health"]
```

```python
# src/idun_agent_standalone/admin/__init__.py
```

- [ ] **Step 4: Implement app factory skeleton**

```python
# src/idun_agent_standalone/app.py
from __future__ import annotations

from fastapi import FastAPI

from idun_agent_standalone.admin.routers import health


def create_standalone_app(settings) -> FastAPI:
    """Full app factory — will be fleshed out in Phase 6 to compose engine + auth + traces."""
    app = FastAPI(title="Idun Agent Standalone")
    app.include_router(health.router)
    return app


async def create_standalone_app_for_testing() -> FastAPI:
    """Minimal factory for Phase 1 tests. No DB, no engine, just health."""
    app = FastAPI(title="Idun Agent Standalone (test)")
    app.include_router(health.router)
    return app
```

- [ ] **Step 5: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_app_health.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/admin \
        libs/idun_agent_standalone/tests/integration/test_app_health.py
git commit -m "feat(standalone): app factory skeleton with /admin/api/v1/health"
```

### Task 1.5: Echo-agent testing helper

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/testing.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_testing_helpers.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_testing_helpers.py
from idun_agent_standalone.testing import echo_agent_config


def test_echo_agent_config_is_engine_config():
    cfg = echo_agent_config()
    assert cfg.agent is not None
    assert cfg.agent.framework in {"langgraph", "echo"}
```

- [ ] **Step 2: Write the helper**

```python
# src/idun_agent_standalone/testing.py
"""Test helpers: minimal agents that don't need real LLM keys."""
from __future__ import annotations

from typing import Any

from idun_agent_schema import EngineConfig


def echo_agent_config() -> EngineConfig:
    """Return an EngineConfig backed by a trivial echo LangGraph.

    The graph echoes the last user message back as the assistant reply.
    """
    return EngineConfig.model_validate({
        "agent": {
            "name": "test-echo",
            "framework": "langgraph",
            "graph_definition": "idun_agent_standalone.testing:echo_graph",
        },
        "memory": {"type": "memory"},
    })


def echo_graph():
    """Build an echo LangGraph for tests."""
    from langgraph.graph import StateGraph, END
    from langgraph.graph.message import add_messages
    from typing import TypedDict, Annotated
    from langchain_core.messages import AIMessage

    class S(TypedDict):
        messages: Annotated[list, add_messages]

    def echo_node(state: S) -> S:
        last = state["messages"][-1] if state["messages"] else None
        text = getattr(last, "content", "") if last else ""
        return {"messages": [AIMessage(content=f"echo: {text}")]}

    g = StateGraph(S)
    g.add_node("echo", echo_node)
    g.set_entry_point("echo")
    g.add_edge("echo", END)
    return g
```

- [ ] **Step 3: Run test + previously xfailed engine integration tests**

Run:
```
uv run pytest libs/idun_agent_standalone/tests/unit/test_testing_helpers.py -v
uv run pytest libs/idun_agent_engine/tests/integration/server/test_agent_run_observers.py -v
uv run pytest libs/idun_agent_engine/tests/integration/server/test_reload_auth.py -v
uv run pytest libs/idun_agent_engine/tests/integration/server/test_static_ui_mount.py -v
```

Expected: all PASS (the engine tests that were skipped now have their fixture).

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/testing.py \
        libs/idun_agent_standalone/tests/unit/test_testing_helpers.py
git commit -m "feat(standalone): echo-agent testing helper + enable engine observer/reload tests"
```

**Phase 1 done.** Package installs, `/health` responds, engine hooks have real tests.

---

## Phase 2 — Database Layer

SQLAlchemy 2 async, Alembic migrations. SQLite default; Postgres via `DATABASE_URL`. All models singleton or collection as defined in spec §3.2.

### Task 2.1: DB base + async engine factory

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/__init__.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/base.py`
- Test: `libs/idun_agent_standalone/tests/unit/db/test_base.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/db/test_base.py
import pytest
from idun_agent_standalone.db.base import Base, create_db_engine, create_sessionmaker


@pytest.mark.asyncio
async def test_sqlite_engine_and_session_roundtrip(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path / 'x.db'}"
    engine = create_db_engine(url)
    sessionmaker = create_sessionmaker(engine)

    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))

    async with sessionmaker() as session:
        from sqlalchemy import text
        await session.execute(text("INSERT INTO t (id) VALUES (1)"))
        await session.commit()

    await engine.dispose()
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/db/test_base.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```python
# src/idun_agent_standalone/db/__init__.py
```

```python
# src/idun_agent_standalone/db/base.py
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all standalone ORM models."""


def create_db_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True, future=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/db/test_base.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/db \
        libs/idun_agent_standalone/tests/unit/db
git commit -m "feat(standalone): async DB base + engine/sessionmaker factories"
```

### Task 2.2: ORM models

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/models.py`
- Test: `libs/idun_agent_standalone/tests/unit/db/test_models.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/db/test_models.py
from datetime import datetime
import pytest
from sqlalchemy import select

from idun_agent_standalone.db.base import Base, create_db_engine, create_sessionmaker
from idun_agent_standalone.db.models import (
    AgentRow,
    GuardrailRow,
    MemoryRow,
    ObservabilityRow,
    McpServerRow,
    PromptRow,
    IntegrationRow,
    ThemeRow,
    SessionRow,
    TraceEventRow,
    AdminUserRow,
)


@pytest.mark.asyncio
async def test_all_models_create_and_roundtrip(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'x.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)

    async with sm() as s:
        s.add(AgentRow(id="singleton", name="x", framework="langgraph",
                       graph_definition="a.py:g", config={"k": 1}))
        s.add(GuardrailRow(id="singleton", config={"guardrails": []}, enabled=True))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        s.add(ObservabilityRow(id="singleton", config={}))
        s.add(ThemeRow(id="singleton", config={"appName": "X"}))
        s.add(AdminUserRow(id="admin", password_hash="$2b$xxx"))
        s.add(McpServerRow(id="m1", name="time", config={}, enabled=True))
        s.add(PromptRow(id="p1", prompt_key="k", version=1, content="hello", tags=[]))
        s.add(IntegrationRow(id="i1", kind="whatsapp", config={}, enabled=False))
        s.add(SessionRow(id="sess", message_count=0))
        await s.commit()

    async with sm() as s:
        agent = (await s.execute(select(AgentRow))).scalar_one()
        assert agent.config == {"k": 1}
        assert isinstance(agent.updated_at, datetime)

    await engine.dispose()
```

- [ ] **Step 2: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/db/test_models.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `models.py`**

```python
# src/idun_agent_standalone/db/models.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from idun_agent_standalone.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentRow(Base):
    __tablename__ = "agent"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    framework: Mapped[str] = mapped_column(String(64))
    graph_definition: Mapped[str] = mapped_column(Text)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class GuardrailRow(Base):
    __tablename__ = "guardrail"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class MemoryRow(Base):
    __tablename__ = "memory"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class ObservabilityRow(Base):
    __tablename__ = "observability"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class ThemeRow(Base):
    __tablename__ = "theme"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class McpServerRow(Base):
    __tablename__ = "mcp_server"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class PromptRow(Base):
    __tablename__ = "prompt"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_key: Mapped[str] = mapped_column(String(255), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (UniqueConstraint("prompt_key", "version", name="uq_prompt_key_version"),)


class IntegrationRow(Base):
    __tablename__ = "integration"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class SessionRow(Base):
    __tablename__ = "session"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, index=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)


class TraceEventRow(Base):
    __tablename__ = "trace_event"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("session.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class AdminUserRow(Base):
    __tablename__ = "admin_user"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    password_rotated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/db/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/db/models.py \
        libs/idun_agent_standalone/tests/unit/db/test_models.py
git commit -m "feat(standalone): ORM models for agent/resources/traces/sessions/admin"
```

### Task 2.3: Alembic setup + initial migration

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrations/env.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrations/script.py.mako`
- Create: `libs/idun_agent_standalone/alembic.ini`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrate.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrations/versions/0001_initial.py`

- [ ] **Step 1: Write `alembic.ini`**

```ini
# libs/idun_agent_standalone/alembic.ini
[alembic]
script_location = src/idun_agent_standalone/db/migrations
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Write `env.py`**

```python
# src/idun_agent_standalone/db/migrations/env.py
from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from idun_agent_standalone.db.base import Base
from idun_agent_standalone.db import models  # noqa: F401  (register models)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return os.environ.get("DATABASE_URL") or "sqlite+aiosqlite:///./idun_standalone.db"


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        {"sqlalchemy.url": _url()},
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Write `script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Write initial migration**

```python
# src/idun_agent_standalone/db/migrations/versions/0001_initial.py
"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("framework", sa.String(64), nullable=False),
        sa.Column("graph_definition", sa.Text(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for t in ("guardrail", "memory", "observability", "theme"):
        op.create_table(
            t,
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            *([sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true())] if t == "guardrail" else []),
        )
    op.create_table(
        "mcp_server",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "prompt",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("prompt_key", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("prompt_key", "version", name="uq_prompt_key_version"),
    )
    op.create_index("ix_prompt_prompt_key", "prompt", ["prompt_key"])
    op.create_table(
        "integration",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "session",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(255), nullable=True),
    )
    op.create_index("ix_session_last_event_at", "session", ["last_event_at"])
    op.create_table(
        "trace_event",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("session.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trace_event_session_id", "trace_event", ["session_id"])
    op.create_index("ix_trace_event_run_id", "trace_event", ["run_id"])
    op.create_index("ix_trace_event_event_type", "trace_event", ["event_type"])
    op.create_index("ix_trace_event_created_at", "trace_event", ["created_at"])
    op.create_table(
        "admin_user",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("password_rotated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    for t in (
        "admin_user",
        "trace_event",
        "session",
        "integration",
        "prompt",
        "mcp_server",
        "theme",
        "observability",
        "memory",
        "guardrail",
        "agent",
    ):
        op.drop_table(t)
```

- [ ] **Step 5: Write `migrate.py` helper**

```python
# src/idun_agent_standalone/db/migrate.py
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_config() -> Config:
    ini_path = Path(__file__).resolve().parents[3] / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    return cfg


def upgrade_head() -> None:
    command.upgrade(_alembic_config(), "head")


def downgrade_base() -> None:
    command.downgrade(_alembic_config(), "base")
```

- [ ] **Step 6: Write a migration integration test**

```python
# tests/integration/db/test_migrations.py
import os
import pytest

from idun_agent_standalone.db.migrate import upgrade_head, downgrade_base


@pytest.mark.asyncio
async def test_migrate_up_down_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'm.db'}")
    upgrade_head()
    downgrade_base()
```

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/db -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_standalone/alembic.ini \
        libs/idun_agent_standalone/src/idun_agent_standalone/db \
        libs/idun_agent_standalone/tests/integration/db
git commit -m "feat(standalone): Alembic setup + initial schema migration"
```

**Phase 2 done.** DB layer works end-to-end: models, migrations up/down, engine/sessionmaker factories.

---

## Phase 3 — Config Bootstrap

YAML → DB seed on first boot. Assembly of `EngineConfig` from DB for the engine. Export/import CLI.

### Task 3.1: Config assembler — DB → EngineConfig

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/config_assembly.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_config_assembly.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_config_assembly.py
import pytest
from sqlalchemy import select

from idun_agent_standalone.db.base import Base, create_db_engine, create_sessionmaker
from idun_agent_standalone.db.models import (
    AgentRow, GuardrailRow, MemoryRow, ObservabilityRow, McpServerRow, PromptRow,
)
from idun_agent_standalone.config_assembly import assemble_engine_config


@pytest.mark.asyncio
async def test_assemble_from_populated_db(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="test", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        s.add(GuardrailRow(id="singleton", config={"guardrails": []}, enabled=True))
        s.add(ObservabilityRow(id="singleton", config={}))
        s.add(McpServerRow(id="m1", name="time", config={"transport": "stdio"}, enabled=True))
        s.add(McpServerRow(id="m2", name="off", config={"transport": "stdio"}, enabled=False))
        await s.commit()

    async with sm() as s:
        cfg = await assemble_engine_config(s)
    assert cfg.agent.name == "test"
    assert cfg.agent.framework == "langgraph"
    assert cfg.agent.memory is not None
    assert len(cfg.mcp_servers) == 1  # disabled filtered

    await engine.dispose()
```

- [ ] **Step 2: Run test (FAIL)**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_config_assembly.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `config_assembly.py`**

```python
# src/idun_agent_standalone/config_assembly.py
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_schema import EngineConfig
from idun_agent_standalone.db.models import (
    AgentRow,
    GuardrailRow,
    IntegrationRow,
    McpServerRow,
    MemoryRow,
    ObservabilityRow,
    PromptRow,
)


async def assemble_engine_config(session: AsyncSession) -> EngineConfig:
    """Assemble the engine's EngineConfig from the singleton + collection rows."""
    agent = (await session.execute(select(AgentRow))).scalar_one()
    memory = (await session.execute(select(MemoryRow))).scalar_one_or_none()
    guardrail = (await session.execute(select(GuardrailRow))).scalar_one_or_none()
    observability = (await session.execute(select(ObservabilityRow))).scalar_one_or_none()

    mcp_rows = (await session.execute(select(McpServerRow).where(McpServerRow.enabled.is_(True)))).scalars().all()
    integration_rows = (await session.execute(select(IntegrationRow).where(IntegrationRow.enabled.is_(True)))).scalars().all()

    data: dict[str, Any] = {
        "agent": {
            "name": agent.name,
            "framework": agent.framework,
            "graph_definition": agent.graph_definition,
            **(agent.config or {}),
        },
    }
    if memory:
        data["agent"]["memory"] = memory.config
    if guardrail and guardrail.enabled:
        data["guardrails"] = guardrail.config.get("guardrails", [])
    if observability:
        data["observability"] = observability.config or {}
    if mcp_rows:
        data["mcp_servers"] = [
            {"name": r.name, **(r.config or {})} for r in mcp_rows
        ]
    if integration_rows:
        data["integrations"] = [
            {"kind": r.kind, **(r.config or {})} for r in integration_rows
        ]

    return EngineConfig.model_validate(data)
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_config_assembly.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/config_assembly.py \
        libs/idun_agent_standalone/tests/unit/test_config_assembly.py
git commit -m "feat(standalone): assemble EngineConfig from DB rows"
```

### Task 3.2: YAML bootstrap + import/export

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/config_io.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_config_io.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_config_io.py
import pytest
import yaml
from pathlib import Path

from idun_agent_standalone.db.base import Base, create_db_engine, create_sessionmaker
from idun_agent_standalone.db.models import AgentRow
from idun_agent_standalone.config_io import seed_from_yaml, export_db_as_yaml


@pytest.mark.asyncio
async def test_seed_then_export_roundtrip(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'b.db'}")
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)

    yaml_path = tmp_path / "config.yaml"
    yaml_path.write_text(yaml.safe_dump({
        "agent": {
            "name": "x",
            "framework": "langgraph",
            "graph_definition": "idun_agent_standalone.testing:echo_graph",
        },
        "memory": {"type": "memory"},
    }))

    async with sm() as s:
        await seed_from_yaml(s, yaml_path)
        await s.commit()

    async with sm() as s:
        dumped = await export_db_as_yaml(s)
    roundtripped = yaml.safe_load(dumped)
    assert roundtripped["agent"]["name"] == "x"

    await engine.dispose()
```

- [ ] **Step 2: Run test (FAIL)**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_config_io.py -v`

- [ ] **Step 3: Implement `config_io.py`**

```python
# src/idun_agent_standalone/config_io.py
from __future__ import annotations

import hashlib
import logging
import uuid
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.db.models import (
    AgentRow,
    GuardrailRow,
    IntegrationRow,
    McpServerRow,
    MemoryRow,
    ObservabilityRow,
    PromptRow,
    ThemeRow,
)

logger = logging.getLogger(__name__)


def _yaml_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


async def is_db_empty(session: AsyncSession) -> bool:
    res = await session.execute(select(AgentRow.id))
    return res.scalar_one_or_none() is None


async def seed_from_yaml(session: AsyncSession, yaml_path: Path) -> None:
    """Seed all tables from a YAML config file. Does not commit — caller does."""
    data = yaml.safe_load(yaml_path.read_text())
    if not isinstance(data, dict):
        raise ValueError("config YAML must be a mapping")

    agent_in = data.get("agent") or {}
    session.add(AgentRow(
        id="singleton",
        name=agent_in.get("name", "agent"),
        framework=agent_in.get("framework", "langgraph"),
        graph_definition=agent_in.get("graph_definition", ""),
        config={k: v for k, v in agent_in.items() if k not in {"name", "framework", "graph_definition", "memory"}},
    ))
    session.add(MemoryRow(id="singleton", config=agent_in.get("memory") or {"type": "memory"}))
    session.add(GuardrailRow(id="singleton", config={"guardrails": data.get("guardrails", [])}, enabled=True))
    session.add(ObservabilityRow(id="singleton", config=data.get("observability", {})))
    session.add(ThemeRow(id="singleton", config=data.get("theme", {})))

    for m in data.get("mcp_servers", []):
        session.add(McpServerRow(
            id=str(uuid.uuid4()),
            name=m.get("name", "unnamed"),
            config={k: v for k, v in m.items() if k != "name"},
            enabled=m.get("enabled", True),
        ))
    for p in data.get("prompts", []):
        session.add(PromptRow(
            id=str(uuid.uuid4()),
            prompt_key=p["key"],
            version=p.get("version", 1),
            content=p["content"],
            tags=p.get("tags", []),
        ))
    for i in data.get("integrations", []):
        session.add(IntegrationRow(
            id=str(uuid.uuid4()),
            kind=i["kind"],
            config={k: v for k, v in i.items() if k != "kind"},
            enabled=i.get("enabled", False),
        ))


async def export_db_as_yaml(session: AsyncSession) -> str:
    agent = (await session.execute(select(AgentRow))).scalar_one()
    memory = (await session.execute(select(MemoryRow))).scalar_one_or_none()
    guardrail = (await session.execute(select(GuardrailRow))).scalar_one_or_none()
    observability = (await session.execute(select(ObservabilityRow))).scalar_one_or_none()
    theme = (await session.execute(select(ThemeRow))).scalar_one_or_none()
    mcps = (await session.execute(select(McpServerRow))).scalars().all()
    prompts = (await session.execute(select(PromptRow))).scalars().all()
    integrations = (await session.execute(select(IntegrationRow))).scalars().all()

    out: dict = {
        "agent": {
            "name": agent.name,
            "framework": agent.framework,
            "graph_definition": agent.graph_definition,
            **(agent.config or {}),
        },
    }
    if memory:
        out["agent"]["memory"] = memory.config
    if guardrail:
        out["guardrails"] = guardrail.config.get("guardrails", [])
    if observability and observability.config:
        out["observability"] = observability.config
    if theme and theme.config:
        out["theme"] = theme.config
    if mcps:
        out["mcp_servers"] = [
            {"name": m.name, "enabled": m.enabled, **(m.config or {})} for m in mcps
        ]
    if prompts:
        out["prompts"] = [
            {"key": p.prompt_key, "version": p.version, "content": p.content, "tags": p.tags}
            for p in prompts
        ]
    if integrations:
        out["integrations"] = [
            {"kind": i.kind, "enabled": i.enabled, **(i.config or {})} for i in integrations
        ]

    return yaml.safe_dump(out, sort_keys=False)
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_config_io.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/config_io.py \
        libs/idun_agent_standalone/tests/integration/test_config_io.py
git commit -m "feat(standalone): YAML bootstrap seed + export roundtrip"
```

### Task 3.3: Wire import/export into CLI

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py` (add sync wrappers that drive the async io helpers)
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/runtime.py` (async entrypoints)

- [ ] **Step 1: Create `runtime.py`**

```python
# src/idun_agent_standalone/runtime.py
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from idun_agent_standalone.config_io import seed_from_yaml, export_db_as_yaml
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.settings import StandaloneSettings


def _db_from_settings() -> tuple[Any, Any]:
    s = StandaloneSettings()
    engine = create_db_engine(s.database_url)
    return engine, create_sessionmaker(engine)


def export_to_yaml_sync(config_path: str | None = None) -> str:
    async def _run() -> str:
        engine, sm = _db_from_settings()
        try:
            async with sm() as session:
                return await export_db_as_yaml(session)
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def import_from_yaml_sync(file: str) -> None:
    async def _run() -> None:
        engine, sm = _db_from_settings()
        try:
            async with sm() as session:
                await seed_from_yaml(session, Path(file))
                await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_run())


def run_server(**kwargs) -> None:
    """Placeholder — implemented in Phase 6 when the app factory is complete."""
    raise NotImplementedError("Phase 6 will implement run_server; CLI stub for now.")
```

- [ ] **Step 2: Update CLI to use runtime helpers**

Edit `cli.py`: replace the `export_cmd` and `import_cmd` bodies:

```python
@main.command("export")
def export_cmd() -> None:
    """Dump current DB state as YAML to stdout."""
    import sys
    from idun_agent_standalone.runtime import export_to_yaml_sync

    sys.stdout.write(export_to_yaml_sync())


@main.command("import")
@click.argument("file", type=click.Path(exists=True))
def import_cmd(file: str) -> None:
    """Load a YAML file into the DB."""
    from idun_agent_standalone.runtime import import_from_yaml_sync

    import_from_yaml_sync(file)
    click.echo("Imported.")
```

- [ ] **Step 3: Write CLI integration test**

```python
# tests/integration/test_cli_io.py
import os
from click.testing import CliRunner
from pathlib import Path

from idun_agent_standalone.cli import main
from idun_agent_standalone.db.migrate import upgrade_head


def test_cli_import_then_export(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'c.db'}")
    upgrade_head()

    yaml_in = tmp_path / "in.yaml"
    yaml_in.write_text(
        "agent:\n"
        "  name: hello\n"
        "  framework: langgraph\n"
        "  graph_definition: idun_agent_standalone.testing:echo_graph\n"
        "memory: {type: memory}\n"
    )

    r = CliRunner().invoke(main, ["import", str(yaml_in)])
    assert r.exit_code == 0, r.output

    r2 = CliRunner().invoke(main, ["export"])
    assert r2.exit_code == 0
    assert "hello" in r2.output
```

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_cli_io.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/runtime.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
        libs/idun_agent_standalone/tests/integration/test_cli_io.py
git commit -m "feat(standalone): wire import/export CLI commands to async DB"
```

**Phase 3 done.** YAML bootstraps the DB; export roundtrips; CLI verbs work.

---

## Phase 4 — Auth (password mode + sessions)

### Task 4.1: Bcrypt verifier + session signer

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/auth/__init__.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/auth/password.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/auth/session.py`
- Test: `libs/idun_agent_standalone/tests/unit/auth/test_password.py`
- Test: `libs/idun_agent_standalone/tests/unit/auth/test_session.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/unit/auth/test_password.py
import bcrypt
from idun_agent_standalone.auth.password import hash_password, verify_password


def test_hash_and_verify():
    h = hash_password("hunter2")
    assert verify_password("hunter2", h) is True
    assert verify_password("wrong", h) is False
    assert h.startswith("$2")


def test_verify_invalid_hash():
    assert verify_password("x", "not-a-hash") is False
```

```python
# tests/unit/auth/test_session.py
import time
import pytest
from idun_agent_standalone.auth.session import sign_session, verify_session, SessionExpired, SessionInvalid


def test_sign_and_verify_roundtrip():
    tok = sign_session(secret="x" * 32, payload={"uid": "admin"})
    claims = verify_session(secret="x" * 32, token=tok, max_age_s=60)
    assert claims["uid"] == "admin"


def test_verify_rejects_bad_secret():
    tok = sign_session(secret="x" * 32, payload={"uid": "admin"})
    with pytest.raises(SessionInvalid):
        verify_session(secret="y" * 32, token=tok, max_age_s=60)


def test_verify_rejects_expired(monkeypatch):
    tok = sign_session(secret="x" * 32, payload={"uid": "admin"})
    time.sleep(0.05)
    with pytest.raises(SessionExpired):
        verify_session(secret="x" * 32, token=tok, max_age_s=0)
```

- [ ] **Step 2: Implement**

```python
# src/idun_agent_standalone/auth/__init__.py
```

```python
# src/idun_agent_standalone/auth/password.py
from __future__ import annotations

import bcrypt


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
```

```python
# src/idun_agent_standalone/auth/session.py
from __future__ import annotations

import json
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


class SessionInvalid(Exception):
    pass


class SessionExpired(Exception):
    pass


_SALT = "idun-standalone-session"


def sign_session(*, secret: str, payload: dict[str, Any]) -> str:
    serializer = URLSafeTimedSerializer(secret, salt=_SALT)
    return serializer.dumps(payload)


def verify_session(*, secret: str, token: str, max_age_s: int) -> dict[str, Any]:
    serializer = URLSafeTimedSerializer(secret, salt=_SALT)
    try:
        return serializer.loads(token, max_age=max_age_s)
    except SignatureExpired as e:
        raise SessionExpired(str(e)) from e
    except BadSignature as e:
        raise SessionInvalid(str(e)) from e
```

- [ ] **Step 3: Run tests**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/auth -v`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/auth \
        libs/idun_agent_standalone/tests/unit/auth
git commit -m "feat(standalone): bcrypt password + itsdangerous signed sessions"
```

### Task 4.2: Auth FastAPI dependency + login/logout routes

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/deps.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/auth.py`
- Test: `libs/idun_agent_standalone/tests/integration/admin/test_auth.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/admin/test_auth.py
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from idun_agent_standalone.auth.password import hash_password
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_login_success_sets_cookie_and_me_works(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("hunter2"))

    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("hunter2")))
        await s.commit()

    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        assert r.status_code == 200
        assert "sid" in r.cookies
        me = await c.get("/admin/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["authenticated"] is True


@pytest.mark.asyncio
async def test_login_wrong_password(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'b.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("right"))
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("right")))
        await s.commit()
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/admin/api/v1/auth/login", json={"password": "wrong"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_none_mode_me_returns_unauthenticated_but_allowed(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'c.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(app=app, base_url="http://t") as c:
        me = await c.get("/admin/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json() == {"authenticated": True, "auth_mode": "none"}
```

- [ ] **Step 2: Implement `deps.py`**

```python
# src/idun_agent_standalone/admin/deps.py
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from idun_agent_standalone.auth.session import SessionExpired, SessionInvalid, verify_session
from idun_agent_standalone.settings import AuthMode, StandaloneSettings


def get_settings(request: Request) -> StandaloneSettings:
    return request.app.state.settings


def require_auth(
    request: Request,
    settings: StandaloneSettings = Depends(get_settings),
) -> dict | None:
    if settings.auth_mode == AuthMode.NONE:
        return None
    token = request.cookies.get("sid")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="auth_required")
    try:
        return verify_session(
            secret=settings.session_secret or "",
            token=token,
            max_age_s=settings.session_ttl_seconds,
        )
    except SessionExpired:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_expired")
    except SessionInvalid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_invalid")
```

- [ ] **Step 3: Implement `routers/auth.py`**

```python
# src/idun_agent_standalone/admin/routers/auth.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import get_settings, require_auth
from idun_agent_standalone.auth.password import verify_password
from idun_agent_standalone.auth.session import sign_session
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.settings import AuthMode, StandaloneSettings


router = APIRouter(prefix="/admin/api/v1/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


@router.post("/login")
async def login(
    body: LoginBody,
    response: Response,
    request: Request,
    settings: StandaloneSettings = Depends(get_settings),
):
    if settings.auth_mode == AuthMode.NONE:
        return {"ok": True, "auth_mode": "none"}

    sm = request.app.state.sessionmaker
    async with sm() as session:
        admin = (await session.execute(select(AdminUserRow))).scalar_one_or_none()
    if admin is None or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    token = sign_session(secret=settings.session_secret or "", payload={"uid": "admin"})
    response.set_cookie(
        "sid", token,
        httponly=True, samesite="lax", secure=request.url.scheme == "https",
        max_age=settings.session_ttl_seconds, path="/",
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@router.get("/me")
async def me(
    settings: StandaloneSettings = Depends(get_settings),
    claims: dict | None = Depends(require_auth),
):
    return {"authenticated": True, "auth_mode": settings.auth_mode.value}
```

- [ ] **Step 4: Create `testing_app.py` helper**

```python
# src/idun_agent_standalone/testing_app.py
from __future__ import annotations

from fastapi import FastAPI

from idun_agent_standalone.admin.routers import auth as auth_router
from idun_agent_standalone.admin.routers import health
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.settings import StandaloneSettings


async def make_test_app() -> tuple[FastAPI, object]:
    upgrade_head()
    settings = StandaloneSettings()
    engine = create_db_engine(settings.database_url)
    sm = create_sessionmaker(engine)

    app = FastAPI(title="standalone-test")
    app.state.settings = settings
    app.state.sessionmaker = sm
    app.include_router(health.router)
    app.include_router(auth_router.router)
    return app, sm
```

- [ ] **Step 5: Run tests**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/admin/test_auth.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin/deps.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/auth.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/testing_app.py \
        libs/idun_agent_standalone/tests/integration/admin/test_auth.py
git commit -m "feat(standalone): login/logout/me routes + require_auth dependency"
```

**Phase 4 done.** Password mode end-to-end.

---

## Phase 5 — Admin REST Surface

Per-resource CRUD. Uses the `require_auth` dep from Phase 4. All routes under `/admin/api/v1/*`.

The pattern is the same for every singleton resource (GET + PUT) and every collection resource (GET/POST/GET/{id}/PATCH/DELETE). Write it once per resource to keep tasks self-contained.

### Task 5.1: `/agent` GET + PUT

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/agent.py`
- Test: `libs/idun_agent_standalone/tests/integration/admin/test_agent.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/admin/test_agent.py
import pytest
from httpx import AsyncClient

from idun_agent_standalone.db.models import AgentRow
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_get_and_put_agent(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="n", framework="langgraph",
                       graph_definition="g.py:g", config={}))
        await s.commit()

    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/admin/api/v1/agent")
        assert r.status_code == 200
        assert r.json()["name"] == "n"

        r2 = await c.put("/admin/api/v1/agent", json={
            "name": "renamed",
            "framework": "langgraph",
            "graph_definition": "g.py:g",
            "config": {"extra": 1},
        })
        assert r2.status_code == 200
        r3 = await c.get("/admin/api/v1/agent")
        assert r3.json()["name"] == "renamed"
        assert r3.json()["config"]["extra"] == 1
```

- [ ] **Step 2: Implement router**

```python
# src/idun_agent_standalone/admin/routers/agent.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import AgentRow


router = APIRouter(prefix="/admin/api/v1/agent", tags=["agent"], dependencies=[Depends(require_auth)])


class AgentRead(BaseModel):
    id: str
    name: str
    framework: str
    graph_definition: str
    config: dict[str, Any]


class AgentUpdate(BaseModel):
    name: str
    framework: str
    graph_definition: str
    config: dict[str, Any] = {}


@router.get("", response_model=AgentRead)
async def get_agent(request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(AgentRow))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent_not_seeded")
        return AgentRead(id=row.id, name=row.name, framework=row.framework,
                         graph_definition=row.graph_definition, config=row.config or {})


@router.put("", response_model=AgentRead)
async def put_agent(body: AgentUpdate, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(AgentRow))).scalar_one_or_none()
        if row is None:
            row = AgentRow(id="singleton", name=body.name, framework=body.framework,
                           graph_definition=body.graph_definition, config=body.config)
            s.add(row)
        else:
            row.name = body.name
            row.framework = body.framework
            row.graph_definition = body.graph_definition
            row.config = body.config
        await s.commit()
        # reload hook is added in Phase 6 Task 6.3
        return AgentRead(id=row.id, name=row.name, framework=row.framework,
                         graph_definition=row.graph_definition, config=row.config or {})
```

- [ ] **Step 3: Register router in `testing_app.py`**

Add `from idun_agent_standalone.admin.routers import agent as agent_router` and `app.include_router(agent_router.router)`.

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/admin/test_agent.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/agent.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/testing_app.py \
        libs/idun_agent_standalone/tests/integration/admin/test_agent.py
git commit -m "feat(standalone): agent config GET/PUT route"
```

### Task 5.2: Singleton routers — guardrails / memory / observability / theme

Each uses the same pattern. Write one file per resource to keep diffs reviewable.

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/guardrails.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/memory.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/observability.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/theme.py`
- Test: `libs/idun_agent_standalone/tests/integration/admin/test_singletons.py`

- [ ] **Step 1: Write one parameterized test covering all four**

```python
# tests/integration/admin/test_singletons.py
import pytest
from httpx import AsyncClient

from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.parametrize("resource,initial,update", [
    ("guardrails", {"config": {"guardrails": []}, "enabled": True}, {"config": {"guardrails": [{"type": "DetectPII"}]}, "enabled": True}),
    ("memory", {"config": {"type": "memory"}}, {"config": {"type": "sqlite", "path": "./c.db"}}),
    ("observability", {"config": {}}, {"config": {"phoenix": {"enabled": True}}}),
    ("theme", {"config": {}}, {"config": {"appName": "My Bot", "layout": "branded"}}),
])
@pytest.mark.asyncio
async def test_singleton_get_put(tmp_path, monkeypatch, resource, initial, update):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / f'{resource}.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, sm = await make_test_app()

    async with AsyncClient(app=app, base_url="http://t") as c:
        # PUT (creates)
        r = await c.put(f"/admin/api/v1/{resource}", json=initial)
        assert r.status_code == 200, r.text
        # PUT (updates)
        r2 = await c.put(f"/admin/api/v1/{resource}", json=update)
        assert r2.status_code == 200, r2.text
        # GET reflects update
        r3 = await c.get(f"/admin/api/v1/{resource}")
        assert r3.json()["config"] == update["config"]
```

- [ ] **Step 2: Implement guardrails router**

```python
# src/idun_agent_standalone/admin/routers/guardrails.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import GuardrailRow


router = APIRouter(prefix="/admin/api/v1/guardrails", tags=["guardrails"],
                   dependencies=[Depends(require_auth)])


class GuardrailsPayload(BaseModel):
    config: dict[str, Any]
    enabled: bool = True


@router.get("")
async def get_guardrails(request: Request) -> GuardrailsPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(GuardrailRow))).scalar_one_or_none()
        if row is None:
            return GuardrailsPayload(config={"guardrails": []}, enabled=True)
        return GuardrailsPayload(config=row.config or {}, enabled=row.enabled)


@router.put("")
async def put_guardrails(body: GuardrailsPayload, request: Request) -> GuardrailsPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(GuardrailRow))).scalar_one_or_none()
        if row is None:
            row = GuardrailRow(id="singleton", config=body.config, enabled=body.enabled)
            s.add(row)
        else:
            row.config = body.config
            row.enabled = body.enabled
        await s.commit()
        return GuardrailsPayload(config=row.config or {}, enabled=row.enabled)
```

- [ ] **Step 3: Implement memory router**

```python
# src/idun_agent_standalone/admin/routers/memory.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import MemoryRow


router = APIRouter(prefix="/admin/api/v1/memory", tags=["memory"],
                   dependencies=[Depends(require_auth)])


class MemoryPayload(BaseModel):
    config: dict[str, Any]


@router.get("")
async def get_memory(request: Request) -> MemoryPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(MemoryRow))).scalar_one_or_none()
        if row is None:
            return MemoryPayload(config={"type": "memory"})
        return MemoryPayload(config=row.config or {})


@router.put("")
async def put_memory(body: MemoryPayload, request: Request) -> MemoryPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(MemoryRow))).scalar_one_or_none()
        if row is None:
            row = MemoryRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        return MemoryPayload(config=row.config or {})
```

- [ ] **Step 4: Implement observability router**

```python
# src/idun_agent_standalone/admin/routers/observability.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import ObservabilityRow


router = APIRouter(prefix="/admin/api/v1/observability", tags=["observability"],
                   dependencies=[Depends(require_auth)])


class ObservabilityPayload(BaseModel):
    config: dict[str, Any]


@router.get("")
async def get_observability(request: Request) -> ObservabilityPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ObservabilityRow))).scalar_one_or_none()
        return ObservabilityPayload(config=(row.config or {}) if row else {})


@router.put("")
async def put_observability(body: ObservabilityPayload, request: Request) -> ObservabilityPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ObservabilityRow))).scalar_one_or_none()
        if row is None:
            row = ObservabilityRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        return ObservabilityPayload(config=row.config or {})
```

- [ ] **Step 5: Implement theme router**

```python
# src/idun_agent_standalone/admin/routers/theme.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import ThemeRow


router = APIRouter(prefix="/admin/api/v1/theme", tags=["theme"],
                   dependencies=[Depends(require_auth)])


class ThemePayload(BaseModel):
    config: dict[str, Any]


@router.get("")
async def get_theme(request: Request) -> ThemePayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
        return ThemePayload(config=(row.config or {}) if row else {})


@router.put("")
async def put_theme(body: ThemePayload, request: Request) -> ThemePayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
        if row is None:
            row = ThemeRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        return ThemePayload(config=row.config or {})
```

- [ ] **Step 6: Register routers in `testing_app.py`**

Add imports for `guardrails`, `memory`, `observability`, `theme` and call `app.include_router(...)` for each.

- [ ] **Step 7: Run tests**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/admin/test_singletons.py -v`
Expected: PASS (4 parametrized cases).

- [ ] **Step 8: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/{guardrails,memory,observability,theme}.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/testing_app.py \
        libs/idun_agent_standalone/tests/integration/admin/test_singletons.py
git commit -m "feat(standalone): singleton CRUD for guardrails/memory/observability/theme"
```

### Task 5.3: Collection routers — MCP servers / prompts / integrations

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/mcp_servers.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/prompts.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/integrations.py`
- Test: `libs/idun_agent_standalone/tests/integration/admin/test_collections.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/admin/test_collections.py
import pytest
from httpx import AsyncClient
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_mcp_crud(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'mcp.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(app=app, base_url="http://t") as c:
        # create
        r = await c.post("/admin/api/v1/mcp-servers", json={
            "name": "time", "config": {"transport": "stdio", "command": "docker"}, "enabled": True,
        })
        assert r.status_code == 201, r.text
        mid = r.json()["id"]
        # list
        r2 = await c.get("/admin/api/v1/mcp-servers")
        assert len(r2.json()) == 1
        # patch
        r3 = await c.patch(f"/admin/api/v1/mcp-servers/{mid}", json={"enabled": False})
        assert r3.json()["enabled"] is False
        # delete
        r4 = await c.delete(f"/admin/api/v1/mcp-servers/{mid}")
        assert r4.status_code == 204
        r5 = await c.get("/admin/api/v1/mcp-servers")
        assert r5.json() == []


@pytest.mark.asyncio
async def test_prompts_versioning(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'p.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/admin/api/v1/prompts", json={"prompt_key": "k", "content": "v1", "tags": []})
        assert r.status_code == 201
        r2 = await c.post("/admin/api/v1/prompts", json={"prompt_key": "k", "content": "v2", "tags": []})
        assert r2.status_code == 201
        all_p = await c.get("/admin/api/v1/prompts")
        versions = sorted(p["version"] for p in all_p.json() if p["prompt_key"] == "k")
        assert versions == [1, 2]


@pytest.mark.asyncio
async def test_integrations_crud(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'i.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/admin/api/v1/integrations", json={
            "kind": "whatsapp", "config": {"phone_number_id": "x"}, "enabled": False,
        })
        assert r.status_code == 201
        iid = r.json()["id"]
        r2 = await c.patch(f"/admin/api/v1/integrations/{iid}", json={"enabled": True})
        assert r2.json()["enabled"] is True
        r3 = await c.delete(f"/admin/api/v1/integrations/{iid}")
        assert r3.status_code == 204
```

- [ ] **Step 2: Implement MCP servers router**

```python
# src/idun_agent_standalone/admin/routers/mcp_servers.py
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import McpServerRow


router = APIRouter(prefix="/admin/api/v1/mcp-servers", tags=["mcp"],
                   dependencies=[Depends(require_auth)])


class McpServerRead(BaseModel):
    id: str
    name: str
    config: dict[str, Any]
    enabled: bool


class McpServerCreate(BaseModel):
    name: str
    config: dict[str, Any]
    enabled: bool = True


class McpServerPatch(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


def _to_read(row: McpServerRow) -> McpServerRead:
    return McpServerRead(id=row.id, name=row.name, config=row.config or {}, enabled=row.enabled)


@router.get("", response_model=list[McpServerRead])
async def list_mcp(request: Request) -> list[McpServerRead]:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (await s.execute(select(McpServerRow))).scalars().all()
        return [_to_read(r) for r in rows]


@router.post("", response_model=McpServerRead, status_code=status.HTTP_201_CREATED)
async def create_mcp(body: McpServerCreate, request: Request) -> McpServerRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = McpServerRow(id=str(uuid.uuid4()), name=body.name, config=body.config, enabled=body.enabled)
        s.add(row)
        await s.commit()
        return _to_read(row)


@router.get("/{mcp_id}", response_model=McpServerRead)
async def get_mcp(mcp_id: str, request: Request) -> McpServerRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(McpServerRow).where(McpServerRow.id == mcp_id))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return _to_read(row)


@router.patch("/{mcp_id}", response_model=McpServerRead)
async def patch_mcp(mcp_id: str, body: McpServerPatch, request: Request) -> McpServerRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(McpServerRow).where(McpServerRow.id == mcp_id))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        if body.name is not None:
            row.name = body.name
        if body.config is not None:
            row.config = body.config
        if body.enabled is not None:
            row.enabled = body.enabled
        await s.commit()
        return _to_read(row)


@router.delete("/{mcp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp(mcp_id: str, request: Request) -> Response:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(McpServerRow).where(McpServerRow.id == mcp_id))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 3: Implement prompts router (append-only versioning)**

```python
# src/idun_agent_standalone/admin/routers/prompts.py
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import PromptRow


router = APIRouter(prefix="/admin/api/v1/prompts", tags=["prompts"],
                   dependencies=[Depends(require_auth)])


class PromptRead(BaseModel):
    id: str
    prompt_key: str
    version: int
    content: str
    tags: list[str]


class PromptCreate(BaseModel):
    prompt_key: str
    content: str
    tags: list[str] = []


def _to_read(row: PromptRow) -> PromptRead:
    return PromptRead(id=row.id, prompt_key=row.prompt_key, version=row.version,
                      content=row.content, tags=row.tags or [])


@router.get("", response_model=list[PromptRead])
async def list_prompts(request: Request) -> list[PromptRead]:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (await s.execute(select(PromptRow).order_by(PromptRow.prompt_key, PromptRow.version.desc()))).scalars().all()
        return [_to_read(r) for r in rows]


@router.post("", response_model=PromptRead, status_code=status.HTTP_201_CREATED)
async def create_prompt(body: PromptCreate, request: Request) -> PromptRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        max_v = (await s.execute(
            select(func.max(PromptRow.version)).where(PromptRow.prompt_key == body.prompt_key)
        )).scalar_one_or_none() or 0
        row = PromptRow(id=str(uuid.uuid4()), prompt_key=body.prompt_key, version=max_v + 1,
                        content=body.content, tags=body.tags)
        s.add(row)
        await s.commit()
        return _to_read(row)


@router.get("/{pid}", response_model=PromptRead)
async def get_prompt(pid: str, request: Request) -> PromptRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(PromptRow).where(PromptRow.id == pid))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return _to_read(row)


@router.delete("/{pid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(pid: str, request: Request) -> Response:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(PromptRow).where(PromptRow.id == pid))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Implement integrations router**

```python
# src/idun_agent_standalone/admin/routers/integrations.py
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import IntegrationRow


router = APIRouter(prefix="/admin/api/v1/integrations", tags=["integrations"],
                   dependencies=[Depends(require_auth)])


class IntegrationRead(BaseModel):
    id: str
    kind: str
    config: dict[str, Any]
    enabled: bool


class IntegrationCreate(BaseModel):
    kind: str
    config: dict[str, Any]
    enabled: bool = False


class IntegrationPatch(BaseModel):
    config: dict[str, Any] | None = None
    enabled: bool | None = None


def _to_read(row: IntegrationRow) -> IntegrationRead:
    return IntegrationRead(id=row.id, kind=row.kind, config=row.config or {}, enabled=row.enabled)


@router.get("", response_model=list[IntegrationRead])
async def list_integrations(request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (await s.execute(select(IntegrationRow))).scalars().all()
        return [_to_read(r) for r in rows]


@router.post("", response_model=IntegrationRead, status_code=status.HTTP_201_CREATED)
async def create_integration(body: IntegrationCreate, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = IntegrationRow(id=str(uuid.uuid4()), kind=body.kind, config=body.config, enabled=body.enabled)
        s.add(row)
        await s.commit()
        return _to_read(row)


@router.patch("/{iid}", response_model=IntegrationRead)
async def patch_integration(iid: str, body: IntegrationPatch, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(IntegrationRow).where(IntegrationRow.id == iid))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        if body.config is not None:
            row.config = body.config
        if body.enabled is not None:
            row.enabled = body.enabled
        await s.commit()
        return _to_read(row)


@router.delete("/{iid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(iid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(IntegrationRow).where(IntegrationRow.id == iid))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 5: Register in `testing_app.py` and run tests**

Add the three `include_router` calls. Then:

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/admin/test_collections.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/{mcp_servers,prompts,integrations}.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/testing_app.py \
        libs/idun_agent_standalone/tests/integration/admin/test_collections.py
git commit -m "feat(standalone): collection CRUD for mcp/prompts/integrations"
```

### Task 5.4: Error handling + `X-Request-Id` middleware

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/errors.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/middleware.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_errors.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_errors.py
import pytest
from httpx import AsyncClient
from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

from idun_agent_standalone.errors import install_exception_handlers
from idun_agent_standalone.middleware import install_request_id_middleware


@pytest.mark.asyncio
async def test_request_id_header_always_present():
    app = FastAPI()
    install_request_id_middleware(app)
    install_exception_handlers(app)
    r = APIRouter()

    @r.get("/boom")
    async def _boom():
        raise RuntimeError("kaboom")

    class M(BaseModel):
        x: int

    @r.post("/v")
    async def _v(m: M):
        return m

    app.include_router(r)

    async with AsyncClient(app=app, base_url="http://t") as c:
        ok = await c.get("/boom")
        assert ok.status_code == 500
        assert "X-Request-Id" in ok.headers
        assert ok.json()["error"] == "internal"

        val = await c.post("/v", json={"x": "not-an-int"})
        assert val.status_code == 400
        assert val.json()["error"] == "validation_failed"
```

- [ ] **Step 2: Implement middleware and handlers**

```python
# src/idun_agent_standalone/middleware.py
from __future__ import annotations

import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_ctx.set(rid)
        try:
            response: Response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-Id"] = rid
        return response


def install_request_id_middleware(app: FastAPI) -> None:
    app.add_middleware(RequestIdMiddleware)
```

```python
# src/idun_agent_standalone/errors.py
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from idun_agent_standalone.middleware import request_id_ctx

logger = logging.getLogger(__name__)


class EngineInitError(Exception):
    """Raised when engine.initialize fails."""


def _resp(code: int, error: str, **extra) -> JSONResponse:
    body = {"error": error, "request_id": request_id_ctx.get()}
    body.update(extra)
    return JSONResponse(status_code=code, content=body)


def install_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(RequestValidationError)
    async def _rv(_: Request, exc: RequestValidationError):
        return _resp(400, "validation_failed", details=exc.errors())

    @app.exception_handler(ValidationError)
    async def _v(_: Request, exc: ValidationError):
        return _resp(400, "validation_failed", details=exc.errors())

    @app.exception_handler(SQLAlchemyError)
    async def _sa(_: Request, exc: SQLAlchemyError):
        logger.exception("database error")
        return _resp(500, "db_error")

    @app.exception_handler(EngineInitError)
    async def _engine(_: Request, exc: EngineInitError):
        logger.exception("engine init failed")
        return _resp(500, "engine_init_failed", message=str(exc))

    @app.exception_handler(Exception)
    async def _catch(_: Request, exc: Exception):
        logger.exception("unhandled exception")
        return _resp(500, "internal")
```

- [ ] **Step 3: Wire into `testing_app.py`**

```python
# at the top of testing_app.py
from idun_agent_standalone.errors import install_exception_handlers
from idun_agent_standalone.middleware import install_request_id_middleware

# inside make_test_app(), after creating app:
install_request_id_middleware(app)
install_exception_handlers(app)
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_errors.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/{errors,middleware,testing_app}.py \
        libs/idun_agent_standalone/tests/integration/test_errors.py
git commit -m "feat(standalone): request-id middleware + global exception handlers"
```

**Phase 5 done.** Admin REST surface complete (minus traces — Phase 7 — and reload wiring — Phase 6).

---

## Phase 6 — Engine Integration + Reload Orchestrator

### Task 6.1: Reload orchestrator with recovery

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/reload.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_reload.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_reload.py
import pytest
from dataclasses import dataclass

from idun_agent_standalone.reload import orchestrate_reload, ReloadOutcome


@dataclass
class FakeEngine:
    initialized_with: object | None = None
    shutdown_called: bool = False
    fail_on: object | None = None

    async def shutdown_agent(self):
        self.shutdown_called = True

    async def initialize(self, cfg):
        if cfg is self.fail_on:
            raise RuntimeError("init boom")
        self.initialized_with = cfg


@pytest.mark.asyncio
async def test_orchestrate_success():
    eng = FakeEngine()
    out = await orchestrate_reload(
        engine=eng,
        new_config="NEW",
        previous_config="OLD",
        structural_change=False,
    )
    assert out.kind == "reloaded"
    assert eng.initialized_with == "NEW"


@pytest.mark.asyncio
async def test_orchestrate_structural_returns_restart_required():
    eng = FakeEngine()
    out = await orchestrate_reload(
        engine=eng, new_config="N", previous_config="O",
        structural_change=True,
    )
    assert out.kind == "restart_required"
    assert eng.initialized_with is None


@pytest.mark.asyncio
async def test_orchestrate_failure_recovers_to_previous():
    eng = FakeEngine(fail_on="NEW")
    out = await orchestrate_reload(
        engine=eng, new_config="NEW", previous_config="OLD",
        structural_change=False,
    )
    assert out.kind == "init_failed"
    assert out.recovered is True
    assert eng.initialized_with == "OLD"


@pytest.mark.asyncio
async def test_orchestrate_failure_recovery_also_fails():
    eng = FakeEngine(fail_on=object())  # fail everything
    eng.fail_on = ...  # sentinel — match any cfg

    class BreakAll(FakeEngine):
        async def initialize(self, cfg):
            raise RuntimeError("both boom")

    eng2 = BreakAll()
    out = await orchestrate_reload(
        engine=eng2, new_config="N", previous_config="O",
        structural_change=False,
    )
    assert out.kind == "init_failed"
    assert out.recovered is False
```

- [ ] **Step 2: Implement**

```python
# src/idun_agent_standalone/reload.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol


logger = logging.getLogger(__name__)


class EngineLike(Protocol):
    async def shutdown_agent(self) -> None: ...
    async def initialize(self, cfg: Any) -> None: ...


@dataclass
class ReloadOutcome:
    kind: str  # "reloaded" | "restart_required" | "init_failed"
    message: str = ""
    recovered: bool | None = None


async def orchestrate_reload(
    *,
    engine: EngineLike,
    new_config: Any,
    previous_config: Any,
    structural_change: bool,
) -> ReloadOutcome:
    if structural_change:
        return ReloadOutcome(kind="restart_required")

    try:
        await engine.shutdown_agent()
    except Exception:
        logger.exception("shutdown_agent failed — continuing to initialize anyway")

    try:
        await engine.initialize(new_config)
        return ReloadOutcome(kind="reloaded")
    except Exception as e:
        logger.exception("engine init failed; attempting recovery")
        try:
            await engine.initialize(previous_config)
            return ReloadOutcome(kind="init_failed", message=str(e), recovered=True)
        except Exception as e2:
            logger.exception("recovery init also failed")
            return ReloadOutcome(kind="init_failed", message=f"{e}; recovery: {e2}", recovered=False)
```

- [ ] **Step 3: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/test_reload.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/reload.py \
        libs/idun_agent_standalone/tests/unit/test_reload.py
git commit -m "feat(standalone): reload orchestrator with previous-config recovery"
```

### Task 6.2: Wire engine composition + reload into app factory

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/runtime.py` (implement `run_server`)
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/agent.py` (call orchestrator after PUT)
- Test: `libs/idun_agent_standalone/tests/integration/test_reload_flow.py`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/integration/test_reload_flow.py
import pytest
from httpx import AsyncClient

from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.models import AgentRow, MemoryRow
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_put_agent_triggers_reload(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'r.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")

    upgrade_head()

    engine = create_db_engine(StandaloneSettings().database_url)
    sm = create_sessionmaker(engine)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="before", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        await s.commit()
    await engine.dispose()

    app = await create_standalone_app(StandaloneSettings())

    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.put("/admin/api/v1/agent", json={
            "name": "after",
            "framework": "langgraph",
            "graph_definition": "idun_agent_standalone.testing:echo_graph",
            "config": {},
        })
        assert r.status_code == 200
        assert r.json()["name"] == "after"

    await app.state.db_engine.dispose()
```

- [ ] **Step 2: Implement full `app.py`**

```python
# src/idun_agent_standalone/app.py
from __future__ import annotations

from fastapi import FastAPI

from idun_agent_engine.server.app_factory import create_app as create_engine_app

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.routers import (
    agent as agent_router,
    auth as auth_router,
    guardrails as guardrails_router,
    health as health_router,
    integrations as integrations_router,
    mcp_servers as mcp_router,
    memory as memory_router,
    observability as observability_router,
    prompts as prompts_router,
    theme as theme_router,
)
from idun_agent_standalone.config_assembly import assemble_engine_config
from idun_agent_standalone.config_io import is_db_empty, seed_from_yaml
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.errors import install_exception_handlers
from idun_agent_standalone.middleware import install_request_id_middleware
from idun_agent_standalone.settings import StandaloneSettings


async def _bootstrap_if_needed(settings, sm) -> None:
    async with sm() as session:
        if await is_db_empty(session):
            if settings.config_path.exists():
                await seed_from_yaml(session, settings.config_path)
                await session.commit()


async def create_standalone_app(settings: StandaloneSettings) -> FastAPI:
    settings.validate_for_runtime()
    upgrade_head()

    db_engine = create_db_engine(settings.database_url)
    sessionmaker = create_sessionmaker(db_engine)
    await _bootstrap_if_needed(settings, sessionmaker)

    async with sessionmaker() as s:
        engine_config = await assemble_engine_config(s)

    def _admin_auth_dep():
        # `require_auth` is itself a dependency; wrap so engine can accept it as one
        return None

    app = create_engine_app(engine_config, reload_auth=require_auth)
    app.state.settings = settings
    app.state.db_engine = db_engine
    app.state.sessionmaker = sessionmaker

    install_request_id_middleware(app)
    install_exception_handlers(app)

    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.include_router(agent_router.router)
    app.include_router(guardrails_router.router)
    app.include_router(memory_router.router)
    app.include_router(observability_router.router)
    app.include_router(theme_router.router)
    app.include_router(mcp_router.router)
    app.include_router(prompts_router.router)
    app.include_router(integrations_router.router)

    return app
```

- [ ] **Step 3: Implement `run_server` in `runtime.py`**

Replace the `NotImplementedError` stub:

```python
# runtime.py — add at top
import uvicorn
from idun_agent_standalone.app import create_standalone_app


def run_server(
    *,
    config_path: str | None = None,
    host: str | None = None,
    port: int | None = None,
    auth_mode: str | None = None,
    ui_dir: str | None = None,
    database_url: str | None = None,
) -> None:
    import os
    if config_path:
        os.environ["IDUN_CONFIG_PATH"] = config_path
    if host:
        os.environ["IDUN_HOST"] = host
    if port:
        os.environ["IDUN_PORT"] = str(port)
    if auth_mode:
        os.environ["IDUN_ADMIN_AUTH_MODE"] = auth_mode
    if ui_dir:
        os.environ["IDUN_UI_DIR"] = ui_dir
    if database_url:
        os.environ["DATABASE_URL"] = database_url

    settings = StandaloneSettings()

    import asyncio

    async def _boot():
        return await create_standalone_app(settings)

    app = asyncio.run(_boot())
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
```

- [ ] **Step 4: Add reload trigger to agent router**

In `admin/routers/agent.py`, replace `put_agent` body's commit section:

```python
# after commit:
from idun_agent_standalone.reload import orchestrate_reload
from idun_agent_standalone.config_assembly import assemble_engine_config

previous_cfg = request.app.state.current_engine_config if hasattr(request.app.state, "current_engine_config") else None
new_cfg = await assemble_engine_config(s)

structural = (
    previous_cfg is not None
    and (previous_cfg.agent.framework != new_cfg.agent.framework
         or previous_cfg.agent.graph_definition != new_cfg.agent.graph_definition)
)

outcome = await orchestrate_reload(
    engine=request.app.state.engine,  # engine's BaseAgent attached by engine's create_app
    new_config=new_cfg,
    previous_config=previous_cfg,
    structural_change=structural,
)
request.app.state.current_engine_config = new_cfg

if outcome.kind == "restart_required":
    return JSONResponse(status_code=202, content={"restart_required": True})
if outcome.kind == "init_failed":
    return JSONResponse(
        status_code=500,
        content={"error": "engine_init_failed", "message": outcome.message, "recovered": outcome.recovered},
    )
# fall through to normal response
```

Imports to add at top:
```python
from fastapi.responses import JSONResponse
```

Also store `current_engine_config` on the app state in `create_standalone_app`:

```python
# in app.py, just after assemble:
app.state.current_engine_config = engine_config
```

- [ ] **Step 5: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_reload_flow.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/{app,runtime}.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/agent.py \
        libs/idun_agent_standalone/tests/integration/test_reload_flow.py
git commit -m "feat(standalone): compose engine + admin routes; reload triggers on agent PUT"
```

### Task 6.3: Apply reload hook to every mutating admin route

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/reload_hook.py` (shared helper)
- Modify: every singleton + collection router to call it

- [ ] **Step 1: Write shared helper**

```python
# src/idun_agent_standalone/admin/reload_hook.py
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from idun_agent_standalone.config_assembly import assemble_engine_config
from idun_agent_standalone.reload import orchestrate_reload


async def trigger_reload(request: Request, session) -> JSONResponse | None:
    """Call after mutating a resource; returns a JSONResponse if reload produced 202 or 500, else None."""
    previous_cfg = getattr(request.app.state, "current_engine_config", None)
    new_cfg = await assemble_engine_config(session)

    structural = (
        previous_cfg is not None
        and (previous_cfg.agent.framework != new_cfg.agent.framework
             or previous_cfg.agent.graph_definition != new_cfg.agent.graph_definition)
    )

    outcome = await orchestrate_reload(
        engine=request.app.state.engine,
        new_config=new_cfg,
        previous_config=previous_cfg,
        structural_change=structural,
    )
    request.app.state.current_engine_config = new_cfg

    if outcome.kind == "restart_required":
        return JSONResponse(status_code=202, content={"restart_required": True})
    if outcome.kind == "init_failed":
        return JSONResponse(
            status_code=500,
            content={"error": "engine_init_failed", "message": outcome.message, "recovered": outcome.recovered},
        )
    return None
```

- [ ] **Step 2: Add `await trigger_reload(request, s)` after `await s.commit()` in each mutating endpoint**

Endpoints to modify:
- `agent.put_agent`
- `guardrails.put_guardrails`
- `memory.put_memory`
- `observability.put_observability`
- `mcp_servers.create_mcp`, `patch_mcp`, `delete_mcp`
- `prompts.create_prompt`, `delete_prompt`
- `integrations.create_integration`, `patch_integration`, `delete_integration`

Pattern (example from memory):

```python
async def put_memory(body: MemoryPayload, request: Request) -> MemoryPayload | JSONResponse:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        ...  # existing mutation
        await s.commit()
        reload_response = await trigger_reload(request, s)
        if reload_response is not None:
            return reload_response
        return MemoryPayload(config=row.config or {})
```

Don't add the hook to `theme` (theme is pure UI state — no engine reload).

Don't add to `auth` routes. Don't add to `health`.

- [ ] **Step 3: Write an integration test hitting guardrails PUT**

```python
# tests/integration/test_reload_on_guardrails.py
import pytest
from httpx import AsyncClient

from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.db.models import AgentRow, MemoryRow
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_guardrails_put_triggers_reload(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'g.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")

    upgrade_head()
    engine = create_db_engine(StandaloneSettings().database_url)
    sm = create_sessionmaker(engine)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="x", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        await s.commit()
    await engine.dispose()

    app = await create_standalone_app(StandaloneSettings())
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.put("/admin/api/v1/guardrails", json={"config": {"guardrails": []}, "enabled": True})
        assert r.status_code in (200, 202, 500)  # 200 = reloaded; any other is still captured
    await app.state.db_engine.dispose()
```

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_reload_on_guardrails.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin \
        libs/idun_agent_standalone/tests/integration/test_reload_on_guardrails.py
git commit -m "feat(standalone): trigger reload hook on every mutating admin route"
```

**Phase 6 done.** Admin mutations reload the engine atomically with previous-config recovery.

---

## Phase 7 — Traces Capture

### Task 7.1: Batched async writer

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/traces/__init__.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/traces/writer.py`
- Test: `libs/idun_agent_standalone/tests/unit/traces/test_writer.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/traces/test_writer.py
import asyncio
import pytest

from idun_agent_standalone.traces.writer import BatchedTraceWriter


class RecordingSink:
    def __init__(self):
        self.batches = []

    async def flush(self, items):
        self.batches.append(list(items))


@pytest.mark.asyncio
async def test_flushes_on_batch_size():
    sink = RecordingSink()
    w = BatchedTraceWriter(sink=sink, batch_size=3, max_latency_ms=10000)
    await w.start()
    for i in range(3):
        await w.enqueue({"i": i})
    await w.drain()
    assert sum(len(b) for b in sink.batches) == 3


@pytest.mark.asyncio
async def test_flushes_on_latency():
    sink = RecordingSink()
    w = BatchedTraceWriter(sink=sink, batch_size=100, max_latency_ms=50)
    await w.start()
    await w.enqueue({"i": 1})
    await asyncio.sleep(0.2)
    await w.drain()
    assert sum(len(b) for b in sink.batches) == 1


@pytest.mark.asyncio
async def test_sink_failure_isolated(caplog):
    class Bad:
        async def flush(self, items):
            raise RuntimeError("sink boom")

    w = BatchedTraceWriter(sink=Bad(), batch_size=1, max_latency_ms=10000)
    await w.start()
    await w.enqueue({"i": 1})
    await w.drain()
    assert any("trace flush failed" in r.message for r in caplog.records)
```

- [ ] **Step 2: Implement**

```python
# src/idun_agent_standalone/traces/__init__.py
```

```python
# src/idun_agent_standalone/traces/writer.py
from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol


logger = logging.getLogger(__name__)


class TraceSink(Protocol):
    async def flush(self, items: list[dict[str, Any]]) -> None: ...


class BatchedTraceWriter:
    def __init__(self, *, sink: TraceSink, batch_size: int = 25, max_latency_ms: int = 250) -> None:
        self._sink = sink
        self._batch_size = batch_size
        self._max_latency = max_latency_ms / 1000.0
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def enqueue(self, item: dict[str, Any]) -> None:
        await self._queue.put(item)

    async def drain(self) -> None:
        await self._queue.put(None)  # sentinel
        if self._task:
            await self._task

    async def _run(self) -> None:
        buffer: list[dict[str, Any]] = []
        while True:
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=self._max_latency)
            except asyncio.TimeoutError:
                if buffer:
                    await self._flush(buffer)
                    buffer = []
                continue
            if item is None:
                if buffer:
                    await self._flush(buffer)
                return
            buffer.append(item)
            if len(buffer) >= self._batch_size:
                await self._flush(buffer)
                buffer = []

    async def _flush(self, items: list[dict[str, Any]]) -> None:
        try:
            await self._sink.flush(items)
        except Exception:
            logger.exception("trace flush failed")
```

- [ ] **Step 3: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/traces/test_writer.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/traces \
        libs/idun_agent_standalone/tests/unit/traces
git commit -m "feat(standalone): batched async trace writer with latency/size flush"
```

### Task 7.2: DB sink + observer wiring

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/traces/sink.py`
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/traces/observer.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Test: `libs/idun_agent_standalone/tests/integration/traces/test_capture.py`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/integration/traces/test_capture.py
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.db.models import AgentRow, MemoryRow, SessionRow, TraceEventRow
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_chat_turn_persists_trace_events(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    upgrade_head()

    engine = create_db_engine(StandaloneSettings().database_url)
    sm = create_sessionmaker(engine)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="x", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        await s.commit()
    await engine.dispose()

    app = await create_standalone_app(StandaloneSettings())
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.post("/agent/run", json={
            "threadId": "tid-1",
            "runId": "rid-1",
            "messages": [{"role": "user", "content": "hello"}],
            "state": {},
        })
        assert r.status_code == 200
        await r.aread()

    # give writer time to drain
    import asyncio
    await asyncio.sleep(0.5)

    sm2 = app.state.sessionmaker
    async with sm2() as s:
        sessions = (await s.execute(select(SessionRow))).scalars().all()
        events = (await s.execute(select(TraceEventRow))).scalars().all()
    assert any(ses.id == "tid-1" for ses in sessions)
    assert len(events) > 0

    await app.state.db_engine.dispose()
```

- [ ] **Step 2: Implement DB sink**

```python
# src/idun_agent_standalone/traces/sink.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.db.models import SessionRow, TraceEventRow


class DatabaseTraceSink:
    def __init__(self, sessionmaker: async_sessionmaker) -> None:
        self._sm = sessionmaker

    async def flush(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        async with self._sm() as s:
            # upsert sessions and count per-session new events
            session_ids: dict[str, int] = {}
            for it in items:
                session_ids[it["session_id"]] = session_ids.get(it["session_id"], 0) + 1

            for sid, inc in session_ids.items():
                existing = (await s.execute(select(SessionRow).where(SessionRow.id == sid))).scalar_one_or_none()
                if existing is None:
                    s.add(SessionRow(id=sid, message_count=inc))
                else:
                    existing.message_count = (existing.message_count or 0) + inc
                    existing.last_event_at = datetime.now(timezone.utc)

            for it in items:
                s.add(TraceEventRow(
                    session_id=it["session_id"],
                    run_id=it["run_id"],
                    sequence=it["sequence"],
                    event_type=it["event_type"],
                    payload=it["payload"],
                ))
            await s.commit()
```

- [ ] **Step 3: Implement observer factory**

```python
# src/idun_agent_standalone/traces/observer.py
from __future__ import annotations

import itertools
from typing import Any

from idun_agent_engine.agent.observers import RunContext
from idun_agent_standalone.traces.writer import BatchedTraceWriter


def make_observer(writer: BatchedTraceWriter):
    run_sequences: dict[str, int] = {}

    async def observe(event: Any, ctx: RunContext) -> None:
        key = f"{ctx.thread_id}:{ctx.run_id}"
        seq = run_sequences.get(key, 0)
        run_sequences[key] = seq + 1

        payload = event.model_dump() if hasattr(event, "model_dump") else {"repr": repr(event)}
        event_type = type(event).__name__

        await writer.enqueue({
            "session_id": ctx.thread_id,
            "run_id": ctx.run_id,
            "sequence": seq,
            "event_type": event_type,
            "payload": payload,
        })

    return observe
```

- [ ] **Step 4: Wire writer + observer into `app.py`**

```python
# app.py — add imports and setup
from idun_agent_standalone.traces.observer import make_observer
from idun_agent_standalone.traces.sink import DatabaseTraceSink
from idun_agent_standalone.traces.writer import BatchedTraceWriter

# inside create_standalone_app, after engine app created:
trace_sink = DatabaseTraceSink(sessionmaker)
trace_writer = BatchedTraceWriter(sink=trace_sink, batch_size=25, max_latency_ms=250)

@app.on_event("startup")
async def _start_traces():
    await trace_writer.start()
    app.state.engine.register_run_event_observer(make_observer(trace_writer))

@app.on_event("shutdown")
async def _stop_traces():
    await trace_writer.drain()

app.state.trace_writer = trace_writer
```

- [ ] **Step 5: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/traces/test_capture.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/traces \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/tests/integration/traces
git commit -m "feat(standalone): AG-UI run events captured to DB via batched observer"
```

### Task 7.3: Traces REST endpoints

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py`
- Test: `libs/idun_agent_standalone/tests/integration/admin/test_traces.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/admin/test_traces.py
import pytest
from httpx import AsyncClient

from idun_agent_standalone.testing_app import make_test_app
from idun_agent_standalone.db.models import SessionRow, TraceEventRow


@pytest.mark.asyncio
async def test_list_session_detail_delete(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(SessionRow(id="ses1", message_count=2))
        s.add(TraceEventRow(session_id="ses1", run_id="r1", sequence=0, event_type="RunStarted", payload={}))
        s.add(TraceEventRow(session_id="ses1", run_id="r1", sequence=1, event_type="RunFinished", payload={}))
        await s.commit()
    async with AsyncClient(app=app, base_url="http://t") as c:
        lst = await c.get("/admin/api/v1/traces/sessions")
        assert lst.status_code == 200
        assert lst.json()["items"][0]["id"] == "ses1"

        det = await c.get("/admin/api/v1/traces/sessions/ses1/events")
        assert det.status_code == 200
        assert len(det.json()["events"]) == 2

        dele = await c.delete("/admin/api/v1/traces/sessions/ses1")
        assert dele.status_code == 204
```

- [ ] **Step 2: Implement router**

```python
# src/idun_agent_standalone/admin/routers/traces.py
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import SessionRow, TraceEventRow


router = APIRouter(prefix="/admin/api/v1/traces", tags=["traces"],
                   dependencies=[Depends(require_auth)])


class SessionSummary(BaseModel):
    id: str
    created_at: datetime
    last_event_at: datetime
    message_count: int
    title: str | None


class SessionList(BaseModel):
    items: list[SessionSummary]
    total: int


class TraceEvent(BaseModel):
    id: int
    session_id: str
    run_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]
    created_at: datetime


class EventsResponse(BaseModel):
    events: list[TraceEvent]
    truncated: bool


@router.get("/sessions", response_model=SessionList)
async def list_sessions(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        total = (await s.execute(select(func.count(SessionRow.id)))).scalar_one()
        rows = (await s.execute(
            select(SessionRow).order_by(SessionRow.last_event_at.desc()).limit(limit).offset(offset)
        )).scalars().all()
        return SessionList(
            items=[SessionSummary(
                id=r.id, created_at=r.created_at, last_event_at=r.last_event_at,
                message_count=r.message_count, title=r.title
            ) for r in rows],
            total=total,
        )


@router.get("/sessions/{sid}", response_model=SessionSummary)
async def get_session(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(SessionRow).where(SessionRow.id == sid))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return SessionSummary(
            id=row.id, created_at=row.created_at, last_event_at=row.last_event_at,
            message_count=row.message_count, title=row.title,
        )


@router.get("/sessions/{sid}/events", response_model=EventsResponse)
async def get_session_events(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (await s.execute(
            select(TraceEventRow).where(TraceEventRow.session_id == sid)
            .order_by(TraceEventRow.sequence.asc()).limit(1000)
        )).scalars().all()
        total = (await s.execute(
            select(func.count(TraceEventRow.id)).where(TraceEventRow.session_id == sid)
        )).scalar_one()
        return EventsResponse(
            events=[TraceEvent(
                id=r.id, session_id=r.session_id, run_id=r.run_id, sequence=r.sequence,
                event_type=r.event_type, payload=r.payload or {}, created_at=r.created_at,
            ) for r in rows],
            truncated=total > len(rows),
        )


@router.delete("/sessions/{sid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(TraceEventRow).where(TraceEventRow.session_id == sid))
        await s.execute(delete(SessionRow).where(SessionRow.id == sid))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 3: Register in `testing_app.py` and `app.py`**

Add `from idun_agent_standalone.admin.routers import traces as traces_router` and `app.include_router(traces_router.router)` to both.

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/admin/test_traces.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/{app,testing_app}.py \
        libs/idun_agent_standalone/tests/integration/admin/test_traces.py
git commit -m "feat(standalone): traces REST endpoints for session list/detail/events/delete"
```

**Phase 7 done.** Traces captured end-to-end and queryable.

---

## Phase 8 — Runtime Config + Static UI Mount

### Task 8.1: `/runtime-config.js` endpoint

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/theme/runtime_config.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_runtime_config.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_runtime_config.py
import json
import pytest
from httpx import AsyncClient

from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.db.models import AgentRow, MemoryRow, ThemeRow
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_runtime_config_js_returns_javascript(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'rc.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    upgrade_head()

    eng = create_db_engine(StandaloneSettings().database_url)
    sm = create_sessionmaker(eng)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="x", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        s.add(ThemeRow(id="singleton", config={"appName": "Test", "layout": "branded"}))
        await s.commit()
    await eng.dispose()

    app = await create_standalone_app(StandaloneSettings())
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/runtime-config.js")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/javascript")
        assert "__IDUN_CONFIG__" in r.text
        assert "Test" in r.text

    await app.state.db_engine.dispose()
```

- [ ] **Step 2: Implement**

```python
# src/idun_agent_standalone/theme/__init__.py
```

```python
# src/idun_agent_standalone/theme/runtime_config.py
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from idun_agent_standalone.db.models import ThemeRow


router = APIRouter(tags=["runtime-config"])


DEFAULT_THEME = {
    "appName": "My Assistant",
    "greeting": "How can I help?",
    "starterPrompts": [],
    "logo": {"text": "MA"},
    "layout": "branded",
    "colors": {
        "light": {"primary": "#4f46e5", "accent": "#7c3aed", "background": "#ffffff",
                  "foreground": "#0a0a0a", "muted": "#f5f5f5", "border": "#e5e7eb"},
        "dark":  {"primary": "#818cf8", "accent": "#a78bfa", "background": "#0a0a0a",
                  "foreground": "#fafafa", "muted": "#1f1f1f", "border": "#262626"},
    },
    "radius": "0.5",
    "fontFamily": "system",
    "defaultColorScheme": "system",
}


@router.get("/runtime-config.js")
async def runtime_config_js(request: Request) -> Response:
    sm = request.app.state.sessionmaker
    settings = request.app.state.settings
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
    theme = {**DEFAULT_THEME, **((row.config or {}) if row else {})}

    config: dict[str, Any] = {
        "theme": theme,
        "authMode": settings.auth_mode.value,
        "layout": theme.get("layout", "branded"),
    }
    body = f"window.__IDUN_CONFIG__ = {json.dumps(config)};\n"
    return Response(content=body, media_type="application/javascript", headers={"Cache-Control": "no-store"})
```

- [ ] **Step 3: Register in `app.py`**

```python
from idun_agent_standalone.theme import runtime_config as runtime_config_router
# in create_standalone_app:
app.include_router(runtime_config_router.router)
```

- [ ] **Step 4: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_runtime_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/theme \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/tests/integration/test_runtime_config.py
git commit -m "feat(standalone): /runtime-config.js endpoint serving theme + auth mode"
```

### Task 8.2: Static UI mount from bundled `static/`

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/static/.gitkeep`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_static_mount.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_static_mount.py
import pytest
from httpx import AsyncClient
from pathlib import Path

from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.db.models import AgentRow, MemoryRow
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_ui_dir_env_takes_precedence(tmp_path, monkeypatch):
    ui = tmp_path / "ui"; ui.mkdir()
    (ui / "index.html").write_text("<title>CUSTOM</title>")
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 's.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_UI_DIR", str(ui))
    upgrade_head()

    eng = create_db_engine(StandaloneSettings().database_url)
    sm = create_sessionmaker(eng)
    async with sm() as s:
        s.add(AgentRow(id="singleton", name="x", framework="langgraph",
                       graph_definition="idun_agent_standalone.testing:echo_graph", config={}))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        await s.commit()
    await eng.dispose()

    app = await create_standalone_app(StandaloneSettings())
    async with AsyncClient(app=app, base_url="http://t") as c:
        r = await c.get("/")
        assert r.status_code == 200
        assert "CUSTOM" in r.text
    await app.state.db_engine.dispose()
```

- [ ] **Step 2: Implement bundled static fallback**

Edit `app.py`. At the END of `create_standalone_app`, after every other mount:

```python
import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles

def _resolve_ui_dir(settings) -> Path | None:
    if settings.ui_dir:
        p = Path(settings.ui_dir)
        if p.is_dir():
            return p
    bundled = Path(__file__).parent / "static"
    return bundled if bundled.is_dir() and any(bundled.iterdir()) else None

# at end of create_standalone_app, after all routers included:
ui_dir = _resolve_ui_dir(settings)
if ui_dir is not None:
    app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
```

Also create the empty placeholder directory so the wheel bundles it:

```bash
mkdir -p libs/idun_agent_standalone/src/idun_agent_standalone/static
touch libs/idun_agent_standalone/src/idun_agent_standalone/static/.gitkeep
```

- [ ] **Step 3: Run test**

Run: `uv run pytest libs/idun_agent_standalone/tests/integration/test_static_mount.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/static/.gitkeep \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/tests/integration/test_static_mount.py
git commit -m "feat(standalone): mount static UI from IDUN_UI_DIR or bundled static/"
```

**Phase 8 done.** Backend is complete. Chat SSE flows, admin REST works, traces capture, runtime config + static UI mount — all with integration tests.

---

## Phase 9 — Next.js Skeleton + Theme

All UI work happens in `services/idun_agent_standalone_ui/`. pnpm, Next.js 15 App Router with `output: 'export'`, Tailwind v4, shadcn/ui primitives.

### Task 9.1: Scaffold Next.js project

**Files:**
- Create: `services/idun_agent_standalone_ui/package.json`
- Create: `services/idun_agent_standalone_ui/tsconfig.json`
- Create: `services/idun_agent_standalone_ui/next.config.mjs`
- Create: `services/idun_agent_standalone_ui/app/layout.tsx`
- Create: `services/idun_agent_standalone_ui/app/page.tsx`
- Create: `services/idun_agent_standalone_ui/app/globals.css`
- Create: `services/idun_agent_standalone_ui/postcss.config.mjs`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "idun-agent-standalone-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest",
    "test:e2e": "playwright test",
    "generate:types": "openapi-typescript http://localhost:8000/openapi.json -o lib/api-types.ts"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@ag-ui/client": "latest",
    "@tanstack/react-query": "^5.50.0",
    "@tanstack/react-table": "^8.20.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",
    "sonner": "^1.5.0",
    "lucide-react": "^0.453.0",
    "recharts": "^2.12.0",
    "@monaco-editor/react": "^4.6.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "openapi-typescript": "^7.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0-beta.1",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 4: Write `app/layout.tsx` with theme + runtime-config loader**

```tsx
// app/layout.tsx
import "./globals.css";
import Script from "next/script";
import type { ReactNode } from "react";

export const metadata = { title: "Idun Agent" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--fg)] antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Write `app/globals.css`**

```css
@import "tailwindcss";

@theme inline {
  --color-primary: var(--primary, #4f46e5);
  --color-accent: var(--accent, #7c3aed);
  --color-bg: var(--background, #ffffff);
  --color-fg: var(--foreground, #0a0a0a);
  --color-muted: var(--muted, #f5f5f5);
  --color-border: var(--border, #e5e7eb);
  --radius: var(--radius-value, 0.5rem);
}

:root {
  --primary: #4f46e5;
  --accent: #7c3aed;
  --background: #ffffff;
  --foreground: #0a0a0a;
  --muted: #f5f5f5;
  --border: #e5e7eb;
  --radius-value: 0.5rem;
}

.dark {
  --primary: #818cf8;
  --accent: #a78bfa;
  --background: #0a0a0a;
  --foreground: #fafafa;
  --muted: #1f1f1f;
  --border: #262626;
}
```

- [ ] **Step 6: Write `app/page.tsx` (placeholder — Phase 10 replaces)**

```tsx
export default function Home() {
  return <div className="p-8">Chat UI — coming in Phase 10</div>;
}
```

- [ ] **Step 7: Write `postcss.config.mjs`**

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 8: Install + verify build**

```bash
cd services/idun_agent_standalone_ui
pnpm install
pnpm build
```

Expected: `out/` dir contains `index.html` with the placeholder text.

- [ ] **Step 9: Commit**

```bash
git add services/idun_agent_standalone_ui
git commit -m "feat(standalone-ui): scaffold Next.js 15 static export + Tailwind v4 + theme vars"
```

### Task 9.2: shadcn/ui init + base primitives

**Files:**
- Create: `services/idun_agent_standalone_ui/components.json`
- Create: `services/idun_agent_standalone_ui/lib/utils.ts`
- Install primitives via CLI (or hand-write — see below)

- [ ] **Step 1: Write `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "components",
    "utils": "lib/utils"
  }
}
```

- [ ] **Step 2: Write `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Install base shadcn primitives**

Run, from `services/idun_agent_standalone_ui/`:
```bash
pnpm dlx shadcn@latest add button input label textarea select checkbox switch card separator skeleton dialog sheet alert-dialog dropdown-menu tabs badge toast
```

(If `shadcn` CLI flow doesn't suit, manually copy the component files from shadcn/ui docs — each is a single file that ends up in `components/ui/`.)

- [ ] **Step 4: Install additional libraries**

```bash
pnpm add @radix-ui/react-slot
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui
git commit -m "feat(standalone-ui): install shadcn/ui primitives + cn helper"
```

### Task 9.3: API client + TanStack Query + auth hook

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/api.ts`
- Create: `services/idun_agent_standalone_ui/lib/query-client.tsx`
- Create: `services/idun_agent_standalone_ui/lib/hooks/use-auth.ts`
- Create: `services/idun_agent_standalone_ui/lib/runtime-config.ts`
- Modify: `services/idun_agent_standalone_ui/app/layout.tsx` (wrap with QueryProvider)

- [ ] **Step 1: Write `lib/runtime-config.ts`**

```ts
export type RuntimeConfig = {
  theme: {
    appName: string;
    greeting: string;
    starterPrompts: string[];
    logo: { text: string; imageUrl?: string };
    layout: "branded" | "minimal" | "inspector";
    colors: { light: Record<string, string>; dark: Record<string, string> };
    radius: string;
    fontFamily: string;
    defaultColorScheme: "light" | "dark" | "system";
  };
  authMode: "none" | "password" | "oidc";
  layout: "branded" | "minimal" | "inspector";
};

declare global {
  interface Window { __IDUN_CONFIG__?: RuntimeConfig }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined" || !window.__IDUN_CONFIG__) {
    return {
      theme: {
        appName: "Idun Agent", greeting: "", starterPrompts: [],
        logo: { text: "IA" }, layout: "branded",
        colors: { light: {}, dark: {} }, radius: "0.5",
        fontFamily: "system", defaultColorScheme: "system",
      },
      authMode: "none", layout: "branded",
    };
  }
  return window.__IDUN_CONFIG__;
}
```

- [ ] **Step 2: Write `lib/api.ts`**

```ts
export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`API ${status}`);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login/";
    throw new ApiError(401, null);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  // auth
  login: (password: string) => apiFetch<{ ok: boolean }>("/admin/api/v1/auth/login", {
    method: "POST", body: JSON.stringify({ password }),
  }),
  logout: () => apiFetch<{ ok: boolean }>("/admin/api/v1/auth/logout", { method: "POST" }),
  me: () => apiFetch<{ authenticated: boolean; auth_mode: string }>("/admin/api/v1/auth/me"),

  // agent
  getAgent: () => apiFetch<any>("/admin/api/v1/agent"),
  putAgent: (body: unknown) => apiFetch<any>("/admin/api/v1/agent", { method: "PUT", body: JSON.stringify(body) }),

  // singletons
  getGuardrails: () => apiFetch<any>("/admin/api/v1/guardrails"),
  putGuardrails: (body: unknown) => apiFetch<any>("/admin/api/v1/guardrails", { method: "PUT", body: JSON.stringify(body) }),
  getMemory: () => apiFetch<any>("/admin/api/v1/memory"),
  putMemory: (body: unknown) => apiFetch<any>("/admin/api/v1/memory", { method: "PUT", body: JSON.stringify(body) }),
  getObservability: () => apiFetch<any>("/admin/api/v1/observability"),
  putObservability: (body: unknown) => apiFetch<any>("/admin/api/v1/observability", { method: "PUT", body: JSON.stringify(body) }),
  getTheme: () => apiFetch<any>("/admin/api/v1/theme"),
  putTheme: (body: unknown) => apiFetch<any>("/admin/api/v1/theme", { method: "PUT", body: JSON.stringify(body) }),

  // collections
  listMcp: () => apiFetch<any[]>("/admin/api/v1/mcp-servers"),
  createMcp: (body: unknown) => apiFetch<any>("/admin/api/v1/mcp-servers", { method: "POST", body: JSON.stringify(body) }),
  patchMcp: (id: string, body: unknown) => apiFetch<any>(`/admin/api/v1/mcp-servers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMcp: (id: string) => apiFetch<void>(`/admin/api/v1/mcp-servers/${id}`, { method: "DELETE" }),

  listPrompts: () => apiFetch<any[]>("/admin/api/v1/prompts"),
  createPrompt: (body: unknown) => apiFetch<any>("/admin/api/v1/prompts", { method: "POST", body: JSON.stringify(body) }),
  deletePrompt: (id: string) => apiFetch<void>(`/admin/api/v1/prompts/${id}`, { method: "DELETE" }),

  listIntegrations: () => apiFetch<any[]>("/admin/api/v1/integrations"),
  createIntegration: (body: unknown) => apiFetch<any>("/admin/api/v1/integrations", { method: "POST", body: JSON.stringify(body) }),
  patchIntegration: (id: string, body: unknown) => apiFetch<any>(`/admin/api/v1/integrations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteIntegration: (id: string) => apiFetch<void>(`/admin/api/v1/integrations/${id}`, { method: "DELETE" }),

  // traces
  listSessions: (params: { limit?: number; offset?: number } = {}) =>
    apiFetch<{ items: any[]; total: number }>(`/admin/api/v1/traces/sessions?limit=${params.limit ?? 50}&offset=${params.offset ?? 0}`),
  getSessionEvents: (id: string) => apiFetch<{ events: any[]; truncated: boolean }>(`/admin/api/v1/traces/sessions/${id}/events`),
  deleteSession: (id: string) => apiFetch<void>(`/admin/api/v1/traces/sessions/${id}`, { method: "DELETE" }),
};
```

- [ ] **Step 3: Write `lib/query-client.tsx`**

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } }
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4: Write `lib/hooks/use-auth.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useAuth() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.me,
    retry: false,
  });
}
```

- [ ] **Step 5: Wrap layout with QueryProvider**

Edit `app/layout.tsx`:

```tsx
import { QueryProvider } from "@/lib/query-client";
// ...
<body>
  <QueryProvider>{children}</QueryProvider>
</body>
```

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/{lib,app}
git commit -m "feat(standalone-ui): API client + TanStack Query + runtime config loader"
```

**Phase 9 done.** Next.js project builds, Tailwind + shadcn primitives available, API client ready.

---

## Phase 10 — Chat UI (`/`)

### Task 10.1: AG-UI client wrapper hook

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/agui.ts`
- Create: `services/idun_agent_standalone_ui/lib/hooks/use-chat.ts`

- [ ] **Step 1: Write `lib/agui.ts`**

```ts
import { AgentClient } from "@ag-ui/client";

export function createAgUiClient() {
  return new AgentClient({
    url: "/agent/run",
    credentials: "include",
  });
}

export type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; toolCalls: ToolCall[]; thinking: string[] };

export type ToolCall = { id: string; name: string; args: string; result?: string };
```

- [ ] **Step 2: Write `lib/hooks/use-chat.ts`**

```ts
"use client";
import { useState, useCallback, useRef } from "react";
import { createAgUiClient, type Message, type ToolCall } from "@/lib/agui";

type Status = "idle" | "streaming" | "error";

export function useChat(threadId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    const runId = crypto.randomUUID();
    const userMsg: Message = { id: runId + "-u", role: "user", text };
    const assistantMsg: Message = {
      id: runId + "-a", role: "assistant", text: "", toolCalls: [], thinking: [],
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStatus("streaming");
    setError(null);

    abortRef.current = new AbortController();
    const client = createAgUiClient();

    try {
      const updateAssistant = (fn: (m: Message) => Message) =>
        setMessages((prev) => prev.map((x) => (x.id === assistantMsg.id ? fn(x) : x)));

      await client.run({
        threadId,
        runId,
        messages: [{ role: "user", content: text }],
        state: {},
        signal: abortRef.current.signal,
        onEvent: (e: any) => {
          switch (e.type) {
            case "TextMessageContent":
              updateAssistant((m) => m.role === "assistant" ? { ...m, text: m.text + (e.delta ?? "") } : m);
              break;
            case "ToolCallStart":
              updateAssistant((m) => m.role === "assistant"
                ? { ...m, toolCalls: [...m.toolCalls, { id: e.toolCallId, name: e.name, args: "" }] }
                : m);
              break;
            case "ToolCallArgs":
              updateAssistant((m) => m.role === "assistant"
                ? { ...m, toolCalls: m.toolCalls.map((tc) => tc.id === e.toolCallId ? { ...tc, args: tc.args + (e.delta ?? "") } : tc) }
                : m);
              break;
            case "ToolCallEnd":
              updateAssistant((m) => m.role === "assistant"
                ? { ...m, toolCalls: m.toolCalls.map((tc) => tc.id === e.toolCallId ? { ...tc, result: JSON.stringify(e.result ?? null) } : tc) }
                : m);
              break;
            case "ThinkingStart":
              updateAssistant((m) => m.role === "assistant" ? { ...m, thinking: [...m.thinking, ""] } : m);
              break;
            case "ThinkingEnd":
              break;
            case "RunFinished":
              setStatus("idle");
              break;
            case "RunError":
              setStatus("error");
              setError(e.message ?? "run error");
              break;
          }
        },
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setStatus("error");
        setError(e?.message ?? "stream failed");
      } else {
        setStatus("idle");
      }
    }
  }, [threadId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, status, error, send, stop };
}
```

Note: the `@ag-ui/client` API signature used here (`client.run({ ..., onEvent })`) matches the pattern in the existing `services/idun_agent_web/src/utils/agui-client.ts`. If the library signature differs, adapt accordingly. Worth verifying with `rg -n "AgentClient" services/idun_agent_web`.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/lib
git commit -m "feat(standalone-ui): useChat hook wrapping AG-UI client with event reducer"
```

### Task 10.2: Chat page with 3 layout variants

**Files:**
- Create: `services/idun_agent_standalone_ui/components/chat/ChatMessage.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/ChatInput.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/EmptyState.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/SessionSwitcher.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/layouts/Branded.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/layouts/Minimal.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/layouts/Inspector.tsx`
- Modify: `services/idun_agent_standalone_ui/app/page.tsx`

- [ ] **Step 1: Write `ChatMessage.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/agui";

export function ChatMessage({ m }: { m: Message }) {
  if (m.role === "user") {
    return <div className="self-end rounded-xl rounded-br-sm bg-[var(--primary)] text-white px-4 py-2 max-w-[72%]">{m.text}</div>;
  }
  return (
    <div className="self-start flex flex-col gap-2 max-w-[72%]">
      {m.thinking.length > 0 && (
        <details className="text-xs text-muted-foreground italic rounded bg-[var(--muted)] px-3 py-1">
          <summary>Thinking</summary>
        </details>
      )}
      {m.toolCalls.map((tc) => (
        <div key={tc.id} className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
          <div className="font-mono text-xs opacity-60">🔧 {tc.name}</div>
          <pre className="text-xs mt-1 overflow-x-auto">{tc.args}</pre>
          {tc.result && <pre className="text-xs mt-1 opacity-70 overflow-x-auto">→ {tc.result}</pre>}
        </div>
      ))}
      {m.text && (
        <div className="rounded-xl rounded-bl-sm bg-[var(--muted)] text-[var(--fg)] px-4 py-2">{m.text}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `ChatInput.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput({ onSend, streaming, onStop }: {
  onSend: (text: string) => void;
  streaming: boolean;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2 border-t border-[var(--border)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text.trim());
        setText("");
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message…"
        rows={1}
        className="flex-1 resize-none"
      />
      {streaming ? (
        <Button type="button" variant="secondary" onClick={onStop}>Stop</Button>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Write `EmptyState.tsx`**

```tsx
import { getRuntimeConfig } from "@/lib/runtime-config";

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const cfg = getRuntimeConfig();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="h-12 w-12 rounded-lg bg-[var(--primary)] grid place-items-center text-white font-bold">
        {cfg.theme.logo.text.slice(0, 2).toUpperCase()}
      </div>
      <h1 className="text-lg font-semibold">{cfg.theme.appName}</h1>
      <p className="text-sm text-muted-foreground">{cfg.theme.greeting}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {cfg.theme.starterPrompts.slice(0, 4).map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `SessionSwitcher.tsx`**

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SessionSwitcher({ threadId }: { threadId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const newSession = () => {
    const id = crypto.randomUUID();
    const qp = new URLSearchParams(params.toString());
    qp.set("session", id);
    router.push(`/?${qp.toString()}`);
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="opacity-60">Session: {threadId.slice(0, 8)}</span>
      <Button size="sm" variant="ghost" onClick={newSession}>New</Button>
    </div>
  );
}
```

- [ ] **Step 5: Write layout components**

```tsx
// components/chat/layouts/Branded.tsx
"use client";
import { ChatMessage } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { EmptyState } from "../EmptyState";
import { SessionSwitcher } from "../SessionSwitcher";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { useChat } from "@/lib/hooks/use-chat";

export function BrandedLayout({ threadId }: { threadId: string }) {
  const cfg = getRuntimeConfig();
  const { messages, status, send, stop } = useChat(threadId);

  return (
    <div className="flex flex-col h-screen">
      <header
        className="flex items-center gap-3 px-4 py-3 text-white"
        style={{ background: `linear-gradient(90deg, ${cfg.theme.colors.light.primary}, ${cfg.theme.colors.light.accent})` }}
      >
        <div className="h-6 w-6 rounded bg-white/20" />
        <strong>{cfg.theme.appName}</strong>
        <div className="ml-auto"><SessionSwitcher threadId={threadId} /></div>
      </header>
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : messages.map((m) => <ChatMessage key={m.id} m={m} />)}
      </div>
      <ChatInput onSend={send} streaming={status === "streaming"} onStop={stop} />
    </div>
  );
}
```

```tsx
// components/chat/layouts/Minimal.tsx
"use client";
import { ChatMessage } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { EmptyState } from "../EmptyState";
import { SessionSwitcher } from "../SessionSwitcher";
import { useChat } from "@/lib/hooks/use-chat";

export function MinimalLayout({ threadId }: { threadId: string }) {
  const { messages, status, send, stop } = useChat(threadId);
  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)]">
        <strong>My Assistant</strong>
        <div className="ml-auto"><SessionSwitcher threadId={threadId} /></div>
      </header>
      <div className="flex-1 flex flex-col gap-3 p-6 overflow-auto">
        {messages.length === 0 ? <EmptyState onPick={send} /> : messages.map((m) => <ChatMessage key={m.id} m={m} />)}
      </div>
      <ChatInput onSend={send} streaming={status === "streaming"} onStop={stop} />
    </div>
  );
}
```

```tsx
// components/chat/layouts/Inspector.tsx
"use client";
import { ChatMessage } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { useChat } from "@/lib/hooks/use-chat";

export function InspectorLayout({ threadId }: { threadId: string }) {
  const { messages, status, send, stop } = useChat(threadId);
  return (
    <div className="grid grid-cols-[180px_1fr_220px] h-screen">
      <aside className="border-r border-[var(--border)] p-3 text-sm">
        <div className="text-xs text-muted-foreground mb-2 uppercase">Sessions</div>
        <button className="w-full text-left px-2 py-1 rounded bg-[var(--muted)] text-sm">+ New chat</button>
      </aside>
      <main className="flex flex-col">
        <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
          {messages.map((m) => <ChatMessage key={m.id} m={m} />)}
        </div>
        <ChatInput onSend={send} streaming={status === "streaming"} onStop={stop} />
      </main>
      <aside className="border-l border-[var(--border)] p-3 text-xs font-mono">
        <div className="text-muted-foreground uppercase mb-2">Run events</div>
        <div className="opacity-60">(live events render here — coming in MVP-1 polish)</div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: Update `app/page.tsx` to pick layout**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { BrandedLayout } from "@/components/chat/layouts/Branded";
import { MinimalLayout } from "@/components/chat/layouts/Minimal";
import { InspectorLayout } from "@/components/chat/layouts/Inspector";

export default function Home() {
  const params = useSearchParams();
  const threadId = useMemo(
    () => params.get("session") ?? crypto.randomUUID(),
    [params],
  );
  const [layout, setLayout] = useState<"branded" | "minimal" | "inspector">("branded");

  useEffect(() => {
    setLayout(getRuntimeConfig().layout);
  }, []);

  if (layout === "minimal") return <MinimalLayout threadId={threadId} />;
  if (layout === "inspector") return <InspectorLayout threadId={threadId} />;
  return <BrandedLayout threadId={threadId} />;
}
```

- [ ] **Step 7: Smoke test the build**

```bash
cd services/idun_agent_standalone_ui && pnpm build
```

Expected: `out/index.html` is generated; no TS errors.

- [ ] **Step 8: Commit**

```bash
git add services/idun_agent_standalone_ui/{app,components,lib}
git commit -m "feat(standalone-ui): chat UI with three layout variants (branded/minimal/inspector)"
```

**Phase 10 done.** Chat UI renders AG-UI events with three switchable layouts.

---

## Phase 11 — Admin UI

The admin area shares a single layout. Each page follows the same pattern: load resource via TanStack Query, edit with react-hook-form + zod, save via mutation, toast on success.

### Task 11.1: Admin layout + login

**Files:**
- Create: `services/idun_agent_standalone_ui/app/login/page.tsx`
- Create: `services/idun_agent_standalone_ui/app/admin/layout.tsx`
- Create: `services/idun_agent_standalone_ui/components/admin/Sidebar.tsx`
- Create: `services/idun_agent_standalone_ui/components/admin/AuthGuard.tsx`

- [ ] **Step 1: Write `AuthGuard.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/hooks/use-auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading, error } = useAuth();
  useEffect(() => {
    if (!isLoading && (error || !data?.authenticated)) {
      router.replace("/login/");
    }
  }, [data, error, isLoading, router]);
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!data?.authenticated) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: Write `Sidebar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const GROUPS = [
  { label: "Overview", items: [
    { href: "/admin", label: "Dashboard" },
    { href: "/traces", label: "Traces" },
    { href: "/logs", label: "Logs" },
  ]},
  { label: "Agent", items: [
    { href: "/admin/agent", label: "Configuration" },
    { href: "/admin/guardrails", label: "Guardrails" },
    { href: "/admin/memory", label: "Memory" },
    { href: "/admin/mcp", label: "MCP" },
    { href: "/admin/observability", label: "Observability" },
    { href: "/admin/prompts", label: "Prompts" },
    { href: "/admin/integrations", label: "Integrations" },
  ]},
  { label: "System", items: [
    { href: "/admin/settings", label: "Settings" },
  ]},
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-48 border-r border-[var(--border)] p-3 flex flex-col gap-1 text-sm">
      {GROUPS.map((g) => (
        <div key={g.label} className="mb-2">
          <div className="text-[10px] uppercase text-muted-foreground px-2 mb-1">{g.label}</div>
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "block px-2 py-1 rounded",
                pathname === it.href || pathname?.startsWith(it.href + "/")
                  ? "bg-[var(--muted)] text-[var(--fg)]"
                  : "text-muted-foreground hover:bg-[var(--muted)]"
              )}
            >
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 3: Write `app/admin/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { Sidebar } from "@/components/admin/Sidebar";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="grid grid-cols-[12rem_1fr] h-screen">
        <Sidebar />
        <main className="overflow-auto">{children}</main>
        <Toaster />
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 4: Write `app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <div className="grid place-items-center min-h-screen p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.login(password);
              router.replace("/admin/");
            } catch {
              toast.error("Invalid credentials");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label>Admin password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <Button type="submit" disabled={busy} className="w-full">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/{app,components}
git commit -m "feat(standalone-ui): admin layout + auth guard + login page"
```

### Task 11.2: Agent config page (template for all editors)

**Files:**
- Create: `services/idun_agent_standalone_ui/app/admin/page.tsx` (redirect to /admin/agent — MVP-1 Dashboard replaces this later)
- Create: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`
- Create: `services/idun_agent_standalone_ui/components/admin/SaveToolbar.tsx`
- Create: `services/idun_agent_standalone_ui/components/admin/YamlPreview.tsx`

- [ ] **Step 1: Write `SaveToolbar.tsx`**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SaveToolbar({ title, dirty, onRevert, onSave, busy }: {
  title: string;
  dirty: boolean;
  onRevert: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
      <h2 className="font-semibold">{title}</h2>
      {dirty && <Badge variant="secondary">● Unsaved</Badge>}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onRevert} disabled={!dirty || busy}>Revert</Button>
        <Button onClick={onSave} disabled={!dirty || busy}>{busy ? "Saving…" : "Save & reload"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `YamlPreview.tsx`**

```tsx
"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import yaml from "yaml";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export function YamlPreview({ value }: { value: unknown }) {
  const text = useMemo(() => yaml.stringify(value), [value]);
  return (
    <div className="border border-[var(--border)] rounded overflow-hidden">
      <Monaco
        language="yaml"
        value={text}
        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
        height="200px"
      />
    </div>
  );
}
```

Install yaml: `pnpm add yaml`.

- [ ] **Step 3: Write `app/admin/agent/page.tsx`**

```tsx
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlPreview } from "@/components/admin/YamlPreview";

const schema = z.object({
  name: z.string().min(1),
  framework: z.enum(["langgraph", "adk", "haystack"]),
  graph_definition: z.string().min(1),
  config: z.record(z.any()).default({}),
});

type FormValues = z.infer<typeof schema>;

export default function AgentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agent"], queryFn: api.getAgent });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: data });
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => { if (data) form.reset(data); }, [data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => api.putAgent(values),
    onSuccess: (resp: any) => {
      if (resp?.restart_required) {
        setRestartRequired(true);
        toast.warning("Restart required to apply this change.");
      } else {
        toast.success("Saved & reloaded");
      }
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
    onError: (e: any) => toast.error(e?.detail?.message ?? "Save failed"),
  });

  if (isLoading) return <div className="p-6">Loading…</div>;

  return (
    <>
      <SaveToolbar
        title="Agent configuration"
        dirty={form.formState.isDirty}
        busy={save.isPending}
        onRevert={() => form.reset(data)}
        onSave={form.handleSubmit((v) => save.mutate(v))}
      />
      {restartRequired && (
        <div className="m-4 rounded border border-amber-500/40 bg-amber-500/10 text-amber-600 px-3 py-2 text-sm">
          Structural change queued — restart the container to activate.
        </div>
      )}
      <form className="p-6 space-y-6 max-w-3xl">
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Identity</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input {...form.register("name")} /></div>
            <div>
              <Label>Framework</Label>
              <select {...form.register("framework")} className="w-full border border-[var(--border)] rounded px-3 py-2 bg-background text-sm">
                <option value="langgraph">LangGraph</option>
                <option value="adk">ADK</option>
                <option value="haystack">Haystack</option>
              </select>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Graph</h3>
          <div><Label>Definition path</Label><Input {...form.register("graph_definition")} placeholder="./agent.py:graph" /></div>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Advanced (YAML preview)</h3>
          <YamlPreview value={form.watch()} />
        </section>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Write `app/admin/page.tsx` (temporary landing; replaced by Dashboard shell in Phase 13)**

```tsx
import { redirect } from "next/navigation";
export default function AdminIndex() { redirect("/admin/agent/"); }
```

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui
git commit -m "feat(standalone-ui): agent config page with form + YAML preview + reload feedback"
```

### Task 11.3–11.8: Remaining admin editors (same pattern)

For each of `guardrails`, `memory`, `observability`, `mcp`, `prompts`, `integrations`, `settings`, create `app/admin/<resource>/page.tsx` following the `agent/page.tsx` template.

**Guardrails, memory, observability, theme/settings** — singleton pattern:
- `useQuery` on `api.get<Resource>`
- `useForm` with a Zod schema matching `{ config, enabled? }`
- `SaveToolbar` + `YamlPreview`
- `useMutation` to `api.put<Resource>`

**MCP, prompts, integrations** — collection pattern:
- `useQuery` returns an array
- Card grid using shadcn `Card`
- Add button opens a `Sheet` with the form for create
- Click a card opens the edit form (PATCH)
- Delete with confirmation `AlertDialog`

**Settings page** — theme editor + admin password + session TTL:
- Color pickers bound to `theme.colors.light.*` / `dark.*`
- Radius slider, font select, logo upload (base64, ≤ 256 KB)
- Layout radio: `branded | minimal | inspector`
- Preset dropdown that calls `form.reset(preset)`
- "Change password" section: current + new + confirm → `POST /admin/api/v1/auth/change-password` (add this endpoint as part of Phase 4 follow-up; MVP-1 shim can just update `AdminUserRow.password_hash` directly)

- [ ] **Step 1: Guardrails page** — single-file task; follow the agent template, bind to `{ config, enabled }`, use `YamlPreview` for the nested `guardrails` list.

- [ ] **Step 2: Memory page** — same template, form over `{ config }` with a `type` select (`memory | sqlite | postgres`) and conditional connection string field.

- [ ] **Step 3: Observability page** — sections per provider (Langfuse, Phoenix, GCP) each with an `enabled` switch + credentials fields.

- [ ] **Step 4: MCP page** — collection pattern. Card displays name + transport + enabled badge. `Sheet` form has transport selector (`stdio | http | sse`), command/args or URL, headers, `enabled` switch.

- [ ] **Step 5: Prompts page** — collection. List grouped by `prompt_key`, each with version badges. "New prompt" opens a Monaco-based editor for content with Jinja variable detection: `/\{\{\s*(\w+)\s*\}\}/g` → chip list.

- [ ] **Step 6: Integrations page** — collection. WhatsApp + Discord forms. Kind selector on create.

- [ ] **Step 7: Settings page** — theme editor (see description above), password change, session TTL input.

After each page, run:
```bash
cd services/idun_agent_standalone_ui && pnpm build
```
And commit with message `feat(standalone-ui): admin <resource> page`.

**Phase 11 done.** All admin editors functional.

---

## Phase 12 — Traces UI

### Task 12.1: Session list page

**Files:**
- Create: `services/idun_agent_standalone_ui/app/traces/page.tsx`
- Create: `services/idun_agent_standalone_ui/app/traces/layout.tsx`
- Create: `services/idun_agent_standalone_ui/components/traces/SessionTable.tsx`

- [ ] **Step 1: Write `app/traces/layout.tsx`** — identical to admin layout (sidebar + auth):

```tsx
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { Sidebar } from "@/components/admin/Sidebar";
import { Toaster } from "sonner";

export default function TracesLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="grid grid-cols-[12rem_1fr] h-screen">
        <Sidebar />
        <main className="overflow-auto">{children}</main>
        <Toaster />
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Write `SessionTable.tsx`**

```tsx
"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SessionTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["traces", "sessions"], queryFn: () => api.listSessions() });
  const del = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traces", "sessions"] }); toast.success("Deleted"); },
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!data?.items.length) return <div className="p-6 text-muted-foreground">No sessions yet.</div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-muted-foreground">
          <th className="p-3">Session</th>
          <th className="p-3">Title</th>
          <th className="p-3">Events</th>
          <th className="p-3">Last event</th>
          <th className="p-3"></th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((s: any) => (
          <tr key={s.id} className="border-b border-[var(--border)]">
            <td className="p-3 font-mono text-xs"><Link href={`/traces/${s.id}/`} className="underline">{s.id.slice(0, 12)}</Link></td>
            <td className="p-3">{s.title ?? "(untitled)"}</td>
            <td className="p-3">{s.message_count}</td>
            <td className="p-3">{new Date(s.last_event_at).toLocaleString()}</td>
            <td className="p-3 text-right">
              <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}>Delete</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Write `app/traces/page.tsx`**

```tsx
import { SessionTable } from "@/components/traces/SessionTable";

export default function TracesPage() {
  return (
    <>
      <header className="p-4 border-b border-[var(--border)]">
        <h2 className="font-semibold">Traces</h2>
      </header>
      <SessionTable />
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui
git commit -m "feat(standalone-ui): traces session list page"
```

### Task 12.2: Session detail page (timeline + inspector + waterfall toggle)

**Files:**
- Create: `services/idun_agent_standalone_ui/app/traces/[sessionId]/page.tsx`
- Create: `services/idun_agent_standalone_ui/components/traces/Timeline.tsx`
- Create: `services/idun_agent_standalone_ui/components/traces/Inspector.tsx`
- Create: `services/idun_agent_standalone_ui/components/traces/WaterfallPreview.tsx`

- [ ] **Step 1: Write `Inspector.tsx`**

```tsx
"use client";
export function Inspector({ event }: { event: any | null }) {
  if (!event) return <div className="p-3 text-xs text-muted-foreground">Click an event to inspect.</div>;
  return (
    <div className="p-3 text-xs">
      <div className="font-mono mb-2 uppercase text-muted-foreground">{event.event_type}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>run_id</dt><dd className="font-mono">{event.run_id}</dd>
        <dt>seq</dt><dd>{event.sequence}</dd>
        <dt>at</dt><dd>{new Date(event.created_at).toLocaleTimeString()}</dd>
      </dl>
      <pre className="mt-3 overflow-x-auto rounded bg-[var(--muted)] p-2 text-[10px]">
        {JSON.stringify(event.payload, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Write `Timeline.tsx`**

```tsx
"use client";
export function Timeline({ events, onSelect }: { events: any[]; onSelect: (e: any) => void }) {
  const byRun = events.reduce<Record<string, any[]>>((acc, e) => {
    (acc[e.run_id] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 p-4">
      {Object.entries(byRun).map(([rid, evs]) => (
        <div key={rid} className="border border-[var(--border)] rounded p-3">
          <div className="text-xs text-muted-foreground font-mono mb-2">run {rid}</div>
          <div className="flex flex-col gap-2">
            {evs.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelect(e)}
                className="text-left text-xs px-2 py-1 rounded hover:bg-[var(--muted)] flex gap-2"
              >
                <span className="font-mono text-muted-foreground w-32 truncate">{e.event_type}</span>
                <span className="flex-1 truncate opacity-80">{JSON.stringify(e.payload)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `WaterfallPreview.tsx` (preview shell, per §9 of spec)**

```tsx
import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
export function WaterfallPreview() {
  return (
    <div className="p-8 grid place-items-center h-full">
      <div className="max-w-md text-center space-y-3">
        <ComingSoonBadge variant="preview" />
        <h3 className="font-semibold">Waterfall view</h3>
        <p className="text-sm text-muted-foreground">
          LLM call-level timing, graph node spans, and model/cost attribution land in MVP-2.
        </p>
      </div>
    </div>
  );
}
```

(Depends on `ComingSoonBadge` — created in Phase 13 Task 13.1; add the `import` now, the component will exist when Phase 13 completes.)

- [ ] **Step 4: Write `app/traces/[sessionId]/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Timeline } from "@/components/traces/Timeline";
import { Inspector } from "@/components/traces/Inspector";
import { WaterfallPreview } from "@/components/traces/WaterfallPreview";

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [view, setView] = useState<"timeline" | "waterfall">("timeline");
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["traces", "session", sessionId, "events"],
    queryFn: () => api.getSessionEvents(sessionId),
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  return (
    <div className="grid grid-cols-[1fr_280px] h-screen">
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 p-3 border-b border-[var(--border)] text-xs">
          <button className={view === "timeline" ? "font-semibold" : "opacity-60"} onClick={() => setView("timeline")}>Timeline</button>
          <button className={view === "waterfall" ? "font-semibold" : "opacity-60"} onClick={() => setView("waterfall")}>Waterfall</button>
        </div>
        <div className="flex-1 overflow-auto">
          {view === "timeline"
            ? <Timeline events={data?.events ?? []} onSelect={setSelected} />
            : <WaterfallPreview />}
        </div>
      </div>
      <div className="border-l border-[var(--border)] overflow-auto">
        <Inspector event={selected} />
      </div>
    </div>
  );
}
```

Also install `yaml` if not already: `pnpm add yaml`.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui
git commit -m "feat(standalone-ui): traces session detail with timeline + inspector + waterfall preview"
```

**Phase 12 done.** Traces viewer functional.

---

## Phase 13 — Dashboard + Logs Shells

UI-only shells, labeled "coming soon" per §9 of spec.

### Task 13.1: `ComingSoonBadge` component

**Files:**
- Create: `services/idun_agent_standalone_ui/components/common/ComingSoonBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Badge } from "@/components/ui/badge";

export function ComingSoonBadge({ variant = "mocked" }: { variant?: "mocked" | "preview" }) {
  return (
    <Badge
      className="bg-amber-500/20 text-amber-600 border border-amber-500/30"
      variant="outline"
    >
      {variant === "mocked" ? "Coming soon — mocked data" : "Preview — available in MVP-2"}
    </Badge>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_standalone_ui/components/common
git commit -m "feat(standalone-ui): ComingSoonBadge component"
```

### Task 13.2: Dashboard shell (replaces `/admin` redirect)

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/page.tsx` (replace redirect)

- [ ] **Step 1: Write the shell**

```tsx
"use client";
import { Card } from "@/components/ui/card";
import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";

const KPIS = [
  { label: "Runs", value: "1,284", delta: "▲ 12%" },
  { label: "Avg latency", value: "1.7s", delta: "▼ +8%" },
  { label: "Tokens", value: "412K", delta: "≈ $2.14" },
  { label: "Error rate", value: "0.9%", delta: "12 errors · 7d" },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Dashboard</h2>
        <ComingSoonBadge variant="mocked" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs uppercase text-muted-foreground">{k.label}</div>
              <ComingSoonBadge variant="mocked" />
            </div>
            <div className="text-2xl font-semibold mt-2">{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.delta}</div>
          </Card>
        ))}
      </div>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Runs over time</div>
          <ComingSoonBadge variant="mocked" />
        </div>
        <div className="flex gap-1 items-end h-24">
          {[20,35,28,50,70,60,85,92,78,65,55,48,42,58,72,80,88,95,75,62,45,38,32,25].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-[var(--primary)]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Top tools</div>
          <ComingSoonBadge variant="mocked" />
        </div>
        <ul className="text-sm space-y-1">
          <li className="flex gap-2"><span className="font-mono flex-1">lookup_order</span><span className="text-muted-foreground">412</span></li>
          <li className="flex gap-2"><span className="font-mono flex-1">product_specs</span><span className="text-muted-foreground">301</span></li>
          <li className="flex gap-2"><span className="font-mono flex-1">send_tracking</span><span className="text-muted-foreground">198</span></li>
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/page.tsx
git commit -m "feat(standalone-ui): dashboard shell with ComingSoonBadge (mocked data)"
```

### Task 13.3: Logs shell page

**Files:**
- Create: `services/idun_agent_standalone_ui/app/logs/page.tsx`
- Create: `services/idun_agent_standalone_ui/app/logs/layout.tsx`

- [ ] **Step 1: Write layout (same shell as admin)**

```tsx
// app/logs/layout.tsx
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { Sidebar } from "@/components/admin/Sidebar";

export default function LogsLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="grid grid-cols-[12rem_1fr] h-screen">
        <Sidebar />
        <main className="overflow-auto">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Write the shell page**

```tsx
// app/logs/page.tsx
import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";

const FAKE = [
  ["11:04:12", "INFO", "agent.run", "RunStarted run_id=run_0001"],
  ["11:04:12", "DEBUG", "langgraph.node", "node=router → tool_call"],
  ["11:04:12", "INFO", "tools.lookup_order", "ok duration=182ms"],
  ["11:04:13", "INFO", "llm.openai", "completion model=gpt-4o tokens=812"],
  ["11:04:13", "INFO", "agent.run", "RunFinished total=1.7s"],
  ["11:04:47", "WARN", "guardrails.pii", "input contains possible email"],
  ["11:04:47", "ERROR", "mcp.time-server", "connection refused"],
];

export default function LogsPage() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 p-3 border-b border-[var(--border)]">
        <h2 className="font-semibold">Logs</h2>
        <ComingSoonBadge variant="mocked" />
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono">
        {FAKE.map(([ts, lvl, logger, msg], i) => (
          <div key={i} className="grid grid-cols-[90px_60px_140px_1fr] gap-3">
            <span className="text-muted-foreground">{ts}</span>
            <span className={lvl === "ERROR" ? "text-red-500" : lvl === "WARN" ? "text-amber-500" : "text-blue-500"}>{lvl}</span>
            <span className="text-purple-400">{logger}</span>
            <span>{msg}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/app/logs
git commit -m "feat(standalone-ui): logs shell page with ComingSoonBadge"
```

**Phase 13 done.** All planned UI surfaces rendered (some with mocked data clearly labeled).

---

## Phase 14 — Docker + Packaging

### Task 14.1: Make target to build + bundle UI into wheel

**Files:**
- Modify: repo root `Makefile`

- [ ] **Step 1: Add targets**

Append to `Makefile`:

```make
.PHONY: build-standalone-ui build-standalone-wheel build-standalone-all

build-standalone-ui:
	cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile && pnpm build
	rm -rf libs/idun_agent_standalone/src/idun_agent_standalone/static
	cp -R services/idun_agent_standalone_ui/out libs/idun_agent_standalone/src/idun_agent_standalone/static

build-standalone-wheel:
	uv build --package idun-agent-standalone -o dist/

build-standalone-all: build-standalone-ui build-standalone-wheel
```

- [ ] **Step 2: Run**

```bash
make build-standalone-ui
make build-standalone-wheel
```

Expected: `libs/idun_agent_standalone/src/idun_agent_standalone/static/index.html` exists; `dist/idun_agent_standalone-0.1.0-py3-none-any.whl` contains `idun_agent_standalone/static/index.html`:

```bash
unzip -l dist/idun_agent_standalone-0.1.0-py3-none-any.whl | grep static/index.html
```

Expected: path listed.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "build: make target to build standalone UI and bundle into wheel"
```

### Task 14.2: Base Dockerfile

**Files:**
- Create: `libs/idun_agent_standalone/docker/Dockerfile.base`
- Create: `libs/idun_agent_standalone/docker/.dockerignore`

- [ ] **Step 1: Write `Dockerfile.base`**

```dockerfile
# libs/idun_agent_standalone/docker/Dockerfile.base
# Multi-stage build: UI → wheel → runtime

# ---- UI stage ---------------------------------------------------------------
FROM node:20-slim AS ui
WORKDIR /app
COPY services/idun_agent_standalone_ui/package.json services/idun_agent_standalone_ui/pnpm-lock.yaml* ./services/idun_agent_standalone_ui/
RUN corepack enable pnpm
WORKDIR /app/services/idun_agent_standalone_ui
RUN pnpm install --frozen-lockfile
COPY services/idun_agent_standalone_ui ./
RUN pnpm build

# ---- Wheel stage ------------------------------------------------------------
FROM python:3.12-slim AS wheel
WORKDIR /build
RUN pip install --no-cache-dir uv
COPY libs/idun_agent_standalone ./libs/idun_agent_standalone
COPY libs/idun_agent_engine ./libs/idun_agent_engine
COPY libs/idun_agent_schema ./libs/idun_agent_schema
COPY pyproject.toml uv.lock ./
COPY --from=ui /app/services/idun_agent_standalone_ui/out \
     ./libs/idun_agent_standalone/src/idun_agent_standalone/static
RUN uv build --package idun-agent-standalone -o /dist

# ---- Runtime ----------------------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    IDUN_IN_CONTAINER=1 \
    IDUN_HOST=0.0.0.0 \
    IDUN_PORT=8000 \
    IDUN_CONFIG_PATH=/app/agent/config.yaml

RUN apt-get update && apt-get install -y --no-install-recommends \
        tini curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=wheel /dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

RUN mkdir -p /app/agent /app/data
VOLUME ["/app/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/admin/api/v1/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["idun-standalone", "serve"]
```

- [ ] **Step 2: Write `.dockerignore`** at repo root (to keep the build slim)

Append to existing `.dockerignore` or create:
```
.venv/
__pycache__/
**/node_modules/
.claude/
.superpowers/
docs/
services/idun_agent_web/
services/idun_agent_manager/
services/idun_agent_standalone_ui/node_modules/
services/idun_agent_standalone_ui/.next/
services/idun_agent_standalone_ui/out/
```

- [ ] **Step 3: Build locally and smoke test**

```bash
docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t idun-agent-standalone:dev .
docker run --rm -p 8000:8000 \
  -e IDUN_ADMIN_AUTH_MODE=none \
  idun-agent-standalone:dev &
sleep 8
curl -sf http://localhost:8000/admin/api/v1/health
docker kill $(docker ps -q --filter ancestor=idun-agent-standalone:dev)
```

Expected: `{"status":"ok"}`.

Note: the container will fail to boot unless `/app/agent/config.yaml` exists. For the smoke test, either mount a minimal config or set a different expected failure mode. A test config:

```bash
mkdir -p /tmp/agent && cat > /tmp/agent/config.yaml <<EOF
agent:
  name: smoke
  framework: langgraph
  graph_definition: idun_agent_standalone.testing:echo_graph
memory: {type: memory}
EOF
docker run --rm -d -p 8000:8000 \
  -v /tmp/agent:/app/agent \
  -e IDUN_ADMIN_AUTH_MODE=none \
  --name standalone-smoke \
  idun-agent-standalone:dev
sleep 10
curl -sf http://localhost:8000/admin/api/v1/health
docker stop standalone-smoke
```

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/docker .dockerignore
git commit -m "build(standalone): multi-stage Dockerfile.base producing runtime image"
```

### Task 14.3: Example extension Dockerfile + docker-compose + Cloud Run YAML

**Files:**
- Create: `libs/idun_agent_standalone/docker/Dockerfile.example`
- Create: `libs/idun_agent_standalone/docker-compose.example.yml`
- Create: `libs/idun_agent_standalone/docker/cloud-run.example.yaml`

- [ ] **Step 1: Example extension Dockerfile**

```dockerfile
# libs/idun_agent_standalone/docker/Dockerfile.example
#
# How users package their own agent on top of the standalone base image.
# Replace 0.1.0 with the pinned release tag in production.

FROM ghcr.io/idun-group/idun-agent-standalone:0.1.0

# Your agent code and config go here.
# The base image expects IDUN_CONFIG_PATH=/app/agent/config.yaml by default.
COPY my_agent/ /app/agent/

# Optional: bring your own .env file (not recommended — prefer platform env)
# COPY .env /app/agent/.env

# Override defaults via env vars at deploy time (--env in docker, Secret Manager in Cloud Run, etc.):
#   IDUN_ADMIN_AUTH_MODE=password
#   IDUN_ADMIN_PASSWORD_HASH=$2b$12$...
#   IDUN_SESSION_SECRET=<32+ chars>
#   DATABASE_URL=postgresql+asyncpg://user:pass@host/db
#   OPENAI_API_KEY=...
```

- [ ] **Step 2: docker-compose example**

```yaml
# libs/idun_agent_standalone/docker-compose.example.yml
# Multi-container deployment template — standalone + Postgres + one MCP sidecar.
version: "3.9"

services:
  standalone:
    image: ghcr.io/idun-group/idun-agent-standalone:0.1.0
    ports:
      - "8000:8000"
    environment:
      IDUN_ADMIN_AUTH_MODE: password
      IDUN_ADMIN_PASSWORD_HASH: ${IDUN_ADMIN_PASSWORD_HASH}
      IDUN_SESSION_SECRET: ${IDUN_SESSION_SECRET}
      DATABASE_URL: postgresql+asyncpg://idun:idun@postgres:5432/idun
      IDUN_CONFIG_PATH: /app/agent/config.yaml
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    volumes:
      - ./my_agent:/app/agent:ro
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: idun
      POSTGRES_PASSWORD: idun
      POSTGRES_DB: idun
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "idun"]
      interval: 5s
      retries: 10

  mcp-time:
    image: mcp/time
    # Standalone reaches this over http://mcp-time:9000 — configure in /admin/mcp

volumes:
  pgdata:
```

- [ ] **Step 3: Cloud Run YAML example**

```yaml
# libs/idun_agent_standalone/docker/cloud-run.example.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-agent
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containers:
        - image: gcr.io/my-project/my-agent:0.1.0   # built from Dockerfile.example
          ports:
            - containerPort: 8000
          env:
            - name: IDUN_ADMIN_AUTH_MODE
              value: password
            - name: IDUN_ADMIN_PASSWORD_HASH
              valueFrom:
                secretKeyRef:
                  name: idun-admin-hash
                  key: latest
            - name: IDUN_SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: idun-session-secret
                  key: latest
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: idun-db-url
                  key: latest
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: latest
          resources:
            limits:
              memory: 1Gi
              cpu: "1"
```

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/docker libs/idun_agent_standalone/docker-compose.example.yml
git commit -m "build(standalone): extension Dockerfile + docker-compose + Cloud Run examples"
```

### Task 14.4: GitHub Actions — publish wheel + image

**Files:**
- Create: `.github/workflows/standalone-release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/standalone-release.yml
name: Standalone release

on:
  push:
    tags:
      - "idun-agent-standalone-v*"
  workflow_dispatch:

permissions:
  contents: read
  packages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm", cache-dependency-path: "services/idun_agent_standalone_ui/pnpm-lock.yaml" }
      - run: pip install uv
      - run: make build-standalone-all
      - uses: actions/upload-artifact@v4
        with:
          name: wheel
          path: dist/*.whl

  image:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/idun-agent-standalone
          tags: |
            type=match,pattern=idun-agent-standalone-v(.*),group=1
            type=sha
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: libs/idun_agent_standalone/docker/Dockerfile.base
          push: true
          platforms: linux/amd64,linux/arm64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  pypi:
    runs-on: ubuntu-latest
    needs: build
    environment: pypi
    steps:
      - uses: actions/download-artifact@v4
        with: { name: wheel, path: dist }
      - uses: pypa/gh-action-pypi-publish@release/v1
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/standalone-release.yml
git commit -m "ci: release workflow publishes wheel to PyPI + image to GHCR on tag"
```

**Phase 14 done.** Single Docker artifact builds reliably; extension + multi-container templates documented; CI/CD releases wheel + image on tag.

---

## Phase 15 — E2E Tests + Documentation

### Task 15.1: Playwright setup

**Files:**
- Create: `services/idun_agent_standalone_ui/playwright.config.ts`
- Create: `services/idun_agent_standalone_ui/e2e/global-setup.ts`
- Create: `services/idun_agent_standalone_ui/e2e/fixtures.ts`

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm -C services/idun_agent_standalone_ui build && ./e2e/boot-standalone.sh",
        url: "http://localhost:8000/admin/api/v1/health",
        timeout: 60_000,
        reuseExistingServer: false,
      },
});
```

- [ ] **Step 2: Write `e2e/boot-standalone.sh`** (launches the backend with the built UI)

```bash
#!/usr/bin/env bash
set -euo pipefail
export IDUN_ADMIN_AUTH_MODE="none"
export DATABASE_URL="sqlite+aiosqlite:///$PWD/e2e.db"
export IDUN_UI_DIR="$PWD/services/idun_agent_standalone_ui/out"
export IDUN_CONFIG_PATH="$PWD/services/idun_agent_standalone_ui/e2e/config.yaml"

# start server in background, write pid for teardown
uv run idun-standalone db migrate
uv run idun-standalone import "$IDUN_CONFIG_PATH"
uv run idun-standalone serve --port 8000 &
echo $! > /tmp/standalone-e2e.pid
```

Make it executable: `chmod +x services/idun_agent_standalone_ui/e2e/boot-standalone.sh`.

- [ ] **Step 3: Write `e2e/config.yaml`**

```yaml
agent:
  name: e2e
  framework: langgraph
  graph_definition: idun_agent_standalone.testing:echo_graph
memory: {type: memory}
theme:
  appName: E2E
  greeting: E2E is go.
  starterPrompts: ["Say hi"]
  layout: branded
```

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/{playwright.config.ts,e2e}
git commit -m "test(standalone-ui): Playwright bootstrap scaffolding"
```

### Task 15.2: Core E2E scenarios

**Files:**
- Create: `services/idun_agent_standalone_ui/e2e/chat.spec.ts`
- Create: `services/idun_agent_standalone_ui/e2e/admin-edit-reload.spec.ts`
- Create: `services/idun_agent_standalone_ui/e2e/traces.spec.ts`

- [ ] **Step 1: Chat scenario**

```ts
// e2e/chat.spec.ts
import { test, expect } from "@playwright/test";

test("chat: send a message and see an echo response", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("E2E is go.")).toBeVisible();
  await page.getByRole("textbox").fill("hello");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText(/echo: hello/)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 2: Admin edit → reload scenario**

```ts
// e2e/admin-edit-reload.spec.ts
import { test, expect } from "@playwright/test";

test("admin: edit agent name, reload succeeds", async ({ page }) => {
  await page.goto("/admin/agent/");
  const name = page.getByLabel("Name");
  await expect(name).toHaveValue("e2e");
  await name.fill("e2e-renamed");
  await page.getByRole("button", { name: /save & reload/i }).click();
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: Traces scenario**

```ts
// e2e/traces.spec.ts
import { test, expect } from "@playwright/test";

test("trace appears after chat turn", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("trace me");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText(/echo: trace me/)).toBeVisible({ timeout: 15_000 });

  await page.goto("/traces/");
  await expect(page.getByText(/session/i)).toBeVisible();
  await page.locator("table tbody tr").first().click();
  await expect(page.getByText(/run_/)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 4: Run**

```bash
cd services/idun_agent_standalone_ui && pnpm test:e2e
```

Expected: 3 passed.

- [ ] **Step 5: Wire into CI**

Add a job to `.github/workflows/standalone-release.yml` (or a new `standalone-ci.yml`) that runs Playwright on pull requests:

```yaml
# .github/workflows/standalone-ci.yml
name: Standalone CI
on:
  pull_request:
    paths:
      - "libs/idun_agent_standalone/**"
      - "services/idun_agent_standalone_ui/**"
      - "libs/idun_agent_engine/**"
      - "libs/idun_agent_schema/**"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm", cache-dependency-path: "services/idun_agent_standalone_ui/pnpm-lock.yaml" }
      - run: pip install uv
      - run: uv sync --all-groups
      - run: uv run pytest libs/idun_agent_standalone libs/idun_agent_engine -v
      - run: cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile && pnpm exec playwright install --with-deps chromium && pnpm test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e .github/workflows/standalone-ci.yml
git commit -m "test(standalone): Playwright E2E for chat + admin reload + traces; wire into CI"
```

### Task 15.3: Documentation — Mintlify

**Files:**
- Create: `docs/standalone/overview.mdx`
- Create: `docs/standalone/quickstart.mdx`
- Create: `docs/standalone/cloud-run.mdx`
- Create: `docs/standalone/docker-compose.mdx`
- Create: `docs/standalone/customizing-ui.mdx`
- Modify: `docs/docs.json` — add a "Standalone" group

- [ ] **Step 1: Overview**

```mdx
// docs/standalone/overview.mdx
---
title: Overview
description: A self-sufficient single-agent deployment with embedded chat UI, admin panel, and traces viewer.
---

**Idun Agent Standalone** bundles one agent into a single process — chat UI, admin panel, traces viewer, and a local database — ready to deploy on Cloud Run, a VM, or your laptop.

## When to use it

- You want to ship ONE agent to production quickly and don't need the governance hub.
- You want to iterate on an agent locally with the full Idun stack, not just the engine SDK.
- You want a branded chat UI without writing a frontend.

## When NOT to use it

- You manage multiple agents and need workspaces / RBAC → use the [governance hub](/manager/overview).
- You need full external observability (Langfuse/Phoenix/GCP) as your primary tool → stay on the engine SDK.
```

- [ ] **Step 2: Quickstart**

```mdx
// docs/standalone/quickstart.mdx
---
title: Quickstart
description: Run your first agent in under 5 minutes.
---

## Install

```bash
pip install idun-agent-standalone
```

## Scaffold

```bash
idun-standalone init my-agent
cd my-agent
```

This creates `config.yaml` and `agent.py`.

## Run

```bash
idun-standalone serve
# Chat: http://localhost:8000/
# Admin: http://localhost:8000/admin/
```

By default, auth is `none` on localhost. When running inside Docker the default is `password`.
```

- [ ] **Step 3: Cloud Run**

```mdx
// docs/standalone/cloud-run.mdx
---
title: Deploy to Cloud Run
---

Single-container, stateless (external Postgres). Cloud Run scales down to zero; `min-instances=1` eliminates cold-start latency.

1. Build and push:
   ```bash
   docker build -t gcr.io/PROJECT/my-agent:0.1 -f Dockerfile .
   docker push gcr.io/PROJECT/my-agent:0.1
   ```
2. Create a Cloud SQL (Postgres) instance and a Secret Manager secret for `DATABASE_URL`.
3. Deploy using the example:
   ```bash
   gcloud run services replace cloud-run.yaml --region europe-west1
   ```

See `libs/idun_agent_standalone/docker/cloud-run.example.yaml` for a complete template.
```

- [ ] **Step 4: docker-compose, Customizing UI** — similar short pages; pull text from `libs/idun_agent_standalone/docker-compose.example.yml` and explain `IDUN_UI_DIR` override.

- [ ] **Step 5: Update `docs/docs.json`**

Add a new group:
```json
{ "group": "Standalone", "pages": [
  "standalone/overview",
  "standalone/quickstart",
  "standalone/cloud-run",
  "standalone/docker-compose",
  "standalone/customizing-ui"
]}
```

- [ ] **Step 6: Commit**

```bash
git add docs/standalone docs/docs.json
git commit -m "docs(standalone): overview + quickstart + Cloud Run + docker-compose + custom UI"
```

### Task 15.4: Upstream CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` at repo root

- [ ] **Step 1: Add a Standalone section**

Append to the "Repository Structure" and "Per-Service Documentation" sections:

```markdown
- `libs/idun_agent_standalone/` — Python package: self-sufficient single-agent runtime
- `services/idun_agent_standalone_ui/` — Next.js UI bundled into the standalone wheel
```

And:
```markdown
- `libs/idun_agent_standalone/CLAUDE.md` — Standalone runtime: admin REST, DB, traces capture, reload orchestration, auth
- `services/idun_agent_standalone_ui/CLAUDE.md` — Standalone UI: Next.js app, theme system, admin editors, traces viewer
```

- [ ] **Step 2: Create the two referenced CLAUDE.md files**

Write brief (300–500 word) files following the pattern of `libs/idun_agent_engine/CLAUDE.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md libs/idun_agent_standalone/CLAUDE.md services/idun_agent_standalone_ui/CLAUDE.md
git commit -m "docs: cross-reference standalone package/service in repo CLAUDE.md"
```

**Phase 15 done.** E2E coverage; docs live.

---

## Self-Review Checklist

Before considering this plan ready to execute:

1. **Spec coverage:** every section of `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md` maps to at least one task:
   - §1 Repo layout → Tasks 1.1, 14.*, 15.*
   - §2 Engine hooks → Tasks 0.1–0.5
   - §3 Standalone package → Tasks 1.*, 2.*, 3.*, 4.*, 5.*, 6.*, 7.*, 8.*
   - §4 UI → Phases 9–13
   - §5 Data flow → covered by integration tests in Phases 6, 7, 8
   - §6 Auth ladder → Phase 4 + Task 15.2 (none mode exercised), password-mode verified by Task 4.2 test
   - §7 Error handling + testing pyramid → Task 5.4 + unit tests across phases + Task 15.*
   - §8 Out-of-scope → enforced by `ComingSoonBadge` (Task 13.1) and deferred features not having tasks
   - §9 Coming-soon labeling rule → Tasks 13.1, 13.2, 13.3, Waterfall in Task 12.2

2. **Placeholders:** No task says "TBD", "similar to above", "add appropriate error handling". Each task includes complete code, commands, and expected output.

3. **Type consistency:** `EngineConfig`, `RunContext`, `BatchedTraceWriter`, `DatabaseTraceSink`, `make_observer`, `ReloadOutcome` — all referenced with the same shape they were defined with.

4. **Order:** Phase 0 is independent; Phase 1 needs nothing; Phase 2 needs Phase 1; Phase 3 needs Phase 2; Phase 4 needs Phase 1; Phase 5 needs Phase 4 + Phase 2; Phase 6 needs Phases 0, 2, 3, 5; Phase 7 needs Phases 0, 2, 6; Phase 8 needs Phase 2; Phases 9–13 need Phases 2, 5, 6, 7, 8; Phase 14 needs Phases 1–13; Phase 15 needs everything.

5. **Commits:** Every task ends with `git commit`; no uncommitted trailing state.

6. **Testing:** Every task that writes code writes a test first (where applicable — Docker/build tasks verify via `docker build` + `curl`; UI tasks verify via `pnpm build` typecheck and E2E in Phase 15).

## Done Definition

The MVP is done when:
- All phases committed, `make ci` passes.
- `make build-standalone-all` produces a working wheel and Docker image.
- `pnpm test:e2e` passes all three core scenarios.
- `docs/standalone/` published via Mintlify.
- A tagged release (`idun-agent-standalone-v0.1.0`) publishes wheel to PyPI + image to GHCR via `standalone-release.yml`.

---

**Plan complete.**
