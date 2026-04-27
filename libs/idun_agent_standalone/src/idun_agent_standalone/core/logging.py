"""Logging setup for the standalone process.

Single setup call at startup. Every module gets its logger via
``get_logger(__name__)`` so the format and level stay consistent.
"""

from __future__ import annotations

import logging


def setup_logging(level: str = "INFO") -> None:
    """Configure root logging once at process startup."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def get_logger(name: str) -> logging.Logger:
    """Return a logger that respects ``setup_logging`` configuration."""
    return logging.getLogger(name)
