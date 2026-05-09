"""Unit tests for the per-resource seed pipeline.

The seeder is split into one function per resource so a failure
materializing one resource (e.g. observability rows in a future
extension) cannot prevent the agent from booting. This module pins
that contract: the orchestrator must catch + log per-resource
exceptions and keep going.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import yaml
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow
from idun_agent_standalone.infrastructure.db.models.observability import (
    StandaloneObservabilityRow,
)
from idun_agent_standalone.infrastructure.db.models.prompt import StandalonePromptRow
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.infrastructure.scripts import seed as seed_module
from idun_agent_standalone.infrastructure.scripts.seed import seed_from_yaml_if_empty
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# A minimal LangGraph YAML the engine's ConfigBuilder can validate
# without importing a real graph module. We intentionally include
# a checkpointer so the memory seed branch fires.
_AGENT_YAML: dict[str, Any] = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {
            "name": "Seeded Ada",
            "graph_definition": "./agent.py:graph",
            "checkpointer": {
                "type": "sqlite",
                "db_url": "sqlite:///checkpoint.db",
            },
        },
    },
}


@pytest.fixture
async def sessionmaker_factory() -> AsyncIterator[async_sessionmaker]:
    """Async sessionmaker bound to an in-memory SQLite with all ORMs created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
def yaml_config_path(tmp_path: Path) -> Path:
    """Write the minimal LangGraph YAML to disk and return its path."""
    config_path = tmp_path / "config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_AGENT_YAML, f)
    return config_path


# YAML with a top-level `prompts:` block — exercises the prompts seeder.
_PROMPTS_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "prompts": [
        {
            "prompt_id": "system-prompt",
            "version": 2,
            "content": "You are a helpful assistant for {{ domain }}.",
            "tags": ["latest", "production"],
        },
        {
            "prompt_id": "rag-context",
            "version": 1,
            "content": "Use this context: {{ context }}",
            "tags": ["rag"],
        },
    ],
}


@pytest.fixture
def prompts_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with a `prompts:` block and return its path."""
    config_path = tmp_path / "config-with-prompts.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_PROMPTS_YAML, f)
    return config_path


# YAML with a top-level `observability:` block — exercises the
# observability seeder (singleton resource: only the first provider
# from the list is persisted, mirroring the assembly layer's wrap).
_OBSERVABILITY_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "observability": [
        {
            "provider": "LANGFUSE",
            "enabled": True,
            "config": {
                "host": "https://cloud.langfuse.com",
                "public_key": "pk-test",
                "secret_key": "sk-test",
            },
        },
    ],
}


@pytest.fixture
def observability_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with an `observability:` block and return its path."""
    config_path = tmp_path / "config-with-observability.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_OBSERVABILITY_YAML, f)
    return config_path


async def test_seed_from_yaml_writes_agent_and_memory_rows(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """Happy path: both per-resource functions run and persist rows."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        agent = (await session.execute(select(StandaloneAgentRow))).scalar_one()
        memory = (await session.execute(select(StandaloneMemoryRow))).scalar_one()

    assert agent.name == "Seeded Ada"
    assert agent.status == "draft"
    assert agent.base_engine_config["agent"]["type"] == "LANGGRAPH"
    # The checkpointer is moved off the agent body and lives on the memory row.
    assert "checkpointer" not in agent.base_engine_config["agent"]["config"]
    assert memory.agent_framework == "LANGGRAPH"
    assert memory.memory_config["type"] == "sqlite"


async def test_seed_skips_when_db_already_has_agent(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """If the agent row exists, the seeder is a no-op (no second insert)."""
    async with sessionmaker_factory() as session:
        session.add(
            StandaloneAgentRow(
                name="Existing",
                base_engine_config={"server": {}, "agent": {"type": "LANGGRAPH"}},
            )
        )
        await session.commit()

    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        agents = (await session.execute(select(StandaloneAgentRow))).scalars().all()

    assert len(agents) == 1
    assert agents[0].name == "Existing"


async def test_seed_no_config_path_is_noop(
    sessionmaker_factory: async_sessionmaker, tmp_path: Path
) -> None:
    """No YAML on disk → no rows, no exception."""
    missing = tmp_path / "does-not-exist.yaml"

    await seed_from_yaml_if_empty(sessionmaker_factory, missing)

    async with sessionmaker_factory() as session:
        agents = (await session.execute(select(StandaloneAgentRow))).scalars().all()
        memories = (await session.execute(select(StandaloneMemoryRow))).scalars().all()

    assert agents == []
    assert memories == []


async def test_memory_failure_does_not_block_agent_seed(
    sessionmaker_factory: async_sessionmaker,
    yaml_config_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If `_seed_memory_if_empty` raises, the agent row must still be persisted.

    This pins SPEC decision #8: per-resource try/except in the
    orchestrator. Observability/memory failures cannot kill agent boot.
    """

    async def boom(session: Any, engine_config: Any) -> None:
        raise RuntimeError("simulated memory seeder explosion")

    monkeypatch.setattr(seed_module, "_seed_memory_if_empty", boom)

    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        agents = (await session.execute(select(StandaloneAgentRow))).scalars().all()
        memories = (await session.execute(select(StandaloneMemoryRow))).scalars().all()

    assert len(agents) == 1
    assert agents[0].name == "Seeded Ada"
    assert memories == []


async def test_agent_failure_does_not_block_memory_seed(
    sessionmaker_factory: async_sessionmaker,
    yaml_config_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If `_seed_agent_if_empty` raises, the memory seeder still gets a chance.

    Pins symmetric per-resource isolation — neither helper monopolizes
    the boot path.
    """

    async def boom(session: Any, engine_config: Any) -> None:
        raise RuntimeError("simulated agent seeder explosion")

    monkeypatch.setattr(seed_module, "_seed_agent_if_empty", boom)

    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        agents = (await session.execute(select(StandaloneAgentRow))).scalars().all()
        memories = (await session.execute(select(StandaloneMemoryRow))).scalars().all()

    assert agents == []
    assert len(memories) == 1
    assert memories[0].agent_framework == "LANGGRAPH"


async def test_seed_prompts_inserts_rows_when_empty(
    sessionmaker_factory: async_sessionmaker, prompts_yaml_path: Path
) -> None:
    """YAML with 2 prompts → 2 StandalonePromptRow records, fields preserved."""
    await seed_from_yaml_if_empty(sessionmaker_factory, prompts_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandalonePromptRow))).all()

    assert len(rows) == 2
    assert {r.prompt_id for r in rows} == {"system-prompt", "rag-context"}
    sys_row = next(r for r in rows if r.prompt_id == "system-prompt")
    assert sys_row.version == 2
    assert sys_row.content == "You are a helpful assistant for {{ domain }}."
    assert sys_row.tags == ["latest", "production"]


async def test_seed_prompts_skips_when_table_nonempty(
    sessionmaker_factory: async_sessionmaker, prompts_yaml_path: Path
) -> None:
    """If the prompts table already has rows, the prompts seeder is a no-op."""
    async with sessionmaker_factory() as session:
        session.add(
            StandalonePromptRow(
                prompt_id="pre-existing",
                version=1,
                content="already here",
                tags=[],
            )
        )
        await session.commit()

    async with sessionmaker_factory() as session:
        pre_count = await session.scalar(
            select(func.count()).select_from(StandalonePromptRow)
        )

    await seed_from_yaml_if_empty(sessionmaker_factory, prompts_yaml_path)

    async with sessionmaker_factory() as session:
        post_count = await session.scalar(
            select(func.count()).select_from(StandalonePromptRow)
        )
        rows = (await session.scalars(select(StandalonePromptRow))).all()

    assert post_count == pre_count, "prompts re-seeded despite non-empty table"
    assert {r.prompt_id for r in rows} == {"pre-existing"}


async def test_seed_prompts_no_op_on_yaml_without_prompts_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without a `prompts:` block → no rows, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandalonePromptRow)
        )

    assert count == 0


async def test_seed_observability_inserts_singleton_when_empty(
    sessionmaker_factory: async_sessionmaker, observability_yaml_path: Path
) -> None:
    """YAML with observability provider → 1 StandaloneObservabilityRow (singleton)."""
    await seed_from_yaml_if_empty(sessionmaker_factory, observability_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneObservabilityRow))).all()

    assert len(rows) == 1
    row = rows[0]
    # Singleton PK + config dict preserved from the first provider in YAML.
    assert row.id == "singleton"
    config = row.observability_config
    assert config["provider"] == "LANGFUSE"
    assert config["enabled"] is True
    assert "config" in config


async def test_seed_observability_skips_when_singleton_exists(
    sessionmaker_factory: async_sessionmaker, observability_yaml_path: Path
) -> None:
    """If singleton row exists, no re-seed (existing config preserved)."""
    async with sessionmaker_factory() as session:
        session.add(
            StandaloneObservabilityRow(
                id="singleton",
                observability_config={
                    "provider": "PHOENIX",
                    "enabled": False,
                    "config": {},
                },
            )
        )
        await session.commit()

    await seed_from_yaml_if_empty(sessionmaker_factory, observability_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneObservabilityRow))).all()

    assert len(rows) == 1
    # The pre-existing PHOENIX row was NOT overwritten with LANGFUSE.
    assert rows[0].observability_config["provider"] == "PHOENIX"


async def test_seed_observability_no_op_on_yaml_without_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without observability block → no row, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneObservabilityRow)
        )

    assert count == 0
