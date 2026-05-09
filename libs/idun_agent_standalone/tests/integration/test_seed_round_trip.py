"""End-to-end: maximal YAML → seed → assemble_engine_config → semantic match.

This is the cross-cutting proof that all 7 per-resource seeders
(agent, memory, prompts, observability, sso, mcp_servers,
integrations, guardrails) and the assembly layer agree on shapes.
Per-resource isolation tests live in tests/unit/scripts/test_seed.py;
this integration test catches subtle interaction bugs (slug
collisions across resources, sort_order regressions, manager↔engine
shape round-trip drift) that the per-resource tests can't surface
individually.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.guardrails_v2 import GuardrailConfigId
from idun_agent_schema.engine.integrations.base import IntegrationProvider
from idun_agent_schema.engine.observability_v2 import ObservabilityProvider
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.infrastructure.scripts.seed import seed_from_yaml_if_empty
from idun_agent_standalone.services.engine_config import assemble_engine_config
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

_MAXIMAL_YAML_PATH = (
    Path(__file__).parent.parent / "fixtures" / "configs" / "maximal.yaml"
)


@pytest.fixture
async def sessionmaker_factory() -> AsyncIterator[async_sessionmaker]:
    """Async sessionmaker bound to an in-memory SQLite with all ORMs created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
def maximal_yaml_path() -> Path:
    """Absolute path to the maximal YAML fixture (all 8 resource blocks)."""
    assert (
        _MAXIMAL_YAML_PATH.exists()
    ), f"maximal YAML fixture missing at {_MAXIMAL_YAML_PATH}"
    return _MAXIMAL_YAML_PATH


async def test_maximal_yaml_seed_round_trip(
    sessionmaker_factory: async_sessionmaker, maximal_yaml_path: Path
) -> None:
    """Seed every resource from the maximal YAML and assemble a matching EngineConfig.

    Pins the contract that the seeder + assembly form a faithful
    round-trip across every resource block. Any new field added to a
    seeder that the assembly layer does not surface (or vice versa)
    will surface here as a missing/extra section on the assembled
    EngineConfig.
    """
    await seed_from_yaml_if_empty(sessionmaker_factory, maximal_yaml_path)

    async with sessionmaker_factory() as session:
        engine_config = await assemble_engine_config(session)

    # ---- Agent + memory (memory is layered onto agent.config.checkpointer) ----
    assert engine_config.agent.type == AgentFramework.LANGGRAPH
    assert engine_config.agent.config.name == "Seeded Ada"
    checkpointer = engine_config.agent.config.checkpointer
    assert checkpointer is not None, "memory row not layered onto agent.config"
    assert checkpointer.type == "sqlite"
    assert checkpointer.db_url == "sqlite:///checkpoint.db"

    # ---- Prompts: 2 entries, fields preserved ----
    assert engine_config.prompts is not None
    assert len(engine_config.prompts) == 2
    by_id = {p.prompt_id: p for p in engine_config.prompts}
    assert set(by_id) == {"system-prompt", "rag-context"}
    assert by_id["system-prompt"].version == 2
    assert by_id["system-prompt"].content == (
        "You are a helpful assistant for {{ domain }}."
    )
    assert by_id["system-prompt"].tags == ["latest", "production"]
    assert by_id["rag-context"].version == 1

    # ---- Observability: singleton wrapped back into a 1-elem list ----
    assert engine_config.observability is not None
    assert len(engine_config.observability) == 1
    obs = engine_config.observability[0]
    assert obs.provider == ObservabilityProvider.LANGFUSE
    assert obs.enabled is True
    assert obs.config.host == "https://cloud.langfuse.com"
    assert obs.config.public_key == "pk-test"
    assert obs.config.secret_key == "sk-test"

    # ---- SSO: present, enabled, fields preserved ----
    assert engine_config.sso is not None
    assert engine_config.sso.enabled is True
    assert engine_config.sso.issuer == "https://accounts.google.com"
    assert engine_config.sso.client_id == "123456.apps.googleusercontent.com"
    assert engine_config.sso.allowed_domains == ["example.com"]

    # ---- MCP servers: 2, both enabled ----
    assert engine_config.mcp_servers is not None
    assert len(engine_config.mcp_servers) == 2
    mcp_names = {m.name for m in engine_config.mcp_servers}
    assert mcp_names == {"time", "filesystem"}
    time_mcp = next(m for m in engine_config.mcp_servers if m.name == "time")
    assert time_mcp.transport == "stdio"
    assert time_mcp.command == "npx"
    assert time_mcp.args == ["-y", "@modelcontextprotocol/server-time"]

    # ---- Integrations: only the enabled WhatsApp row surfaces; Discord is filtered. ----
    # _layer_integrations drops disabled rows so the engine never tries to
    # register a webhook for an integration the operator has paused.
    assert engine_config.integrations is not None
    assert len(engine_config.integrations) == 1
    whatsapp = engine_config.integrations[0]
    assert whatsapp.provider == IntegrationProvider.WHATSAPP
    assert whatsapp.enabled is True
    assert whatsapp.config.access_token == "test-token"
    assert whatsapp.config.phone_number_id == "123456"
    assert whatsapp.config.verify_token == "test-verify"

    # ---- Guardrails: 2 input + 1 output, ordering preserved by sort_order ----
    assert engine_config.guardrails is not None
    assert len(engine_config.guardrails.input) == 2
    assert len(engine_config.guardrails.output) == 1

    input_ids = [g.config_id for g in engine_config.guardrails.input]
    assert input_ids == [
        GuardrailConfigId.BAN_LIST,
        GuardrailConfigId.DETECT_PII,
    ]
    output_ids = [g.config_id for g in engine_config.guardrails.output]
    assert output_ids == [GuardrailConfigId.TOXIC_LANGUAGE]

    ban_guard = engine_config.guardrails.input[0]
    assert ban_guard.banned_words == ["secret-word", "another-banned"]
    pii_guard = engine_config.guardrails.input[1]
    assert pii_guard.pii_entities == ["EMAIL_ADDRESS", "PHONE_NUMBER"]
    toxic_guard = engine_config.guardrails.output[0]
    assert toxic_guard.threshold == 0.5
