"""Application logging utilities."""

import logging


def setup_logging(level: str = "INFO") -> None:
    """Configure root logging for the engine."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def get_logger(name: str = __name__) -> logging.Logger:
    """Get a configured logger instance."""
    return logging.getLogger(name)
