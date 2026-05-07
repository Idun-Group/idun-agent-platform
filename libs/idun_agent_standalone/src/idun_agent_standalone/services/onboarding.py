"""Onboarding service: state classification + EngineConfig assembly.

This module is the orchestration layer between the ``/onboarding/*``
HTTP endpoints, the scanner (read-only), and the scaffolder
(side-effecting). It owns:

  - The 5-state classification rule.
  - Building an ``EngineConfig`` dict from a ``DetectedAgent``.
  - Building an ``EngineConfig`` dict for a starter scaffold.

The two materialize coroutines (DB insert + reload pipeline) land in
Task 6 alongside the corresponding HTTP integration tests.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, Literal

from fastapi import status as http_status
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    DetectedAgent,
    OnboardingState,
    ScanResult,
    StandaloneAdminError,
    StandaloneAgentRead,
    StandaloneErrorCode,
    StandaloneMutationResponse,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services import scaffold, scanner
from idun_agent_standalone.services.reload import commit_with_reload

logger = get_logger(__name__)

ReloadCallable = Callable[[EngineConfig], Awaitable[None]]

_STARTER_DEFAULT_NAME = "Starter Agent"

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    """Return a slug suitable for ``agent.config.name``.

    Mirrors the engine's ADK validator (``AdkAgentConfig._default_app_name_from_name``)
    so that ``_slugify(x)`` is a fixed point of the engine rule and revalidation is
    idempotent.

    Non-ASCII characters are stripped (e.g. ``"café"`` → ``"caf"``), matching the
    engine validator's ASCII-only ``[^a-z0-9]+`` pattern. This is a deliberate
    non-fold — do NOT add NFKD normalization here, or the standalone slug will
    diverge from what the engine derives at validation time.

    Falls back to ``"agent"`` when the input slugifies to empty.
    """
    slug = _SLUG_RE.sub("_", name.lower()).strip("_")
    return slug or "agent"


def classify_state(
    scan_result: ScanResult,
    *,
    agent_row_exists: bool,
) -> OnboardingState:
    """Compute the wizard's 5-state classification."""
    if agent_row_exists:
        return "ALREADY_CONFIGURED"
    if not scan_result.has_python_files:
        return "EMPTY"
    if not scan_result.detected:
        return "NO_SUPPORTED"
    if len(scan_result.detected) == 1:
        return "ONE_DETECTED"
    return "MANY_DETECTED"


def engine_config_dict_from_detection(detection: DetectedAgent) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict from a detected agent."""
    name_slug = _slugify(detection.inferred_name)
    if detection.framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }


def engine_config_dict_for_starter(
    *,
    framework: Literal["LANGGRAPH", "ADK"],
    name: str,
) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict for a starter scaffold."""
    name_slug = _slugify(name)
    if framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": "agent.py:graph",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": "agent.py:agent",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }


async def _agent_row(session: AsyncSession) -> StandaloneAgentRow | None:
    """Return the singleton agent row, or None if absent."""
    return (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()


def _conflict(message: str) -> AdminAPIError:
    """Build a 409 admin error envelope."""
    return AdminAPIError(
        status_code=http_status.HTTP_409_CONFLICT,
        error=StandaloneAdminError(
            code=StandaloneErrorCode.CONFLICT,
            message=message,
        ),
    )


async def materialize_from_detection(
    session: AsyncSession,
    body: CreateFromDetectionBody,
    *,
    scan_root: Path,
    reload_callable: ReloadCallable,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Materialize a detection picked by the wizard.

    Re-scans inside the handler so the detection's ``inferred_name`` and
    confidence come from the authoritative server-side scan, not from
    anything the client could tamper with. The triple
    ``(framework, file_path, variable_name)`` is the lookup key. If the
    file moved between the original scan and this call, returns 409 so
    the wizard can re-scan.
    """
    if await _agent_row(session) is not None:
        raise _conflict(
            "Agent already configured. Use PATCH /admin/api/v1/agent to update it."
        )

    scan_result = await scanner.scan_folder(scan_root)
    match: DetectedAgent | None = None
    for detection in scan_result.detected:
        if (
            detection.framework == body.framework
            and detection.file_path == body.file_path
            and detection.variable_name == body.variable_name
        ):
            match = detection
            break
    if match is None:
        raise _conflict(
            f"Detection not found: {body.framework} "
            f"{body.file_path}:{body.variable_name}. "
            "The project may have changed — re-run the scan."
        )

    config_dict = engine_config_dict_from_detection(match)
    row = StandaloneAgentRow(
        name=match.inferred_name,
        base_engine_config=config_dict,
    )

    async with reload_service._reload_mutex:
        # Re-check inside the mutex to close the TOCTOU window between the
        # initial pre-check and the row insert.
        if await _agent_row(session) is not None:
            raise _conflict(
                "Agent already configured. Use PATCH /admin/api/v1/agent to update it."
            )
        session.add(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.onboarding.create_from_detection framework=%s name=%s status=%s",
        match.framework,
        match.inferred_name,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )


async def materialize_starter(
    session: AsyncSession,
    body: CreateStarterBody,
    *,
    scaffold_root: Path,
    reload_callable: ReloadCallable,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Scaffold a starter project + insert the singleton agent row.

    On any pre-check failure (existing agent, scaffold conflict) nothing
    is written to disk and no row is inserted. After a successful
    scaffold + row insert, a reload failure rolls back the DB row but
    leaves the scaffolded files on disk (per spec §5.3 — disk state is
    independent of DB rollback). Recovery: edit ``agent.py`` and
    re-trigger the wizard, which will re-create the row pointing at
    the existing files.
    """
    if await _agent_row(session) is not None:
        raise _conflict(
            "Agent already configured. Use PATCH /admin/api/v1/agent to update it."
        )

    name = body.name or _STARTER_DEFAULT_NAME

    try:
        written = scaffold.create_starter_project(
            scaffold_root, framework=body.framework
        )
    except scaffold.ScaffoldConflictError as exc:
        names = ", ".join(p.name for p in exc.paths)
        raise _conflict(
            f"Scaffold target exists: {names}. Move or delete and retry."
        ) from exc

    config_dict = engine_config_dict_for_starter(framework=body.framework, name=name)
    row = StandaloneAgentRow(name=name, base_engine_config=config_dict)

    async with reload_service._reload_mutex:
        # Re-check inside the mutex to close the TOCTOU window. If a concurrent
        # request already inserted the row, the scaffolded files stay on disk —
        # the user can move them or DELETE the agent and re-run the wizard.
        if await _agent_row(session) is not None:
            raise _conflict(
                "Agent already configured. Use PATCH /admin/api/v1/agent to update it."
            )
        session.add(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.onboarding.create_starter framework=%s files=%d status=%s",
        body.framework,
        len(written),
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )
