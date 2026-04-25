"""Integration test for the trace observer surviving a config reload.

This test boots the real ``create_standalone_app`` against the bundled
echo agent, drives a chat turn, asserts trace rows landed in
``trace_event``, then mutates the agent via ``PUT /admin/api/v1/agent``
to force a hot-swap, drives another turn, and asserts the second turn
produced more rows. If the observer is dropped on reload (BUG 2), the
second turn yields zero new rows and the test fails.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.base import Base, create_db_engine
from idun_agent_standalone.db.models import TraceEventRow
from idun_agent_standalone.settings import StandaloneSettings
from sqlalchemy import select


@asynccontextmanager
async def _create_schema(database_url: str):
    """Create the standalone schema directly (skip Alembic for tests)."""
    engine = create_db_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


def _echo_yaml() -> dict:
    """Return a YAML-shaped seed config for the echo agent."""
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test-echo",
                "graph_definition": (
                    "idun_agent_standalone.testing:echo_graph"
                ),
                "checkpointer": {"type": "memory"},
            },
        }
    }


async def _run_chat_turn(
    client: AsyncClient, *, thread_id: str, run_id: str, text: str
) -> None:
    """Drive a single AG-UI run through ``/agent/run`` and consume the SSE."""
    resp = await client.post(
        "/agent/run",
        json={
            "threadId": thread_id,
            "runId": run_id,
            "messages": [{"id": "m1", "role": "user", "content": text}],
            "state": {},
            "tools": [],
            "context": [],
            "forwardedProps": {},
        },
        headers={"accept": "text/event-stream"},
    )
    assert resp.status_code == 200, resp.text
    await resp.aread()


@pytest.mark.asyncio
async def test_observer_survives_agent_reload(tmp_path: Path, monkeypatch):
    """A hot-swap should not silence the trace pipeline.

    Bug-2 regression: ``configure_app`` rebuilds ``BaseAgent`` from
    scratch, so observers attached at boot vanish. The reload
    orchestrator must re-attach the standalone's trace observer.
    """
    db_path = tmp_path / "reload.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(_echo_yaml()))

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(config_path))

    async with _create_schema(f"sqlite+aiosqlite:///{db_path}"):
        settings = StandaloneSettings()
        app = await create_standalone_app(settings)

        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                await _run_chat_turn(
                    client, thread_id="thr1", run_id="run1", text="hello"
                )

                # Drain the batched writer so events have actually hit the DB.
                await app.state.trace_writer.drain()

                sm = app.state.sessionmaker
                async with sm() as s:
                    rows_before = (
                        await s.execute(select(TraceEventRow))
                    ).scalars().all()
                first_count = len(rows_before)
                assert first_count > 0, "no trace rows from first chat turn"

                # Restart the writer so the post-reload turn can drain again.
                await app.state.trace_writer.start()

                # Mutate the agent — this triggers the reload orchestrator.
                # The name is held constant so the structural-change check
                # (framework / graph_definition only) does not fire and we
                # exercise the hot-swap path.
                resp = await client.put(
                    "/admin/api/v1/agent",
                    json={
                        "name": "test-echo",
                        "framework": "langgraph",
                        "graph_definition": (
                            "idun_agent_standalone.testing:echo_graph"
                        ),
                        "config": {
                            "checkpointer": {"type": "memory"},
                            "extra_marker": "reload-1",
                        },
                    },
                )
                assert resp.status_code == 200, resp.text

                await _run_chat_turn(
                    client, thread_id="thr2", run_id="run2", text="post-reload"
                )

                await app.state.trace_writer.drain()
                async with sm() as s:
                    rows_after = (
                        await s.execute(select(TraceEventRow))
                    ).scalars().all()
                second_count = len(rows_after)
                assert second_count > first_count, (
                    f"observer dropped: {first_count} → {second_count} rows "
                    "after reload (expected >)"
                )

                # Ensure the second turn produced rows for thr2.
                thr2_rows = [r for r in rows_after if r.session_id == "thr2"]
                assert thr2_rows, "no trace rows captured for post-reload run"

                # Restart writer so lifespan teardown's drain has a live task.
                await app.state.trace_writer.start()
