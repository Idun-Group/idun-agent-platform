"""Engine ``POST /reload`` must re-attach the standalone trace observer.

Bug — the standalone re-attached its observer in the *admin* reload
orchestrator only. The engine ships its own ``POST /reload`` route on
``base_router`` which calls ``cleanup_agent`` + ``configure_app``
directly; in ``auth_mode=none`` operators (and the engine TUI) can hit
it and silently break the trace pipeline.

The fix moves the re-attach to a ``post_configure_callbacks`` hook the
engine runs at the end of every ``configure_app`` invocation. This test
exercises that hook by hitting the engine route directly and asserting
new trace rows still land after the reload.
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
async def test_engine_reload_reattaches_observer(tmp_path: Path, monkeypatch):
    """A direct hit on engine ``POST /reload`` must keep traces flowing.

    Without the post-configure callback the second turn would yield zero
    new rows because ``configure_app`` rebuilt ``app.state.agent`` and
    nobody re-registered the trace observer.
    """
    db_path = tmp_path / "engine_reload.db"
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
                # First turn — boot path attached the observer via the
                # post-configure callback.
                await _run_chat_turn(
                    client, thread_id="thrA", run_id="runA", text="before"
                )
                await app.state.trace_writer.drain()

                sm = app.state.sessionmaker
                async with sm() as s:
                    rows_before = (
                        await s.execute(select(TraceEventRow))
                    ).scalars().all()
                first_count = len(rows_before)
                assert first_count > 0, "no trace rows from first chat turn"

                await app.state.trace_writer.start()

                # Hit the ENGINE's own /reload directly — this is the path
                # the admin orchestrator does NOT cover. ``auth_mode=none``
                # means require_auth is a no-op so the call goes through.
                resp = await client.post(
                    "/reload", json={"path": str(config_path)}
                )
                assert resp.status_code == 200, resp.text

                # Second turn — if the post-configure callback didn't fire
                # (or didn't re-attach the observer), no new rows land.
                await _run_chat_turn(
                    client, thread_id="thrB", run_id="runB", text="after"
                )
                await app.state.trace_writer.drain()

                async with sm() as s:
                    rows_after = (
                        await s.execute(select(TraceEventRow))
                    ).scalars().all()
                second_count = len(rows_after)
                assert second_count > first_count, (
                    f"observer dropped after engine /reload: "
                    f"{first_count} → {second_count} rows"
                )

                thr_b_rows = [r for r in rows_after if r.session_id == "thrB"]
                assert thr_b_rows, (
                    "no trace rows captured for the post-/reload run"
                )

                # Restart writer so lifespan teardown's drain has a live task.
                await app.state.trace_writer.start()
