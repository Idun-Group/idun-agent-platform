"""Serialize the writer's row dicts into a JSON-safe ``/collect`` body.

Bytes are hex-encoded, datetimes ISO-8601, Decimals stringified.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

VERSION = 1


def _encode_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _encode_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_encode_value(v) for v in value]
    return value


def _encode_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _encode_value(value) for key, value in row.items()}


def encode_batch(
    span_rows: list[dict[str, Any]],
    trace_rows: list[dict[str, Any]],
    *,
    version: int = VERSION,
) -> dict[str, Any]:
    """Build the ``/collect`` request body from writer row dicts."""
    return {
        "version": version,
        "spans": [_encode_row(r) for r in span_rows],
        "traces": [_encode_row(r) for r in trace_rows],
    }
