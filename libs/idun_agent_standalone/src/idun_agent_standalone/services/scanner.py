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
import json
import os
import re
import time
import tomllib
from pathlib import Path

import yaml
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

_LANGGRAPH_IMPORT_RE = re.compile(r"(?m)^\s*(from\s+langgraph[\s.]|import\s+langgraph)")
_ADK_IMPORT_RE = re.compile(r"(?m)^\s*(from\s+google\.adk|import\s+google\.adk)")
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

        # Flips ONLY after the full chain validates (type, config dict,
        # parseable target, non-empty rel + variable). Moving this above
        # the empty-rel check would flip the flag on a partially-valid
        # config and confuse the wizard's state classification.
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
        if depth >= max_depth:
            dirnames[:] = []
        else:
            dirnames[:] = [d for d in dirnames if not _is_skipped(d)]
        for filename in filenames:
            if filename in ("config.yaml", "config.yml"):
                path = Path(dirpath) / filename
                try:
                    if path.stat().st_size > _MAX_FILE_BYTES:
                        continue
                except OSError:
                    continue
                yield path


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

    # Rule 6: stripped stem was empty (e.g. ``agent.py``) — user-visible fallback.
    return "My Agent"


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
        d.model_copy(update={"inferred_name": _infer_name(d, root)}) for d in deduped
    ]

    duration_ms = int((time.monotonic() - started) * 1000)
    return ScanResult(
        root=str(root),
        detected=detected,
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=duration_ms,
    )
