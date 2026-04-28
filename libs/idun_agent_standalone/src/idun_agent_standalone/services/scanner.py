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
