"""``/admin/api/v1/prompts`` — append-only versioned collection."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import PromptRow

router = APIRouter(
    prefix="/admin/api/v1/prompts",
    tags=["prompts"],
    dependencies=[Depends(require_auth)],
)


class PromptRead(BaseModel):
    id: str
    prompt_key: str
    version: int
    content: str
    tags: list[str]


class PromptCreate(BaseModel):
    prompt_key: str
    content: str
    tags: list[str] = []


def _to_read(row: PromptRow) -> PromptRead:
    return PromptRead(
        id=row.id,
        prompt_key=row.prompt_key,
        version=row.version,
        content=row.content,
        tags=row.tags or [],
    )


@router.get("", response_model=list[PromptRead])
async def list_prompts(request: Request) -> list[PromptRead]:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (
            await s.execute(
                select(PromptRow).order_by(
                    PromptRow.prompt_key, PromptRow.version.desc()
                )
            )
        ).scalars().all()
        return [_to_read(r) for r in rows]


@router.post("", response_model=PromptRead, status_code=status.HTTP_201_CREATED)
async def create_prompt(body: PromptCreate, request: Request) -> PromptRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        max_v = (
            await s.execute(
                select(func.max(PromptRow.version)).where(
                    PromptRow.prompt_key == body.prompt_key
                )
            )
        ).scalar_one_or_none() or 0
        row = PromptRow(
            id=str(uuid.uuid4()),
            prompt_key=body.prompt_key,
            version=max_v + 1,
            content=body.content,
            tags=body.tags,
        )
        s.add(row)
        await s.commit()
        return _to_read(row)


@router.get("/{pid}", response_model=PromptRead)
async def get_prompt(pid: str, request: Request) -> PromptRead:
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (
            await s.execute(select(PromptRow).where(PromptRow.id == pid))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return _to_read(row)


@router.delete("/{pid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(pid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(PromptRow).where(PromptRow.id == pid))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
