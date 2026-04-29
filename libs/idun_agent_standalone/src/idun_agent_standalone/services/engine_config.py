"""Assemble an EngineConfig from standalone DB rows."""

from __future__ import annotations

import os
from typing import Any

from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2
from idun_agent_schema.manager.guardrail_configs import convert_guardrail
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.core.logging import get_logger
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
    observability = await _load_observability(session)
    mcp_servers = await _load_mcp_servers(session)
    guardrails = await _load_guardrails(session)
    prompts = await _load_prompts(session)
    integrations = await _load_integrations(session)

    base_config = _parse_base_config(agent)
    framework = base_config.agent.type

    memory_payload = _resolve_memory_payload(agent.name, memory, framework)

    base_dict = base_config.model_dump(exclude_none=True)
    _layer_memory(base_dict, framework, memory_payload)
    _layer_observability(base_dict, agent.name, observability)
    _layer_mcp_servers(base_dict, agent.name, mcp_servers)
    _layer_guardrails(base_dict, agent.name, guardrails)
    _layer_prompts(base_dict, agent.name, prompts)
    _layer_integrations(base_dict, agent.name, integrations)

    return _validate_assembled(base_dict, agent.name, framework)


async def _load_agent(session: AsyncSession) -> StandaloneAgentRow:
    agent = (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()
    if agent is None:
        raise AgentNotConfiguredError(
            "Standalone agent is not configured. Seed via IDUN_CONFIG_PATH "
            "or PATCH /admin/api/v1/agent."
        )
    return agent


async def _load_memory(session: AsyncSession) -> StandaloneMemoryRow | None:
    return (await session.execute(select(StandaloneMemoryRow))).scalar_one_or_none()


async def _load_observability(
    session: AsyncSession,
) -> StandaloneObservabilityRow | None:
    return (
        await session.execute(select(StandaloneObservabilityRow))
    ).scalar_one_or_none()


async def _load_mcp_servers(
    session: AsyncSession,
) -> list[StandaloneMCPServerRow]:
    return list(
        (
            await session.execute(
                select(StandaloneMCPServerRow).order_by(
                    StandaloneMCPServerRow.created_at
                )
            )
        )
        .scalars()
        .all()
    )


async def _load_guardrails(
    session: AsyncSession,
) -> list[StandaloneGuardrailRow]:
    return list(
        (
            await session.execute(
                select(StandaloneGuardrailRow).order_by(
                    StandaloneGuardrailRow.position,
                    StandaloneGuardrailRow.sort_order,
                    StandaloneGuardrailRow.created_at,
                )
            )
        )
        .scalars()
        .all()
    )


async def _load_integrations(
    session: AsyncSession,
) -> list[StandaloneIntegrationRow]:
    return list(
        (
            await session.execute(
                select(StandaloneIntegrationRow).order_by(
                    StandaloneIntegrationRow.created_at
                )
            )
        )
        .scalars()
        .all()
    )


async def _load_prompts(
    session: AsyncSession,
) -> list[StandalonePromptRow]:
    return list(
        (
            await session.execute(
                select(StandalonePromptRow).order_by(
                    StandalonePromptRow.prompt_id,
                    StandalonePromptRow.version,
                )
            )
        )
        .scalars()
        .all()
    )


def _parse_base_config(agent: StandaloneAgentRow) -> EngineConfig:
    try:
        return EngineConfig.model_validate(agent.base_engine_config)
    except ValidationError as exc:
        logger.error("assemble: base_engine_config invalid agent=%s", agent.name)
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


def _layer_observability(
    base_dict: dict[str, Any],
    agent_name: str,
    observability: StandaloneObservabilityRow | None,
) -> None:
    """Layer the singleton observability provider onto the engine config.

    Standalone stores one provider per install; the engine expects a
    list. Wrap in a one element list. Absent row means the engine runs
    without telemetry.
    """
    if observability is None:
        logger.info("assemble: no observability provider agent=%s", agent_name)
        return
    base_dict["observability"] = [observability.observability_config]
    provider = observability.observability_config.get("provider", "unknown")
    enabled = observability.observability_config.get("enabled", True)
    logger.info(
        "assemble: observability agent=%s provider=%s enabled=%s",
        agent_name,
        provider,
        enabled,
    )


def _layer_mcp_servers(
    base_dict: dict[str, Any],
    agent_name: str,
    mcp_servers: list[StandaloneMCPServerRow],
) -> None:
    """Layer enabled MCP server rows onto the engine config.

    Disabled rows are skipped at assembly time so the engine never
    tries to spawn or connect to a server the operator has paused.
    Empty after the filter leaves the field absent.
    """
    enabled = [row for row in mcp_servers if row.enabled]
    if not enabled:
        logger.info("assemble: no mcp servers agent=%s", agent_name)
        return
    base_dict["mcp_servers"] = [row.mcp_server_config for row in enabled]
    logger.info(
        "assemble: mcp servers agent=%s count=%d",
        agent_name,
        len(enabled),
    )


def _layer_guardrails(
    base_dict: dict[str, Any],
    agent_name: str,
    guardrails: list[StandaloneGuardrailRow],
) -> None:
    """Layer enabled guardrails onto the engine config.

    Disabled rows are skipped so an operator can pause a guard without
    deleting it. Within each position bucket the rows are already
    ordered by ``sort_order`` thanks to the load query. The manager
    shape is converted to engine shape via ``convert_guardrail`` and
    then parsed into ``GuardrailsV2`` so any malformed conversion
    output surfaces here as an ``AssemblyError`` rather than later in
    the engine. The ``GUARDRAILS_API_KEY`` env var is written by the
    guardrail router from the request body before assembly runs, so
    we do not pre check it here.
    """
    enabled = [row for row in guardrails if row.enabled]
    if not enabled:
        logger.info("assemble: no guardrails agent=%s", agent_name)
        return

    if not os.environ.get("GUARDRAILS_API_KEY"):
        for row in enabled:
            api_key = row.guardrail_config.get("api_key")
            if api_key:
                os.environ["GUARDRAILS_API_KEY"] = api_key
                logger.info(
                    "assemble: GUARDRAILS_API_KEY restored from row id=%s", row.id
                )
                break

    grouped: dict[str, list[dict[str, Any]]] = {"input": [], "output": []}
    for row in enabled:
        config = {k: v for k, v in row.guardrail_config.items() if k != "api_key"}
        grouped[row.position].append(config)

    try:
        converted = convert_guardrail(grouped)
    except Exception as exc:
        logger.exception("assemble: guardrail conversion failed agent=%s", agent_name)
        raise AssemblyError(
            f"Guardrail conversion failed (agent={agent_name}): {exc}"
        ) from exc

    try:
        parsed = GuardrailsV2.model_validate(converted)
    except ValidationError as exc:
        logger.error("assemble: converted guardrails invalid agent=%s", agent_name)
        raise AssemblyError(
            f"Converted guardrails do not match GuardrailsV2 "
            f"(agent={agent_name}). Inspect the stored guardrail rows.",
            validation_error=exc,
        ) from exc

    base_dict["guardrails"] = parsed.model_dump(exclude_none=True)
    logger.info(
        "assemble: guardrails agent=%s input=%d output=%d",
        agent_name,
        len(parsed.input),
        len(parsed.output),
    )


def _layer_prompts(
    base_dict: dict[str, Any],
    agent_name: str,
    prompts: list[StandalonePromptRow],
) -> None:
    """Layer the latest version of each prompt onto the engine config.

    The DB stores the full version history (append only). The engine
    only needs the active prompt per logical id, so we collapse to the
    latest version per ``prompt_id`` here. Empty after collapse leaves
    the field absent.
    """
    if not prompts:
        logger.info("assemble: no prompts agent=%s", agent_name)
        return

    latest: dict[str, StandalonePromptRow] = {}
    for row in prompts:
        current = latest.get(row.prompt_id)
        if current is None or row.version > current.version:
            latest[row.prompt_id] = row

    base_dict["prompts"] = [
        {
            "prompt_id": row.prompt_id,
            "version": row.version,
            "content": row.content,
            "tags": list(row.tags),
        }
        for row in latest.values()
    ]
    logger.info(
        "assemble: prompts agent=%s ids=%d total_versions=%d",
        agent_name,
        len(latest),
        len(prompts),
    )


def _layer_integrations(
    base_dict: dict[str, Any],
    agent_name: str,
    integrations: list[StandaloneIntegrationRow],
) -> None:
    """Layer enabled integrations onto the engine config.

    Disabled rows are skipped at assembly time. The inner
    ``IntegrationConfig.enabled`` flag is overwritten to true so the
    row level toggle is the single source of truth and a misaligned
    inner flag never silently disables a row that is enabled at the
    admin layer.
    """
    enabled = [row for row in integrations if row.enabled]
    if not enabled:
        logger.info("assemble: no integrations agent=%s", agent_name)
        return
    payloads: list[dict[str, Any]] = []
    for row in enabled:
        config = dict(row.integration_config)
        config["enabled"] = True
        payloads.append(config)
    base_dict["integrations"] = payloads
    logger.info(
        "assemble: integrations agent=%s count=%d",
        agent_name,
        len(payloads),
    )


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
