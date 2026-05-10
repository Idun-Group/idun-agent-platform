"""Integration tests for ``/admin/api/v1/traces``.

Mirrors the router-level dependency-override pattern used by every
other admin flow test (see ``test_observability_flow.py``). Tests run
against the in-memory SQLite session fixture, which materializes the
trace + span ORMs through ``Base.metadata.create_all``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import get_session
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.traces import router as traces_router
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow


def _trace_id(byte_value: int) -> bytes:
    """Build a deterministic 16-byte trace id for fixtures."""
    return bytes([byte_value]) * 16


def _span_id(byte_value: int) -> bytes:
    """Build a deterministic 8-byte span id for fixtures."""
    return bytes([byte_value]) * 8


@pytest.fixture
async def admin_app(async_session):
    """Bare FastAPI app with the trace router mounted under
    overridden DB session dependency. ``require_auth`` is short-circuited
    by leaving ``auth_mode=NONE`` so individual tests can still drive
    auth-gating regression in a follow-up fixture.
    """
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.state.settings = StandaloneSettings(auth_mode=AuthMode.NONE)

    class _Sm:
        def __call__(self):
            return _Ctx()

    class _Ctx:
        async def __aenter__(self):
            return async_session

        async def __aexit__(self, *_a):
            return None

    app.state.sessionmaker = _Sm()
    app.include_router(traces_router)

    async def override_session():
        yield async_session

    app.dependency_overrides[get_session] = override_session
    return app


async def _seed_trace(
    async_session,
    *,
    trace_id: bytes,
    started_at: datetime,
    name: str = "agent.run",
    models: list[str] | None = None,
    status: str | None = "OK",
    user_id: str | None = None,
    session_id: str | None = None,
) -> StandaloneTraceRow:
    row = StandaloneTraceRow(
        started_at=started_at,
        otel_trace_id=trace_id,
        name=name,
        models=models or ["openai/gpt-4o"],
        status=status,
        user_id=user_id,
        session_id=session_id,
    )
    async_session.add(row)
    await async_session.commit()
    return row


async def test_list_traces_empty_returns_empty_response(admin_app) -> None:
    """No seeded traces → 200 with an empty items list."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/traces")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["nextCursor"] is None


async def test_list_traces_returns_seeded_traces(admin_app, async_session) -> None:
    """Three seeded traces → three items, sorted started_at DESC."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    for i in range(3):
        await _seed_trace(
            async_session,
            trace_id=_trace_id(i + 1),
            started_at=base + timedelta(minutes=i),
        )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/traces?limit=10")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 3
    # DESC by started_at — newest first.
    started = [item["startedAt"] for item in body["items"]]
    assert started == sorted(started, reverse=True)
    # otel_trace_id is hex-encoded.
    assert all(len(item["otelTraceId"]) == 32 for item in body["items"])


async def test_list_traces_filters_by_model(admin_app, async_session) -> None:
    """``model`` query param filters via ARRAY membership."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    await _seed_trace(
        async_session,
        trace_id=_trace_id(1),
        started_at=base,
        models=["openai/gpt-4o"],
    )
    await _seed_trace(
        async_session,
        trace_id=_trace_id(2),
        started_at=base + timedelta(minutes=1),
        models=["anthropic/claude-opus"],
    )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/admin/api/v1/traces?model=anthropic%2Fclaude-opus"
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["models"] == ["anthropic/claude-opus"]


async def test_list_traces_pagination_cursor_round_trip(
    admin_app, async_session
) -> None:
    """Five seeded, limit=2 → first page 2 items + cursor → next page 2 items."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    for i in range(5):
        await _seed_trace(
            async_session,
            trace_id=_trace_id(i + 1),
            started_at=base + timedelta(minutes=i),
        )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/admin/api/v1/traces?limit=2")
        first_body = first.json()
        assert len(first_body["items"]) == 2
        assert first_body["nextCursor"] is not None

        second = await client.get(
            f"/admin/api/v1/traces?limit=2&cursor={first_body['nextCursor']}"
        )
        second_body = second.json()
        assert len(second_body["items"]) == 2
        assert second_body["nextCursor"] is not None

        # No overlap.
        first_ids = {item["otelTraceId"] for item in first_body["items"]}
        second_ids = {item["otelTraceId"] for item in second_body["items"]}
        assert first_ids.isdisjoint(second_ids)


async def test_health_endpoint_returns_zero_when_pipeline_absent(admin_app) -> None:
    """No ``app.state.trace_exporter`` → health returns zeroes/idle."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/traces/_health")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "queueDepth": 0,
        "maxQueueSize": 0,
        "overflowCount": 0,
        "writerRunning": False,
    }


async def _seed_span(
    async_session,
    *,
    trace_id_8: bytes,
    span_id: bytes,
    parent_span_id: bytes | None,
    started_at: datetime,
    name: str = "span",
    kind: str = "INTERNAL",
) -> StandaloneSpanRow:
    row = StandaloneSpanRow(
        started_at=started_at,
        otel_span_id=span_id,
        otel_trace_id=trace_id_8,
        parent_span_id=parent_span_id,
        name=name,
        kind=kind,
    )
    async_session.add(row)
    await async_session.commit()
    return row


async def test_get_trace_detail_returns_tree_for_seeded_trace(
    admin_app, async_session
) -> None:
    """Three-span trace (root + 2 children) → tree with one root + 2 leaves."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    trace_id = _trace_id(0xAB)
    await _seed_trace(
        async_session,
        trace_id=trace_id,
        started_at=base,
    )
    trace_id_8 = trace_id[8:]
    root_id = _span_id(0x01)
    child_a = _span_id(0x02)
    child_b = _span_id(0x03)
    await _seed_span(
        async_session,
        trace_id_8=trace_id_8,
        span_id=root_id,
        parent_span_id=None,
        started_at=base,
        name="root",
    )
    await _seed_span(
        async_session,
        trace_id_8=trace_id_8,
        span_id=child_a,
        parent_span_id=root_id,
        started_at=base + timedelta(milliseconds=10),
        name="child_a",
    )
    await _seed_span(
        async_session,
        trace_id_8=trace_id_8,
        span_id=child_b,
        parent_span_id=root_id,
        started_at=base + timedelta(milliseconds=20),
        name="child_b",
    )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/admin/api/v1/traces/{trace_id.hex()}")
    assert response.status_code == 200
    body = response.json()
    assert body["trace"]["otelTraceId"] == trace_id.hex()
    tree = body["tree"]
    assert len(tree) == 1
    root_node = tree[0]
    assert root_node["span"]["name"] == "root"
    children = root_node["children"]
    assert {c["span"]["name"] for c in children} == {"child_a", "child_b"}
    assert all(c["children"] == [] for c in children)


async def test_get_trace_detail_404_when_unknown(admin_app) -> None:
    """Random hex trace id → 404 with the standalone error envelope."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/admin/api/v1/traces/" + ("ff" * 16),
        )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_get_trace_detail_depth_capped_at_32(
    admin_app, async_session
) -> None:
    """35-deep linear chain → returned tree depth is at most 32."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    trace_id = _trace_id(0xCD)
    await _seed_trace(async_session, trace_id=trace_id, started_at=base)
    trace_id_8 = trace_id[8:]

    parent: bytes | None = None
    for i in range(35):
        span_id = bytes([i + 1, 0, 0, 0, 0, 0, 0, 0])
        await _seed_span(
            async_session,
            trace_id_8=trace_id_8,
            span_id=span_id,
            parent_span_id=parent,
            started_at=base + timedelta(milliseconds=i),
            name=f"depth-{i}",
        )
        parent = span_id

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/admin/api/v1/traces/{trace_id.hex()}")
    assert response.status_code == 200
    body = response.json()
    tree = body["tree"]
    assert len(tree) == 1

    depth = 1
    node = tree[0]
    while node["children"]:
        depth += 1
        node = node["children"][0]

    # The recursive CTE caps at depth 32 (decision §28). The 33rd level
    # and below are silently truncated.
    assert depth <= 32


async def test_delete_trace_by_id_removes_spans_too(
    admin_app, async_session
) -> None:
    """Single-id DELETE cascades to spans for that trace."""
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    trace_id = _trace_id(0xDD)
    await _seed_trace(async_session, trace_id=trace_id, started_at=base)
    trace_id_8 = trace_id[8:]
    await _seed_span(
        async_session,
        trace_id_8=trace_id_8,
        span_id=_span_id(0x10),
        parent_span_id=None,
        started_at=base,
    )
    await _seed_span(
        async_session,
        trace_id_8=trace_id_8,
        span_id=_span_id(0x11),
        parent_span_id=_span_id(0x10),
        started_at=base + timedelta(milliseconds=5),
    )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(f"/admin/api/v1/traces/{trace_id.hex()}")
    assert response.status_code == 200
    body = response.json()
    assert body["deleted"] is True
    assert body["deletedSpans"] == 2

    # Trace + spans gone.
    from sqlalchemy import select as _select  # local import to avoid module-level

    remaining_traces = (
        await async_session.execute(_select(StandaloneTraceRow))
    ).scalars().all()
    remaining_spans = (
        await async_session.execute(_select(StandaloneSpanRow))
    ).scalars().all()
    assert remaining_traces == []
    assert remaining_spans == []


async def test_delete_trace_404_when_unknown(admin_app) -> None:
    """Unknown id → 404; no rows touched."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/admin/api/v1/traces/" + ("aa" * 16))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_bulk_delete_with_model_filter(admin_app, async_session) -> None:
    """Bulk DELETE with ``model`` filter only removes matching traces.

    Spans for a deleted trace are also removed; spans for a surviving
    trace stay put.
    """
    base = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    keep_id = _trace_id(0xEE)
    drop_id = _trace_id(0xEF)

    await _seed_trace(
        async_session,
        trace_id=keep_id,
        started_at=base,
        models=["openai/gpt-4o"],
    )
    await _seed_trace(
        async_session,
        trace_id=drop_id,
        started_at=base + timedelta(seconds=1),
        models=["anthropic/claude-opus"],
    )
    await _seed_span(
        async_session,
        trace_id_8=keep_id[8:],
        span_id=_span_id(0x21),
        parent_span_id=None,
        started_at=base,
    )
    await _seed_span(
        async_session,
        trace_id_8=drop_id[8:],
        span_id=_span_id(0x22),
        parent_span_id=None,
        started_at=base + timedelta(seconds=1),
    )

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            "/admin/api/v1/traces?model=anthropic%2Fclaude-opus"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["deletedTraces"] == 1
    assert body["deletedSpans"] == 1

    from sqlalchemy import select as _select

    remaining_traces = (
        await async_session.execute(_select(StandaloneTraceRow))
    ).scalars().all()
    assert len(remaining_traces) == 1
    assert remaining_traces[0].otel_trace_id == keep_id
