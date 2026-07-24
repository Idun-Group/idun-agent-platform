"""Shared helpers for dynamically loading user agent modules from a file path.

Both the LangGraph and ADK adapters import the user's agent file directly via
``importlib.util.spec_from_file_location``. That call bypasses Python's normal
import machinery and never puts the agent's project root on ``sys.path`` — so an
agent file that uses absolute, package-relative imports (e.g.
``from app.config import config``) fails to boot with ``ModuleNotFoundError``.

``ensure_import_root`` restores the missing behaviour by placing the agent
file's package/project root on ``sys.path`` before the module is executed.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_INIT_FILE = "__init__.py"
# Files that mark the root of a Python project. Used to locate the import root
# for implicit namespace packages (PEP 420), which have no __init__.py chain.
_ROOT_MARKERS = ("pyproject.toml", "setup.py", "setup.cfg")


def _package_root(file_dir: Path) -> Path:
    """Return the top of the ``__init__.py`` (regular-package) chain.

    Walks up while each directory is a regular package. For a file at
    ``.../myproject/app/agent.py`` where ``app`` is a regular package, returns
    ``.../myproject``. When ``file_dir`` is not itself a regular package,
    returns ``file_dir`` unchanged.
    """
    root = file_dir
    while (root / _INIT_FILE).exists():
        root = root.parent
    return root


def _marker_root(start: Path) -> Path | None:
    """Return the nearest ancestor (inclusive) holding a project-root marker."""
    for directory in (start, *start.parents):
        if any((directory / marker).exists() for marker in _ROOT_MARKERS):
            return directory
    return None


def _prepend_sys_path(path_str: str) -> None:
    """Make ``path_str`` the first entry of ``sys.path``.

    If the entry already exists elsewhere it is moved to the front, so the
    agent's own project root wins over any earlier same-named package. Idempotent
    when the entry is already at ``sys.path[0]``.
    """
    if sys.path and sys.path[0] == path_str:
        return
    if path_str in sys.path:
        sys.path.remove(path_str)
    sys.path.insert(0, path_str)


def ensure_import_root(agent_file: Path) -> str:
    """Ensure the package/project root of ``agent_file`` is importable.

    ``importlib.util.spec_from_file_location`` loads a single file without
    adding its project root to ``sys.path``, so absolute imports the file makes
    relative to its project root (``from app.config import config``) raise
    ``ModuleNotFoundError``. This helper resolves that root and moves it to the
    front of ``sys.path`` so those imports resolve as they would when the
    project is run normally.

    Resolution:
        * **Regular package** — walk up the ``__init__.py`` chain from the
          file's directory; the root is the top package's parent. For
          ``.../myproject/app/agent.py`` the root is ``.../myproject``.
        * **Namespace package / flat script** — when the file's directory has
          no ``__init__.py``, its own directory is used (so flat-layout sibling
          imports resolve), and, if a project-root marker
          (``pyproject.toml`` / ``setup.py`` / ``setup.cfg``) is found in an
          ancestor, that project root is added as well — this is what makes an
          implicit namespace package's ``from app.config import config`` resolve.

    Every root placed on ``sys.path`` is moved to the front if already present,
    so it takes precedence over an earlier same-named package. The operation is
    idempotent, so it is safe to call repeatedly under hot-reload.

    Args:
        agent_file: Filesystem path to the user's agent module. Callers should
            pass an already-resolved (absolute) path.

    Returns:
        The primary root placed at ``sys.path[0]`` (the package/flat-script
        root).
    """
    file_dir = agent_file.parent
    pkg_root = _package_root(file_dir)

    if pkg_root != file_dir:
        # Regular package: its parent is the one correct import root.
        roots = [str(pkg_root)]
    else:
        # No __init__.py at the agent's directory: it is either a flat script
        # (needs its own directory) or a namespace-package member (needs the
        # project root). Add both so either import style resolves; keep the
        # file's own directory at highest precedence.
        roots = [str(file_dir)]
        marker_root = _marker_root(file_dir)
        if marker_root is not None and marker_root != file_dir:
            roots.append(str(marker_root))

    # Prepend in reverse so roots[0] ends up at sys.path[0] (highest precedence).
    for path_str in reversed(roots):
        _prepend_sys_path(path_str)

    logger.debug("Ensured agent import roots on sys.path: %s", roots)
    return roots[0]
