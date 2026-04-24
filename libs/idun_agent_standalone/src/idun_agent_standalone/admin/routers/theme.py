"""Singleton theme — UI-only state, never triggers an engine reload."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import ThemeRow

router = APIRouter(
    prefix="/admin/api/v1/theme",
    tags=["theme"],
    dependencies=[Depends(require_auth)],
)


class ThemePayload(BaseModel):
    config: dict[str, Any]


@router.get("", response_model=ThemePayload)
async def get_theme(request: Request) -> ThemePayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
        return ThemePayload(config=(row.config or {}) if row else {})


@router.put("")
async def put_theme(body: ThemePayload, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
        if row is None:
            row = ThemeRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        return ThemePayload(config=row.config or {})
