"""Phase 2 P2.2: Integration provider casing must normalize at all boundaries.

``IntegrationProvider`` is upper-case (``DISCORD``, ``SLACK`` …) but
operators may type ``"discord"`` or ``"Discord"``. Without normalization
the assembled ``EngineConfig`` rejects the row at validation time. The
fix normalizes on every write boundary (admin POST/PATCH, YAML
bootstrap) and defensively at the read boundary (``assemble_engine_config``)
so legacy rows still validate.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.config_assembly import assemble_engine_config
from idun_agent_standalone.config_io import seed_from_yaml
from idun_agent_standalone.db.models import (
    AgentRow,
    IntegrationRow,
    MemoryRow,
)

_DISCORD_CONFIG: dict[str, str] = {
    "bot_token": "test-bot-token",
    "application_id": "1234567890",
    "public_key": "0" * 64,
}


async def _seed_minimal_agent(session) -> None:
    session.add(
        AgentRow(
            id="singleton",
            name="t-agent",
            framework="langgraph",
            graph_definition="idun_agent_standalone.testing:echo_graph",
            config={},
        )
    )
    session.add(MemoryRow(id="singleton", config={"type": "memory"}))


@pytest.mark.asyncio
async def test_yaml_bootstrap_normalizes_lowercase_provider(
    standalone_app, tmp_path
):
    """YAML carrying ``provider: discord`` must persist as upper-case ``DISCORD``."""
    app, sm = standalone_app
    yaml_path: Path = tmp_path / "in.yaml"
    yaml_path.write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "hello",
                        "graph_definition": (
                            "idun_agent_standalone.testing:echo_graph"
                        ),
                        "checkpointer": {"type": "memory"},
                    },
                },
                "integrations": [
                    {
                        "provider": "discord",
                        "enabled": True,
                        "config": _DISCORD_CONFIG,
                    }
                ],
            }
        )
    )

    async with sm() as session:
        await seed_from_yaml(session, yaml_path)
        await session.commit()

    async with sm() as session:
        rows = (await session.execute(IntegrationRow.__table__.select())).fetchall()

    assert len(rows) == 1
    assert rows[0].kind == "DISCORD"

    async with sm() as session:
        cfg = await assemble_engine_config(session)

    assert cfg.integrations is not None
    assert cfg.integrations[0].provider.value == "DISCORD"


@pytest.mark.asyncio
async def test_admin_post_normalizes_mixed_case(standalone_app):
    """Admin POST with ``kind: "Discord"`` (mixed) → DB stores ``DISCORD``."""
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        r = await client.post(
            "/admin/api/v1/integrations",
            json={
                "kind": "Discord",
                "config": _DISCORD_CONFIG,
                "enabled": True,
            },
        )
    assert r.status_code in {200, 201}, r.text
    body = r.json()
    assert body["kind"] == "DISCORD"

    async with sm() as session:
        cfg = await assemble_engine_config(session)
    assert cfg.integrations is not None
    assert cfg.integrations[0].provider.value == "DISCORD"


@pytest.mark.asyncio
async def test_admin_post_unknown_provider_rejected(standalone_app):
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        r = await client.post(
            "/admin/api/v1/integrations",
            json={"kind": "myspace", "config": {}, "enabled": True},
        )
    assert r.status_code == 400, r.text


@pytest.mark.asyncio
async def test_admin_patch_normalizes_kind_change(standalone_app):
    """PATCH from ``DISCORD`` to ``"Slack"`` (mixed) must store ``SLACK``."""
    app, sm = standalone_app
    iid = str(uuid.uuid4())
    async with sm() as session:
        await _seed_minimal_agent(session)
        # Pre-existing row stored mixed-case to simulate a legacy entry.
        session.add(
            IntegrationRow(
                id=iid,
                kind="discord",
                config=_DISCORD_CONFIG,
                enabled=True,
            )
        )
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        r = await client.patch(
            f"/admin/api/v1/integrations/{iid}",
            json={
                "kind": "Slack",
                "config": {
                    "bot_token": "xoxb-...",
                    "signing_secret": "s" * 32,
                },
            },
        )
    assert r.status_code in {200, 201, 202}, r.text

    async with sm() as session:
        row = (
            await session.execute(
                IntegrationRow.__table__.select().where(IntegrationRow.id == iid)
            )
        ).one()
    assert row.kind == "SLACK"


@pytest.mark.asyncio
async def test_assemble_normalizes_legacy_lowercase_row(standalone_app):
    """Existing lower-case rows must still produce a valid ``EngineConfig``."""
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        # Legacy row from before normalization existed.
        session.add(
            IntegrationRow(
                id=str(uuid.uuid4()),
                kind="discord",
                config=_DISCORD_CONFIG,
                enabled=True,
            )
        )
        await session.commit()

    async with sm() as session:
        cfg = await assemble_engine_config(session)

    assert cfg.integrations is not None
    assert cfg.integrations[0].provider.value == "DISCORD"
