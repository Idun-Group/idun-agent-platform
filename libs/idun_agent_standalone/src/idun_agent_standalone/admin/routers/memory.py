"""Singleton memory/checkpointer resource."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import trigger_reload
from idun_agent_standalone.db.models import MemoryRow

router = APIRouter(
    prefix="/admin/api/v1/memory",
    tags=["memory"],
    dependencies=[Depends(require_auth)],
)


class MemoryPayload(BaseModel):
    config: dict[str, Any]


@router.get("", response_model=MemoryPayload)
async def get_memory(request: Request) -> MemoryPayload:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(MemoryRow))).scalar_one_or_none()
        if row is None:
            return MemoryPayload(config={"type": "memory"})
        return MemoryPayload(config=row.config or {})


@router.put("")
async def put_memory(body: MemoryPayload, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(MemoryRow))).scalar_one_or_none()
        if row is None:
            row = MemoryRow(id="singleton", config=body.config)
            s.add(row)
        else:
            row.config = body.config
        await s.commit()
        reload_response = await trigger_reload(request, s)
        if reload_response is not None:
            return reload_response
        return MemoryPayload(config=row.config or {})
