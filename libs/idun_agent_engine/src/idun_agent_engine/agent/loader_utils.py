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


def ensure_import_root(agent_file: Path) -> str:
    """Ensure the package/project root of ``agent_file`` is importable.

    ``importlib.util.spec_from_file_location`` loads a single file without
    adding its project root to ``sys.path``, so absolute imports the file makes
    relative to its project root (``from app.config import config``) raise
    ``ModuleNotFoundError``. This helper resolves that root and inserts it at
    ``sys.path[0]`` so those imports resolve as they would when the project is
    run normally.

    Resolution:
        * Walk up the ``__init__.py`` chain from the file's directory to find
          the top of the enclosing package; the root is that package's parent.
          For ``.../myproject/app/agent.py`` where ``app`` is a package, the
          root is ``.../myproject`` — making ``from app.config import ...`` work.
        * If the file is not inside a package (its directory has no
          ``__init__.py``), the file's own directory is used, so flat-layout
          sibling imports (``from config import ...``) resolve.

    The insert is idempotent: an entry already on ``sys.path`` is not added
    again, so this is safe to call repeatedly under hot-reload.

    Args:
        agent_file: Filesystem path to the user's agent module. Callers should
            pass an already-resolved (absolute) path.

    Returns:
        The directory added to (or already present on) ``sys.path``.
    """
    root = agent_file.parent
    while (root / _INIT_FILE).exists():
        root = root.parent

    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
        logger.debug("Added agent project root to sys.path: %s", root_str)

    return root_str
