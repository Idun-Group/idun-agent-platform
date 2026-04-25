"""Atomic reload semantics — DB rolls back when engine init fails.

Spec §7.1 line 488 — *"Reload rollback: new-config init failure rolls
back DB txn AND keeps old agent running."* The previous code committed
the DB before calling the engine reload, which left the persisted state
ahead of the live runtime — the bad config replayed on the next process
boot.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.db.base import Base, create_db_engine
from idun_agent_standalone.settings import StandaloneSettings


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


@pytest.mark.asyncio
async def test_engine_init_failure_rolls_db_back(tmp_path: Path, monkeypatch):
    """A bad config that breaks ``configure_app`` must NOT persist to DB.

    Strategy:
    - Boot a healthy echo agent.
    - PUT a config that points at a non-importable graph_definition. The
      framework / graph_definition are structural, so the orchestrator
      returns ``restart_required`` (202) WITHOUT calling configure_app.
      To exercise the recovery path we instead change ONLY ``config``
      with a marker that breaks the engine downstream.

    To deterministically trigger the failure path we monkeypatch
    ``configure_app`` (via the orchestrator's injection) so the second
    invocation raises. We do this by replacing
    ``app.state.reload_orchestrator`` with a wrapper that flips behaviour
    on the second call.
    """
    db_path = tmp_path / "atomic.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(_echo_yaml()))

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(config_path))

    async with _create_schema(f"sqlite+aiosqlite:///{db_path}"):
        settings = StandaloneSettings()
        app = await create_standalone_app(settings)

        async with app.router.lifespan_context(app):
            # Replace the orchestrator with one that fails on the next call,
            # mimicking a buggy config that breaks engine init.
            from fastapi.responses import JSONResponse

            async def _failing_orchestrator(_req, _session):
                # Mimic init_failed with recovered=True.
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": "engine_init_failed",
                        "message": "synthetic init failure",
                        "recovered": True,
                    },
                )

            app.state.reload_orchestrator = _failing_orchestrator

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                # Save the current agent state to assert it stays intact.
                resp_before = await client.get("/admin/api/v1/agent")
                assert resp_before.status_code == 200, resp_before.text
                old_state = resp_before.json()

                # Submit a *non-structural* mutation (only ``config`` body
                # changes). The failing orchestrator returns 500, which
                # should cause the helper to roll back the DB.
                resp = await client.put(
                    "/admin/api/v1/agent",
                    json={
                        "name": "broken-name",
                        "framework": old_state["framework"],
                        "graph_definition": old_state["graph_definition"],
                        "config": {"break_marker": "broken-value"},
                    },
                )
                assert resp.status_code == 500, resp.text
                body = resp.json()
                assert body.get("recovered") is True, body

                # The DB should still hold the OLD config.
                resp_after = await client.get("/admin/api/v1/agent")
                assert resp_after.status_code == 200
                got = resp_after.json()
                assert got == old_state, (
                    f"DB was not rolled back — expected {old_state}, got {got}"
                )


@pytest.mark.asyncio
async def test_structural_change_persists_for_restart(
    tmp_path: Path, monkeypatch
):
    """``restart_required`` MUST commit so the new state survives a process restart."""
    db_path = tmp_path / "structural.db"
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
                # Change graph_definition → structural → 202.
                resp = await client.put(
                    "/admin/api/v1/agent",
                    json={
                        "name": "test-echo",
                        "framework": "langgraph",
                        "graph_definition": (
                            "idun_agent_standalone.testing:echo_graph_v2"
                        ),
                        "config": {"checkpointer": {"type": "memory"}},
                    },
                )
                assert resp.status_code == 202, resp.text
                assert resp.json() == {"restart_required": True}

                # The structural change MUST be persisted so a restart
                # picks it up.
                resp_after = await client.get("/admin/api/v1/agent")
                assert resp_after.status_code == 200
                assert (
                    resp_after.json()["graph_definition"]
                    == "idun_agent_standalone.testing:echo_graph_v2"
                )
