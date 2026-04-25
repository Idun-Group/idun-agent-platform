"""Integration test for DatabaseTraceSink against a real SQLite session."""

import pytest
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.db.models import SessionRow, TraceEventRow
from idun_agent_standalone.traces.sink import DatabaseTraceSink
from sqlalchemy import select


@pytest.mark.asyncio
async def test_sink_upserts_session_and_appends_events(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'tr.db'}")
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)
    sink = DatabaseTraceSink(sm)

    items = [
        {
            "session_id": "s1",
            "run_id": "r1",
            "sequence": 0,
            "event_type": "RunStarted",
            "payload": {},
        },
        {
            "session_id": "s1",
            "run_id": "r1",
            "sequence": 1,
            "event_type": "RunFinished",
            "payload": {"ok": True},
        },
    ]
    await sink.flush(items)

    async with sm() as session:
        sessions = (await session.execute(select(SessionRow))).scalars().all()
        events = (await session.execute(select(TraceEventRow))).scalars().all()
    assert len(sessions) == 1
    assert sessions[0].id == "s1"
    assert sessions[0].message_count == 2
    assert len(events) == 2

    # second flush extends the session
    await sink.flush(
        [
            {
                "session_id": "s1",
                "run_id": "r2",
                "sequence": 0,
                "event_type": "RunStarted",
                "payload": {},
            }
        ]
    )
    async with sm() as session:
        sessions = (await session.execute(select(SessionRow))).scalars().all()
    assert sessions[0].message_count == 3
    await engine.dispose()
