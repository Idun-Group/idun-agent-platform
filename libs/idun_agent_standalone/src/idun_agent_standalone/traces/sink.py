"""SQLAlchemy sink — upsert sessions and append trace events."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.db.models import SessionRow, TraceEventRow


class DatabaseTraceSink:
    def __init__(self, sessionmaker: async_sessionmaker) -> None:
        self._sm = sessionmaker

    async def flush(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        async with self._sm() as s:
            counts: dict[str, int] = {}
            for it in items:
                counts[it["session_id"]] = counts.get(it["session_id"], 0) + 1

            for sid, inc in counts.items():
                existing = (
                    await s.execute(select(SessionRow).where(SessionRow.id == sid))
                ).scalar_one_or_none()
                if existing is None:
                    s.add(SessionRow(id=sid, message_count=inc))
                else:
                    existing.message_count = (existing.message_count or 0) + inc
                    existing.last_event_at = datetime.now(UTC)

            for it in items:
                s.add(
                    TraceEventRow(
                        session_id=it["session_id"],
                        run_id=it["run_id"],
                        sequence=it["sequence"],
                        event_type=it["event_type"],
                        payload=it["payload"],
                    )
                )
            await s.commit()
