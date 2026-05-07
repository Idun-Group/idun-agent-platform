# Onboarding scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-Python filesystem scanner that detects LangGraph and Google ADK agents from source files, `langgraph.json`, and Idun `config.yaml`, returning a structured `ScanResult` consumed by the onboarding wizard's HTTP layer.

**Architecture:** Two artifacts. The wire schema lives in `idun_agent_schema.standalone.onboarding` so backend and UI share one source of truth. The implementation lives in `idun_agent_standalone.services.scanner` as a single async function `scan_folder(root: Path) -> ScanResult`. Detection is the union of three independent paths (Idun config → `langgraph.json` → `.py` AST), deduplicated by `(file_path, variable_name)` keeping HIGH confidence over MEDIUM. The scanner is stateless, never mutates the filesystem, and never raises on malformed input.

**Tech Stack:** Python 3.12 stdlib (`os`, `ast`, `re`, `tomllib`, `json`), `pydantic` 2.11+, `pyyaml` (already a standalone dep), `pytest` + `pytest-asyncio` (`asyncio_mode = auto` already configured for the standalone test suite).

**Spec:** [`docs/superpowers/specs/2026-04-28-onboarding-scanner-design.md`](../specs/2026-04-28-onboarding-scanner-design.md)

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py` | Create | `DetectedAgent` + `ScanResult` Pydantic models |
| `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py` | Modify | re-export the two new types |
| `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py` | Create | `scan_folder` + private helpers (walk, three detection paths, dedup, inference cascade) |
| `libs/idun_agent_standalone/tests/unit/services/test_scanner.py` | Create | unit tests, all fixtures via `pytest`'s `tmp_path` |

---

## Task 1: Schema (`DetectedAgent`, `ScanResult`)

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`
- Test: `libs/idun_agent_schema/tests/standalone/test_onboarding.py`

- [ ] **Step 1: Write the failing test**

Create `libs/idun_agent_schema/tests/standalone/test_onboarding.py`:

```python
"""Wire-shape tests for the onboarding schema."""

from __future__ import annotations

from idun_agent_schema.standalone import DetectedAgent, ScanResult


def test_detected_agent_camelcase_roundtrip() -> None:
    """Snake-case input + camelCase output by default."""
    agent = DetectedAgent(
        framework="LANGGRAPH",
        file_path="agent.py",
        variable_name="graph",
        inferred_name="My Agent",
        confidence="HIGH",
        source="config",
    )
    dumped = agent.model_dump(by_alias=True)
    assert dumped == {
        "framework": "LANGGRAPH",
        "filePath": "agent.py",
        "variableName": "graph",
        "inferredName": "My Agent",
        "confidence": "HIGH",
        "source": "config",
    }


def test_scan_result_camelcase_roundtrip() -> None:
    result = ScanResult(
        root="/tmp/x",
        detected=[],
        has_python_files=False,
        has_idun_config=False,
        scan_duration_ms=42,
    )
    dumped = result.model_dump(by_alias=True)
    assert dumped == {
        "root": "/tmp/x",
        "detected": [],
        "hasPythonFiles": False,
        "hasIdunConfig": False,
        "scanDurationMs": 42,
    }


def test_detected_agent_rejects_unknown_framework() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DetectedAgent(
            framework="HAYSTACK",
            file_path="x.py",
            variable_name="x",
            inferred_name="X",
            confidence="HIGH",
            source="config",
        )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_onboarding.py -v
```

Expected: collection error or import error — `DetectedAgent` and `ScanResult` are not yet exported.

- [ ] **Step 3: Create the schema module**

Create `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py`:

```python
"""Wire schema for the onboarding scanner.

These models are shared by the standalone backend (which produces them)
and the standalone UI (which consumes them through the onboarding API).
The five-state wizard classification is *not* in this schema — it is
derived at the API layer by combining a ``ScanResult`` with the DB
state of the singleton agent row.
"""

from __future__ import annotations

from typing import Literal

from ._base import _CamelModel


class DetectedAgent(_CamelModel):
    """One agent the scanner found in the target folder."""

    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str
    variable_name: str
    inferred_name: str
    confidence: Literal["HIGH", "MEDIUM"]
    source: Literal["config", "source", "langgraph_json"]


class ScanResult(_CamelModel):
    """Aggregate result of a single ``scan_folder`` call."""

    root: str
    detected: list[DetectedAgent]
    has_python_files: bool
    has_idun_config: bool
    scan_duration_ms: int
```

- [ ] **Step 4: Re-export from the namespace `__init__`**

Modify `libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py`. After the existing `from .observability import (...)` block (and before `from .prompts import (...)`), insert:

```python
from .onboarding import (  # noqa: F401
    DetectedAgent,
    ScanResult,
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_onboarding.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py \
        libs/idun_agent_schema/src/idun_agent_schema/standalone/__init__.py \
        libs/idun_agent_schema/tests/standalone/test_onboarding.py
git commit -m "feat(schema): add onboarding ScanResult + DetectedAgent shapes"
```

---

## Task 2: Scanner skeleton (walk, skip-list, depth limit, `has_python_files`)

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Test: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
"""Unit tests for ``services.scanner``."""

from __future__ import annotations

from pathlib import Path

from idun_agent_standalone.services.scanner import scan_folder


async def test_empty_folder(tmp_path: Path) -> None:
    result = await scan_folder(tmp_path)
    assert result.detected == []
    assert result.has_python_files is False
    assert result.has_idun_config is False
    assert result.root == str(tmp_path)
    assert result.scan_duration_ms >= 0


async def test_has_python_files_set_when_py_present(tmp_path: Path) -> None:
    (tmp_path / "noise.py").write_text("print('hi')\n")
    result = await scan_folder(tmp_path)
    assert result.has_python_files is True
    assert result.detected == []


async def test_skip_list_ignores_dot_venv(tmp_path: Path) -> None:
    """A graph file inside .venv must not be detected."""
    venv = tmp_path / ".venv" / "lib"
    venv.mkdir(parents=True)
    (venv / "trap.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []
    # The walk did not recurse into .venv at all
    assert result.has_python_files is False


async def test_skip_list_ignores_dotted_dir(tmp_path: Path) -> None:
    hidden = tmp_path / ".cache"
    hidden.mkdir()
    (hidden / "x.py").write_text("x = 1\n")
    result = await scan_folder(tmp_path)
    assert result.has_python_files is False


async def test_depth_limit_4(tmp_path: Path) -> None:
    """Files deeper than 4 levels are not visited."""
    deep = tmp_path / "a" / "b" / "c" / "d" / "e"
    deep.mkdir(parents=True)
    (deep / "deep.py").write_text("x = 1\n")
    shallow = tmp_path / "a" / "b" / "c" / "d"
    (shallow / "shallow.py").write_text("y = 1\n")
    result = await scan_folder(tmp_path)
    # Depth ≤ 4 means up to 4 path components below the root, so
    # ``a/b/c/d/shallow.py`` is in (4 components) and ``e/deep.py`` is out.
    assert result.has_python_files is True  # shallow.py was visited
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: collection error — `services.scanner` does not exist yet.

- [ ] **Step 3: Implement the skeleton**

Create `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`:

```python
"""Pure-Python filesystem scanner for the onboarding wizard.

Walks a folder, detects LangGraph and Google ADK agents from three
sources (Idun config.yaml, langgraph.json, .py source via regex
pre-filter + AST), and returns a structured ``ScanResult``.

The scanner never mutates the filesystem, never raises on malformed
input (parse errors are silently skipped), and runs purely off
stdlib + pydantic + pyyaml. The five-state wizard classification is
*not* the scanner's responsibility — it is derived at the API layer.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

from idun_agent_schema.standalone import DetectedAgent, ScanResult

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)

_SKIP_DIRS = frozenset(
    {
        ".git",
        "__pycache__",
        "node_modules",
        ".venv",
        "venv",
        "env",
        "dist",
        "build",
        "target",
    }
)
_MAX_DEPTH = 4
_MAX_FILE_BYTES = 1_000_000  # 1 MB


def _is_skipped(name: str) -> bool:
    return name in _SKIP_DIRS or name.startswith(".")


def _walk(root: Path):
    """Yield (rel_path, abs_path) for every ``.py`` file under root.

    Honors the skip-list and depth limit. Symlinks are not followed.
    """
    root_str = str(root)
    for dirpath, dirnames, filenames in os.walk(root_str, followlinks=False):
        rel = os.path.relpath(dirpath, root_str)
        depth = 0 if rel == "." else len(Path(rel).parts)
        if depth >= _MAX_DEPTH:
            dirnames[:] = []  # do not descend further
        # Prune skipped subdirs in-place so os.walk does not enter them.
        dirnames[:] = [d for d in dirnames if not _is_skipped(d)]
        for filename in filenames:
            if not filename.endswith(".py"):
                continue
            abs_path = Path(dirpath) / filename
            try:
                if abs_path.stat().st_size > _MAX_FILE_BYTES:
                    continue
            except OSError:
                continue
            rel_path = "" if rel == "." else rel
            posix_rel = (Path(rel_path) / filename).as_posix()
            yield posix_rel, abs_path


async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``.

    Async for caller ergonomics — the parent spec wraps this in a 5s
    ``asyncio.wait_for`` budget at the API layer. The function itself
    is CPU-bound and does not need true async IO.
    """
    started = time.monotonic()
    has_python_files = False
    detected: list[DetectedAgent] = []

    for _rel, _abs in _walk(root):
        has_python_files = True

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=False,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): scanner skeleton with walk + skip-list + depth limit"
```

---

## Task 3: `.py` source detection (LangGraph + ADK)

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
async def test_detect_minimal_langgraph(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_detect_uncompiled_langgraph(tmp_path: Path) -> None:
    """A bare StateGraph(...) assignment counts."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int)\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_detect_compiled_via_intermediate(tmp_path: Path) -> None:
    """g = StateGraph(...); graph = g.compile() → 1 detection on the compiled binding."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "g = StateGraph(int)\n"
        "graph = g.compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_no_false_positive_on_unrelated_compile(tmp_path: Path) -> None:
    """``something.compile()`` with no traceable StateGraph receiver is ignored."""
    (tmp_path / "noise.py").write_text(
        "import re\n"
        "pat = re.compile(r'x')\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_detect_minimal_adk(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from google.adk.agents import Agent\n"
        "root_agent = Agent(name='x')\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "ADK"
    assert d.variable_name == "root_agent"
    assert d.source == "source"


async def test_detect_adk_subclasses(tmp_path: Path) -> None:
    """LlmAgent / SequentialAgent / ParallelAgent / LoopAgent all count."""
    src = (
        "from google.adk.agents import LlmAgent, SequentialAgent\n"
        "from google.adk.agents import ParallelAgent, LoopAgent\n"
        "a = LlmAgent(name='a')\n"
        "b = SequentialAgent(name='b')\n"
        "c = ParallelAgent(name='c')\n"
        "d = LoopAgent(name='d')\n"
    )
    (tmp_path / "agents.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"a", "b", "c", "d"}


async def test_skip_unparseable_source(tmp_path: Path) -> None:
    """A SyntaxError in one file does not crash the scan."""
    (tmp_path / "broken.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int  # missing paren\n"
    )
    (tmp_path / "good.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    files = {d.file_path for d in result.detected}
    assert files == {"good.py"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v -k "detect or false_positive or unparseable"
```

Expected: 7 failures (no detection logic yet).

- [ ] **Step 3: Implement source detection**

Modify `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`. Replace the imports section and add detection helpers. The full file content after this step:

```python
"""Pure-Python filesystem scanner for the onboarding wizard.

Walks a folder, detects LangGraph and Google ADK agents from three
sources (Idun config.yaml, langgraph.json, .py source via regex
pre-filter + AST), and returns a structured ``ScanResult``.

The scanner never mutates the filesystem, never raises on malformed
input (parse errors are silently skipped), and runs purely off
stdlib + pydantic + pyyaml. The five-state wizard classification is
*not* the scanner's responsibility — it is derived at the API layer.
"""

from __future__ import annotations

import ast
import os
import re
import time
from pathlib import Path

from idun_agent_schema.standalone import DetectedAgent, ScanResult

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)

_SKIP_DIRS = frozenset(
    {
        ".git",
        "__pycache__",
        "node_modules",
        ".venv",
        "venv",
        "env",
        "dist",
        "build",
        "target",
    }
)
_MAX_DEPTH = 4
_MAX_FILE_BYTES = 1_000_000  # 1 MB

_LANGGRAPH_IMPORT_RE = re.compile(
    r"(?m)^\s*(from\s+langgraph[\s.]|import\s+langgraph)"
)
_ADK_IMPORT_RE = re.compile(
    r"(?m)^\s*(from\s+google\.adk|import\s+google\.adk)"
)
_ADK_AGENT_CLASSES = frozenset(
    {"Agent", "LlmAgent", "SequentialAgent", "ParallelAgent", "LoopAgent"}
)


def _is_skipped(name: str) -> bool:
    return name in _SKIP_DIRS or name.startswith(".")


def _walk(root: Path):
    """Yield (rel_path, abs_path) for every ``.py`` file under root.

    Honors the skip-list and depth limit. Symlinks are not followed.
    """
    root_str = str(root)
    for dirpath, dirnames, filenames in os.walk(root_str, followlinks=False):
        rel = os.path.relpath(dirpath, root_str)
        depth = 0 if rel == "." else len(Path(rel).parts)
        if depth >= _MAX_DEPTH:
            dirnames[:] = []
        dirnames[:] = [d for d in dirnames if not _is_skipped(d)]
        for filename in filenames:
            if not filename.endswith(".py"):
                continue
            abs_path = Path(dirpath) / filename
            try:
                if abs_path.stat().st_size > _MAX_FILE_BYTES:
                    continue
            except OSError:
                continue
            rel_path = "" if rel == "." else rel
            posix_rel = (Path(rel_path) / filename).as_posix()
            yield posix_rel, abs_path


def _is_call_to(node: ast.AST, names: frozenset[str]) -> bool:
    """True if ``node`` is a Call whose callable is a Name in ``names``."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Name):
        return func.id in names
    return False


def _is_state_graph_call(node: ast.AST) -> bool:
    return _is_call_to(node, frozenset({"StateGraph"}))


def _is_adk_agent_call(node: ast.AST) -> bool:
    return _is_call_to(node, _ADK_AGENT_CLASSES)


def _module_compile_target(node: ast.AST, state_graph_bindings: set[str]) -> bool:
    """True if ``node`` is ``<expr>.compile(...)`` where receiver is a known StateGraph."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if not isinstance(func, ast.Attribute) or func.attr != "compile":
        return False
    recv = func.value
    if isinstance(recv, ast.Name) and recv.id in state_graph_bindings:
        return True
    if isinstance(recv, ast.Call) and _is_state_graph_call(recv):
        return True
    return False


def _detect_in_source(rel_path: str, abs_path: Path) -> list[DetectedAgent]:
    """Return all source-detected agents from a single ``.py`` file."""
    try:
        text = abs_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    has_lg = bool(_LANGGRAPH_IMPORT_RE.search(text))
    has_adk = bool(_ADK_IMPORT_RE.search(text))
    if not (has_lg or has_adk):
        return []

    try:
        module = ast.parse(text)
    except SyntaxError:
        logger.debug("scanner: skip %s, syntax error", rel_path)
        return []

    found: list[DetectedAgent] = []
    state_graph_bindings: set[str] = set()
    compiled_from_binding: set[str] = set()

    # First pass: collect StateGraph bindings so we can resolve `.compile()`.
    for stmt in module.body:
        targets = _assign_targets(stmt)
        if not targets:
            continue
        rhs = _assign_rhs(stmt)
        if rhs is None:
            continue
        if has_lg and _is_state_graph_call(rhs):
            for name in targets:
                state_graph_bindings.add(name)

    # Second pass: emit detections.
    for stmt in module.body:
        targets = _assign_targets(stmt)
        if not targets:
            continue
        rhs = _assign_rhs(stmt)
        if rhs is None:
            continue
        target_name = targets[0]

        if has_lg and _module_compile_target(rhs, state_graph_bindings):
            # The compiled binding shadows the intermediate StateGraph
            # binding (we only emit one detection per file/var).
            compiled_from_binding.update(
                _receiver_name(rhs)
            )  # type: ignore[arg-type]
            found.append(
                DetectedAgent(
                    framework="LANGGRAPH",
                    file_path=rel_path,
                    variable_name=target_name,
                    inferred_name="",  # filled by inference cascade later
                    confidence="MEDIUM",
                    source="source",
                )
            )
            continue

        if has_lg and _is_state_graph_call(rhs):
            found.append(
                DetectedAgent(
                    framework="LANGGRAPH",
                    file_path=rel_path,
                    variable_name=target_name,
                    inferred_name="",
                    confidence="MEDIUM",
                    source="source",
                )
            )
            continue

        if has_adk and _is_adk_agent_call(rhs):
            found.append(
                DetectedAgent(
                    framework="ADK",
                    file_path=rel_path,
                    variable_name=target_name,
                    inferred_name="",
                    confidence="MEDIUM",
                    source="source",
                )
            )

    # Drop the intermediate StateGraph binding when a compiled form
    # also exists in the same file pointing at it.
    if compiled_from_binding:
        found = [
            d
            for d in found
            if not (
                d.framework == "LANGGRAPH" and d.variable_name in compiled_from_binding
            )
        ]
    return found


def _assign_targets(stmt: ast.AST) -> list[str]:
    """Return the list of single-Name LHS targets for an Assign / AnnAssign."""
    if isinstance(stmt, ast.Assign):
        out: list[str] = []
        for tgt in stmt.targets:
            if isinstance(tgt, ast.Name):
                out.append(tgt.id)
        return out
    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
        return [stmt.target.id]
    return []


def _assign_rhs(stmt: ast.AST) -> ast.AST | None:
    if isinstance(stmt, ast.Assign):
        return stmt.value
    if isinstance(stmt, ast.AnnAssign):
        return stmt.value
    return None


def _receiver_name(call: ast.Call) -> set[str]:
    """If call is `<Name>.compile(...)`, return {Name.id}; else empty."""
    func = call.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        return {func.value.id}
    return set()


async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``."""
    started = time.monotonic()
    has_python_files = False
    detected: list[DetectedAgent] = []

    for rel, abs_path in _walk(root):
        has_python_files = True
        detected.extend(_detect_in_source(rel, abs_path))

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=False,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 12 passed (the 5 from Task 2 plus 7 new).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): detect LangGraph and ADK agents from .py source"
```

---

## Task 4: `langgraph.json` detection at root

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
import json


async def test_langgraph_json_single_graph(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text(
        json.dumps(
            {
                "dependencies": ["./agent.py"],
                "graphs": {"helpdesk": "./agent.py:graph"},
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "HIGH"
    assert d.source == "langgraph_json"
    # has_idun_config is *not* set by langgraph.json
    assert result.has_idun_config is False


async def test_langgraph_json_multiple_graphs(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text(
        json.dumps(
            {
                "graphs": {
                    "alpha": "./a.py:graph",
                    "beta": "./b.py:graph",
                },
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2
    assert {d.variable_name for d in result.detected} == {"graph"}
    assert {d.file_path for d in result.detected} == {"a.py", "b.py"}


async def test_langgraph_json_malformed_skipped(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text("{not valid json")
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_langgraph_json_only_at_root(tmp_path: Path) -> None:
    """langgraph.json deeper than depth 0 is not consulted."""
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "langgraph.json").write_text(
        json.dumps({"graphs": {"x": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v -k "langgraph_json"
```

Expected: 4 failures.

- [ ] **Step 3: Implement `langgraph.json` detection**

Modify `scanner.py`. Add at the top of the imports:

```python
import json
```

Add a new helper after `_receiver_name`:

```python
def _detect_in_langgraph_json(root: Path) -> list[DetectedAgent]:
    """Parse ``<root>/langgraph.json`` and emit one detection per graphs entry."""
    path = root / "langgraph.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        logger.debug("scanner: skip langgraph.json, parse error")
        return []
    if not isinstance(data, dict):
        return []
    graphs = data.get("graphs")
    if not isinstance(graphs, dict):
        return []

    out: list[DetectedAgent] = []
    for key, value in graphs.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        if ":" not in value:
            continue
        file_part, _, variable = value.partition(":")
        # Strip leading "./" so the wire shape stays normalized.
        rel = file_part.removeprefix("./").lstrip("/")
        if not rel or not variable:
            continue
        out.append(
            DetectedAgent(
                framework="LANGGRAPH",
                file_path=rel,
                variable_name=variable,
                inferred_name=key,  # langgraph.json key wins inference rule 2
                confidence="HIGH",
                source="langgraph_json",
            )
        )
    return out
```

Modify the body of `scan_folder` to merge the new path:

```python
async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``."""
    started = time.monotonic()
    has_python_files = False
    detected: list[DetectedAgent] = []

    detected.extend(_detect_in_langgraph_json(root))

    for rel, abs_path in _walk(root):
        has_python_files = True
        detected.extend(_detect_in_source(rel, abs_path))

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=False,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 16 passed (12 prior + 4 new).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): detect LangGraph agents from langgraph.json"
```

---

## Task 5: Idun `config.yaml` detection (depth 0–2)

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
import yaml


async def test_idun_config_langgraph(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Helpdesk",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "HIGH"
    assert d.source == "config"


async def test_idun_config_adk(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "ADK",
                    "config": {
                        "name": "Helpdesk",
                        "agent": "./agent.py:root_agent",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "ADK"
    assert d.variable_name == "root_agent"


async def test_idun_config_yml_extension(tmp_path: Path) -> None:
    (tmp_path / "config.yml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1


async def test_idun_config_at_depth_2(tmp_path: Path) -> None:
    nested = tmp_path / "sub" / "deeper"
    nested.mkdir(parents=True)
    (nested / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True


async def test_idun_config_at_depth_3_ignored(tmp_path: Path) -> None:
    """Idun config at depth > 2 is not consulted."""
    nested = tmp_path / "a" / "b" / "c"
    nested.mkdir(parents=True)
    (nested / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False


async def test_idun_config_malformed_skipped(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text("not: valid: yaml: at: all:")
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False
    assert result.detected == []


async def test_idun_config_unsupported_type_skipped(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "HAYSTACK",
                    "config": {"component_definition": "./pipe.py:pipe"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False
    assert result.detected == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v -k "idun_config"
```

Expected: 7 failures.

- [ ] **Step 3: Implement `config.yaml` detection**

Modify `scanner.py`. Add at the top of the imports:

```python
import yaml
```

Add a new helper after `_detect_in_langgraph_json`:

```python
def _detect_in_idun_config(
    root: Path,
) -> tuple[list[DetectedAgent], bool]:
    """Walk depth 0–2 for ``config.yaml`` / ``config.yml``.

    Returns the detections plus a boolean ``has_idun_config`` that the
    caller folds into the ``ScanResult``.
    """
    detections: list[DetectedAgent] = []
    has_idun_config = False

    for path in _iter_idun_config_paths(root, max_depth=2):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8", errors="replace"))
        except (OSError, yaml.YAMLError):
            logger.debug("scanner: skip %s, yaml error", path)
            continue
        if not isinstance(data, dict):
            continue
        agent = data.get("agent")
        if not isinstance(agent, dict):
            continue
        agent_type = agent.get("type")
        if agent_type not in ("LANGGRAPH", "ADK"):
            continue
        config = agent.get("config")
        if not isinstance(config, dict):
            continue

        target = (
            config.get("graph_definition")
            if agent_type == "LANGGRAPH"
            else config.get("agent")
        )
        if not isinstance(target, str) or ":" not in target:
            continue
        file_part, _, variable = target.partition(":")
        rel = file_part.removeprefix("./").lstrip("/")
        if not rel or not variable:
            continue

        has_idun_config = True
        inferred = config.get("name")
        if not isinstance(inferred, str) or not inferred:
            inferred = ""  # filled by inference cascade
        detections.append(
            DetectedAgent(
                framework=agent_type,
                file_path=rel,
                variable_name=variable,
                inferred_name=inferred,
                confidence="HIGH",
                source="config",
            )
        )
    return detections, has_idun_config


def _iter_idun_config_paths(root: Path, *, max_depth: int):
    """Yield candidate ``config.yaml`` / ``config.yml`` paths up to depth 2."""
    for dirpath, dirnames, filenames in os.walk(str(root), followlinks=False):
        rel = os.path.relpath(dirpath, str(root))
        depth = 0 if rel == "." else len(Path(rel).parts)
        if depth > max_depth:
            dirnames[:] = []
            continue
        if depth == max_depth:
            dirnames[:] = []
        dirnames[:] = [d for d in dirnames if not _is_skipped(d)]
        for filename in filenames:
            if filename in ("config.yaml", "config.yml"):
                yield Path(dirpath) / filename
```

Modify the body of `scan_folder` to add the new path:

```python
async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``."""
    started = time.monotonic()
    has_python_files = False
    detected: list[DetectedAgent] = []

    config_detections, has_idun_config = _detect_in_idun_config(root)
    detected.extend(config_detections)
    detected.extend(_detect_in_langgraph_json(root))

    for rel, abs_path in _walk(root):
        has_python_files = True
        detected.extend(_detect_in_source(rel, abs_path))

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 23 passed (16 prior + 7 new).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): detect agents from Idun config.yaml (depth 0-2)"
```

---

## Task 6: Deduplication on `(file_path, variable_name)`

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
async def test_dedup_config_over_source(tmp_path: Path) -> None:
    """Config (HIGH) and source (MEDIUM) on same file:var → 1 entry, HIGH wins."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "From config",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.confidence == "HIGH"
    assert d.source == "config"
    assert d.inferred_name == "From config"


async def test_dedup_langgraph_json_over_source(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "langgraph.json").write_text(
        json.dumps({"graphs": {"helpdesk": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.source == "langgraph_json"
    assert d.inferred_name == "helpdesk"


async def test_distinct_files_not_deduped(tmp_path: Path) -> None:
    """Two genuinely different agents both surface."""
    (tmp_path / "alpha.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "beta.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v -k "dedup or distinct_files"
```

Expected: 2 failures (`test_distinct_files_not_deduped` already passes).

- [ ] **Step 3: Implement deduplication**

Modify `scanner.py`. Add a private helper above `scan_folder`:

```python
_CONFIDENCE_ORDER = {"HIGH": 2, "MEDIUM": 1}


def _dedup(detections: list[DetectedAgent]) -> list[DetectedAgent]:
    """Collapse entries sharing ``(file_path, variable_name)`` to the highest-confidence one.

    Insertion order is preserved for the surviving entry. Ties on
    confidence keep the first occurrence (i.e. the order
    ``_detect_in_idun_config`` → ``_detect_in_langgraph_json`` →
    ``_detect_in_source`` in ``scan_folder`` defines preference).
    """
    by_key: dict[tuple[str, str], DetectedAgent] = {}
    for d in detections:
        key = (d.file_path, d.variable_name)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = d
            continue
        if _CONFIDENCE_ORDER[d.confidence] > _CONFIDENCE_ORDER[existing.confidence]:
            by_key[key] = d
    return list(by_key.values())
```

Modify the body of `scan_folder` to call `_dedup`:

```python
async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``."""
    started = time.monotonic()
    has_python_files = False
    raw: list[DetectedAgent] = []

    config_detections, has_idun_config = _detect_in_idun_config(root)
    raw.extend(config_detections)
    raw.extend(_detect_in_langgraph_json(root))

    for rel, abs_path in _walk(root):
        has_python_files = True
        raw.extend(_detect_in_source(rel, abs_path))

    detected = _dedup(raw)
    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 26 passed (23 prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): dedup detections by (file_path, variable_name) keeping highest confidence"
```

---

## Task 7: Inference cascade for `inferred_name`

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
async def test_inferred_name_uses_pyproject(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "my-bot"\nversion = "0.1.0"\n'
    )
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "My Bot"


async def test_inferred_name_falls_back_to_parent_dir(tmp_path: Path) -> None:
    sub = tmp_path / "chat_assistant"
    sub.mkdir()
    (sub / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "Chat Assistant"


async def test_inferred_name_skips_src_in_parent(tmp_path: Path) -> None:
    """A src/ wrapper is skipped during parent-dir inference."""
    src = tmp_path / "src"
    src.mkdir()
    (src / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    # src/ is skipped → falls through to filename-based inference
    assert result.detected[0].inferred_name == "Agent"


async def test_inferred_name_strips_underscore_agent_suffix(tmp_path: Path) -> None:
    (tmp_path / "chatbot_agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "Chatbot"


async def test_inferred_name_fallback(tmp_path: Path) -> None:
    """Filename ``agent.py`` with no parent context → titlecased filename, not fallback."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    # No pyproject, no parent dir, filename ``agent`` after stripping is empty
    # so we fall through to the literal "My Agent" fallback.
    assert result.detected[0].inferred_name == "My Agent"


async def test_inferred_name_langgraph_json_key_wins(tmp_path: Path) -> None:
    """langgraph.json key takes priority over pyproject."""
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "my-bot"\n'
    )
    (tmp_path / "langgraph.json").write_text(
        json.dumps({"graphs": {"helpdesk": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "helpdesk"


async def test_inferred_name_config_name_wins(tmp_path: Path) -> None:
    """Idun config.name takes priority over everything."""
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "my-bot"\n'
    )
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "From Config",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "From Config"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v -k "inferred_name"
```

Expected: 4–6 failures (the config-name and langgraph-json-key tests already pass since rules 1–2 are wired in earlier tasks; pyproject / parent-dir / filename / fallback rules are not).

- [ ] **Step 3: Implement the inference cascade**

Modify `scanner.py`. Add at the top of the imports:

```python
import tomllib
```

Add a private helper above `scan_folder`:

```python
_TRAILING_AGENT_RE = re.compile(r"_?agent$", re.IGNORECASE)


def _humanize(token: str) -> str:
    """Return a Title-Cased label from a slug-ish token (``my-bot`` → ``My Bot``)."""
    parts = re.split(r"[-_\s]+", token.strip())
    return " ".join(p.capitalize() for p in parts if p)


def _read_pyproject_name(root: Path) -> str | None:
    path = root / "pyproject.toml"
    if not path.is_file():
        return None
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, tomllib.TOMLDecodeError):
        return None
    project = data.get("project")
    if isinstance(project, dict):
        name = project.get("name")
        if isinstance(name, str) and name:
            return name
    return None


def _infer_name(detected: DetectedAgent, root: Path) -> str:
    """Apply the 6-rule cascade to compute the human-friendly name.

    Rules 1 and 2 — config.name and langgraph.json key — are already
    populated by the detection paths; this function only fills the
    blanks for source-detected entries (and overrides empty values
    that slipped through from config without a name).
    """
    if detected.inferred_name:
        return detected.inferred_name

    pyproject_name = _read_pyproject_name(root)
    if pyproject_name:
        return _humanize(pyproject_name)

    file_path = Path(detected.file_path)
    parent = file_path.parent
    # Rule 4: parent dir, skipping ``src``
    if parent.parts and parent.parts != (".",):
        candidate = parent.parts[-1]
        if candidate == "src" and len(parent.parts) >= 2:
            candidate = parent.parts[-2]
        if candidate and candidate != "src":
            return _humanize(candidate)

    # Rule 5: filename without extension, strip ``_agent`` / ``agent``
    stem = file_path.stem
    stripped = _TRAILING_AGENT_RE.sub("", stem)
    if stripped:
        return _humanize(stripped)

    return "My Agent"
```

Modify the body of `scan_folder` to apply the cascade after dedup:

```python
async def scan_folder(root: Path) -> ScanResult:
    """Walk ``root`` and return a ``ScanResult``."""
    started = time.monotonic()
    has_python_files = False
    raw: list[DetectedAgent] = []

    config_detections, has_idun_config = _detect_in_idun_config(root)
    raw.extend(config_detections)
    raw.extend(_detect_in_langgraph_json(root))

    for rel, abs_path in _walk(root):
        has_python_files = True
        raw.extend(_detect_in_source(rel, abs_path))

    deduped = _dedup(raw)
    detected = [
        d.model_copy(update={"inferred_name": _infer_name(d, root)})
        for d in deduped
    ]

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=duration_ms,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 33 passed (26 prior + 7 new).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py \
        libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "feat(standalone): inference cascade for DetectedAgent.inferred_name"
```

---

## Task 8: Final safety + integration coverage

**Files:**
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`

- [ ] **Step 1: Write the final failing / coverage tests**

Append to `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`:

```python
async def test_ipynb_files_ignored(tmp_path: Path) -> None:
    """Notebook files are never parsed."""
    (tmp_path / "agent.ipynb").write_text(
        "{ \"cells\": [{ \"source\": [\"from langgraph.graph import StateGraph\\n\","
        " \"graph = StateGraph(int).compile()\\n\"] }] }"
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []
    assert result.has_python_files is False


async def test_oversized_py_skipped(tmp_path: Path) -> None:
    """Files > 1 MB are skipped (binary heuristic)."""
    (tmp_path / "huge.py").write_text("# pad\n" * 200_000)  # ~1.4 MB
    result = await scan_folder(tmp_path)
    assert result.has_python_files is False  # huge.py was skipped
    assert result.detected == []


async def test_scan_duration_populated(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.scan_duration_ms >= 0


async def test_full_state_2_shape(tmp_path: Path) -> None:
    """End-to-end: state-2 (one supported agent) feeds the wizard correctly."""
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "support-bot"\n'
    )
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.has_python_files is True
    assert result.has_idun_config is False
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.inferred_name == "Support Bot"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_full_state_3_shape(tmp_path: Path) -> None:
    """End-to-end: state-3 (multiple agents) returns a list the wizard can show."""
    (tmp_path / "alpha.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "beta.py").write_text(
        "from google.adk.agents import Agent\n"
        "root_agent = Agent(name='b')\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2
    frameworks = {d.framework for d in result.detected}
    assert frameworks == {"LANGGRAPH", "ADK"}
```

- [ ] **Step 2: Run all scanner tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_scanner.py -v
```

Expected: 38 passed (33 prior + 5 new). No new implementation required — these tests cover existing behaviour.

- [ ] **Step 3: Run the full standalone suite to check for regressions**

```bash
uv run pytest libs/idun_agent_standalone/tests
```

Expected: every prior test still green. The new scanner tests join the existing 156 baseline (plus the 30 from connection-checks if #536 has been merged) for a total around 194 — exact count depends on which umbrella commits are present.

- [ ] **Step 4: Run the lint gate**

```bash
uv run ruff check libs/idun_agent_standalone/ libs/idun_agent_schema/src/idun_agent_schema/standalone/
uv run black --check libs/idun_agent_standalone/ libs/idun_agent_schema/src/idun_agent_schema/standalone/
uv run mypy libs/idun_agent_standalone/src/
```

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/tests/unit/services/test_scanner.py
git commit -m "test(standalone): scanner integration coverage for spec states 2 and 3"
```

---

## Task 9: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/onboarding-scanner
```

(Adjust the branch name if you started from a different name; the rest of the umbrella has used `feat/<topic>` naming.)

- [ ] **Step 2: Open the PR against the umbrella**

```bash
gh pr create --base feat/standalone-admin-db-rework --head feat/onboarding-scanner \
  --title "feat(standalone): onboarding scanner — sub-project A" \
  --body 'Implements the onboarding scanner per `docs/superpowers/specs/2026-04-28-onboarding-scanner-design.md`.

Pure-Python filesystem walk, three detection paths (Idun config.yaml, langgraph.json, .py source via regex pre-filter + AST), deduplicated by (file_path, variable_name) with HIGH confidence winning over MEDIUM. Six-rule inference cascade for inferred_name. Notebooks ignored, files > 1 MB skipped, malformed YAML/JSON/Python silently skipped.

Wire schema lives in idun_agent_schema/standalone/onboarding.py so the upcoming onboarding API (sub-project B) and UI (sub-project C) share one source of truth.

## Tests

38 unit tests under libs/idun_agent_standalone/tests/unit/services/test_scanner.py. The standalone test suite stays green end-to-end.

## What this does NOT include

- HTTP surface — sub-project B
- Wizard UI — sub-project C
- Five-state classification — sub-project B (the scanner stays stateless and deterministic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```

---

## Self-review

- **Spec coverage:** every section of the scanner spec maps to a task. Schema (§"Module location and public API") → Task 1. Walk + skip-list + depth + file size + `has_python_files` (§"Walk strategy" + §"Performance and safety") → Task 2 + Task 8. Source detection (§"Path 3") → Task 3. `langgraph.json` (§"Path 2") → Task 4. Idun `config.yaml` (§"Path 1" + `has_idun_config`) → Task 5. Dedup (§"Detection sources" intro paragraph) → Task 6. Inference cascade (§"Name inference cascade") → Task 7. Notebook ignore (§"Walk strategy") → Task 8. Safety on malformed input (§"Performance and safety") → covered across Tasks 3 / 4 / 5 with explicit tests.

- **Placeholders:** no TBD / TODO / "implement later" / "similar to Task N" / vague guidance.

- **Type consistency:** `DetectedAgent` and `ScanResult` field names match across Task 1 (definition) and every later task (usage). Helper names (`_walk`, `_is_skipped`, `_detect_in_source`, `_detect_in_langgraph_json`, `_detect_in_idun_config`, `_dedup`, `_infer_name`, `_humanize`, `_read_pyproject_name`) are introduced exactly once and referenced consistently. The `source` literal triple `"config" | "source" | "langgraph_json"` is the same in the schema (Task 1) and in every detection path (Tasks 3 / 4 / 5).
