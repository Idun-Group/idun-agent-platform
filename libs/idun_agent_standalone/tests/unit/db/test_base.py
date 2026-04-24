"""Smoke tests for the SQLAlchemy primitives."""

from __future__ import annotations

import pytest
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from sqlalchemy import text


@pytest.mark.asyncio
async def test_sqlite_engine_and_session_roundtrip(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path / 'x.db'}"
    engine = create_db_engine(url)
    sessionmaker = create_sessionmaker(engine)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))

    async with sessionmaker() as session:
        await session.execute(text("INSERT INTO t (id) VALUES (1)"))
        await session.commit()
        row = (await session.execute(text("SELECT id FROM t"))).scalar_one()
        assert row == 1

    await engine.dispose()
