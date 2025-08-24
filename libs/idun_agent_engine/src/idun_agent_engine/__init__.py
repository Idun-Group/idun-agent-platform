"""Idun Agent Engine public API.

Exports top-level helpers for convenience imports in examples and user code.
"""

from ._version import __version__
from .agent.base import BaseAgent
from .core.app_factory import create_app
from .core.config_builder import ConfigBuilder
from .core.server_runner import (
    run_server,
    run_server_from_builder,
    run_server_from_config,
)

__all__ = [
    "create_app",
    "run_server",
    "run_server_from_config",
    "run_server_from_builder",
    "ConfigBuilder",
    "BaseAgent",
    "__version__",
]
