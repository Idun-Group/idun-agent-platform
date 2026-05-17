"""End-to-end smoke test for the trace pipeline on the default SQLite URL.

Phase T6 acceptance: validates that T1 (schema) + T2 (exporter + writer
+ finalizer) + T7 (bootstrap shape) compose against the standalone's
default ``DATABASE_URL`` (``sqlite+aiosqlite://``).

We exercise the pipeline modules **directly** rather than booting the
full FastAPI app — the bootstrap callback is already covered by
``tests/integration/test_trace_bootstrap.py`` and spinning a uvicorn-less
TestClient just to push spans buys nothing here. What this test asserts
that the unit-level writer tests do not is that the same dialect dispatch
the writer takes against an aiosqlite URL also writes through to the
SQLite file on disk and that the rows come back through the admin
list-traces handler in a shape the React UI can render.

Schema is materialized via the packaged Alembic migrations, not
``Base.metadata.create_all``. Production runs alembic; the SQLite branch
of the migration must agree with the ORM column types it backs. A
previous iteration of this test used ``create_all`` and silently passed
while the migration shipped ``latency_ms TEXT`` (TEXT affinity stores
``Decimal`` as a string and crashes the read path with
``TypeError: must be real number, not str`` on every list response).
"""

from __future__ import annotations

import asyncio

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import get_session
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.traces import router as traces_router
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.db.migrate import _alembic_config, downgrade_base
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from idun_agent_standalone.infrastructure.traces.writer import TraceWriter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tests.unit.traces._helpers import fake_span as _fake_span

_DRAIN_TIMEOUT_S = 3.0
_DRAIN_TICK_S = 0.05


async def _make_sqlite_pipeline(tmp_path, monkeypatch):
    """Materialize the standalone schema by running the packaged Alembic
    migrations against an aiosqlite DB on disk.

    Driving alembic (not ``Base.metadata.create_all``) is load-bearing:
    the read path goes through SQLAlchemy's ``Numeric`` decoder and only
    accepts real numbers, so the migration's SQLite column affinity has
    to match the ORM declaration. This setup ran ``create_all`` until
    2026-05-10 and silently masked the ``latency_ms TEXT`` regression.

    The standalone alembic env runs its async upgrade via ``asyncio.run``;
    calling it from a running event loop would nest loops, so we hop
    through ``asyncio.to_thread`` to give it a dedicated worker thread.

    Returns the engine + sessionmaker; caller owns disposal.
    """
    url = f"sqlite+aiosqlite:///{tmp_path / 'e2e.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    return engine, sm


async def _wait_for(predicate, *, timeout_s: float = _DRAIN_TIMEOUT_S) -> bool:
    """Poll ``predicate`` until it returns truthy or ``timeout_s`` elapses."""
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        if await predicate():
            return True
        await asyncio.sleep(_DRAIN_TICK_S)
    return False


@pytest.mark.asyncio
async def test_e2e_sqlite_span_emit_to_list(tmp_path, monkeypatch):
    """Push 3 spans through the exporter, drain via writer, list via admin API.

    Asserts:
        * ``standalone_span`` has 3 rows after the writer drains.
        * ``standalone_trace`` has exactly 1 row (finalizer fires when the
          batch contains the root span).
        * The trace row's aggregates (name, models, status) reflect the
          locked finalizer behaviour.
        * ``GET /admin/api/v1/traces`` returns the trace through the
          public read path — the assertion exercises ``latency_ms`` and
          ``total_cost_usd`` as real numbers, which only round-trips when
          the migration declares the columns with NUMERIC affinity.
    """
    engine, sm = await _make_sqlite_pipeline(tmp_path, monkeypatch)
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        # Tight schedule so the test doesn't sit on the default 2 s tick.
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_id = 0xCAFEBABE_DEADBEEF_CAFEBABE_DEADBEEF
        root = _fake_span(
            "agent.run",
            span_id=0x1,
            trace_id=trace_id,
            parent_span_id=None,
            start_time_ns=1_700_000_000_000_000_000,
            end_time_ns=1_700_000_005_000_000_000,
            attributes={
                "openinference.span.kind": "CHAIN",
                "user.id": "user-e2e",
                "session.id": "sess-e2e",
            },
        )
        child_a = _fake_span(
            "llm.call.a",
            span_id=0x2,
            trace_id=trace_id,
            parent_span_id=0x1,
            start_time_ns=1_700_000_001_000_000_000,
            end_time_ns=1_700_000_003_000_000_000,
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o",
            },
        )
        child_b = _fake_span(
            "llm.call.b",
            span_id=0x3,
            trace_id=trace_id,
            parent_span_id=0x1,
            start_time_ns=1_700_000_002_000_000_000,
            end_time_ns=1_700_000_004_000_000_000,
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o-mini",
            },
        )
        exporter.export([root, child_a, child_b])

        async def _spans_landed() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            return count == 3

        async def _trace_finalized() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneTraceRow)
                    )
                ).scalar()
            return count == 1

        assert await _wait_for(_spans_landed), (
            "writer did not drain 3 spans into standalone_span within "
            f"{_DRAIN_TIMEOUT_S}s"
        )
        assert await _wait_for(_trace_finalized), (
            "writer did not finalize 1 trace into standalone_trace within "
            f"{_DRAIN_TIMEOUT_S}s"
        )

        # Verify span + trace contents directly through SQLAlchemy.
        async with sm() as session:
            spans = (
                (await session.execute(select(StandaloneSpanRow))).scalars().all()
            )
            traces = (
                (await session.execute(select(StandaloneTraceRow))).scalars().all()
            )
        assert len(spans) == 3
        assert {s.name for s in spans} == {"agent.run", "llm.call.a", "llm.call.b"}
        # The standalone_span table stores the trailing 8 bytes of the
        # 16-byte W3C trace_id; every span in this batch shares the same
        # trace, so the bytes must match across all three rows.
        span_trace_id_8 = trace_id.to_bytes(16, "big")[8:]
        assert all(s.otel_trace_id == span_trace_id_8 for s in spans)

        [trace] = traces
        # Full 16-byte W3C id on the trace table.
        assert len(trace.otel_trace_id) == 16
        assert trace.otel_trace_id == trace_id.to_bytes(16, "big")
        # Root-derived aggregates.
        assert trace.name == "agent.run"
        assert trace.status == "OK"
        assert trace.user_id == "user-e2e"
        assert trace.session_id == "sess-e2e"
        # Models — sorted distinct from the LLM children only.
        assert sorted(trace.models or []) == ["gpt-4o", "gpt-4o-mini"]

        # Now exercise the public list-traces handler against the same
        # SQLite DB. This proves the row written by the SQLite writer is
        # readable through the admin REST surface — the user-facing path
        # T6 needs to validate.
        app = FastAPI()
        register_admin_exception_handlers(app)
        app.state.settings = StandaloneSettings(auth_mode=AuthMode.NONE)
        app.state.sessionmaker = sm
        app.include_router(traces_router)

        async def _override_session():
            async with sm() as session:
                yield session

        app.dependency_overrides[get_session] = _override_session

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/admin/api/v1/traces?limit=10")

        assert response.status_code == 200, (
            "If this is 500 with TypeError 'must be real number, not str' in "
            "the server log, the SQLite trace migration is using TEXT "
            "affinity for a Numeric column again — see the notes in "
            "_make_sqlite_pipeline."
        )
        body = response.json()
        assert len(body["items"]) == 1
        item = body["items"][0]
        # otel_trace_id is hex-encoded by the schema layer.
        assert item["otelTraceId"] == trace_id.to_bytes(16, "big").hex()
        assert item["name"] == "agent.run"
        assert sorted(item["models"]) == ["gpt-4o", "gpt-4o-mini"]
        assert item["status"] == "OK"
        # Force the Numeric round-trip on the read path. If
        # ``standalone_trace.latency_ms`` is declared TEXT in the migration,
        # SQLAlchemy's Numeric decoder rejects the stored string and the
        # whole list response 500s — this assertion is the regression
        # tripwire for that bug.
        assert item["latencyMs"] is not None
        assert isinstance(item["latencyMs"], float)
        assert item["latencyMs"] == pytest.approx(5000.0)
    finally:
        await writer.stop()
        await engine.dispose()
        # Roll back the on-disk Alembic version so a fresh tmp_path on the
        # next test is not surprised by a stamped DB. ``downgrade_base``
        # uses the env-var DATABASE_URL we set in _make_sqlite_pipeline.
        await asyncio.to_thread(downgrade_base)
