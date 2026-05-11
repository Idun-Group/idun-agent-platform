
import pytest

from idun_agent_schema.standalone.dashboard import (
    DashboardRange,
    DashboardResponse,
)


def test_dashboard_response_round_trip_uses_camel_case_aliases():
    payload = {
        "range": "24h",
        "generatedAt": "2026-05-11T16:00:00Z",
        "bucketSeconds": 300,
        "requests": {
            "total": 12408,
            "deltaPct": 0.14,
            "series": [{"t": "2026-05-11T15:00:00Z", "v": 42}],
        },
        "latency": {
            "p50Ms": 220.0,
            "p95Ms": 820.0,
            "p95DeltaPct": 0.08,
            "series": [{"t": "2026-05-11T15:00:00Z", "p50": 200.0, "p95": 800.0}],
        },
        "errorRate": {
            "valuePct": 0.0042,
            "deltaPp": -0.001,
            "series": [{"t": "2026-05-11T15:00:00Z", "v": 0.004}],
        },
        "cost": {
            "totalUsd": 2.41,
            "deltaPct": 0.16,
            "series": [{"t": "2026-05-11T15:00:00Z", "v": 0.12}],
        },
        "topErrors": [
            {
                "spanName": "execute_tool refund_api",
                "count": 23,
                "lastSeen": "2026-05-11T15:58:00Z",
                "sampleTraceId": "7f3a2c00",
            }
        ],
    }
    resp = DashboardResponse.model_validate(payload)
    assert resp.range == DashboardRange.h24
    assert resp.bucket_seconds == 300
    assert resp.requests.total == 12408
    assert resp.latency.p50_ms == 220.0
    assert resp.error_rate.delta_pp == pytest.approx(-0.001)
    assert resp.cost.total_usd == pytest.approx(2.41)
    assert resp.top_errors[0].span_name == "execute_tool refund_api"

    # Round trip back to camelCase
    dumped = resp.model_dump(by_alias=True)
    assert dumped["bucketSeconds"] == 300
    assert dumped["topErrors"][0]["spanName"] == "execute_tool refund_api"


def test_empty_window_response_is_valid():
    payload = {
        "range": "1h",
        "generatedAt": "2026-05-11T16:00:00Z",
        "bucketSeconds": 60,
        "requests": {"total": 0, "deltaPct": None, "series": []},
        "latency": {
            "p50Ms": None,
            "p95Ms": None,
            "p95DeltaPct": None,
            "series": [],
        },
        "errorRate": {"valuePct": 0.0, "deltaPp": None, "series": []},
        "cost": {"totalUsd": 0.0, "deltaPct": None, "series": []},
        "topErrors": [],
    }
    resp = DashboardResponse.model_validate(payload)
    assert resp.requests.delta_pct is None
    assert resp.latency.p50_ms is None
    assert resp.top_errors == []
