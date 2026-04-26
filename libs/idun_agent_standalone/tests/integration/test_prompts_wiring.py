"""Phase 2 P2.1: Admin-edited prompts must reach the assembled engine config.

Prompts live in their own DB table; without explicit wiring in
``assemble_engine_config`` they never reach the engine. This test asserts
that the latest version of every ``PromptRow`` ends up in
``EngineConfig.prompts`` keyed by ``prompt_id``.
"""

from __future__ import annotations

import uuid

import pytest
from idun_agent_standalone.config_assembly import assemble_engine_config
from idun_agent_standalone.db.models import (
    AgentRow,
    MemoryRow,
    PromptRow,
)


async def _seed_minimal_agent(session) -> None:
    """Seed the singletons required for ``assemble_engine_config`` to succeed."""
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
async def test_prompt_rows_reach_assembled_config(standalone_app):
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        session.add(
            PromptRow(
                id=str(uuid.uuid4()),
                prompt_key="greeting",
                content="Hello {{ name }}",
                version=1,
                tags=["welcome"],
            )
        )
        await session.commit()

    async with sm() as session:
        cfg = await assemble_engine_config(session)

    assert cfg.prompts is not None, "EngineConfig.prompts must be populated"
    keys = {p.prompt_id for p in cfg.prompts}
    assert "greeting" in keys

    greeting = next(p for p in cfg.prompts if p.prompt_id == "greeting")
    assert greeting.content == "Hello {{ name }}"
    assert greeting.version == 1
    assert greeting.tags == ["welcome"]


@pytest.mark.asyncio
async def test_assemble_picks_latest_version_per_prompt_key(standalone_app):
    """When multiple versions of the same key exist, the engine sees only the latest."""
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        for v, content in [(1, "v1"), (2, "v2"), (3, "v3")]:
            session.add(
                PromptRow(
                    id=str(uuid.uuid4()),
                    prompt_key="system",
                    content=content,
                    version=v,
                    tags=[],
                )
            )
        await session.commit()

    async with sm() as session:
        cfg = await assemble_engine_config(session)

    assert cfg.prompts is not None
    matching = [p for p in cfg.prompts if p.prompt_id == "system"]
    assert len(matching) == 1, "Only the latest version should reach the engine"
    assert matching[0].version == 3
    assert matching[0].content == "v3"


@pytest.mark.asyncio
async def test_no_prompt_rows_yields_no_prompts_field(standalone_app):
    """Empty prompt table must leave ``cfg.prompts`` as ``None``, not ``[]``."""
    app, sm = standalone_app
    async with sm() as session:
        await _seed_minimal_agent(session)
        await session.commit()

    async with sm() as session:
        cfg = await assemble_engine_config(session)

    assert cfg.prompts is None
