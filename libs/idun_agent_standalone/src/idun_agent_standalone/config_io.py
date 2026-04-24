"""YAML <-> DB IO for the standalone.

On first boot we seed the DB from ``IDUN_CONFIG_PATH``. After that, the DB
is the source of truth; ``export_db_as_yaml`` dumps it back to YAML for
backup or hub migration.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.db.models import (
    AgentRow,
    GuardrailRow,
    IntegrationRow,
    McpServerRow,
    MemoryRow,
    ObservabilityRow,
    PromptRow,
    ThemeRow,
)

logger = logging.getLogger(__name__)


async def is_db_empty(session: AsyncSession) -> bool:
    res = await session.execute(select(AgentRow.id))
    return res.scalar_one_or_none() is None


def _agent_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Extract the ``agent`` section regardless of whether it's nested under
    ``config`` (engine YAML shape) or flat (export shape).
    """
    raw = data.get("agent") or {}
    if "config" in raw and isinstance(raw["config"], dict):
        merged = dict(raw["config"])
        merged.setdefault("type", raw.get("type"))
        return merged
    return raw


async def seed_from_yaml(session: AsyncSession, yaml_path: Path) -> None:
    """Seed all tables from a YAML config file. Caller commits."""
    data = yaml.safe_load(yaml_path.read_text())
    if not isinstance(data, dict):
        raise ValueError("config YAML must be a mapping")

    flat = _agent_payload(data)

    framework = (
        (data.get("agent") or {}).get("type") or flat.get("type") or "LANGGRAPH"
    )
    name = flat.get("name", "agent")
    graph_definition = flat.get("graph_definition", "")
    other_agent_config = {
        k: v
        for k, v in flat.items()
        if k not in {"name", "graph_definition", "checkpointer", "type"}
    }

    session.add(
        AgentRow(
            id="singleton",
            name=name,
            framework=str(framework).lower(),
            graph_definition=graph_definition,
            config=other_agent_config,
        )
    )
    session.add(
        MemoryRow(
            id="singleton", config=flat.get("checkpointer") or {"type": "memory"}
        )
    )
    session.add(
        GuardrailRow(
            id="singleton",
            config=data.get("guardrails") or {},
            enabled=bool(data.get("guardrails")),
        )
    )
    session.add(ObservabilityRow(id="singleton", config=data.get("observability") or {}))
    session.add(ThemeRow(id="singleton", config=data.get("theme") or {}))

    for m in data.get("mcp_servers") or []:
        session.add(
            McpServerRow(
                id=str(uuid.uuid4()),
                name=m.get("name", "unnamed"),
                config={k: v for k, v in m.items() if k != "name"},
                enabled=m.get("enabled", True),
            )
        )
    for p in data.get("prompts") or []:
        session.add(
            PromptRow(
                id=str(uuid.uuid4()),
                prompt_key=p["prompt_id"] if "prompt_id" in p else p["key"],
                version=p.get("version", 1),
                content=p["content"],
                tags=p.get("tags", []),
            )
        )
    for i in data.get("integrations") or []:
        session.add(
            IntegrationRow(
                id=str(uuid.uuid4()),
                kind=str(
                    i.get("provider") or i.get("kind") or "unknown"
                ).lower(),
                config=i.get("config") or {
                    k: v
                    for k, v in i.items()
                    if k not in {"provider", "kind", "enabled"}
                },
                enabled=i.get("enabled", False),
            )
        )


async def reset_and_seed_from_yaml(session: AsyncSession, yaml_path: Path) -> None:
    """Wipe all tables and re-seed (used by the ``import`` CLI)."""
    for model in (
        IntegrationRow,
        PromptRow,
        McpServerRow,
        ThemeRow,
        ObservabilityRow,
        GuardrailRow,
        MemoryRow,
        AgentRow,
    ):
        await session.execute(delete(model))
    await seed_from_yaml(session, yaml_path)


async def export_db_as_yaml(session: AsyncSession) -> str:
    agent = (await session.execute(select(AgentRow))).scalar_one()
    memory = (await session.execute(select(MemoryRow))).scalar_one_or_none()
    guardrail = (await session.execute(select(GuardrailRow))).scalar_one_or_none()
    observability = (
        await session.execute(select(ObservabilityRow))
    ).scalar_one_or_none()
    theme = (await session.execute(select(ThemeRow))).scalar_one_or_none()
    mcps = (await session.execute(select(McpServerRow))).scalars().all()
    prompts = (await session.execute(select(PromptRow))).scalars().all()
    integrations = (await session.execute(select(IntegrationRow))).scalars().all()

    inner_agent_config: dict[str, Any] = {
        "name": agent.name,
        "graph_definition": agent.graph_definition,
        **(agent.config or {}),
    }
    if memory and memory.config:
        inner_agent_config["checkpointer"] = memory.config

    out: dict[str, Any] = {
        "agent": {
            "type": agent.framework.upper(),
            "config": inner_agent_config,
        }
    }
    if guardrail and guardrail.config:
        out["guardrails"] = guardrail.config
    if observability and observability.config:
        out["observability"] = observability.config
    if theme and theme.config:
        out["theme"] = theme.config
    if mcps:
        out["mcp_servers"] = [
            {"name": m.name, "enabled": m.enabled, **(m.config or {})} for m in mcps
        ]
    if prompts:
        out["prompts"] = [
            {
                "prompt_id": p.prompt_key,
                "version": p.version,
                "content": p.content,
                "tags": p.tags,
            }
            for p in prompts
        ]
    if integrations:
        out["integrations"] = [
            {
                "provider": i.kind.upper(),
                "enabled": i.enabled,
                "config": i.config or {},
            }
            for i in integrations
        ]

    return yaml.safe_dump(out, sort_keys=False)
