"""Application logging utilities (simple stdlib setup)."""

import logging


def setup_logging() -> None:
    """Configure root logging based on settings."""
    level = logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def get_logger(name: str = __name__):
    """Get a configured logger instance (stdlib)."""
    return logging.getLogger(name)
