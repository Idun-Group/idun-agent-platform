"""``/admin/api/v1/agent`` — get and replace the singleton agent config."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import commit_with_reload
from idun_agent_standalone.db.models import AgentRow

router = APIRouter(
    prefix="/admin/api/v1/agent",
    tags=["agent"],
    dependencies=[Depends(require_auth)],
)


class AgentRead(BaseModel):
    id: str
    name: str
    framework: str
    graph_definition: str
    config: dict[str, Any]


class AgentUpdate(BaseModel):
    name: str
    framework: str
    graph_definition: str
    config: dict[str, Any] = {}


def _to_read(row: AgentRow) -> AgentRead:
    return AgentRead(
        id=row.id,
        name=row.name,
        framework=row.framework,
        graph_definition=row.graph_definition,
        config=row.config or {},
    )


@router.get("", response_model=AgentRead)
async def get_agent(request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(AgentRow))).scalar_one_or_none()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="agent_not_seeded"
            )
        return _to_read(row)


@router.put("")
async def put_agent(body: AgentUpdate, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (await s.execute(select(AgentRow))).scalar_one_or_none()
        if row is None:
            row = AgentRow(
                id="singleton",
                name=body.name,
                framework=body.framework,
                graph_definition=body.graph_definition,
                config=body.config,
            )
            s.add(row)
        else:
            row.name = body.name
            row.framework = body.framework
            row.graph_definition = body.graph_definition
            row.config = body.config
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return _to_read(row)


@router.post("/reload", response_model=None)
async def force_reload(request: Request) -> JSONResponse | dict[str, str]:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
    return {"status": "noop"}
