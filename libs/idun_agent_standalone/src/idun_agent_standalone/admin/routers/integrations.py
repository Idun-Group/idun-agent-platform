"""``/admin/api/v1/integrations`` — collection of WhatsApp/Discord configs."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from idun_agent_schema.engine.integrations import IntegrationProvider
from pydantic import BaseModel
from sqlalchemy import delete, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.reload_hook import commit_with_reload
from idun_agent_standalone.db.models import IntegrationRow


def _normalize_kind(value: str) -> str:
    """Coerce free-form ``kind`` input to the canonical ``IntegrationProvider`` value.

    ``IntegrationProvider`` is a ``StrEnum`` whose values are upper-case
    (``"DISCORD"``, ``"SLACK"`` …). Operators may type ``"discord"`` or
    ``"Discord"``; this collapses those to the schema's canonical form so
    downstream ``EngineConfig.integrations`` validation always succeeds.
    Raises ``HTTPException`` 400 for unknown providers.
    """
    try:
        return IntegrationProvider(value.upper()).value
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"unknown integration provider: {value!r}",
        ) from exc

router = APIRouter(
    prefix="/admin/api/v1/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_auth)],
)


class IntegrationRead(BaseModel):
    id: str
    kind: str
    config: dict[str, Any]
    enabled: bool


class IntegrationCreate(BaseModel):
    kind: str
    config: dict[str, Any]
    enabled: bool = False


class IntegrationPatch(BaseModel):
    kind: str | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


def _to_read(row: IntegrationRow) -> IntegrationRead:
    return IntegrationRead(
        id=row.id, kind=row.kind, config=row.config or {}, enabled=row.enabled
    )


@router.get("", response_model=list[IntegrationRead])
async def list_integrations(request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (await s.execute(select(IntegrationRow))).scalars().all()
        return [_to_read(r) for r in rows]


@router.get("/{iid}", response_model=IntegrationRead)
async def get_integration(iid: str, request: Request) -> IntegrationRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (
            await s.execute(select(IntegrationRow).where(IntegrationRow.id == iid))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return _to_read(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_integration(body: IntegrationCreate, request: Request):
    sm = request.app.state.sessionmaker
    normalized_kind = _normalize_kind(body.kind)
    async with sm() as s:
        row = IntegrationRow(
            id=str(uuid.uuid4()),
            kind=normalized_kind,
            config=body.config,
            enabled=body.enabled,
        )
        s.add(row)
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return _to_read(row)


@router.patch("/{iid}")
async def patch_integration(iid: str, body: IntegrationPatch, request: Request):
    sm = request.app.state.sessionmaker
    normalized_kind = _normalize_kind(body.kind) if body.kind is not None else None
    async with sm() as s:
        row = (
            await s.execute(select(IntegrationRow).where(IntegrationRow.id == iid))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        if normalized_kind is not None:
            row.kind = normalized_kind
        if body.config is not None:
            row.config = body.config
        if body.enabled is not None:
            row.enabled = body.enabled
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
        await s.refresh(row)
        return _to_read(row)


@router.delete("/{iid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(iid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(IntegrationRow).where(IntegrationRow.id == iid))
        reload_response = await commit_with_reload(request, s)
        if reload_response is not None:
            return reload_response
    return Response(status_code=status.HTTP_204_NO_CONTENT)
