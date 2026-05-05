# Config UX Bundle B — File-Reference Validation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move broken-config detection from round 3 (engine reload) to round 2.5 (save time) with field-mapped errors. Add `?dryRun=true` on the agent PATCH plus a blur-triggered dry-run on the frontend so the operator gets immediate feedback when the `definition` path is broken.

**Architecture:** Extract LangGraph's import + lookup logic from `_load_graph_builder` into a standalone `validate_graph_definition` callable. The standalone reload pipeline calls it between rounds 2 and 3. Round 3 failures route through a new `classify_reload_error` taxonomy that maps known exception types to admin-facing field paths. The agent PATCH router accepts a `?dryRun=true` flag that runs all validation but skips commit + reload. Frontend adds a structural regex on the `definition` field and a `useBlurDryRun` hook that fires the dry-run on blur, routing failures through Bundle A's `applyFieldErrors`.

**Tech Stack:** Python (importlib, Pydantic), pytest, FastAPI Query params, LangGraph (StateGraph type-check), Next.js, react-hook-form, zod, TanStack Query mutations, vitest.

**Branch:** `feat/config-ux-file-ref` opens against `feat/config-ux`.

**Dependencies:** PR-1 (Bundle A) must be merged first — this PR consumes `applyFieldErrors` from `lib/api/form-errors.ts`.

**Spec:** `docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` (Bundle B section).

---

## File structure

**Engine refactor (Python):**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/agent/validation.py` — public `validate_graph_definition` callable, `GraphValidationCode` enum, `GraphValidationResult` model
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` — `_load_graph_builder` delegates import + lookup to the new callable; compile remains in-place
- Create: `libs/idun_agent_engine/tests/unit/agent/test_validation.py`

**Standalone backend (Python):**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/error_classifier.py` — `ReloadFailureCode`, `classify_reload_error`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py` — invoke round-2.5 between round-2 and round-3; route round-3 errors through the classifier
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py` — accept `?dryRun=true`, short-circuit before commit
- Modify: `libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py` — dry-run smoke (good config returns 200/not_attempted; bad config returns 422; row count unchanged)

**Frontend (TypeScript):**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx` — add zod regex on `definition`; wire `useBlurDryRun` on the field
- Create: `services/idun_agent_standalone_ui/hooks/use-blur-dry-run.ts`
- Create: `services/idun_agent_standalone_ui/__tests__/hooks/use-blur-dry-run.test.tsx`
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts` — accept an optional `?dryRun=true` for `patchAgent`

---

## Task 1: Engine — extract `validate_graph_definition`

**Files:**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/agent/validation.py`
- Test: `libs/idun_agent_engine/tests/unit/agent/test_validation.py`

- [ ] **Step 1: Write the failing tests**

```python
# libs/idun_agent_engine/tests/unit/agent/test_validation.py
"""Unit tests for validate_graph_definition."""
from __future__ import annotations

from pathlib import Path

import pytest

from idun_agent_engine.agent.validation import (
    GraphValidationCode,
    validate_graph_definition,
)


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    return tmp_path


def _write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)


def test_file_not_found(project_root: Path) -> None:
    result = validate_graph_definition(
        framework="langgraph",
        definition="./missing.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.FILE_NOT_FOUND
    assert "missing.py" in result.message


def test_import_error(project_root: Path) -> None:
    _write(project_root / "broken.py", "import nonexistent_top_level_module_xyz\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./broken.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.IMPORT_ERROR


def test_attribute_not_found(project_root: Path) -> None:
    _write(project_root / "agent.py", "x = 1\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.ATTRIBUTE_NOT_FOUND
    assert "graph" in result.message


def test_wrong_type(project_root: Path) -> None:
    _write(project_root / "agent.py", "graph = 'not a state graph'\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.WRONG_TYPE


def test_happy_path_state_graph(project_root: Path) -> None:
    _write(
        project_root / "agent.py",
        """
from typing import TypedDict
from langgraph.graph import StateGraph

class State(TypedDict):
    x: int

graph = StateGraph(State)
graph.add_node("noop", lambda s: s)
graph.set_entry_point("noop")
graph.set_finish_point("noop")
""".strip(),
    )
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is True
    assert result.code is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_validation.py -v
```

Expected: 5 failures — module not found.

- [ ] **Step 3: Implement `validate_graph_definition`**

```python
# libs/idun_agent_engine/src/idun_agent_engine/agent/validation.py
"""Save-time file-reference validation for agent definitions.

Extracted from ``LanggraphAgent._load_graph_builder`` so callers
(notably ``idun_agent_standalone``'s reload pipeline) can probe a
``graph_definition`` string without booting a full engine. Returns a
result envelope mirroring the connection-check pattern used elsewhere
in the standalone admin surface.

Scope:
- LangGraph only in the first cut. ADK / Haystack land as follow-ups
  when their adapters are reworked.
- Import + lookup + isinstance check only. Compile is intentionally
  NOT run here — that side-effect would fire on every save and is
  already exercised at engine init time.
"""

from __future__ import annotations

import importlib
import importlib.util
from enum import StrEnum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel


class GraphValidationCode(StrEnum):
    FILE_NOT_FOUND = "file_not_found"
    IMPORT_ERROR = "import_error"
    ATTRIBUTE_NOT_FOUND = "attribute_not_found"
    WRONG_TYPE = "wrong_type"


class GraphValidationResult(BaseModel):
    ok: bool
    code: GraphValidationCode | None = None
    message: str = ""
    hint: str | None = None


Framework = Literal["langgraph"]  # ADK / Haystack added when their adapters are reworked


def validate_graph_definition(
    framework: Framework,
    definition: str,
    project_root: Path,
) -> GraphValidationResult:
    """Probe a `graph_definition` string without compiling.

    Tries the file path first, then a Python module-path fallback,
    matching the engine's existing import logic. Returns ``ok=False``
    with a structured ``code`` on the first failure encountered;
    ``ok=True`` only when import + attribute lookup + isinstance
    check all succeed.
    """
    if framework != "langgraph":
        # Out of scope for the first cut — fail closed so callers don't
        # silently treat unknown frameworks as valid.
        return GraphValidationResult(
            ok=False,
            code=GraphValidationCode.WRONG_TYPE,
            message=f"Validation for framework '{framework}' is not implemented.",
        )

    try:
        module_path, var_name = definition.rsplit(":", 1)
    except ValueError:
        return GraphValidationResult(
            ok=False,
            code=GraphValidationCode.FILE_NOT_FOUND,
            message=(
                "Definition must be in the format 'path/to/file.py:variable' "
                "or 'module.path:variable'."
            ),
        )

    if not module_path.endswith(".py"):
        module_path_with_py = module_path + ".py"
    else:
        module_path_with_py = module_path

    resolved = (project_root / module_path_with_py).resolve()
    loaded_module: Any | None = None

    if resolved.is_file():
        try:
            spec = importlib.util.spec_from_file_location(var_name, str(resolved))
            if spec is None or spec.loader is None:
                return GraphValidationResult(
                    ok=False,
                    code=GraphValidationCode.IMPORT_ERROR,
                    message=f"Could not load spec for {resolved}.",
                )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            loaded_module = module
        except ImportError as exc:
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.IMPORT_ERROR,
                message=str(exc),
            )
        except Exception as exc:
            # Top-level user code can raise anything during import.
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.IMPORT_ERROR,
                message=f"{type(exc).__name__}: {exc}",
            )
    else:
        # Fallback: try Python module path
        module_import_path = (
            module_path_with_py[:-3]
            if module_path_with_py.endswith(".py")
            else module_path_with_py
        )
        try:
            loaded_module = importlib.import_module(module_import_path)
        except ImportError as exc:
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.FILE_NOT_FOUND,
                message=(
                    f"Could not find file '{module_path_with_py}' or import "
                    f"module '{module_import_path}': {exc}"
                ),
            )
        except Exception as exc:
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.IMPORT_ERROR,
                message=f"{type(exc).__name__}: {exc}",
            )

    if not hasattr(loaded_module, var_name):
        available = [n for n in vars(loaded_module) if not n.startswith("_")]
        hint = None
        if available:
            close = [n for n in available if n.lower() == var_name.lower()]
            if close:
                hint = f"Did you mean '{close[0]}'?"
        return GraphValidationResult(
            ok=False,
            code=GraphValidationCode.ATTRIBUTE_NOT_FOUND,
            message=f"Variable '{var_name}' not found in {module_path}.",
            hint=hint,
        )

    candidate = getattr(loaded_module, var_name)

    # Lazy import to avoid circular dependency at module load and to
    # keep the engine import surface thin for callers that only need
    # the validation enums.
    from langgraph.graph import StateGraph
    from langgraph.graph.state import CompiledStateGraph

    if not isinstance(candidate, (StateGraph, CompiledStateGraph)):
        return GraphValidationResult(
            ok=False,
            code=GraphValidationCode.WRONG_TYPE,
            message=(
                f"Variable '{var_name}' in {module_path} is "
                f"{type(candidate).__name__}, expected StateGraph."
            ),
        )

    return GraphValidationResult(ok=True)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_validation.py -v
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/validation.py \
        libs/idun_agent_engine/tests/unit/agent/test_validation.py
git commit -m "feat(engine): validate_graph_definition callable for save-time probing"
```

---

## Task 2: Engine — `_load_graph_builder` delegates to `validate_graph_definition`

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`

The existing `_load_graph_builder` does import + lookup + (later) compile. The compile step stays where it is. Refactor the import + lookup to call into `validate_graph_definition`, falling through to the existing `_validate_graph_builder` for the type-check + CompiledStateGraph handling.

- [ ] **Step 1: Add the import at the top of langgraph.py**

Open `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` and add (alongside other imports):

```python
from idun_agent_engine.agent.validation import (
    GraphValidationCode,
    validate_graph_definition,
)
```

- [ ] **Step 2: Replace the `_load_graph_builder` body**

Find the existing `_load_graph_builder` (lines ~458-514) and replace its body with:

```python
    def _load_graph_builder(self, graph_definition: str) -> StateGraph:
        """Loads a StateGraph instance from a specified path.

        Delegates the import + attribute lookup to ``validate_graph_definition``
        so the standalone admin surface can probe save-time without booting
        a full engine. Compilation and the ``CompiledStateGraph`` extraction
        remain here; this function still returns a real ``StateGraph``.
        """
        from pathlib import Path

        result = validate_graph_definition(
            framework="langgraph",
            definition=graph_definition,
            project_root=Path.cwd(),
        )

        if not result.ok:
            # Translate the structured failure into the engine's existing
            # ``ValueError`` contract so call sites that already rescue it
            # (the standalone reload pipeline catches this and re-raises
            # as ReloadInitFailed) keep working.
            raise ValueError(result.message)

        # The validator has already proved this resolves and is the right
        # type. Re-resolve to the actual object now.
        try:
            module_path, graph_variable_name = graph_definition.rsplit(":", 1)
        except ValueError as exc:
            raise ValueError(
                "graph_definition must be in the format 'path/to/file.py:variable_name'"
            ) from exc

        if not module_path.endswith(".py"):
            module_path += ".py"

        resolved_path = Path(module_path).resolve()
        if resolved_path.is_file():
            spec = importlib.util.spec_from_file_location(
                graph_variable_name, str(resolved_path)
            )
            if spec is None or spec.loader is None:
                raise ValueError(
                    f"Could not load spec for module at {module_path}"
                )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        else:
            module_import_path = module_path[:-3]
            module = importlib.import_module(module_import_path)

        graph_builder = getattr(module, graph_variable_name)
        return self._validate_graph_builder(
            graph_builder, module_path, graph_variable_name
        )
```

(The `_validate_graph_builder` helper at lines ~518-557 is unchanged — it still handles the `CompiledStateGraph` → `StateGraph` extraction.)

- [ ] **Step 3: Run engine tests to confirm no regression**

```bash
uv run pytest libs/idun_agent_engine/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS (engine tests still green; no behavior change for existing call sites).

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py
git commit -m "refactor(engine): _load_graph_builder delegates import+lookup to validate_graph_definition"
```

---

## Task 3: Standalone — round-2.5 invocation in reload pipeline

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`
- Test: `libs/idun_agent_standalone/tests/unit/services/test_reload.py` (existing — extend it)

- [ ] **Step 1: Write the failing test**

Append to `libs/idun_agent_standalone/tests/unit/services/test_reload.py`:

```python
@pytest.mark.asyncio
async def test_round_two_and_a_half_blocks_bad_graph_definition(
    sessionmaker_with_agent_row_pointing_at_missing_file,
    successful_reload_callable,
):
    """A broken graph_definition must be caught at round 2.5 with a
    field-mapped 422, before the reload callable runs."""
    async with sessionmaker_with_agent_row_pointing_at_missing_file() as session:
        async with reload._reload_mutex:
            with pytest.raises(AdminAPIError) as info:
                await reload.commit_with_reload(
                    session,
                    reload_callable=successful_reload_callable,
                )
    assert info.value.status_code == 422
    field_paths = [fe.field for fe in info.value.error.field_errors or []]
    assert "agent.config.graphDefinition" in field_paths
    # successful_reload_callable.calls is the count fixture exposes
    assert successful_reload_callable.calls == 0
```

The fixture `sessionmaker_with_agent_row_pointing_at_missing_file` exists if not; add to the existing test conftest. Mirror existing `agent_row_with` patterns. The `successful_reload_callable` fixture wraps a reload callable that records its call count in `.calls`.

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_reload.py::test_round_two_and_a_half_blocks_bad_graph_definition -v
```

Expected: FAIL — round 2.5 doesn't exist yet, so the bad definition flows through to round 3 and fails there with code `reload_failed` instead of `validation_failed`.

- [ ] **Step 3: Insert round 2.5 in `commit_with_reload`**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py` and add after the existing round-2 block (just before the structural-hash computation around line 192). The new block:

```python
    # Round 2.5 — file-reference probe for the agent's graph_definition.
    # Catches broken file paths, missing variables, and wrong types
    # before the engine is asked to compile. Failures map to
    # field_errors[agent.config.graphDefinition].
    if assembled.agent.type.value == "LANGGRAPH":
        graph_def = getattr(assembled.agent.config, "graph_definition", None)
        if graph_def:
            from pathlib import Path

            from idun_agent_engine.agent.validation import (
                validate_graph_definition,
            )

            probe = validate_graph_definition(
                framework="langgraph",
                definition=graph_def,
                project_root=Path.cwd(),
            )
            if not probe.ok:
                from idun_agent_schema.standalone import StandaloneFieldError

                await session.rollback()
                logger.info(
                    "reload.round2_5_failed code=%s",
                    probe.code.value if probe.code else "unknown",
                )
                raise AdminAPIError(
                    status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                    error=StandaloneAdminError(
                        code=StandaloneErrorCode.VALIDATION_FAILED,
                        message="Graph definition could not be loaded.",
                        field_errors=[
                            StandaloneFieldError(
                                field="agent.config.graphDefinition",
                                message=probe.message
                                + (f" {probe.hint}" if probe.hint else ""),
                                code=probe.code.value if probe.code else "invalid",
                            ),
                        ],
                    ),
                )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_reload.py -v
```

Expected: ALL PASS (existing tests + the new round-2.5 test).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py \
        libs/idun_agent_standalone/tests/unit/services/test_reload.py
git commit -m "feat(standalone): round 2.5 file-ref probe in reload pipeline"
```

---

## Task 4: Standalone — `services/error_classifier.py`

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/services/error_classifier.py`
- Create: `libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py`

- [ ] **Step 1: Write the failing tests**

```python
# libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py
"""Unit tests for classify_reload_error."""
from __future__ import annotations

import pytest
from idun_agent_schema.standalone import StandaloneErrorCode

from idun_agent_standalone.services.error_classifier import (
    ReloadFailureCode,
    classify_reload_error,
)


def _engine_config_stub():
    """Stub engine config: only the attributes accessed by the classifier."""
    class _M:
        class _C:
            db_url = "postgresql://localhost:5432/agent"
        config = _C()
    class _O:
        class _C:
            host = "https://cloud.langfuse.com"
        config = _C()
    class _Cfg:
        memory = _M()
        observability = [_O()]
    return _Cfg()


def test_import_error_maps_to_graph_definition() -> None:
    err = classify_reload_error(
        ImportError("no module named 'foo'"), _engine_config_stub()
    )
    assert err.code == StandaloneErrorCode.RELOAD_FAILED
    assert any(
        fe.field == "agent.config.graphDefinition"
        and fe.code == ReloadFailureCode.IMPORT_ERROR.value
        for fe in (err.field_errors or [])
    )


def test_postgres_connection_error_maps_to_memory_db_url() -> None:
    err = classify_reload_error(
        ConnectionError("could not connect to server postgresql://localhost:5432"),
        _engine_config_stub(),
    )
    assert any(
        fe.field == "memory.config.dbUrl"
        and fe.code == ReloadFailureCode.CONNECTION_ERROR.value
        for fe in (err.field_errors or [])
    )


def test_keyerror_for_env_var_lands_in_details() -> None:
    err = classify_reload_error(
        KeyError("OPENAI_API_KEY"), _engine_config_stub()
    )
    assert err.field_errors == [] or err.field_errors is None
    assert err.details is not None
    assert err.details.get("envVar") == "OPENAI_API_KEY"
    assert "OPENAI_API_KEY" in err.message


def test_unknown_exception_falls_through() -> None:
    err = classify_reload_error(
        RuntimeError("mystery"), _engine_config_stub()
    )
    assert (err.field_errors or []) == []
    assert "mystery" in err.message
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py -v
```

Expected: 4 failures — module not found.

- [ ] **Step 3: Implement the classifier**

```python
# libs/idun_agent_standalone/src/idun_agent_standalone/services/error_classifier.py
"""Classify round-3 reload failures into structured admin errors.

The reload pipeline catches ``ReloadInitFailed`` and currently emits a
flat ``code=reload_failed`` envelope. This classifier converts the
underlying exception into a bounded taxonomy with field paths and
extras (``details.envVar``, ``details.upstream``) so the UI can
highlight the wrong field instead of toasting a generic message.
"""

from __future__ import annotations

import re
from enum import StrEnum

from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)


class ReloadFailureCode(StrEnum):
    IMPORT_ERROR = "import_error"
    CONNECTION_ERROR = "connection_error"
    ENV_UNSET = "env_unset"
    COMPILE_ERROR = "compile_error"
    INIT_FAILED_UNKNOWN = "init_failed_unknown"


_ENV_VAR_PATTERN = re.compile(r"[A-Z][A-Z0-9_]+")


def classify_reload_error(
    exc: BaseException,
    engine_config: object,
) -> StandaloneAdminError:
    """Translate a round-3 exception into a structured admin error.

    The classifier consults the assembled engine_config to map errors
    to specific resource fields when the exception is unambiguous
    (postgres ConnectionError → memory.config.dbUrl, etc.).
    """
    message = f"{type(exc).__name__}: {exc}"

    # ImportError → almost always the graph definition
    if isinstance(exc, ImportError):
        return StandaloneAdminError(
            code=StandaloneErrorCode.RELOAD_FAILED,
            message=message,
            field_errors=[
                StandaloneFieldError(
                    field="agent.config.graphDefinition",
                    message=str(exc),
                    code=ReloadFailureCode.IMPORT_ERROR.value,
                ),
            ],
        )

    # KeyError that looks like an env var (uppercase, underscores, all-caps)
    if isinstance(exc, KeyError) and exc.args:
        key = str(exc.args[0]).strip("'\"")
        if _ENV_VAR_PATTERN.fullmatch(key):
            return StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message=f"Missing environment variable: {key}",
                details={"envVar": key},
            )

    # ConnectionError / OperationalError — try to pin to memory or observability
    name = type(exc).__name__
    if name in {"ConnectionError", "OperationalError", "OSError"}:
        text = str(exc).lower()
        memory = getattr(engine_config, "memory", None)
        memory_url = (
            getattr(getattr(memory, "config", None), "db_url", None)
            if memory is not None
            else None
        )
        if memory_url and any(
            tok in text
            for tok in ("postgres", "psycopg", str(memory_url).split("@")[-1].lower())
        ):
            return StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message=message,
                field_errors=[
                    StandaloneFieldError(
                        field="memory.config.dbUrl",
                        message=str(exc),
                        code=ReloadFailureCode.CONNECTION_ERROR.value,
                    ),
                ],
                details={"upstream": str(memory_url)},
            )
        # Try observability hosts
        observability = getattr(engine_config, "observability", []) or []
        for entry in observability:
            host = getattr(getattr(entry, "config", None), "host", None)
            if host and str(host).lower() in text:
                return StandaloneAdminError(
                    code=StandaloneErrorCode.RELOAD_FAILED,
                    message=message,
                    field_errors=[
                        StandaloneFieldError(
                            field="observability.config.host",
                            message=str(exc),
                            code=ReloadFailureCode.CONNECTION_ERROR.value,
                        ),
                    ],
                    details={"upstream": str(host)},
                )

    # Unknown — pass through
    return StandaloneAdminError(
        code=StandaloneErrorCode.RELOAD_FAILED,
        message=message,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py -v
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/error_classifier.py \
        libs/idun_agent_standalone/tests/unit/services/test_error_classifier.py
git commit -m "feat(standalone): error_classifier for round-3 reload failures"
```

---

## Task 5: Standalone — route round-3 errors through the classifier

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`

- [ ] **Step 1: Write the failing test**

Append to `libs/idun_agent_standalone/tests/unit/services/test_reload.py`:

```python
@pytest.mark.asyncio
async def test_round_three_import_error_emits_field_errors(
    sessionmaker_with_agent_row,
    failing_reload_with_import_error,
):
    """Round-3 ImportError must surface as field_errors on graphDefinition."""
    async with sessionmaker_with_agent_row() as session:
        async with reload._reload_mutex:
            with pytest.raises(AdminAPIError) as info:
                await reload.commit_with_reload(
                    session,
                    reload_callable=failing_reload_with_import_error,
                )
    assert info.value.status_code == 500
    paths = [fe.field for fe in info.value.error.field_errors or []]
    assert "agent.config.graphDefinition" in paths
```

`failing_reload_with_import_error` is a fixture-provided callable that raises `ReloadInitFailed("ImportError: no module named 'app'")` (or wraps a real ImportError in ReloadInitFailed). Add it to the test conftest near the existing reload-callable fixtures.

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_reload.py::test_round_three_import_error_emits_field_errors -v
```

Expected: FAIL — current code emits `code=RELOAD_FAILED` with `details.recovered=true`, no field_errors.

- [ ] **Step 3: Update the round-3 catch in `commit_with_reload`**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py`. Change `ReloadInitFailed` to wrap the original exception so the classifier has a real type to inspect. First update the exception class (around line 67):

```python
class ReloadInitFailed(Exception):  # noqa: N818
    """Raised when round 3 (engine reload via reload_callable) fails.

    Carries the original exception so callers can classify it.
    """

    def __init__(self, message: str, *, original: BaseException | None = None) -> None:
        super().__init__(message)
        self.original = original
```

Update the round-3 catch (current lines ~213-234) to:

```python
    try:
        await reload_callable(assembled)
    except ReloadInitFailed as exc:
        from idun_agent_standalone.services.error_classifier import (
            classify_reload_error,
        )

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
        admin_error = classify_reload_error(
            exc.original or exc, assembled
        )
        # Always include the recovered marker so the UI knows the prior
        # config is still live.
        details = dict(admin_error.details or {})
        details["recovered"] = True
        admin_error.details = details
        raise AdminAPIError(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=admin_error,
        ) from exc
```

- [ ] **Step 4: Update the standalone reload callable that raises `ReloadInitFailed`**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/services/engine_reload.py` (or wherever `ReloadInitFailed` is currently raised in `build_engine_reload_callable`). Find the existing raise pattern and update it to pass the original exception:

```python
        except Exception as exc:
            raise ReloadInitFailed(
                f"Engine init failed: {exc}", original=exc
            ) from exc
```

(If the existing code already does this, leave it — search first.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/services/test_reload.py -v
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/services/engine_reload.py \
        libs/idun_agent_standalone/tests/unit/services/test_reload.py
git commit -m "feat(standalone): classify round-3 reload errors with field paths"
```

---

## Task 6: Standalone — `?dryRun=true` on agent PATCH

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py`
- Test: `libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py` (existing — extend)

- [ ] **Step 1: Inspect the agent router**

```bash
cat libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py
```

Identify the `PATCH ""` handler (singleton agent) and the lines around `commit_with_reload(...)`.

- [ ] **Step 2: Write the failing tests**

Append to `libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py`:

```python
@pytest.mark.asyncio
async def test_patch_dry_run_skips_commit_and_reload(
    standalone, configured_agent_row, sessionmaker
):
    """Dry-run on a valid PATCH must return reload.status=not_attempted
    and leave the DB unchanged."""
    transport = ASGITransport(app=standalone)
    async with sessionmaker() as session:
        before = await session.execute(select(StandaloneAgentRow))
        before_count = len(before.scalars().all())

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent?dryRun=true",
            json={"name": "renamed-via-dry-run"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "not_attempted"

    async with sessionmaker() as session:
        after = await session.execute(select(StandaloneAgentRow))
        after_rows = after.scalars().all()
    assert len(after_rows) == before_count
    assert after_rows[0].name != "renamed-via-dry-run"


@pytest.mark.asyncio
async def test_patch_dry_run_with_bad_graph_definition_returns_422(
    standalone, configured_agent_row, sessionmaker
):
    """Dry-run on a body that would fail round 2.5 returns 422 with field_errors."""
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent?dryRun=true",
            json={
                "baseEngineConfig": {
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "x",
                            "graph_definition": "./missing.py:graph",
                        },
                    }
                }
            },
        )
    assert response.status_code == 422
    body = response.json()
    paths = [fe["field"] for fe in body["error"]["fieldErrors"]]
    assert "agent.config.graphDefinition" in paths
```

The existing `configured_agent_row` fixture seeds an agent into the test DB. The schema for `StandaloneReloadStatus` currently has `RELOADED / RESTART_REQUIRED / RELOAD_FAILED` — extending it to add `NOT_ATTEMPTED` is part of step 4 below.

- [ ] **Step 3: Run tests to verify they fail**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py::test_patch_dry_run_skips_commit_and_reload \
              libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py::test_patch_dry_run_with_bad_graph_definition_returns_422 \
              -v
```

Expected: failures — `?dryRun=true` is ignored (current router commits anyway).

- [ ] **Step 4: Add `NOT_ATTEMPTED` to the reload status enum**

Open `libs/idun_agent_schema/src/idun_agent_schema/standalone/reload.py` (or wherever `StandaloneReloadStatus` is defined; check via `grep -rn "class StandaloneReloadStatus" libs/idun_agent_schema/`). Add the new variant:

```python
class StandaloneReloadStatus(StrEnum):
    RELOADED = "reloaded"
    RESTART_REQUIRED = "restart_required"
    RELOAD_FAILED = "reload_failed"
    NOT_ATTEMPTED = "not_attempted"
```

- [ ] **Step 5: Add the dry-run parameter to the agent PATCH handler**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py`. Find the existing `patch_agent` handler. Add the `dry_run: bool = Query(...)` parameter and short-circuit before `commit_with_reload`. Concrete shape:

```python
from fastapi import APIRouter, Query

# ... existing imports ...

@router.patch("", response_model=StandaloneMutationResponse[StandaloneAgentRead])
async def patch_agent(
    body: StandaloneAgentPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
    dry_run: bool = Query(default=False, alias="dryRun"),
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Apply a shallow update to the singleton agent row.

    With ``?dryRun=true``, runs rounds 1 + 2 + 2.5 (Pydantic, assembled
    config validation, graph_definition probe) but skips the DB commit
    and the engine reload. Returns ``reload.status="not_attempted"``.
    """
    # ... existing body application logic up to session.flush() ...

    if dry_run:
        # Round 2 — re-assemble + validate without commit.
        from idun_agent_standalone.services.engine_config import (
            AssemblyError,
            assemble_engine_config,
        )
        from idun_agent_standalone.services.validation import (
            RoundTwoValidationFailed,
            validate_assembled_config,
        )

        try:
            assembled = await assemble_engine_config(session)
        except AssemblyError as exc:
            await session.rollback()
            field_errors = (
                field_errors_from_validation_error(exc.validation_error)
                if exc.validation_error is not None
                else []
            )
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="Assembled config failed validation.",
                    field_errors=field_errors,
                ),
            ) from exc

        try:
            validate_assembled_config(assembled)
        except RoundTwoValidationFailed as exc:
            await session.rollback()
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="Assembled config failed validation.",
                    field_errors=exc.field_errors,
                ),
            ) from exc

        # Round 2.5 — file-ref probe.
        if assembled.agent.type.value == "LANGGRAPH":
            graph_def = getattr(assembled.agent.config, "graph_definition", None)
            if graph_def:
                from pathlib import Path

                from idun_agent_engine.agent.validation import (
                    GraphValidationCode,
                    validate_graph_definition,
                )

                probe = validate_graph_definition(
                    framework="langgraph",
                    definition=graph_def,
                    project_root=Path.cwd(),
                )
                if not probe.ok:
                    await session.rollback()
                    raise AdminAPIError(
                        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                        error=StandaloneAdminError(
                            code=StandaloneErrorCode.VALIDATION_FAILED,
                            message="Graph definition could not be loaded.",
                            field_errors=[
                                StandaloneFieldError(
                                    field="agent.config.graphDefinition",
                                    message=probe.message
                                    + (f" {probe.hint}" if probe.hint else ""),
                                    code=probe.code.value if probe.code else "invalid",
                                ),
                            ],
                        ),
                    )

        await session.rollback()  # discard the staged mutation
        await session.refresh(row)
        return StandaloneMutationResponse(
            data=_to_read(row),
            reload=StandaloneReloadResult(
                status=StandaloneReloadStatus.NOT_ATTEMPTED,
                message="Dry run — no changes committed.",
            ),
        )

    # Real save path — unchanged
    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    return StandaloneMutationResponse(data=_to_read(row), reload=result)
```

(Adapt the surrounding code structure — body-application logic before flush, response shape — to whatever the existing handler does. The dry-run insertion is between body application and the real `commit_with_reload` call.)

- [ ] **Step 6: Run integration tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py -v
```

Expected: ALL PASS, including the two new dry-run tests.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/standalone/reload.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py \
        libs/idun_agent_standalone/tests/integration/api/v1/test_agent_route.py
git commit -m "feat(standalone): ?dryRun=true on agent PATCH"
```

---

## Task 7: Frontend — accept `dryRun` flag in `api.patchAgent`

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts`

- [ ] **Step 1: Update the wrapper signature**

Open `services/idun_agent_standalone_ui/lib/api/index.ts`. Find the existing `patchAgent`:

```typescript
  patchAgent: (body: AgentPatch) =>
    apiFetch<MutationResponse<AgentRead>>(`${ADMIN}/agent`, {
      method: "PATCH",
      body: j(body),
    }),
```

Replace with:

```typescript
  patchAgent: (body: AgentPatch, opts?: { dryRun?: boolean }) =>
    apiFetch<MutationResponse<AgentRead>>(
      `${ADMIN}/agent${opts?.dryRun ? "?dryRun=true" : ""}`,
      {
        method: "PATCH",
        body: j(body),
      },
    ),
```

- [ ] **Step 2: Confirm existing tests still pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS (existing call sites without `opts` continue to work — the second arg is optional).

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/index.ts
git commit -m "feat(standalone-ui): patchAgent accepts dryRun option"
```

---

## Task 8: Frontend — `useBlurDryRun` hook

**Files:**
- Create: `services/idun_agent_standalone_ui/hooks/use-blur-dry-run.ts`
- Create: `services/idun_agent_standalone_ui/__tests__/hooks/use-blur-dry-run.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// services/idun_agent_standalone_ui/__tests__/hooks/use-blur-dry-run.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useBlurDryRun } from "@/hooks/use-blur-dry-run";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useBlurDryRun", () => {
  it("calls the mutation function with the current value on blur", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.run("./agent.py:graph");
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledWith("./agent.py:graph");
  });

  it("does not re-run for identical consecutive values", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError: () => {} }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.run("./a.py:g");
      await result.current.run("./a.py:g");
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it("forwards mutation errors to the provided onError callback", async () => {
    const error = new Error("boom");
    const mutationFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.run("./a.py:g");
    });
    expect(onError).toHaveBeenCalledWith(error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/hooks/use-blur-dry-run.test.tsx
```

Expected: 3 failures — module not found.

- [ ] **Step 3: Implement the hook**

```typescript
// services/idun_agent_standalone_ui/hooks/use-blur-dry-run.ts
"use client";

import { useRef } from "react";

type Args<T> = {
  mutationFn: (value: string) => Promise<T>;
  onError: (err: unknown) => void;
};

/**
 * Triggers a dry-run mutation when the user pauses (typically on
 * `onBlur`) and skips re-runs when the value is identical to the
 * last one.
 *
 * No debounce, no in-flight cancellation, no race handling — when the
 * user pauses, the call runs once. If they keep editing and tab out
 * again with a different value, it runs again.
 */
export function useBlurDryRun<T>({ mutationFn, onError }: Args<T>) {
  const last = useRef<string | null>(null);

  async function run(value: string): Promise<void> {
    if (value === last.current) return;
    last.current = value;
    try {
      await mutationFn(value);
    } catch (err) {
      onError(err);
    }
  }

  function reset(): void {
    last.current = null;
  }

  return { run, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/hooks/use-blur-dry-run.test.tsx
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/hooks/use-blur-dry-run.ts \
        services/idun_agent_standalone_ui/__tests__/hooks/use-blur-dry-run.test.tsx
git commit -m "feat(standalone-ui): useBlurDryRun hook"
```

---

## Task 9: Frontend — wire dry-run on the agent page `definition` field

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1: Add the regex to the zod schema**

Find the existing form schema:

```tsx
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  definition: z.string().min(1, "Definition is required"),
});
```

Replace with:

```tsx
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  definition: z
    .string()
    .min(1, "Definition is required")
    .regex(
      /^[^\s:]+:[A-Za-z_]\w*$/,
      "Use the format `path/file.py:variable` or `module.path:variable`",
    ),
});
```

- [ ] **Step 2: Add imports**

In the import block of `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`:

```tsx
import { useBlurDryRun } from "@/hooks/use-blur-dry-run";
import { applyFieldErrors } from "@/lib/api/form-errors";
```

(`applyFieldErrors` may already be imported from Bundle A — leave it alone if so.)

- [ ] **Step 3: Add the hook + wire it into the form field**

Inside the `AgentPage` component, after `const form = useForm<...>` and before the `save` mutation, add:

```tsx
  const dryRun = useBlurDryRun({
    mutationFn: async (definition: string) => {
      // Reuse the page's current form values for everything else, only
      // override the definition. The backend will run rounds 1+2+2.5
      // and return either 200 + not_attempted or 422 with field_errors.
      const v = form.getValues();
      return api.patchAgent(
        {
          baseEngineConfig: buildBaseEngineConfig(
            data?.baseEngineConfig,
            activeTab,
            definition,
            v.name,
          ),
        } as AgentPatch,
        { dryRun: true },
      );
    },
    onError: (err) => {
      applyFieldErrors(form, err, {
        "agent.config.graphDefinition": "definition",
      });
    },
  });
```

Find the `definition` field's `<Input>` and add an `onBlur` handler:

```tsx
                      <Input
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          if (e.target.value) {
                            void dryRun.run(e.target.value);
                          }
                        }}
                        placeholder={
                          activeTab === "adk"
                            ? "./agent/agent.py:root_agent"
                            : "./agent.py:graph"
                        }
                      />
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "feat(standalone-ui): blur-triggered dry-run on agent definition field"
```

---

## Task 10: Acceptance gates + PR

- [ ] **Step 1: Engine narrowed pytest gate**

```bash
uv run pytest libs/idun_agent_engine/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS.

- [ ] **Step 2: Standalone narrowed pytest gate**

```bash
uv run pytest libs/idun_agent_standalone/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS.

- [ ] **Step 3: Frontend vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 4: Pre-commit**

```bash
make precommit
```

Expected: clean.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/config-ux-file-ref
gh pr create --base feat/config-ux --title "feat(config-ux/B): file-reference validation pipeline" --body "$(cat <<'EOF'
## Summary

Bundle B from the config-UX umbrella. Catches broken `graph_definition`
inputs at save time with field-mapped errors instead of letting them
fall through to round 3.

- Engine: extracted `validate_graph_definition` callable; `_load_graph_builder` delegates import + lookup to it.
- Standalone: round-2.5 invocation in `commit_with_reload`; `error_classifier.py` for round-3 taxonomy; `?dryRun=true` query flag on agent PATCH.
- Frontend: structural regex on the `definition` zod field; `useBlurDryRun` hook fires the dry-run on field blur and routes failures through Bundle A's `applyFieldErrors`.

## Spec
`docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` — Bundle B section.

## Test plan
- [x] engine narrowed pytest gate (incl. 5 new validation tests)
- [x] standalone narrowed pytest gate (incl. round-2.5 + classifier + dry-run integration)
- [x] vitest (incl. 3 new useBlurDryRun tests)
- [x] make precommit
- [x] dry-run smoke: bad config → 422 with `agent.config.graphDefinition`; DB row count unchanged

## Depends on
PR-1 (Bundle A) for `applyFieldErrors`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (already applied)

- Spec coverage: every Bundle B item maps to a task — engine refactor (Tasks 1-2), round 2.5 (Task 3), classifier (Tasks 4-5), dry-run query flag (Task 6), frontend regex + hook + wiring (Tasks 7-9).
- The spec mentioned "ADK / Haystack" out-of-scope; the Python `Framework` literal is `"langgraph"` only, with a fail-closed branch for unknown frameworks.
- `ReloadInitFailed` extension to carry `original` is necessary for the classifier to inspect a real exception type — added in Task 5.
- `StandaloneReloadStatus.NOT_ATTEMPTED` is a new enum variant — added in Task 6 step 4. The Bundle A frontend `RuntimeStatus` type already lists `"reloaded" | "restart_required" | "reload_failed"`. Adding `"not_attempted"` to the TS union belongs here too:
  - Task 7 step 1 should also widen the TS type. Append to that step:

```typescript
// services/idun_agent_standalone_ui/lib/api/types/runtime.ts (Bundle A added this file)
export type ReloadStatusKind =
  | "reloaded"
  | "restart_required"
  | "reload_failed"
  | "not_attempted";
```

Apply this change as part of Task 7 step 1 if Bundle A has already merged.

- Round-2.5 test fixture names assume conventions used by the existing `tests/unit/services/test_reload.py` — confirm fixture names match before committing; rename if needed.
