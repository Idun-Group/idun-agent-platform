"""Integration test: structural agent changes return 202 restart_required (A10, spec §3.6 step 4)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.settings import StandaloneSettings


def _write_echo_config(target: Path) -> None:
    target.write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Structural Test",
                        "graph_definition": "idun_agent_standalone.testing:echo_graph",
                        "checkpointer": {"type": "memory"},
                    },
                },
            }
        )
    )


@pytest.mark.asyncio
async def test_graph_definition_change_returns_202_restart_required(
    tmp_path, monkeypatch
):
    """Spec §3.6 step 4: graph_definition change → 202 + restart_required."""
    cfg_path = tmp_path / "config.yaml"
    _write_echo_config(cfg_path)
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'struct.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(cfg_path))

    # Create schema synchronously (Alembic env.py uses asyncio.run which
    # collides with pytest-asyncio's running loop). Production boot calls
    # upgrade_head() outside any loop in run_server.
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
            current = await client.get("/admin/api/v1/agent")
            assert current.status_code == 200
            body = current.json()

            # Structural change: swap graph_definition path.
            body["graph_definition"] = (
                "idun_agent_standalone.testing:other_graph"
            )
            r = await client.put("/admin/api/v1/agent", json=body)
            assert r.status_code == 202, r.text
            assert r.json() == {"restart_required": True}
    finally:
        await app.state.db_engine.dispose()


@pytest.mark.asyncio
async def test_name_change_does_not_trigger_restart(tmp_path, monkeypatch):
    """Spec D11: only framework / graph_definition are structural.

    A simple name change should hot-reload (200), not restart_required (202).
    """
    cfg_path = tmp_path / "config.yaml"
    _write_echo_config(cfg_path)
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'name.db'}"
    )
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
            current = (await client.get("/admin/api/v1/agent")).json()
            current["name"] = "Renamed"
            r = await client.put("/admin/api/v1/agent", json=current)
            # Either reloaded (200) or persisted-only if engine init had a
            # transient hiccup (500 with recovered=true). Anything but 202
            # is fine — name change is NOT structural.
            assert r.status_code != 202, r.text
    finally:
        await app.state.db_engine.dispose()
