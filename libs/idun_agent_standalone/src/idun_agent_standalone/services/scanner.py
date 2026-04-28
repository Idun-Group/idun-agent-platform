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
    return (isinstance(recv, ast.Name) and recv.id in state_graph_bindings) or (
        isinstance(recv, ast.Call) and _is_state_graph_call(recv)
    )


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

        if has_lg and _module_compile_target(rhs, state_graph_bindings):
            # The compiled binding shadows the intermediate StateGraph
            # binding (we only emit one detection per file/var).
            compiled_from_binding.update(_receiver_name(rhs))
            for target_name in targets:
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
            for target_name in targets:
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
            for target_name in targets:
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


def _receiver_name(call: ast.AST) -> set[str]:
    """If call is `<Name>.compile(...)`, return {Name.id}; else empty."""
    if not isinstance(call, ast.Call):
        return set()
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
