"""``/admin/api/v1/traces`` — read-only access to captured AG-UI run events."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.db.models import SessionRow, TraceEventRow

router = APIRouter(
    prefix="/admin/api/v1/traces",
    tags=["traces"],
    dependencies=[Depends(require_auth)],
)


class SessionSummary(BaseModel):
    id: str
    created_at: datetime
    last_event_at: datetime
    message_count: int
    title: str | None


class SessionList(BaseModel):
    items: list[SessionSummary]
    total: int


class TraceEvent(BaseModel):
    id: int
    session_id: str
    run_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]
    created_at: datetime


class EventsResponse(BaseModel):
    events: list[TraceEvent]
    truncated: bool


@router.get("/sessions", response_model=SessionList)
async def list_sessions(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        total = (await s.execute(select(func.count(SessionRow.id)))).scalar_one()
        rows = (
            await s.execute(
                select(SessionRow)
                .order_by(SessionRow.last_event_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()
        return SessionList(
            items=[
                SessionSummary(
                    id=r.id,
                    created_at=r.created_at,
                    last_event_at=r.last_event_at,
                    message_count=r.message_count,
                    title=r.title,
                )
                for r in rows
            ],
            total=total,
        )


@router.get("/sessions/{sid}", response_model=SessionSummary)
async def get_session(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        row = (
            await s.execute(select(SessionRow).where(SessionRow.id == sid))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not_found")
        return SessionSummary(
            id=row.id,
            created_at=row.created_at,
            last_event_at=row.last_event_at,
            message_count=row.message_count,
            title=row.title,
        )


@router.get("/sessions/{sid}/events", response_model=EventsResponse)
async def get_session_events(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        rows = (
            await s.execute(
                select(TraceEventRow)
                .where(TraceEventRow.session_id == sid)
                .order_by(TraceEventRow.sequence.asc())
                .limit(1000)
            )
        ).scalars().all()
        total = (
            await s.execute(
                select(func.count(TraceEventRow.id)).where(
                    TraceEventRow.session_id == sid
                )
            )
        ).scalar_one()
        return EventsResponse(
            events=[
                TraceEvent(
                    id=r.id,
                    session_id=r.session_id,
                    run_id=r.run_id,
                    sequence=r.sequence,
                    event_type=r.event_type,
                    payload=r.payload or {},
                    created_at=r.created_at,
                )
                for r in rows
            ],
            truncated=total > len(rows),
        )


@router.delete("/sessions/{sid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(sid: str, request: Request):
    sm = request.app.state.sessionmaker
    async with sm() as s:
        await s.execute(delete(TraceEventRow).where(TraceEventRow.session_id == sid))
        await s.execute(delete(SessionRow).where(SessionRow.id == sid))
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
