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


# Detail / delete / auth-gate tests are added in subsequent commits.
