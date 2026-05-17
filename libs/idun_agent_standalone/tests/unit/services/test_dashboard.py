"""Unit tests for dashboard helpers — bucket math + span-name normalization.

Higher-level SQL is exercised by ``tests/integration/api/v1/test_dashboard_flow.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from idun_agent_schema.standalone.dashboard import DashboardRange
from idun_agent_standalone.services.dashboard import (
    _normalize_span_name,
    _resolve_bucket_seconds,
    _resolve_window,
)


@pytest.mark.parametrize(
    "range_value,expected_seconds",
    [
        (DashboardRange.h1, 60),
        (DashboardRange.h24, 300),
        (DashboardRange.d7, 3600),
        (DashboardRange.d30, 21600),
    ],
)
def test_resolve_bucket_seconds_matches_spec(range_value, expected_seconds):
    assert _resolve_bucket_seconds(range_value) == expected_seconds


def test_resolve_window_returns_start_now_prior_start():
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    start, end, prior_start = _resolve_window(DashboardRange.h24, now=now)
    assert end == now
    assert start == now - timedelta(hours=24)
    assert prior_start == now - timedelta(hours=48)


def test_resolve_window_30d_is_30_days():
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    start, _, prior_start = _resolve_window(DashboardRange.d30, now=now)
    assert (now - start) == timedelta(days=30)
    assert (now - prior_start) == timedelta(days=60)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("execute_tool refund_api", "execute_tool refund_api"),
        ("execute_tool refund_api/req-abc-123", "execute_tool refund_api"),
        ("call_llm gpt-4o-mini-2024-07-18", "call_llm gpt-4o-mini-2024-07-18"),
        (
            "invoke_agent worker-5f3a-b1c2-91d4-001122334455",
            "invoke_agent worker-<uuid>",
        ),
        ("step 17", "step <n>"),
    ],
)
def test_normalize_span_name_collapses_dynamic_args(raw, expected):
    assert _normalize_span_name(raw) == expected
