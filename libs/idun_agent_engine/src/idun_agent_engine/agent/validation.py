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


Framework = Literal[
    "langgraph"
]  # ADK / Haystack added when their adapters are reworked


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
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.IMPORT_ERROR,
                message=f"{type(exc).__name__}: {exc}",
            )
    else:
        looks_like_path = (
            module_path.endswith(".py")
            or "/" in module_path
            or module_path.startswith(".")
        )
        module_import_path = (
            module_path_with_py[:-3]
            if module_path_with_py.endswith(".py")
            else module_path_with_py
        )
        if looks_like_path:
            return GraphValidationResult(
                ok=False,
                code=GraphValidationCode.FILE_NOT_FOUND,
                message=(
                    f"Could not find file '{module_path_with_py}' "
                    f"(resolved to {resolved})."
                ),
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
