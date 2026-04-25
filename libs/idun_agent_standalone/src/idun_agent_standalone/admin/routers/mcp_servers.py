"""``/admin/api/v1/mcp-servers`` — collection CRUD with reload hook."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import commit_with_reload
from idun_agent_standalone.db.models import McpServerRow

router = APIRouter(
    prefix="/admin/api/v1/mcp-servers",
    tags=["mcp"],
    dependencies=[Depends(require_auth)],
)


class McpServerRead(BaseModel):
    id: str
    name: str
    config: dict[str, Any]
    enabled: bool
    # D6 — surfaces per-server engine init failures so the UI can show
    # a red badge without operators having to scrape logs. ``"running"``
    # means the engine accepted the server (or it isn't enabled at all);
    # ``"failed"`` means MCPClientRegistry recorded an init error.
    status: Literal["running", "failed"] = "running"
    failure_reason: str | None = None


class McpServerCreate(BaseModel):
    name: str
    config: dict[str, Any]
    enabled: bool = True


class McpServerPatch(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


def _to_read(row: McpServerRow) -> McpServerRead:
    return McpServerRead(
        id=row.id, name=row.name, config=row.config or {}, enabled=row.enabled
    )


def _failures_by_name(request: Request) -> dict[str, dict[str, str]]:
    """Return ``{name: failure_record}`` from ``app.state.failed_mcp_servers``.

    Defensive: when the engine hasn't initialised yet (test setups,
    import-time access) the attribute is missing or None.
    """
    raw = getattr(request.app.state, "failed_mcp_servers", None) or []
    return {entry.get("name", ""): entry for entry in raw if entry.get("name")}


@router.get("", response_model=list[McpServerRead])
async def list_mcp(request: Request) -> list[McpServerRead]:
    sm = request.app.state.sessionmaker
    failures = _failures_by_name(request)
    async with sm() as s:
        rows = (await s.execute(select(McpServerRow))).scalars().all()
        out: list[McpServerRead] = []
        for r in rows:
            read = _to_read(r)
            failure = failures.get(read.name)
            if failure is not None:
                read.status = "failed"
                read.failure_reason = failure.get("reason")
            out.append(read)
        return out


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_mcp(body: McpServerCreate, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = McpServerRow(
            id=str(uuid.uuid4()),
            name=body.name,
            config=body.config,
            enabled=body.enabled,
        )
        s.add(row)
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return _to_read(row)


@router.get("/{mcp_id}", response_model=McpServerRead)
async def get_mcp(mcp_id: str, request: Request) -> McpServerRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (
            await s.execute(select(McpServerRow).where(McpServerRow.id == mcp_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        read = _to_read(row)
        failure = _failures_by_name(request).get(read.name)
        if failure is not None:
            read.status = "failed"
            read.failure_reason = failure.get("reason")
        return read


@router.patch("/{mcp_id}")
async def patch_mcp(mcp_id: str, body: McpServerPatch, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (
            await s.execute(select(McpServerRow).where(McpServerRow.id == mcp_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        if body.name is not None:
            row.name = body.name
        if body.config is not None:
            row.config = body.config
        if body.enabled is not None:
            row.enabled = body.enabled
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return _to_read(row)


@router.delete("/{mcp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp(mcp_id: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(McpServerRow).where(McpServerRow.id == mcp_id))
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
    return Response(status_code=status.HTTP_204_NO_CONTENT)
