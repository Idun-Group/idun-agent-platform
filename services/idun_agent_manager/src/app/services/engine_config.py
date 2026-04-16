"""Engine config assembly and resource synchronization.

Contains the core logic for:
- Assembling a full EngineConfig from relational references
- Synchronizing resource associations (FK + junction tables)
- Recomputing the materialized engine_config JSONB cache
"""

import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.manager.managed_agent import AgentResourceIds
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.agent_guardrail import AgentGuardrailModel
from app.infrastructure.db.models.agent_integration import AgentIntegrationModel
from app.infrastructure.db.models.agent_mcp_server import AgentMCPServerModel
from app.infrastructure.db.models.agent_observability import AgentObservabilityModel
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.infrastructure.db.models.managed_integration import ManagedIntegrationModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel
from app.infrastructure.db.models.managed_sso import ManagedSSOModel

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
            agent_config.pop("checkpointer", None)
        else:
            agent_config["checkpointer"] = mem_config
            agent_config.pop("session_service", None)
    else:
        # No memory resource linked — use in-memory defaults
        if framework in ("ADK",):
            agent_config["session_service"] = {"type": "in_memory"}
            agent_config.pop("checkpointer", None)
        else:
            agent_config["checkpointer"] = {"type": "memory"}
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
        base["guardrails"] = {"input": input_guards, "output": output_guards}
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
    return engine_config.model_dump(exclude_none=True)


async def recompute_engine_config(
    session: AsyncSession, agent_id: UUID
) -> None:
    """Recompute and persist the materialized engine_config for an agent.

    Loads the agent with all relationships, assembles the full config,
    and writes it to the engine_config JSONB column.
    """
    # Expire first so selectinload re-fetches relationships that may have
    # changed within this transaction (e.g. memory_id FK was just set).
    model = await session.get(ManagedAgentModel, agent_id)
    if not model:
        logger.warning("Cannot recompute config: agent %s not found", agent_id)
        return

    await session.refresh(
        model,
        attribute_names=[
            "memory",
            "sso",
            "guardrail_associations",
            "mcp_server_associations",
            "observability_associations",
            "integration_associations",
        ],
    )
    # Nested relationships (e.g. guardrail_associations -> guardrail) are
    # loaded via lazy="selectin" on the junction models.

    model.engine_config = assemble_engine_config(model)
    await session.flush()


async def sync_resources(
    session: AsyncSession,
    model: ManagedAgentModel,
    resources: AgentResourceIds,
) -> None:
    """Synchronize resource associations on an agent model.

    Loads relationships first (to avoid MissingGreenlet with async drivers),
    then clears and re-creates all junction rows.
    Call recompute_engine_config() afterwards to update the materialized cache.
    """
    # Ensure relationships are loaded before modifying
    await session.refresh(
        model,
        attribute_names=[
            "guardrail_associations",
            "mcp_server_associations",
            "observability_associations",
            "integration_associations",
        ],
    )

    await _validate_resource_scope(session, model, resources)

    # 1:1 FKs
    model.memory_id = resources.memory_id
    model.sso_id = resources.sso_id

    # Clear existing junction rows and flush deletes to DB before
    # re-inserting — avoids unique constraint violations when the
    # same (agent_id, resource_id) pair is re-created.
    model.guardrail_associations.clear()
    model.mcp_server_associations.clear()
    model.observability_associations.clear()
    model.integration_associations.clear()
    await session.flush()

    # Re-create guardrail associations
    for ref in (resources.guardrail_ids or []):
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
    for mcp_id in (resources.mcp_server_ids or []):
        model.mcp_server_associations.append(
            AgentMCPServerModel(
                id=uuid4(),
                agent_id=model.id,
                mcp_server_id=mcp_id,
            )
        )

    # Re-create observability associations
    for obs_id in (resources.observability_ids or []):
        model.observability_associations.append(
            AgentObservabilityModel(
                id=uuid4(),
                agent_id=model.id,
                observability_id=obs_id,
            )
        )

    # Re-create integration associations
    for int_id in (resources.integration_ids or []):
        model.integration_associations.append(
            AgentIntegrationModel(
                id=uuid4(),
                agent_id=model.id,
                integration_id=int_id,
            )
        )


async def _validate_resource_scope(
    session: AsyncSession,
    agent: ManagedAgentModel,
    resources: AgentResourceIds,
) -> None:
    """Ensure every referenced resource belongs to the agent's workspace and project."""

    async def _check_resource(resource_model, resource_id: UUID, label: str) -> None:
        resource = await session.get(resource_model, resource_id)
        if resource is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{label} not found",
            )
        if (
            resource.workspace_id != agent.workspace_id
            or resource.project_id != agent.project_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label} does not belong to the active project",
            )

    if resources.memory_id is not None:
        await _check_resource(ManagedMemoryModel, resources.memory_id, "Memory config")
    if resources.sso_id is not None:
        await _check_resource(ManagedSSOModel, resources.sso_id, "SSO config")

    for ref in resources.guardrail_ids or []:
        await _check_resource(ManagedGuardrailModel, ref.id, "Guardrail config")
    for resource_id in resources.mcp_server_ids or []:
        await _check_resource(ManagedMCPServerModel, resource_id, "MCP server")
    for resource_id in resources.observability_ids or []:
        await _check_resource(
            ManagedObservabilityModel, resource_id, "Observability config"
        )
    for resource_id in resources.integration_ids or []:
        await _check_resource(
            ManagedIntegrationModel, resource_id, "Integration config"
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
