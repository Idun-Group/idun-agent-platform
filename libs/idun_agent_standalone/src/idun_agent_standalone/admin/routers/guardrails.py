"""Singleton guardrails resource."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import commit_with_reload
from idun_agent_standalone.db.models import GuardrailRow

router = APIRouter(
    prefix="/admin/api/v1/guardrails",
    tags=["guardrails"],
    dependencies=[Depends(require_auth)],
)


class GuardrailsPayload(BaseModel):
    config: dict[str, Any]
    enabled: bool = True


@router.get("", response_model=GuardrailsPayload)
async def get_guardrails(request: Request) -> GuardrailsPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(GuardrailRow))).scalar_one_or_none()
        if row is None:
            return GuardrailsPayload(config={}, enabled=True)
        return GuardrailsPayload(config=row.config or {}, enabled=row.enabled)


@router.put("")
async def put_guardrails(body: GuardrailsPayload, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(GuardrailRow))).scalar_one_or_none()
        if row is None:
            row = GuardrailRow(id="singleton", config=body.config, enabled=body.enabled)
            s.add(row)
        else:
            row.config = body.config
            row.enabled = body.enabled
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return GuardrailsPayload(config=row.config or {}, enabled=row.enabled)
