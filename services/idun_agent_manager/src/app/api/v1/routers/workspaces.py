"""Workspaces API endpoints - list caller tenant workspaces."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.v1.deps import get_principal, get_session
from idun_agent_schema.manager.deps import Principal

router = APIRouter()


@router.get("/workspaces")
async def list_workspaces(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = await session.execute(
        text(
            "SELECT id, name, slug, status FROM workspaces WHERE tenant_id = :tid ORDER BY name ASC"
        ),
        {"tid": str(principal.tenant_id)},
    )
    return [
        {"id": str(r[0]), "name": r[1], "slug": r[2], "status": r[3]}
        for r in rows.fetchall()
    ]


