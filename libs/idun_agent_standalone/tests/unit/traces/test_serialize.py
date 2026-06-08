"""Unit tests for the telemetry wire serializer."""

import json
from datetime import UTC, datetime
from decimal import Decimal

from idun_agent_standalone.infrastructure.traces._serialize import encode_batch


def test_encode_batch_is_json_serializable_and_converts_non_json_types():
    span = {
        "started_at": datetime(2026, 6, 1, 10, 0, tzinfo=UTC),
        "otel_span_id": b"\x01\x02\x03\x04\x05\x06\x07\x08",
        "otel_trace_id": b"\x11\x12\x13\x14\x15\x16\x17\x18",
        "parent_span_id": None,
        "name": "chat",
        "kind": "LLM",
        "latency_ms": Decimal("12.5"),
        "cost_usd": Decimal("0.0001234"),
        "attributes": {"llm.model_name": "gpt-4o"},
    }
    trace = {
        "started_at": datetime(2026, 6, 1, 10, 0, tzinfo=UTC),
        "otel_trace_id": bytes(range(0x11, 0x21)),
        "name": "chat",
        "models": ["gpt-4o"],
    }

    body = encode_batch([span], [trace])

    # The whole point: no non-JSON-native types leak through.
    json.dumps(body)

    assert body["version"] == 1

    s = body["spans"][0]
    assert s["otel_span_id"] == "0102030405060708"
    assert s["otel_trace_id"] == "1112131415161718"
    assert s["parent_span_id"] is None
    assert s["started_at"] == "2026-06-01T10:00:00+00:00"
    assert s["latency_ms"] == "12.5"
    assert s["cost_usd"] == "0.0001234"
    assert s["name"] == "chat"
    # Nested JSON-native values pass through untouched.
    assert s["attributes"] == {"llm.model_name": "gpt-4o"}

    t = body["traces"][0]
    assert t["otel_trace_id"] == "1112131415161718191a1b1c1d1e1f20"
    assert t["models"] == ["gpt-4o"]


def test_encode_batch_handles_nested_non_json_values():
    span = {
        "otel_span_id": b"\x01",
        "name": "s",
        "kind": "LLM",
        "cost_breakdown": {"input": Decimal("0.001"), "output": Decimal("0.002")},
        "events": [{"name": "e", "ts": datetime(2026, 6, 1, tzinfo=UTC)}],
    }

    body = encode_batch([span], [])

    json.dumps(body)  # must not raise on nested Decimal / datetime

    s = body["spans"][0]
    assert s["cost_breakdown"]["input"] == "0.001"
    assert s["events"][0]["ts"] == "2026-06-01T00:00:00+00:00"
