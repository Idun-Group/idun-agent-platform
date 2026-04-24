"""Singleton observability resource."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import trigger_reload
from idun_agent_standalone.db.models import ObservabilityRow

router = APIRouter(
    prefix="/admin/api/v1/observability",
    tags=["observability"],
    dependencies=[Depends(require_auth)],
)


class ObservabilityPayload(BaseModel):
    # The engine accepts a *list* of provider configs at the top level, so
    # the standalone stores whatever shape the operator submits and only
    # validates on engine reload.
    config: Any


@router.get("", response_model=ObservabilityPayload)
async def get_observability(request: Request) -> ObservabilityPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ObservabilityRow))).scalar_one_or_none()
        return ObservabilityPayload(config=(row.config or {}) if row else {})


@router.put("")
async def put_observability(body: ObservabilityPayload, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ObservabilityRow))).scalar_one_or_none()
        if row is None:
            row = ObservabilityRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        reload_response = await trigger_reload(request, s)
        if reload_response is not None:
            return reload_response
        return ObservabilityPayload(config=row.config or {})
