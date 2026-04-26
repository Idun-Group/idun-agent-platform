"""Build a validated ``EngineConfig`` from the standalone's DB rows.

This is the bridge between the admin DB (where operators edit individual
resources) and the engine (which receives a single ``EngineConfig`` per
boot/reload). Disabled MCP servers and integrations are filtered out so the
engine doesn't try to start them.
"""

from __future__ import annotations

from typing import Any

from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.engine.integrations import IntegrationProvider
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.db.models import (
    AgentRow,
    GuardrailRow,
    IntegrationRow,
    McpServerRow,
    MemoryRow,
    ObservabilityRow,
    PromptRow,
)

_FRAMEWORK_TYPE_MAP = {
    "langgraph": "LANGGRAPH",
    "adk": "ADK",
    "haystack": "HAYSTACK",
    "translation_agent": "TRANSLATION_AGENT",
    "correction_agent": "CORRECTION_AGENT",
    "deep_research_agent": "DEEP_RESEARCH_AGENT",
    "crewai": "CREWAI",
    "custom": "CUSTOM",
}


def _normalize_framework(value: str) -> str:
    """Map free-form framework strings to the engine's ``AgentFramework`` enum."""
    return _FRAMEWORK_TYPE_MAP.get(value.lower(), value.upper())


def _normalize_provider(name: str | IntegrationProvider) -> str:
    """Return the canonical (upper-case) ``IntegrationProvider`` value.

    Defensive: integration rows persisted before this normalization existed
    may store mixed/lower-case strings. ``IntegrationProvider`` is a
    ``StrEnum`` so a valid lower-case value upper-cases cleanly.
    """
    if isinstance(name, IntegrationProvider):
        return name.value
    return IntegrationProvider(name.upper()).value


async def assemble_engine_config(session: AsyncSession) -> EngineConfig:
    """Materialize an ``EngineConfig`` from the singleton + collection rows."""
    agent = (await session.execute(select(AgentRow))).scalar_one()
    memory = (await session.execute(select(MemoryRow))).scalar_one_or_none()
    guardrail = (await session.execute(select(GuardrailRow))).scalar_one_or_none()
    observability = (
        await session.execute(select(ObservabilityRow))
    ).scalar_one_or_none()

    mcp_rows = (
        await session.execute(
            select(McpServerRow).where(McpServerRow.enabled.is_(True))
        )
    ).scalars().all()
    integration_rows = (
        await session.execute(
            select(IntegrationRow).where(IntegrationRow.enabled.is_(True))
        )
    ).scalars().all()
    prompt_rows = (
        await session.execute(
            select(PromptRow).order_by(
                PromptRow.prompt_key, PromptRow.version.desc()
            )
        )
    ).scalars().all()

    inner_agent_config: dict[str, Any] = {
        "name": agent.name,
        "graph_definition": agent.graph_definition,
        **(agent.config or {}),
    }
    if memory and memory.config:
        inner_agent_config["checkpointer"] = memory.config

    data: dict[str, Any] = {
        "agent": {
            "type": _normalize_framework(agent.framework),
            "config": inner_agent_config,
        }
    }
    if guardrail and guardrail.enabled and guardrail.config:
        data["guardrails"] = guardrail.config
    if observability and observability.config:
        data["observability"] = observability.config
    if mcp_rows:
        data["mcp_servers"] = [
            {"name": r.name, **(r.config or {})} for r in mcp_rows
        ]
    if integration_rows:
        data["integrations"] = [
            {
                "provider": _normalize_provider(r.kind),
                "enabled": r.enabled,
                "config": r.config or {},
            }
            for r in integration_rows
        ]
    if prompt_rows:
        # Pick the highest-versioned row per ``prompt_key`` — prompts are
        # append-only, so the engine should always run with the latest.
        latest_by_key: dict[str, PromptRow] = {}
        for r in prompt_rows:
            existing = latest_by_key.get(r.prompt_key)
            if existing is None or r.version > existing.version:
                latest_by_key[r.prompt_key] = r
        data["prompts"] = [
            {
                "prompt_id": r.prompt_key,
                "version": r.version,
                "content": r.content,
                "tags": r.tags or [],
            }
            for r in latest_by_key.values()
        ]

    return EngineConfig.model_validate(data)
