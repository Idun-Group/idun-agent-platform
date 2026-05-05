"""Logging capture context manager for assertion tests."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager


class _ListHandler(logging.Handler):
    def __init__(self, records: list[logging.LogRecord]) -> None:
        super().__init__()
        self._records = records

    def emit(self, record: logging.LogRecord) -> None:
        self._records.append(record)


@contextmanager
def captured_logs(
    logger_name: str = "idun_agent_standalone",
    level: int = logging.DEBUG,
) -> Iterator[list[logging.LogRecord]]:
    """Yield a list collecting LogRecords emitted under logger_name."""
    logger = logging.getLogger(logger_name)
    records: list[logging.LogRecord] = []
    handler = _ListHandler(records)
    handler.setLevel(level)
    previous_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(level)
    try:
        yield records
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)
