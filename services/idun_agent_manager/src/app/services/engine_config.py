"""Engine config assembly and resource synchronization.

Contains the core logic for:
- Assembling a full EngineConfig from relational references
- Synchronizing resource associations (FK + junction tables)
- Recomputing the materialized engine_config JSONB cache
"""

import logging
from typing import Any
from uuid import UUID, uuid4

from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.manager.guardrail_configs import convert_guardrail
from idun_agent_schema.manager.managed_agent import AgentResourceIds
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.db.models.agent_guardrail import AgentGuardrailModel
from app.infrastructure.db.models.agent_integration import AgentIntegrationModel
from app.infrastructure.db.models.agent_mcp_server import AgentMCPServerModel
from app.infrastructure.db.models.agent_observability import AgentObservabilityModel
from app.infrastructure.db.models.managed_agent import ManagedAgentModel

logger = logging.getLogger(__name__)


def assemble_engine_config(model: ManagedAgentModel) -> dict[str, Any]:
    """Assemble a full EngineConfig dict from an agent's relational data.

    Reads the base config (server + agent) from the existing engine_config
    JSONB, then layers on referenced resources from FK/junction relations.

    The model must have its relationships loaded (selectin).
    """
    base = dict(model.engine_config)

    # --- Memory: inject checkpointer / session_service into agent.config ---
    agent_section = dict(base.get("agent", {}))
    agent_config = dict(agent_section.get("config", {}))
    framework = agent_section.get("type", "")

    if model.memory_id and model.memory:
        mem_config = model.memory.memory_config
        if framework in ("ADK",):
            agent_config["session_service"] = mem_config
        else:
            agent_config["checkpointer"] = mem_config
    else:
        # Ensure no stale memory config remains
        agent_config.pop("checkpointer", None)
        agent_config.pop("session_service", None)

    agent_section["config"] = agent_config
    base["agent"] = agent_section

    # --- Guardrails: assemble from junction table ---
    input_guards: list[dict[str, Any]] = []
    output_guards: list[dict[str, Any]] = []
    if model.guardrail_associations:
        for assoc in sorted(model.guardrail_associations, key=lambda a: a.sort_order):
            guard_data = assoc.guardrail.guardrail_config
            if assoc.position == "input":
                input_guards.append(guard_data)
            else:
                output_guards.append(guard_data)

    if input_guards or output_guards:
        raw_guardrails = {"input": input_guards, "output": output_guards}
        base["guardrails"] = convert_guardrail(raw_guardrails)
    else:
        base.pop("guardrails", None)

    # --- MCP servers: assemble from junction table ---
    if model.mcp_server_associations:
        base["mcp_servers"] = [
            assoc.mcp_server.mcp_server_config
            for assoc in model.mcp_server_associations
        ]
    else:
        base.pop("mcp_servers", None)
        base.pop("mcpServers", None)

    # --- Observability: assemble from junction table ---
    if model.observability_associations:
        base["observability"] = [
            assoc.observability.observability_config
            for assoc in model.observability_associations
        ]
    else:
        base.pop("observability", None)

    # --- SSO: assemble from FK ---
    if model.sso_id and model.sso:
        base["sso"] = model.sso.sso_config
    else:
        base.pop("sso", None)

    # --- Integrations: assemble from junction table ---
    if model.integration_associations:
        base["integrations"] = [
            assoc.integration.integration_config
            for assoc in model.integration_associations
        ]
    else:
        base.pop("integrations", None)

    # Validate through Pydantic to ensure consistency
    engine_config = EngineConfig(**base)
    return engine_config.model_dump()


async def recompute_engine_config(
    session: AsyncSession, agent_id: UUID
) -> None:
    """Recompute and persist the materialized engine_config for an agent.

    Loads the agent with all relationships, assembles the full config,
    and writes it to the engine_config JSONB column.
    """
    stmt = (
        select(ManagedAgentModel)
        .where(ManagedAgentModel.id == agent_id)
        .options(
            selectinload(ManagedAgentModel.memory),
            selectinload(ManagedAgentModel.sso),
            selectinload(ManagedAgentModel.guardrail_associations).selectinload(
                AgentGuardrailModel.guardrail
            ),
            selectinload(ManagedAgentModel.mcp_server_associations).selectinload(
                AgentMCPServerModel.mcp_server
            ),
            selectinload(ManagedAgentModel.observability_associations).selectinload(
                AgentObservabilityModel.observability
            ),
            selectinload(ManagedAgentModel.integration_associations).selectinload(
                AgentIntegrationModel.integration
            ),
        )
    )
    result = await session.execute(stmt)
    model = result.scalar_one_or_none()
    if not model:
        logger.warning("Cannot recompute config: agent %s not found", agent_id)
        return

    model.engine_config = assemble_engine_config(model)
    await session.flush()


def sync_resources(
    model: ManagedAgentModel,
    resources: AgentResourceIds,
) -> None:
    """Synchronize resource associations on an agent model.

    Sets 1:1 FKs and replaces all junction rows.
    Must be called within a session context. After calling this,
    call recompute_engine_config() to update the materialized cache.
    """
    # 1:1 FKs
    model.memory_id = resources.memory_id
    model.sso_id = resources.sso_id

    # Clear existing junction rows (ORM cascade handles DELETE)
    model.guardrail_associations.clear()
    model.mcp_server_associations.clear()
    model.observability_associations.clear()
    model.integration_associations.clear()

    # Re-create guardrail associations
    if resources.guardrail_ids:
        for ref in resources.guardrail_ids:
            model.guardrail_associations.append(
                AgentGuardrailModel(
                    id=uuid4(),
                    agent_id=model.id,
                    guardrail_id=ref.id,
                    position=ref.position,
                    sort_order=ref.sort_order,
                )
            )

    # Re-create MCP server associations
    if resources.mcp_server_ids:
        for mcp_id in resources.mcp_server_ids:
            model.mcp_server_associations.append(
                AgentMCPServerModel(
                    id=uuid4(),
                    agent_id=model.id,
                    mcp_server_id=mcp_id,
                )
            )

    # Re-create observability associations
    if resources.observability_ids:
        for obs_id in resources.observability_ids:
            model.observability_associations.append(
                AgentObservabilityModel(
                    id=uuid4(),
                    agent_id=model.id,
                    observability_id=obs_id,
                )
            )

    # Re-create integration associations
    if resources.integration_ids:
        for int_id in resources.integration_ids:
            model.integration_associations.append(
                AgentIntegrationModel(
                    id=uuid4(),
                    agent_id=model.id,
                    integration_id=int_id,
                )
            )


def extract_resource_ids(model: ManagedAgentModel) -> AgentResourceIds:
    """Extract resource IDs from an agent's loaded relationships."""
    return AgentResourceIds(
        memory_id=model.memory_id,
        sso_id=model.sso_id,
        guardrail_ids=[
            {
                "id": a.guardrail_id,
                "position": a.position,
                "sort_order": a.sort_order,
            }
            for a in model.guardrail_associations
        ],
        mcp_server_ids=[a.mcp_server_id for a in model.mcp_server_associations],
        observability_ids=[
            a.observability_id for a in model.observability_associations
        ],
        integration_ids=[a.integration_id for a in model.integration_associations],
    )
