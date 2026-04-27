"""Assemble an EngineConfig from standalone DB rows."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow

logger = get_logger(__name__)

_LANGGRAPH_DEFAULT_MEMORY: dict[str, Any] = {"type": "memory"}
_ADK_DEFAULT_MEMORY: dict[str, Any] = {"type": "in_memory"}


class AssemblyError(Exception):
    """Raised when EngineConfig cannot be assembled from current DB rows.

    Carries the underlying Pydantic ``ValidationError`` when the failure
    is a config shape problem the operator can fix. The router layer
    translates ``validation_error.errors()`` into the standalone admin
    error envelope with structured ``field_errors``.
    """

    def __init__(
        self,
        message: str,
        validation_error: ValidationError | None = None,
    ) -> None:
        self.validation_error = validation_error
        super().__init__(message)


class AgentNotConfiguredError(AssemblyError):
    """Raised when no agent row exists.

    Distinct from a corrupted-config error so the caller can map this
    to the cold-start ``not_configured`` state rather than a hard 500.
    """


async def assemble_engine_config(session: AsyncSession) -> EngineConfig:
    """Build the running EngineConfig from the standalone DB rows.

    Reads the singleton agent row plus the optional memory row and
    layers memory onto ``agent.config`` (``checkpointer`` for LangGraph,
    ``session_service`` for ADK). Other resources layer here when they
    land.
    """
    agent = await _load_agent(session)
    memory = await _load_memory(session)

    base_config = _parse_base_config(agent)
    framework = base_config.agent.type

    memory_payload = _resolve_memory_payload(agent.name, memory, framework)

    base_dict = base_config.model_dump(exclude_none=True)
    _layer_memory(base_dict, framework, memory_payload)

    return _validate_assembled(base_dict, agent.name, framework)


async def _load_agent(session: AsyncSession) -> StandaloneAgentRow:
    agent = (
        await session.execute(select(StandaloneAgentRow))
    ).scalar_one_or_none()
    if agent is None:
        raise AgentNotConfiguredError(
            "Standalone agent is not configured. Seed via IDUN_CONFIG_PATH "
            "or PATCH /admin/api/v1/agent."
        )
    return agent


async def _load_memory(session: AsyncSession) -> StandaloneMemoryRow | None:
    return (
        await session.execute(select(StandaloneMemoryRow))
    ).scalar_one_or_none()


def _parse_base_config(agent: StandaloneAgentRow) -> EngineConfig:
    try:
        return EngineConfig.model_validate(agent.base_engine_config)
    except ValidationError as exc:
        logger.error(
            "assemble: base_engine_config invalid agent=%s", agent.name
        )
        raise AssemblyError(
            f"Agent base_engine_config is corrupted (agent={agent.name}). "
            "Fix the agent row or restore from a known good config.",
            validation_error=exc,
        ) from exc


def _resolve_memory_payload(
    agent_name: str,
    memory: StandaloneMemoryRow | None,
    framework: AgentFramework,
) -> dict[str, Any]:
    if memory is not None:
        memory_type = memory.memory_config.get("type", "unknown")
        logger.info(
            "assemble: configured memory agent=%s framework=%s memory_type=%s",
            agent_name,
            framework.value,
            memory_type,
        )
        return memory.memory_config

    default = (
        _ADK_DEFAULT_MEMORY
        if framework == AgentFramework.ADK
        else _LANGGRAPH_DEFAULT_MEMORY
    )
    logger.info(
        "assemble: default memory agent=%s framework=%s memory_type=%s",
        agent_name,
        framework.value,
        default["type"],
    )
    return default


def _layer_memory(
    base_dict: dict[str, Any],
    framework: AgentFramework,
    memory_payload: dict[str, Any],
) -> None:
    """Layer memory onto agent.config in place.

    The inner agent config is a discriminated union, so we mutate the
    dict before the final EngineConfig validation rather than setting
    typed fields on each variant.
    """
    agent_inner = base_dict["agent"]["config"]
    if framework == AgentFramework.ADK:
        agent_inner["session_service"] = memory_payload
        agent_inner.pop("checkpointer", None)
    else:
        agent_inner["checkpointer"] = memory_payload
        agent_inner.pop("session_service", None)


def _validate_assembled(
    base_dict: dict[str, Any],
    agent_name: str,
    framework: AgentFramework,
) -> EngineConfig:
    try:
        config = EngineConfig.model_validate(base_dict)
    except ValidationError as exc:
        logger.error(
            "assemble: assembled EngineConfig invalid agent=%s framework=%s",
            agent_name,
            framework.value,
        )
        raise AssemblyError(
            f"Assembled EngineConfig is invalid "
            f"(agent={agent_name}, framework={framework.value}). "
            "Likely cause: memory configuration does not match the agent framework.",
            validation_error=exc,
        ) from exc

    logger.info(
        "assemble: complete agent=%s framework=%s",
        agent_name,
        framework.value,
    )
    return config
