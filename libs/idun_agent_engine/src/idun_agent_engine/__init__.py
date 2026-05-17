"""Idun Agent Engine public API.

Exports top-level helpers for convenience imports in examples and user code.
"""

import warnings as _warnings

# ag_ui.core.types declares pydantic field aliases on type-aliased
# union members; pydantic v2 flags this with
# UnsupportedFieldAttributeWarning ~30 times on first /agent/run because
# pydantic builds the AG-UI validators lazily. The aliases still work
# at runtime — install the filter at engine package-import time
# (BEFORE any ag_ui import path is reachable) so the operator's log
# isn't dominated by upstream-library noise. Track upstream and
# remove once ag_ui migrates to ``Annotated[..., Field(...)]``.
try:
    from pydantic.warnings import UnsupportedFieldAttributeWarning  # noqa: N814

    _warnings.filterwarnings(
        "ignore", category=UnsupportedFieldAttributeWarning
    )
    del UnsupportedFieldAttributeWarning
except ImportError:
    pass

from ._version import __version__
from .agent.base import BaseAgent
from .core.app_factory import create_app
from .core.config_builder import ConfigBuilder
from .core.server_runner import (
    run_server,
    run_server_from_builder,
    run_server_from_config,
)
from .prompts import get_prompt

__all__ = [
    "create_app",
    "run_server",
    "run_server_from_config",
    "run_server_from_builder",
    "ConfigBuilder",
    "BaseAgent",
    "get_prompt",
    "__version__",
]
