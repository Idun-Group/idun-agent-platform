# Onboarding HTTP API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sub-project B from `2026-04-29-onboarding-http-api-design.md`: three HTTP endpoints under `/admin/api/v1/onboarding/` that scan the user's project, materialize an agent from a detection, or scaffold a starter project — all wired to the existing reload pipeline.

**Architecture:** Three thin endpoints in `routers/onboarding.py` delegating to a stateless `services/onboarding.py` (state classification, EngineConfig assembly from a detection) and a pure-IO `services/scaffold.py` (template strings + atomic writes). Materialize endpoints use the same `commit_with_reload` pipeline as `agent.py`/`memory.py`, returning `StandaloneMutationResponse[StandaloneAgentRead]`.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.x async, Pydantic 2.11+, pytest-asyncio, httpx ASGITransport.

**Branch:** `feat/onboarding-scanner` — extending the same branch that PR #538 lives on. Additive only.

---

## Files at a glance

| Path | Action | Responsibility |
|---|---|---|
| `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py` | Modify | Add `OnboardingState`, `ScanResponse`, `CreateFromDetectionBody`, `CreateStarterBody` |
| `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py` | Modify | Re-export the new classes |
| `libs/idun_agent_schema/tests/standalone/test_onboarding.py` | Modify | Add tests for the new wire models |
| `libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py` | Create | Template strings + atomic 5-file writer + `ScaffoldConflictError` |
| `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py` | Create | Unit tests for the scaffolder |
| `libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py` | Create | `classify_state`, EngineConfig builder, materialize functions |
| `libs/idun_agent_standalone/tests/unit/services/test_onboarding.py` | Create | Unit tests for the service |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py` | Create | 3 endpoints + error translation |
| `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` | Modify | Wire the new router |
| `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py` | Create | Integration tests for all 3 endpoints |

---

## Pattern reminders for implementers

When implementing, lean on these existing patterns (not abstractions to invent):

- **camelCase schemas:** `_CamelModel` from `idun_agent_schema.standalone._base`. Pydantic `populate_by_name=True` is already configured — accepts both snake_case and camelCase on input.
- **Mutation envelope:** `StandaloneMutationResponse[StandaloneAgentRead]` with `data` + `reload: StandaloneReloadResult`.
- **Reload pipeline:** Acquire `reload_service._reload_mutex`, stage the row, `await session.flush()`, then `result = await commit_with_reload(session, reload_callable=reload_callable)`. The pipeline owns commit/rollback.
- **Error envelope:** Raise `AdminAPIError(status_code=..., error=StandaloneAdminError(code=StandaloneErrorCode.CONFLICT, message=...))`. The exception handler renders the wire shape.
- **DI:** `SessionDep`, `ReloadCallableDep` from `api/v1/deps.py`. `Depends(require_auth)` is wired at `app.include_router(...)` level — don't re-add per-endpoint.
- **Engine config keys:** LangGraph uses `agent.config.graph_definition`. ADK uses `agent.config.agent`. Framework name on the wire: `"LANGGRAPH"` / `"ADK"` (uppercase strings, matching `AgentFramework` enum values).
- **Scanner output:** Each `DetectedAgent` already has `framework`, `file_path`, `variable_name`, `inferred_name`, `confidence`, `source`. Re-scan callers compare on `(framework, file_path, variable_name)` only.
- **Integration test layout:** Each test file builds its own minimal `FastAPI()` with the routers it needs (see `test_memory_flow.py:admin_app`). Reuses `async_session`, `stub_reload_callable` fixtures from `conftest.py`. Use `monkeypatch.chdir(tmp_path)` to isolate scan root.

---

## Task 1: Schema additions for the wizard wire format

**Files:**
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`
- Test: `libs/idun_agent_schema/tests/standalone/test_onboarding.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_schema/tests/standalone/test_onboarding.py`:

```python
from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    DetectedAgent,
    ScanResponse,
    ScanResult,
)


def test_scan_response_camel_case_serialization() -> None:
    response = ScanResponse(
        state="EMPTY",
        scan_result=ScanResult(
            root="/tmp/foo",
            detected=[],
            has_python_files=False,
            has_idun_config=False,
            scan_duration_ms=12,
        ),
        current_agent=None,
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["state"] == "EMPTY"
    assert dumped["scanResult"]["hasPythonFiles"] is False
    assert dumped["currentAgent"] is None


def test_scan_response_already_configured_carries_current_agent() -> None:
    """When state == ALREADY_CONFIGURED the UI needs the current agent payload."""
    response = ScanResponse.model_validate(
        {
            "state": "ALREADY_CONFIGURED",
            "scanResult": {
                "root": "/tmp/foo",
                "detected": [],
                "hasPythonFiles": True,
                "hasIdunConfig": False,
                "scanDurationMs": 0,
            },
            "currentAgent": None,
        }
    )
    assert response.state == "ALREADY_CONFIGURED"


def test_create_from_detection_body_accepts_camel_case() -> None:
    body = CreateFromDetectionBody.model_validate(
        {
            "framework": "LANGGRAPH",
            "filePath": "agent.py",
            "variableName": "graph",
        }
    )
    assert body.file_path == "agent.py"
    assert body.variable_name == "graph"


def test_create_from_detection_body_rejects_unknown_framework() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateFromDetectionBody(
            framework="HAYSTACK",  # type: ignore[arg-type]
            file_path="agent.py",
            variable_name="graph",
        )


def test_create_starter_body_default_name_is_none() -> None:
    body = CreateStarterBody(framework="LANGGRAPH")
    assert body.name is None


def test_create_starter_body_rejects_empty_name() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateStarterBody(framework="LANGGRAPH", name="")


def test_create_starter_body_rejects_overlong_name() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateStarterBody(framework="LANGGRAPH", name="x" * 81)
```

- [ ] **Step 2: Run tests — they must fail**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_onboarding.py -v
```

Expected: ImportError or AttributeError on `ScanResponse` / `CreateFromDetectionBody` / `CreateStarterBody`.

- [ ] **Step 3: Add the schema classes**

Append to `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py`:

```python
# Add to imports at the top of the file (alongside existing imports):
from pydantic import Field

from .agent import StandaloneAgentRead


# Append after the existing ScanResult class:

OnboardingState = Literal[
    "EMPTY",
    "NO_SUPPORTED",
    "ONE_DETECTED",
    "MANY_DETECTED",
    "ALREADY_CONFIGURED",
]


class ScanResponse(_CamelModel):
    """Response for ``POST /admin/api/v1/onboarding/scan``.

    The five-state classification is computed server-side from the
    scan result plus the agent row's existence. ``current_agent`` is
    only populated when ``state == "ALREADY_CONFIGURED"``.
    """

    state: OnboardingState
    scan_result: ScanResult
    current_agent: StandaloneAgentRead | None = None


class CreateFromDetectionBody(_CamelModel):
    """Body for ``POST /admin/api/v1/onboarding/create-from-detection``.

    The triple ``(framework, file_path, variable_name)`` is the lookup
    key for re-validation against a fresh scan inside the handler.
    ``inferred_name`` is intentionally not on the wire — the server
    computes it from the fresh scan, not from the body.
    """

    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str
    variable_name: str


class CreateStarterBody(_CamelModel):
    """Body for ``POST /admin/api/v1/onboarding/create-starter``.

    ``name`` is optional. When omitted the server uses
    ``"Starter Agent"``. Empty string is rejected.
    """

    framework: Literal["LANGGRAPH", "ADK"]
    name: str | None = Field(default=None, min_length=1, max_length=80)
```

- [ ] **Step 4: Add re-exports**

Modify `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`:

Replace the existing `onboarding` import block:

```python
from .onboarding import (  # noqa: F401
    DetectedAgent,
    ScanResult,
)
```

with:

```python
from .onboarding import (  # noqa: F401
    CreateFromDetectionBody,
    CreateStarterBody,
    DetectedAgent,
    OnboardingState,
    ScanResponse,
    ScanResult,
)
```

- [ ] **Step 5: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_onboarding.py -v
```

Expected: 7+ tests pass (3 pre-existing from sub-project A + 7 new).

- [ ] **Step 6: Lint + commit**

```bash
uv run ruff check libs/idun_agent_schema/
uv run black --check libs/idun_agent_schema/
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py \
        libs/idun_agent_schema/tests/standalone/test_onboarding.py
git commit -m "feat(schema): wire models for onboarding HTTP API"
```

---

## Task 2: Scaffolder — LangGraph templates + happy path

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`:

```python
"""Unit tests for the starter-project scaffolder."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from idun_agent_standalone.services import scaffold


def test_create_starter_langgraph_writes_five_files(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")

    expected_names = {
        "agent.py",
        "requirements.txt",
        ".env.example",
        "README.md",
        ".gitignore",
    }
    assert {p.name for p in written} == expected_names
    for path in written:
        assert path.exists()
        assert path.is_file()


def test_langgraph_agent_py_is_syntactically_valid(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    source = (tmp_path / "agent.py").read_text()
    # ast.parse raises SyntaxError on invalid source
    ast.parse(source)
    # Sanity: the variable our scanner expects is present.
    assert "graph = " in source


def test_langgraph_requirements_lists_idun_and_langgraph(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    contents = (tmp_path / "requirements.txt").read_text()
    assert "idun-agent-standalone" in contents
    assert "langgraph" in contents


def test_langgraph_env_example_carries_openai_key(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    assert "OPENAI_API_KEY" in (tmp_path / ".env.example").read_text()


def test_gitignore_covers_env_and_caches(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    contents = (tmp_path / ".gitignore").read_text()
    for entry in (".env", "__pycache__/", ".venv/"):
        assert entry in contents
```

- [ ] **Step 2: Run tests — must fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scaffold.py -v
```

Expected: ImportError on `scaffold` module.

- [ ] **Step 3: Implement the LangGraph scaffolder**

Create `libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py`:

```python
"""Starter project scaffolder.

Pure-IO module: emits a fixed set of files into a target directory.
No DB, no FastAPI, no event loop. Imported by the onboarding HTTP
endpoint and (later) by sub-project D's ``idun init`` CLI.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Literal

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)


class ScaffoldConflictError(Exception):
    """Raised when one or more target files already exist.

    Holds ``paths`` so the router can echo them back to the UI for a
    human-readable conflict message. The scaffolder writes nothing
    when it raises this, so the user can resolve manually and retry.
    """

    def __init__(self, paths: list[Path]) -> None:
        self.paths = paths
        super().__init__(f"Scaffold conflict: {[str(p) for p in paths]}")


_LANGGRAPH_AGENT_PY: Final[str] = '''\
"""Minimal LangGraph hello-world agent."""

from typing import TypedDict

from langgraph.graph import END, StateGraph


class State(TypedDict):
    message: str


def echo(state: State) -> State:
    return {"message": f"You said: {state['message']}"}


_builder = StateGraph(State)
_builder.add_node("echo", echo)
_builder.set_entry_point("echo")
_builder.add_edge("echo", END)
graph = _builder.compile()
'''


_LANGGRAPH_REQUIREMENTS: Final[str] = """\
idun-agent-standalone
langgraph>=0.2.0
langchain-core>=0.3.0
langchain-openai>=0.2.0
"""


_LANGGRAPH_ENV_EXAMPLE: Final[str] = "OPENAI_API_KEY=\n"


_README: Final[str] = """\
# My Idun Agent

Quick start:

1. Copy `.env.example` to `.env` and fill in your API key.
2. `pip install -r requirements.txt`
3. `idun standalone`

Edit `agent.py` to customize the agent.
"""


_GITIGNORE: Final[str] = """\
.env
__pycache__/
*.pyc
.venv/
.idun/
"""


def _build_file_map(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> dict[Path, str]:
    if framework == "LANGGRAPH":
        agent_py = _LANGGRAPH_AGENT_PY
        requirements = _LANGGRAPH_REQUIREMENTS
        env_example = _LANGGRAPH_ENV_EXAMPLE
    else:
        # ADK templates land in Task 3.
        raise NotImplementedError(f"Framework not yet supported: {framework}")
    return {
        root / "agent.py": agent_py,
        root / "requirements.txt": requirements,
        root / ".env.example": env_example,
        root / "README.md": _README,
        root / ".gitignore": _GITIGNORE,
    }


def create_starter_project(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> list[Path]:
    """Atomically write the 5-file starter into ``root``.

    Either all files land or none do. On any mid-write IO failure we
    remove anything we managed to create so the user's working
    directory is untouched.
    """
    files = _build_file_map(root, framework)
    conflicts = [p for p in files if p.exists()]
    if conflicts:
        logger.info("scaffold.conflict count=%d", len(conflicts))
        raise ScaffoldConflictError(conflicts)

    written: list[Path] = []
    try:
        for path, content in files.items():
            tmp = path.with_suffix(path.suffix + ".idun-tmp")
            tmp.write_text(content)
            tmp.replace(path)
            written.append(path)
    except Exception:
        for p in written:
            p.unlink(missing_ok=True)
        raise

    logger.info("scaffold.written framework=%s count=%d", framework, len(written))
    return written
```

- [ ] **Step 4: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scaffold.py -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py \
        libs/idun_agent_standalone/tests/unit/services/test_scaffold.py
git commit -m "feat(standalone): scaffold service — LangGraph starter templates"
```

---

## Task 3: Scaffolder — ADK templates

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`

- [ ] **Step 1: Append failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`:

```python
def test_create_starter_adk_writes_five_files(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="ADK")
    assert {p.name for p in written} == {
        "agent.py",
        "requirements.txt",
        ".env.example",
        "README.md",
        ".gitignore",
    }


def test_adk_agent_py_is_syntactically_valid(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    source = (tmp_path / "agent.py").read_text()
    ast.parse(source)
    # The scanner expects an `agent` variable bound to an ADK Agent.
    assert "agent = " in source
    assert "Agent(" in source


def test_adk_requirements_lists_idun_and_adk(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    contents = (tmp_path / "requirements.txt").read_text()
    assert "idun-agent-standalone" in contents
    assert "google-adk" in contents


def test_adk_env_example_carries_google_key(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    assert "GOOGLE_API_KEY" in (tmp_path / ".env.example").read_text()
```

- [ ] **Step 2: Run new tests — must fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scaffold.py -v -k adk
```

Expected: 4 ADK tests fail with `NotImplementedError`.

- [ ] **Step 3: Add ADK templates**

Modify `libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py`:

Add these constants below the existing LangGraph constants:

```python
_ADK_AGENT_PY: Final[str] = '''\
"""Minimal Google ADK hello-world agent."""

from google.adk.agents import Agent

agent = Agent(
    name="starter",
    model="gemini-2.0-flash",
    description="A minimal starter agent.",
    instruction="You are a helpful assistant. Respond concisely.",
)
'''


_ADK_REQUIREMENTS: Final[str] = """\
idun-agent-standalone
google-adk>=0.1.0
"""


_ADK_ENV_EXAMPLE: Final[str] = "GOOGLE_API_KEY=\n"
```

Replace the body of `_build_file_map` to dispatch on framework:

```python
def _build_file_map(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> dict[Path, str]:
    if framework == "LANGGRAPH":
        agent_py = _LANGGRAPH_AGENT_PY
        requirements = _LANGGRAPH_REQUIREMENTS
        env_example = _LANGGRAPH_ENV_EXAMPLE
    elif framework == "ADK":
        agent_py = _ADK_AGENT_PY
        requirements = _ADK_REQUIREMENTS
        env_example = _ADK_ENV_EXAMPLE
    else:  # pragma: no cover — Literal exhausts at type-check time
        raise ValueError(f"Unknown framework: {framework}")
    return {
        root / "agent.py": agent_py,
        root / "requirements.txt": requirements,
        root / ".env.example": env_example,
        root / "README.md": _README,
        root / ".gitignore": _GITIGNORE,
    }
```

- [ ] **Step 4: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scaffold.py -v
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scaffold.py \
        libs/idun_agent_standalone/tests/unit/services/test_scaffold.py
git commit -m "feat(standalone): scaffold service — ADK starter templates"
```

---

## Task 4: Scaffolder — atomicity + cleanup

**Files:**
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`

The scaffolder code already implements conflict-check and cleanup (Task 2). This task adds the tests that pin those behaviors so they don't regress.

- [ ] **Step 1: Append failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scaffold.py`:

```python
def test_conflict_pre_check_raises_with_paths(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text("# pre-existing\n")
    (tmp_path / ".gitignore").write_text("# pre-existing\n")
    with pytest.raises(scaffold.ScaffoldConflictError) as exc_info:
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    conflicts = {p.name for p in exc_info.value.paths}
    assert conflicts == {"agent.py", ".gitignore"}


def test_conflict_writes_zero_files(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text("# pre-existing\n")
    pre_count = len(list(tmp_path.iterdir()))
    with pytest.raises(scaffold.ScaffoldConflictError):
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    assert len(list(tmp_path.iterdir())) == pre_count


def test_mid_write_failure_cleans_up_partial_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If write_text raises midway through, already-written files get unlinked."""
    real_write_text = Path.write_text
    call_count = {"n": 0}

    def flaky_write_text(self: Path, content: str, *args: object, **kwargs: object) -> int:
        call_count["n"] += 1
        # Fail on the 3rd file written (any in-progress write triggers cleanup).
        if call_count["n"] == 3:
            raise OSError("simulated disk full")
        return real_write_text(self, content, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", flaky_write_text)

    with pytest.raises(OSError, match="simulated disk full"):
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")

    # Cleanup loop only removes files we successfully renamed before the failure.
    leftover = {p.name for p in tmp_path.iterdir() if not p.name.endswith(".idun-tmp")}
    assert leftover == set(), f"unexpected leftover files: {leftover}"


def test_returned_paths_resolve_inside_root(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    for path in written:
        assert path.parent == tmp_path
```

- [ ] **Step 2: Run tests — verify all pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scaffold.py -v
```

Expected: 13 tests pass. (Conflict and cleanup behavior already implemented in Task 2 — these tests validate the contract.)

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_standalone/tests/unit/services/test_scaffold.py
git commit -m "test(standalone): pin scaffold atomicity and cleanup contracts"
```

---

## Task 5: Onboarding service — state classification + EngineConfig builder

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_onboarding.py`

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_standalone/tests/unit/services/test_onboarding.py`:

```python
"""Unit tests for the onboarding service helpers."""

from __future__ import annotations

import pytest
from idun_agent_schema.standalone import DetectedAgent, ScanResult
from idun_agent_standalone.services import onboarding


def _scan_result(
    *,
    detected: list[DetectedAgent] | None = None,
    has_python_files: bool = False,
    has_idun_config: bool = False,
) -> ScanResult:
    return ScanResult(
        root="/tmp",
        detected=detected or [],
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=0,
    )


def _det(framework: str = "LANGGRAPH", *, name: str = "Agent") -> DetectedAgent:
    return DetectedAgent(
        framework=framework,  # type: ignore[arg-type]
        file_path="agent.py",
        variable_name="graph" if framework == "LANGGRAPH" else "agent",
        inferred_name=name,
        confidence="HIGH",
        source="source",
    )


def test_classify_state_already_configured_short_circuits() -> None:
    """Agent row trumps everything else."""
    state = onboarding.classify_state(
        _scan_result(detected=[_det()]), agent_row_exists=True
    )
    assert state == "ALREADY_CONFIGURED"


def test_classify_state_empty() -> None:
    state = onboarding.classify_state(_scan_result(), agent_row_exists=False)
    assert state == "EMPTY"


def test_classify_state_no_supported() -> None:
    state = onboarding.classify_state(
        _scan_result(has_python_files=True), agent_row_exists=False
    )
    assert state == "NO_SUPPORTED"


def test_classify_state_one_detected() -> None:
    state = onboarding.classify_state(
        _scan_result(detected=[_det()], has_python_files=True),
        agent_row_exists=False,
    )
    assert state == "ONE_DETECTED"


def test_classify_state_many_detected() -> None:
    state = onboarding.classify_state(
        _scan_result(
            detected=[_det(name="A"), _det(name="B")],
            has_python_files=True,
        ),
        agent_row_exists=False,
    )
    assert state == "MANY_DETECTED"


def test_engine_config_for_langgraph_detection() -> None:
    detection = _det(framework="LANGGRAPH", name="My Agent")
    config_dict = onboarding.engine_config_dict_from_detection(detection)
    assert config_dict["agent"]["type"] == "LANGGRAPH"
    assert config_dict["agent"]["config"]["graph_definition"] == "agent.py:graph"
    # Names that hit the engine config must be slugified — engine ADK validator
    # derives app_name from name, and arbitrary unicode breaks downstream.
    assert config_dict["agent"]["config"]["name"]


def test_engine_config_for_adk_detection() -> None:
    detection = _det(framework="ADK", name="My Agent")
    config_dict = onboarding.engine_config_dict_from_detection(detection)
    assert config_dict["agent"]["type"] == "ADK"
    assert config_dict["agent"]["config"]["agent"] == "agent.py:agent"
    assert config_dict["agent"]["config"]["name"]


def test_engine_config_for_starter_langgraph() -> None:
    config_dict = onboarding.engine_config_dict_for_starter(
        framework="LANGGRAPH", name="Starter Agent"
    )
    assert config_dict["agent"]["type"] == "LANGGRAPH"
    assert config_dict["agent"]["config"]["graph_definition"] == "agent.py:graph"


def test_engine_config_for_starter_adk() -> None:
    config_dict = onboarding.engine_config_dict_for_starter(
        framework="ADK", name="Starter Agent"
    )
    assert config_dict["agent"]["type"] == "ADK"
    assert config_dict["agent"]["config"]["agent"] == "agent.py:agent"


def test_engine_config_passes_engine_validation_langgraph() -> None:
    """The dict we hand to StandaloneAgentRow.base_engine_config must validate."""
    from idun_agent_schema.engine import EngineConfig

    detection = _det(framework="LANGGRAPH", name="Foo")
    EngineConfig.model_validate(onboarding.engine_config_dict_from_detection(detection))


def test_engine_config_passes_engine_validation_adk() -> None:
    from idun_agent_schema.engine import EngineConfig

    detection = _det(framework="ADK", name="Foo")
    EngineConfig.model_validate(onboarding.engine_config_dict_from_detection(detection))
```

- [ ] **Step 2: Run tests — must fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_onboarding.py -v
```

Expected: ImportError on `idun_agent_standalone.services.onboarding`.

- [ ] **Step 3: Implement the service helpers**

Create `libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py`:

```python
"""Onboarding service: state classification + EngineConfig assembly.

This module is the orchestration layer between the ``/onboarding/*``
HTTP endpoints, the scanner (read-only), and the scaffolder
(side-effecting). It owns:

  - The 5-state classification rule.
  - Building an ``EngineConfig`` dict from a ``DetectedAgent``.
  - Building an ``EngineConfig`` dict for a starter scaffold.
  - The two materialize coroutines that insert the singleton agent
    row and run it through the existing ``commit_with_reload`` pipeline.

Errors raised here are translated to HTTP envelopes by the router.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal

from fastapi import status as http_status
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    DetectedAgent,
    OnboardingState,
    ScanResult,
    StandaloneAdminError,
    StandaloneAgentRead,
    StandaloneErrorCode,
    StandaloneMutationResponse,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services import scaffold, scanner
from idun_agent_standalone.services.reload import commit_with_reload

ReloadCallable = Callable[[EngineConfig], Awaitable[None]]

logger = get_logger(__name__)


_STARTER_DEFAULT_NAME = "Starter Agent"
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    """Return a slug suitable for ``agent.config.name``.

    The engine's ADK validator derives ``app_name`` from ``name`` by
    lower-casing and replacing non-alphanumerics with ``_``, so we run
    the same transformation up-front to keep the value stable across
    re-validations and avoid surprising round-trip differences.
    Falls back to ``"agent"`` when the input slugifies to empty.
    """
    slug = _SLUG_RE.sub("_", name.lower()).strip("_")
    return slug or "agent"


def classify_state(
    scan_result: ScanResult,
    *,
    agent_row_exists: bool,
) -> OnboardingState:
    """Compute the wizard's 5-state classification."""
    if agent_row_exists:
        return "ALREADY_CONFIGURED"
    if not scan_result.has_python_files:
        return "EMPTY"
    if not scan_result.detected:
        return "NO_SUPPORTED"
    if len(scan_result.detected) == 1:
        return "ONE_DETECTED"
    return "MANY_DETECTED"


def engine_config_dict_from_detection(detection: DetectedAgent) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict from a detected agent."""
    name_slug = _slugify(detection.inferred_name)
    if detection.framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }


def engine_config_dict_for_starter(
    *,
    framework: Literal["LANGGRAPH", "ADK"],
    name: str,
) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict for a starter scaffold."""
    name_slug = _slugify(name)
    if framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": "agent.py:graph",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": "agent.py:agent",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }


async def _agent_row(session: AsyncSession) -> StandaloneAgentRow | None:
    return (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()


def _conflict(code: StandaloneErrorCode, message: str, **extra: Any) -> AdminAPIError:
    """Helper for 409 envelopes. Extra fields go into ``message`` is enough for MVP."""
    return AdminAPIError(
        status_code=http_status.HTTP_409_CONFLICT,
        error=StandaloneAdminError(code=code, message=message),
    )
```

- [ ] **Step 4: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_onboarding.py -v
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py \
        libs/idun_agent_standalone/tests/unit/services/test_onboarding.py
git commit -m "feat(standalone): onboarding service — state classifier + EngineConfig builders"
```

---

## Task 6: Onboarding service — materialize functions

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py`

The two materialize coroutines do the same dance: pre-check, build config, insert row, run reload pipeline. They call into the existing `commit_with_reload` so the reload contract stays identical to `agent.py` and `memory.py`.

- [ ] **Step 1: Append the materialize functions**

Append to `libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py`:

```python
async def materialize_from_detection(
    session: AsyncSession,
    body: CreateFromDetectionBody,
    *,
    scan_root: Path,
    reload_callable: ReloadCallable,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Materialize a detection picked by the wizard.

    Re-scans inside the handler so the detection's ``inferred_name``
    and confidence come from the authoritative server-side scan, not
    from anything the client could tamper with.
    """
    if await _agent_row(session) is not None:
        raise _conflict(
            StandaloneErrorCode.CONFLICT,
            "Agent already configured.",
        )

    scan_result = scanner.scan_folder(scan_root)
    match: DetectedAgent | None = None
    for detection in scan_result.detected:
        if (
            detection.framework == body.framework
            and detection.file_path == body.file_path
            and detection.variable_name == body.variable_name
        ):
            match = detection
            break
    if match is None:
        raise _conflict(
            StandaloneErrorCode.CONFLICT,
            (
                f"Detection not found: {body.framework} "
                f"{body.file_path}:{body.variable_name}. "
                "The project may have changed — re-run the scan."
            ),
        )

    config_dict = engine_config_dict_from_detection(match)
    row = StandaloneAgentRow(
        name=match.inferred_name,
        base_engine_config=config_dict,
    )

    async with reload_service._reload_mutex:
        session.add(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.onboarding.create_from_detection framework=%s name=%s status=%s",
        match.framework,
        match.inferred_name,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )


async def materialize_starter(
    session: AsyncSession,
    body: CreateStarterBody,
    *,
    scaffold_root: Path,
    reload_callable: ReloadCallable,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Scaffold a starter project + insert the singleton agent row.

    On any pre-check failure (existing agent, scaffold conflict)
    nothing is written to disk and no row is inserted. After a
    successful scaffold + row insert, reload failures leave both the
    files and the row in place; the user's recovery path is to edit
    ``agent.py`` and ``PATCH /agent`` to retry the reload.
    """
    if await _agent_row(session) is not None:
        raise _conflict(
            StandaloneErrorCode.CONFLICT,
            "Agent already configured.",
        )

    name = body.name or _STARTER_DEFAULT_NAME

    try:
        written = scaffold.create_starter_project(
            scaffold_root, framework=body.framework
        )
    except scaffold.ScaffoldConflictError as exc:
        names = ", ".join(p.name for p in exc.paths)
        raise _conflict(
            StandaloneErrorCode.CONFLICT,
            f"Scaffold target exists: {names}. Move or delete and retry.",
        ) from exc

    config_dict = engine_config_dict_for_starter(
        framework=body.framework, name=name
    )
    row = StandaloneAgentRow(name=name, base_engine_config=config_dict)

    async with reload_service._reload_mutex:
        session.add(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.onboarding.create_starter framework=%s files=%d status=%s",
        body.framework,
        len(written),
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )
```

- [ ] **Step 2: Run unit tests — must still pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_onboarding.py -v
```

Expected: 11 tests pass (no new tests yet — materialize coroutines are exercised end-to-end in Task 8).

- [ ] **Step 3: Lint check**

```bash
uv run ruff check libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py
```

Expected: clean. If the inline `from pathlib import Path` triggers E402, move the import to the top of the file (the inline placement above is intentional documentation but ruff config may forbid it; resolve in favour of ruff).

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/onboarding.py
git commit -m "feat(standalone): onboarding service — materialize coroutines"
```

---

## Task 7: Router — three onboarding endpoints + app wiring

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`

- [ ] **Step 1: Create the router**

Create `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py`:

```python
"""``/admin/api/v1/onboarding`` router.

Three endpoints:

  - ``POST /scan``: classify the user's project + return scanner output.
  - ``POST /create-from-detection``: materialize an agent the user picked.
  - ``POST /create-starter``: scaffold a fresh starter project.

Materialize endpoints flow through the same ``commit_with_reload``
pipeline as ``/admin/api/v1/agent``. Failure modes:

  - 409 ``conflict`` when an agent row already exists.
  - 409 ``conflict`` when a re-scan can no longer find the picked detection.
  - 409 ``conflict`` when a scaffold target file already exists.

Auth is wired at ``app.include_router`` level, not per-endpoint.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    ScanResponse,
    StandaloneAgentRead,
    StandaloneMutationResponse,
)

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.services import onboarding
from idun_agent_standalone.services import scanner

router = APIRouter(prefix="/admin/api/v1/onboarding", tags=["admin"])

logger = get_logger(__name__)


def _scan_root(request: Request) -> Path:
    """Resolve the scan root.

    Default: ``Path.cwd()``. Tests override via
    ``app.state.onboarding_scan_root`` so the wizard can be exercised
    without ``monkeypatch.chdir`` collisions across asyncio tasks.
    """
    override = getattr(request.app.state, "onboarding_scan_root", None)
    if override is not None:
        return Path(override)
    return Path.cwd()


@router.post("/scan", response_model=ScanResponse)
async def scan(request: Request, session: SessionDep) -> ScanResponse:
    """Classify the project and return the scanner result."""
    from sqlalchemy import select

    from idun_agent_standalone.infrastructure.db.models.agent import (
        StandaloneAgentRow,
    )

    row = (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()
    agent_row_exists = row is not None
    current_agent: StandaloneAgentRead | None = None

    if agent_row_exists:
        # Skip the walk — UI shouldn't be calling /scan in this state, and
        # if something does, surface the existing config so the operator
        # can see what they are looking at.
        from idun_agent_schema.standalone import ScanResult

        scan_result = ScanResult(
            root=str(_scan_root(request)),
            detected=[],
            has_python_files=False,
            has_idun_config=False,
            scan_duration_ms=0,
        )
        current_agent = StandaloneAgentRead.model_validate(row)
    else:
        scan_result = scanner.scan_folder(_scan_root(request))

    state = onboarding.classify_state(
        scan_result, agent_row_exists=agent_row_exists
    )
    logger.info(
        "admin.onboarding.scan state=%s detections=%d duration_ms=%d",
        state,
        len(scan_result.detected),
        scan_result.scan_duration_ms,
    )
    return ScanResponse(
        state=state, scan_result=scan_result, current_agent=current_agent
    )


@router.post(
    "/create-from-detection",
    response_model=StandaloneMutationResponse[StandaloneAgentRead],
)
async def create_from_detection(
    body: CreateFromDetectionBody,
    request: Request,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Materialize a detection picked by the wizard."""
    return await onboarding.materialize_from_detection(
        session,
        body,
        scan_root=_scan_root(request),
        reload_callable=reload_callable,
    )


@router.post(
    "/create-starter",
    response_model=StandaloneMutationResponse[StandaloneAgentRead],
)
async def create_starter(
    body: CreateStarterBody,
    request: Request,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Scaffold a starter project + register the singleton agent row."""
    return await onboarding.materialize_starter(
        session,
        body,
        scaffold_root=_scan_root(request),
        reload_callable=reload_callable,
    )
```

- [ ] **Step 2: Wire the router in `app.py`**

Find the block in `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` that includes the existing admin routers. Add the import and the include alongside them:

```python
# In the imports section near the other router imports:
from idun_agent_standalone.api.v1.routers.onboarding import (
    router as onboarding_router,
)

# In the app factory where other routers are included (look for the block
# that calls app.include_router(agent_router, ...) etc.):
app.include_router(onboarding_router, dependencies=[Depends(require_auth)])
```

If the existing pattern uses a different DI surface (e.g. `auth_dep` already attached at a parent router), match that — the goal is to land onboarding at the same auth gate as the other admin routes.

- [ ] **Step 3: Smoke-check imports**

```bash
uv run python -c "from idun_agent_standalone.app import build_app; build_app()"
```

Expected: no import errors. If the call signature for `build_app` has changed, the goal is to import the module without error.

If `build_app()` requires settings, fall back to:

```bash
uv run python -c "from idun_agent_standalone.api.v1.routers.onboarding import router; print(router.routes)"
```

Expected output: three `Route` objects whose paths end in `/scan`, `/create-from-detection`, `/create-starter`.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py
git commit -m "feat(standalone): onboarding router — 3 endpoints wired with auth gate"
```

---

## Task 8: Integration tests — `/scan` flows

**Files:**
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`

This file is built incrementally across Tasks 8/9/10. Task 8 adds the fixture and the 5 `/scan` tests.

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`:

```python
"""Integration tests for ``/admin/api/v1/onboarding/*``."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
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
from idun_agent_standalone.api.v1.routers.onboarding import (
    router as onboarding_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)


@pytest.fixture
async def admin_app(async_session, stub_reload_callable, tmp_path):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(onboarding_router)
    app.state.reload_callable = stub_reload_callable
    app.state.onboarding_scan_root = tmp_path

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


def _seed_langgraph_file(root: Path, *, var: str = "graph") -> None:
    (root / "agent.py").write_text(
        textwrap.dedent(
            f"""
            from langgraph.graph import StateGraph
            from typing import TypedDict

            class State(TypedDict):
                m: str

            {var} = StateGraph(State).compile()
            """
        ).lstrip()
    )


def _seed_adk_file(root: Path) -> None:
    (root / "main_adk.py").write_text(
        textwrap.dedent(
            """
            from google.adk.agents import Agent

            agent = Agent(name="x", model="gemini-2.0-flash")
            """
        ).lstrip()
    )


async def _seed_existing_agent(async_session) -> StandaloneAgentRow:
    row = StandaloneAgentRow(
        name="Existing",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "existing", "graph_definition": "agent.py:graph"},
            },
        },
    )
    async_session.add(row)
    await async_session.commit()
    return row


# ---- /scan ----------------------------------------------------------------


async def test_scan_state_empty(admin_app, tmp_path) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "EMPTY"
    assert body["scanResult"]["hasPythonFiles"] is False
    assert body["currentAgent"] is None


async def test_scan_state_no_supported(admin_app, tmp_path) -> None:
    (tmp_path / "hello.py").write_text("print('hi')\n")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "NO_SUPPORTED"
    assert body["scanResult"]["hasPythonFiles"] is True
    assert body["scanResult"]["detected"] == []


async def test_scan_state_one_detected(admin_app, tmp_path) -> None:
    _seed_langgraph_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "ONE_DETECTED"
    assert len(body["scanResult"]["detected"]) == 1
    detection = body["scanResult"]["detected"][0]
    assert detection["framework"] == "LANGGRAPH"
    assert detection["filePath"] == "agent.py"
    assert detection["variableName"] == "graph"


async def test_scan_state_many_detected(admin_app, tmp_path) -> None:
    _seed_langgraph_file(tmp_path)
    _seed_adk_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "MANY_DETECTED"
    frameworks = {d["framework"] for d in body["scanResult"]["detected"]}
    assert frameworks == {"LANGGRAPH", "ADK"}


async def test_scan_state_already_configured_returns_current_agent(
    admin_app, async_session, tmp_path
) -> None:
    await _seed_existing_agent(async_session)
    # Even with detectable files on disk, an existing agent row trumps.
    _seed_langgraph_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "ALREADY_CONFIGURED"
    assert body["currentAgent"] is not None
    assert body["currentAgent"]["name"] == "Existing"
    # The walk is skipped — detected list is empty in this branch.
    assert body["scanResult"]["detected"] == []
```

- [ ] **Step 2: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py -v
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py
git commit -m "test(standalone): integration coverage for /onboarding/scan"
```

---

## Task 9: Integration tests — `/create-from-detection`

**Files:**
- Modify: `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`

- [ ] **Step 1: Append failing tests**

Append to `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`:

```python
# ---- /create-from-detection ------------------------------------------------


async def test_create_from_detection_langgraph_happy_path(
    admin_app, async_session, tmp_path, stub_reload_callable
) -> None:
    _seed_langgraph_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-from-detection",
            json={
                "framework": "LANGGRAPH",
                "filePath": "agent.py",
                "variableName": "graph",
            },
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["baseEngineConfig"]["agent"]["type"] == "LANGGRAPH"
    assert (
        body["data"]["baseEngineConfig"]["agent"]["config"]["graph_definition"]
        == "agent.py:graph"
    )
    assert body["reload"]["status"] == "reloaded"
    assert stub_reload_callable.call_count == 1


async def test_create_from_detection_adk_happy_path(
    admin_app, tmp_path, stub_reload_callable
) -> None:
    _seed_adk_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-from-detection",
            json={
                "framework": "ADK",
                "filePath": "main_adk.py",
                "variableName": "agent",
            },
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["baseEngineConfig"]["agent"]["type"] == "ADK"
    assert (
        body["data"]["baseEngineConfig"]["agent"]["config"]["agent"]
        == "main_adk.py:agent"
    )


async def test_create_from_detection_already_configured_409(
    admin_app, async_session, tmp_path
) -> None:
    await _seed_existing_agent(async_session)
    _seed_langgraph_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-from-detection",
            json={
                "framework": "LANGGRAPH",
                "filePath": "agent.py",
                "variableName": "graph",
            },
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_create_from_detection_stale_pick_409(admin_app, tmp_path) -> None:
    """File deleted between scan and click → re-scan returns no match → 409."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-from-detection",
            json={
                "framework": "LANGGRAPH",
                "filePath": "agent.py",
                "variableName": "graph",
            },
        )
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "conflict"
    # Message should help the user: it mentions the filename they sent.
    assert "agent.py" in body["error"]["message"]
```

- [ ] **Step 2: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py -v
```

Expected: 9 tests pass (5 from Task 8 + 4 new). The `stub_reload_callable` fixture is an `AsyncMock` from `tests/conftest.py`, so `.call_count`, `.assert_called_once()`, `.reset_mock()`, and `.side_effect = ...` all work as expected.

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py
git commit -m "test(standalone): integration coverage for /onboarding/create-from-detection"
```

---

## Task 10: Integration tests — `/create-starter`

**Files:**
- Modify: `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`

- [ ] **Step 1: Append failing tests**

Append to `libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py`:

```python
# ---- /create-starter -------------------------------------------------------


async def test_create_starter_langgraph_happy_path(
    admin_app, tmp_path, stub_reload_callable
) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-starter",
            json={"framework": "LANGGRAPH"},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["name"] == "Starter Agent"
    assert body["reload"]["status"] == "reloaded"

    expected = {"agent.py", "requirements.txt", ".env.example", "README.md", ".gitignore"}
    assert {p.name for p in tmp_path.iterdir()} >= expected


async def test_create_starter_adk_happy_path(admin_app, tmp_path) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-starter",
            json={"framework": "ADK", "name": "My Bot"},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["name"] == "My Bot"
    assert body["data"]["baseEngineConfig"]["agent"]["type"] == "ADK"
    assert "GOOGLE_API_KEY" in (tmp_path / ".env.example").read_text()


async def test_create_starter_scaffold_conflict_409_zero_writes(
    admin_app, tmp_path
) -> None:
    (tmp_path / "agent.py").write_text("# pre-existing\n")
    pre_state = {p.name: p.read_text() for p in tmp_path.iterdir()}
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-starter",
            json={"framework": "LANGGRAPH"},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    # Pre-existing file untouched, no new files.
    post_state = {p.name: p.read_text() for p in tmp_path.iterdir()}
    assert post_state == pre_state


async def test_create_starter_already_configured_409_zero_writes(
    admin_app, async_session, tmp_path
) -> None:
    await _seed_existing_agent(async_session)
    pre_files = list(tmp_path.iterdir())
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-starter",
            json={"framework": "LANGGRAPH"},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    # Confirm scaffold did not run.
    assert list(tmp_path.iterdir()) == pre_files


async def test_create_starter_reload_failure_keeps_files(
    admin_app, tmp_path, stub_reload_callable
) -> None:
    """Reload failure surfaces in envelope; scaffolded files persist.

    The reload pipeline rolls back the DB on a ``ReloadInitFailed`` and
    re-raises as ``AdminAPIError(500, code=reload_failed)`` (see
    ``services/reload.py``). The scaffolded files live on disk
    independently of the DB, so they remain — recovery per spec §5.3
    is to edit ``agent.py`` and re-run the wizard once the row is gone
    (or PATCH /agent if the row stayed for a different failure mode).
    """
    from idun_agent_standalone.services.reload import ReloadInitFailed

    # AsyncMock side_effect: any call to the stub raises this.
    stub_reload_callable.side_effect = ReloadInitFailed("simulated")

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/onboarding/create-starter",
            json={"framework": "LANGGRAPH"},
        )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "reload_failed"

    expected = {"agent.py", "requirements.txt", ".env.example", "README.md", ".gitignore"}
    assert {p.name for p in tmp_path.iterdir()} >= expected
```

- [ ] **Step 2: Run tests — verify**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py -v
```

Expected: 14 tests pass.

- [ ] **Step 3: Run the full standalone test suite**

```bash
uv run pytest libs/idun_agent_standalone/tests/ -q
```

Expected: all tests pass — including pre-existing scanner + auth + admin tests.

- [ ] **Step 4: Run lint + format**

```bash
uv run ruff check libs/idun_agent_standalone/ libs/idun_agent_schema/
uv run black --check libs/idun_agent_standalone/ libs/idun_agent_schema/
```

Expected: clean. Fix anything reported before committing.

- [ ] **Step 5: Final commit**

```bash
git add libs/idun_agent_standalone/tests/integration/api/v1/test_onboarding_flow.py
git commit -m "test(standalone): integration coverage for /onboarding/create-starter"
```

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| §4 5-state machine | Task 5 (classify_state) + Task 8 (5 /scan tests) |
| §5.1 /scan | Task 7 (router) + Task 8 (tests) |
| §5.2 /create-from-detection | Task 6 (materialize) + Task 7 (router) + Task 9 (tests) |
| §5.3 /create-starter | Task 6 (materialize) + Task 7 (router) + Task 10 (tests) |
| §6 schema additions | Task 1 |
| §7 module layout | Tasks 2/5/7 (scaffold.py / onboarding.py / router) |
| §8 scaffolder atomic algorithm | Tasks 2-4 |
| §9 onboarding service surface | Tasks 5-6 |
| §10 concurrency (singleton row) | Pre-existing DB primary key — implicitly covered by 409 tests |
| §11 auth + reload | Task 7 (Depends(require_auth)) + Task 10 (reload-failure test) |
| §12 testing strategy | Tasks 2-4 (scaffold unit), Task 5 (service unit), Tasks 8-10 (integration) |
| §13 future work | Out of scope — explicitly deferred |

## Test count summary

- `tests/standalone/test_onboarding.py`: 7 new (3 pre-existing from sub-project A)
- `tests/unit/services/test_scaffold.py`: 13 new
- `tests/unit/services/test_onboarding.py`: 11 new
- `tests/integration/api/v1/test_onboarding_flow.py`: 14 new

**Total new tests: 45.**
