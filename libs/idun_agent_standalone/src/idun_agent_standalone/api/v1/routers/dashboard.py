"""Dashboard endpoint -- single GET returning all v1 widgets.

See ``SPEC.md`` § 5.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from idun_agent_schema.standalone.dashboard import DashboardRange, DashboardResponse

from idun_agent_standalone.api.v1.deps import SessionDep, require_auth
from idun_agent_standalone.services.dashboard import compute_dashboard

router = APIRouter(
    prefix="/admin/api/v1/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(require_auth)],
)


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    session: SessionDep,
    response: Response,
    range_value: Annotated[
        DashboardRange, Query(alias="range")
    ] = DashboardRange.h24,
) -> DashboardResponse:
    """Return all five v1 dashboard widgets for the requested time range."""
    response.headers["Cache-Control"] = "no-store"
    return await compute_dashboard(session, range_value)
