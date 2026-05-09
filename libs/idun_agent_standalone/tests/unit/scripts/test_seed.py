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
from idun_agent_standalone.infrastructure.db.models.guardrail import (
    StandaloneGuardrailRow,
)
from idun_agent_standalone.infrastructure.db.models.integration import (
    StandaloneIntegrationRow,
)
from idun_agent_standalone.infrastructure.db.models.mcp_server import (
    StandaloneMCPServerRow,
)
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow
from idun_agent_standalone.infrastructure.db.models.observability import (
    StandaloneObservabilityRow,
)
from idun_agent_standalone.infrastructure.db.models.prompt import StandalonePromptRow
from idun_agent_standalone.infrastructure.db.models.sso import StandaloneSsoRow
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


# YAML with a top-level `sso:` block — exercises the SSO seeder. SSO is
# a singleton in the engine schema (a single SSOConfig, not a list), so
# the seeder writes one row keyed by id="singleton".
_SSO_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "sso": {
        "enabled": True,
        "issuer": "https://accounts.google.com",
        "client_id": "123456.apps.googleusercontent.com",
        "allowed_domains": ["example.com"],
    },
}


@pytest.fixture
def sso_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with an `sso:` block and return its path."""
    config_path = tmp_path / "config-with-sso.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_SSO_YAML, f)
    return config_path


# YAML with a top-level `mcp_servers:` block — exercises the mcp_servers
# seeder. Collection resource: each entry becomes its own row with a
# unique slug derived from the MCP server's name.
_MCP_SERVERS_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "mcp_servers": [
        {
            "name": "time",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-time"],
        },
        {
            "name": "filesystem",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
    ],
}


@pytest.fixture
def mcp_servers_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with an `mcp_servers:` block and return its path."""
    config_path = tmp_path / "config-with-mcp-servers.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_MCP_SERVERS_YAML, f)
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


async def test_seed_sso_inserts_singleton_when_empty(
    sessionmaker_factory: async_sessionmaker, sso_yaml_path: Path
) -> None:
    """YAML with sso block → 1 StandaloneSsoRow (singleton, fields preserved)."""
    await seed_from_yaml_if_empty(sessionmaker_factory, sso_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneSsoRow))).all()

    assert len(rows) == 1
    row = rows[0]
    assert row.id == "singleton"
    config = row.sso_config
    assert config["enabled"] is True
    assert config["issuer"] == "https://accounts.google.com"
    assert config["client_id"] == "123456.apps.googleusercontent.com"
    assert config["allowed_domains"] == ["example.com"]


async def test_seed_sso_skips_when_singleton_exists(
    sessionmaker_factory: async_sessionmaker, sso_yaml_path: Path
) -> None:
    """If singleton row exists, no re-seed (existing config preserved)."""
    async with sessionmaker_factory() as session:
        session.add(
            StandaloneSsoRow(
                id="singleton",
                sso_config={
                    "enabled": False,
                    "issuer": "https://other.idp",
                    "client_id": "other-client",
                },
            )
        )
        await session.commit()

    await seed_from_yaml_if_empty(sessionmaker_factory, sso_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneSsoRow))).all()

    assert len(rows) == 1
    # The pre-existing row was NOT overwritten with the YAML values.
    assert rows[0].sso_config["issuer"] == "https://other.idp"
    assert rows[0].sso_config["enabled"] is False


async def test_seed_sso_no_op_on_yaml_without_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without sso block → no row, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(select(func.count()).select_from(StandaloneSsoRow))

    assert count == 0


async def test_seed_mcp_servers_inserts_rows_when_empty(
    sessionmaker_factory: async_sessionmaker, mcp_servers_yaml_path: Path
) -> None:
    """YAML with 2 MCP servers → 2 StandaloneMCPServerRow records with unique slugs."""
    await seed_from_yaml_if_empty(sessionmaker_factory, mcp_servers_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneMCPServerRow))).all()

    assert len(rows) == 2
    names = {r.name for r in rows}
    assert names == {"time", "filesystem"}
    # All rows enabled by default.
    assert all(r.enabled for r in rows)
    # Slugs are unique across the seeded batch.
    slugs = [r.slug for r in rows]
    assert len(set(slugs)) == 2
    # Config dict preserved (transport/command/args round-trip).
    time_row = next(r for r in rows if r.name == "time")
    assert time_row.mcp_server_config["transport"] == "stdio"
    assert time_row.mcp_server_config["command"] == "npx"
    assert time_row.mcp_server_config["args"] == [
        "-y",
        "@modelcontextprotocol/server-time",
    ]


async def test_seed_mcp_servers_skips_when_table_nonempty(
    sessionmaker_factory: async_sessionmaker, mcp_servers_yaml_path: Path
) -> None:
    """If the mcp_servers table has any row, the mcp_servers seeder is a no-op."""
    async with sessionmaker_factory() as session:
        session.add(
            StandaloneMCPServerRow(
                name="pre-existing",
                slug="pre-existing",
                enabled=True,
                mcp_server_config={
                    "transport": "stdio",
                    "command": "echo",
                    "args": ["hi"],
                },
            )
        )
        await session.commit()

    async with sessionmaker_factory() as session:
        pre_count = await session.scalar(
            select(func.count()).select_from(StandaloneMCPServerRow)
        )

    await seed_from_yaml_if_empty(sessionmaker_factory, mcp_servers_yaml_path)

    async with sessionmaker_factory() as session:
        post_count = await session.scalar(
            select(func.count()).select_from(StandaloneMCPServerRow)
        )
        rows = (await session.scalars(select(StandaloneMCPServerRow))).all()

    assert post_count == pre_count, "mcp_servers re-seeded despite non-empty table"
    assert {r.name for r in rows} == {"pre-existing"}


async def test_seed_mcp_servers_no_op_on_yaml_without_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without an `mcp_servers:` block → no rows, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneMCPServerRow)
        )

    assert count == 0


# YAML with a top-level `integrations:` block — exercises the integrations
# seeder. Collection resource: each entry becomes its own row with a slug
# derived from the provider, and the row level ``enabled`` flag preserved
# from the YAML (NOT default-True like mcp_servers).
_INTEGRATIONS_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "integrations": [
        {
            "provider": "WHATSAPP",
            "enabled": True,
            "config": {
                "access_token": "test-token",
                "phone_number_id": "123456",
                "verify_token": "test-verify",
            },
        },
        {
            "provider": "DISCORD",
            "enabled": False,
            "config": {
                "bot_token": "test-bot-token",
                "application_id": "987654",
                "public_key": "abcdef",
            },
        },
    ],
}


@pytest.fixture
def integrations_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with an `integrations:` block and return its path."""
    config_path = tmp_path / "config-with-integrations.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_INTEGRATIONS_YAML, f)
    return config_path


async def test_seed_integrations_inserts_rows_when_empty(
    sessionmaker_factory: async_sessionmaker, integrations_yaml_path: Path
) -> None:
    """YAML with 2 integrations → 2 rows with unique slugs, enabled flags preserved."""
    await seed_from_yaml_if_empty(sessionmaker_factory, integrations_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (await session.scalars(select(StandaloneIntegrationRow))).all()

    assert len(rows) == 2
    # Both providers are present in the seeded payloads.
    providers = {r.integration_config["provider"] for r in rows}
    assert providers == {"WHATSAPP", "DISCORD"}
    # Enabled flag preserved from YAML (WhatsApp=true, Discord=false). The
    # row level enabled is the single source of truth at assembly; the
    # seeder must NOT default it to True like mcp_servers does.
    by_provider = {r.integration_config["provider"]: r for r in rows}
    assert by_provider["WHATSAPP"].enabled is True
    assert by_provider["DISCORD"].enabled is False
    # Slugs are unique across the seeded batch.
    slugs = [r.slug for r in rows]
    assert len(set(slugs)) == 2


async def test_seed_integrations_skips_when_table_nonempty(
    sessionmaker_factory: async_sessionmaker, integrations_yaml_path: Path
) -> None:
    """If the integrations table has any row, the seeder is a no-op."""
    async with sessionmaker_factory() as session:
        existing = StandaloneIntegrationRow(
            slug="pre-existing",
            name="pre-existing",
            enabled=True,
            integration_config={
                "provider": "SLACK",
                "enabled": True,
                "config": {
                    "bot_token": "xoxb-pre",
                    "signing_secret": "shh",
                },
            },
        )
        session.add(existing)
        await session.commit()

    await seed_from_yaml_if_empty(sessionmaker_factory, integrations_yaml_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneIntegrationRow)
        )
        rows = (await session.scalars(select(StandaloneIntegrationRow))).all()

    assert count == 1
    assert {r.integration_config["provider"] for r in rows} == {"SLACK"}


async def test_seed_integrations_no_op_on_yaml_without_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without an `integrations:` block → no rows, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneIntegrationRow)
        )

    assert count == 0


# YAML with a top-level `guardrails:` block — exercises the guardrails
# seeder. Mixed input (2) and output (1) so positions and sort_order
# branches both fire. Engine YAML uses the engine-shape ``GuardrailsV2``
# typed configs; the seeder converts each to manager-shape via
# ``to_manager_shape`` before storing in the JSON column.
_GUARDRAILS_YAML: dict[str, Any] = {
    **_AGENT_YAML,
    "guardrails": {
        "input": [
            {
                "config_id": "ban_list",
                "banned_words": ["secret-word", "another-banned"],
                "api_key": "test-key",
            },
            {
                "config_id": "detect_pii",
                "pii_entities": ["EMAIL_ADDRESS", "PHONE_NUMBER"],
                "api_key": "test-key",
            },
        ],
        "output": [
            {
                "config_id": "toxic_language",
                "threshold": 0.5,
                "api_key": "test-key",
            },
        ],
    },
}


@pytest.fixture
def guardrails_yaml_path(tmp_path: Path) -> Path:
    """Write a YAML config with a `guardrails:` block and return its path."""
    config_path = tmp_path / "config-with-guardrails.yaml"
    with open(config_path, "w") as f:
        yaml.dump(_GUARDRAILS_YAML, f)
    return config_path


async def test_seed_guardrails_inserts_input_and_output_rows(
    sessionmaker_factory: async_sessionmaker, guardrails_yaml_path: Path
) -> None:
    """YAML with 2 input + 1 output guards → 3 StandaloneGuardrailRow records.

    Exercises the position split (``input``/``output``), the per-position
    ``sort_order`` counter, and the manager-shape conversion: the JSON
    column must hold the manager-shape (``config_id`` + guard-specific
    fields, no engine-only ``guard_url``).
    """
    await seed_from_yaml_if_empty(sessionmaker_factory, guardrails_yaml_path)

    async with sessionmaker_factory() as session:
        rows = (
            await session.scalars(
                select(StandaloneGuardrailRow).order_by(
                    StandaloneGuardrailRow.position,
                    StandaloneGuardrailRow.sort_order,
                )
            )
        ).all()

    assert len(rows) == 3
    inputs = [r for r in rows if r.position == "input"]
    outputs = [r for r in rows if r.position == "output"]
    assert len(inputs) == 2
    assert len(outputs) == 1
    # Sort order is monotonic and starts at 0 within each position bucket
    # so the assembly layer's ORDER BY (position, sort_order) preserves
    # the operator's YAML ordering.
    assert [r.sort_order for r in inputs] == [0, 1]
    assert outputs[0].sort_order == 0
    # All enabled by default — engine GuardrailsV2 has no per-guard
    # ``enabled`` flag so the seeder marks every row enabled.
    assert all(r.enabled for r in rows)
    # Slugs are unique across the seeded batch.
    slugs = [r.slug for r in rows]
    assert len(set(slugs)) == 3
    # Manager-shape stored: each row holds a ``config_id`` and the
    # guard-specific fields (no engine-only ``guard_url``).
    config_ids = [r.guardrail_config["config_id"] for r in rows]
    assert set(config_ids) == {"ban_list", "detect_pii", "toxic_language"}
    for row in rows:
        assert "guard_url" not in row.guardrail_config
    ban_row = next(r for r in inputs if r.guardrail_config["config_id"] == "ban_list")
    assert ban_row.guardrail_config["banned_words"] == [
        "secret-word",
        "another-banned",
    ]


async def test_seed_guardrails_skips_when_table_nonempty(
    sessionmaker_factory: async_sessionmaker, guardrails_yaml_path: Path
) -> None:
    """If the guardrails table has any row, the seeder is a no-op."""
    async with sessionmaker_factory() as session:
        existing = StandaloneGuardrailRow(
            slug="pre-existing",
            name="pre-existing",
            position="input",
            sort_order=0,
            enabled=True,
            guardrail_config={
                "config_id": "detect_pii",
                "pii_entities": ["EMAIL_ADDRESS"],
            },
        )
        session.add(existing)
        await session.commit()

    await seed_from_yaml_if_empty(sessionmaker_factory, guardrails_yaml_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneGuardrailRow)
        )
        rows = (await session.scalars(select(StandaloneGuardrailRow))).all()

    assert count == 1
    assert rows[0].slug == "pre-existing"


async def test_seed_guardrails_no_op_on_yaml_without_block(
    sessionmaker_factory: async_sessionmaker, yaml_config_path: Path
) -> None:
    """YAML without a `guardrails:` block → no rows, no error."""
    await seed_from_yaml_if_empty(sessionmaker_factory, yaml_config_path)

    async with sessionmaker_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(StandaloneGuardrailRow)
        )

    assert count == 0
