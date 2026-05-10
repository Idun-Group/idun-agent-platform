"""Shared helpers for the standalone traces unit-test package.

The fake-span builder lives here (rather than module-local in
``test_exporter.py``) so the writer suite can import it without a
test-from-test dependency cycle.
"""

from __future__ import annotations

from unittest.mock import MagicMock


def fake_span(
    name: str = "smoke",
    *,
    span_id: int | None = None,
    trace_id: int = 0xDEADBEEFCAFEBABEDEADBEEFCAFEBABE,
    parent_span_id: int | None = None,
    start_time_ns: int = 1_700_000_000_000_000_000,
    end_time_ns: int = 1_700_000_001_000_000_000,
    status_code: int = 1,
    attributes: dict | None = None,
) -> MagicMock:
    """Build a minimal ``ReadableSpan``-shaped MagicMock with LLM attrs.

    Each call returns a span with a fresh ``otel_span_id`` so they can be
    inserted into the SQLite span table without colliding on the
    ``(started_at, otel_span_id)`` primary key.
    """
    span = MagicMock()
    span.name = name
    span.attributes = (
        attributes
        if attributes is not None
        else {
            "openinference.span.kind": "LLM",
            "llm.model_name": "gpt-4o",
        }
    )
    span.context.trace_id = trace_id
    if span_id is None:
        # Counter mutates module-level state to keep IDs unique across calls.
        global _SPAN_COUNTER
        _SPAN_COUNTER += 1
        span_id = 0xDEADBEEFCAFEBA00 + _SPAN_COUNTER
    span.context.span_id = span_id
    if parent_span_id is None:
        span.parent = None
    else:
        parent_mock = MagicMock()
        parent_mock.span_id = parent_span_id
        span.parent = parent_mock
    span.start_time = start_time_ns
    span.end_time = end_time_ns
    span.status.status_code = status_code
    span.events = []
    return span


_SPAN_COUNTER = 0
