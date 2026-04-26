"""Regression: app.state.current_engine_config must reflect the LIVE agent,
not the latest persisted DB config (P0 from 2026-04-26 review)."""

from __future__ import annotations

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_restart_required_does_not_advance_live_config(tmp_path, monkeypatch):
    """Structural change → 202 → live config stays on previous graph."""
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(yaml.safe_dump({
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Live Config Test",
                "graph_definition": "idun_agent_standalone.testing:echo_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }))
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'live.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(cfg_path))

    from idun_agent_standalone.db.base import Base
    from sqlalchemy.ext.asyncio import create_async_engine

    settings = StandaloneSettings()
    _e = create_async_engine(settings.database_url)
    async with _e.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _e.dispose()

    app = await create_standalone_app(settings)
    try:
        async with app.router.lifespan_context(app), AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            before = app.state.current_engine_config
            assert before is not None

            # Structural change → 202 restart_required
            current = (await client.get("/admin/api/v1/agent")).json()
            current["graph_definition"] = "idun_agent_standalone.testing:other_graph"
            r = await client.put("/admin/api/v1/agent", json=current)
            assert r.status_code == 202

            # Live config must NOT have advanced
            after = app.state.current_engine_config
            assert after is before, (
                "current_engine_config advanced on restart_required — "
                "should still point at the previous live config"
            )
    finally:
        await app.state.db_engine.dispose()


@pytest.mark.asyncio
async def test_successful_hot_reload_advances_live_config(tmp_path, monkeypatch):
    """Non-structural change → 200 → live config advances to the new value."""
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(yaml.safe_dump({
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Original Name",
                "graph_definition": "idun_agent_standalone.testing:echo_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }))
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'live.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(cfg_path))

    from idun_agent_standalone.db.base import Base
    from sqlalchemy.ext.asyncio import create_async_engine

    settings = StandaloneSettings()
    _e = create_async_engine(settings.database_url)
    async with _e.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _e.dispose()

    app = await create_standalone_app(settings)
    try:
        async with app.router.lifespan_context(app), AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            before = app.state.current_engine_config
            assert before is not None
            assert before.agent.config.name == "Original Name"

            # Non-structural change (Spec D11): name only.
            current = (await client.get("/admin/api/v1/agent")).json()
            current["name"] = "Renamed Live"
            r = await client.put("/admin/api/v1/agent", json=current)
            # Successful hot reload returns 200 (no body override from
            # orchestrator). The router serializes its normal payload.
            assert r.status_code == 200, r.text

            # Live config MUST have advanced to reflect the new name.
            after = app.state.current_engine_config
            assert after is not before, (
                "current_engine_config did not advance on successful hot "
                "reload — should now point at the new config"
            )
            assert after.agent.config.name == "Renamed Live"
    finally:
        await app.state.db_engine.dispose()
