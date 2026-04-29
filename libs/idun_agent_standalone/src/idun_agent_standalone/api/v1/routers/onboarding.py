"""``/admin/api/v1/onboarding`` router.

Three endpoints:

  - ``POST /scan``: classify the user's project + return scanner output.
  - ``POST /create-from-detection``: materialize an agent the user picked.
  - ``POST /create-starter``: scaffold a fresh starter project.

Materialize endpoints flow through the same ``commit_with_reload``
pipeline as ``/admin/api/v1/agent``. Failure modes:

  - 409 ``conflict`` when an agent row already exists.
  - 409 ``conflict`` when a re-scan can no longer find the picked detection.
  - 409 ``conflict`` when a scaffold target file already exists.

Auth is wired at ``app.include_router`` level via the shared
``admin_auth`` dependency in ``app.py``, not per-endpoint.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    ScanResponse,
    StandaloneAgentRead,
    StandaloneMutationResponse,
)
from sqlalchemy import select

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services import onboarding, scanner

router = APIRouter(prefix="/admin/api/v1/onboarding", tags=["admin"])

logger = get_logger(__name__)


def _scan_root(request: Request) -> Path:
    """Resolve the scan / scaffold root.

    Default: ``Path.cwd()``. Tests override via
    ``app.state.onboarding_scan_root`` so the integration suite can
    isolate per-test ``tmp_path`` directories without leaking ``chdir``
    across asyncio tasks.
    """
    override = getattr(request.app.state, "onboarding_scan_root", None)
    if override is not None:
        return Path(override)
    return Path.cwd()


@router.post("/scan", response_model=ScanResponse)
async def scan(request: Request, session: SessionDep) -> ScanResponse:
    """Classify the project and return the scanner result.

    Always runs the scanner so the response carries truthful
    ``has_python_files`` / ``has_idun_config`` / ``detected`` values
    even when an agent row already exists — useful for direct-curl
    callers inspecting state. When the row exists, ``current_agent``
    is populated so the UI can short-circuit to chat without a
    follow-up ``GET /agent`` call.
    """
    row = (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()
    agent_row_exists = row is not None

    scan_result = await scanner.scan_folder(_scan_root(request))
    state = onboarding.classify_state(
        scan_result, agent_row_exists=agent_row_exists
    )

    current_agent: StandaloneAgentRead | None = (
        StandaloneAgentRead.model_validate(row) if row is not None else None
    )

    # Coupling invariant: current_agent is populated iff state is
    # ALREADY_CONFIGURED. Tripping this means classify_state and the
    # row-presence branch have diverged.
    assert current_agent is None or state == "ALREADY_CONFIGURED"

    logger.info(
        "admin.onboarding.scan state=%s detections=%d duration_ms=%d",
        state,
        len(scan_result.detected),
        scan_result.scan_duration_ms,
    )
    return ScanResponse(
        state=state, scan_result=scan_result, current_agent=current_agent
    )


@router.post(
    "/create-from-detection",
    response_model=StandaloneMutationResponse[StandaloneAgentRead],
)
async def create_from_detection(
    body: CreateFromDetectionBody,
    request: Request,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Materialize a detection picked by the wizard."""
    return await onboarding.materialize_from_detection(
        session,
        body,
        scan_root=_scan_root(request),
        reload_callable=reload_callable,
    )


@router.post(
    "/create-starter",
    response_model=StandaloneMutationResponse[StandaloneAgentRead],
)
async def create_starter(
    body: CreateStarterBody,
    request: Request,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Scaffold a starter project + register the singleton agent row."""
    return await onboarding.materialize_starter(
        session,
        body,
        scaffold_root=_scan_root(request),
        reload_callable=reload_callable,
    )
