"""Shared helpers for the standalone traces unit-test package.

The fake-span builder lives here (rather than module-local in
``test_exporter.py``) so the writer suite can import it without a
test-from-test dependency cycle.
"""

from __future__ import annotations

from unittest.mock import MagicMock


def fake_span(name: str = "smoke", *, span_id: int | None = None) -> MagicMock:
    """Build a minimal ``ReadableSpan``-shaped MagicMock with LLM attrs.

    Each call returns a span with a fresh ``otel_span_id`` so they can be
    inserted into the SQLite span table without colliding on the
    ``(started_at, otel_span_id)`` primary key.
    """
    span = MagicMock()
    span.name = name
    span.attributes = {
        "openinference.span.kind": "LLM",
        "llm.model_name": "gpt-4o",
    }
    span.context.trace_id = 0xDEADBEEFCAFEBABEDEADBEEFCAFEBABE
    if span_id is None:
        # Counter mutates module-level state to keep IDs unique across calls.
        global _SPAN_COUNTER
        _SPAN_COUNTER += 1
        span_id = 0xDEADBEEFCAFEBA00 + _SPAN_COUNTER
    span.context.span_id = span_id
    span.parent = None
    span.start_time = 1_700_000_000_000_000_000
    span.end_time = 1_700_000_001_000_000_000
    span.status.status_code = 1  # OK
    span.events = []
    return span


_SPAN_COUNTER = 0
