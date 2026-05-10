"""Unit tests for the trace writer task."""

from __future__ import annotations

import asyncio

import pytest
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from idun_agent_standalone.infrastructure.traces.writer import TraceWriter
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Cross-test import sentinel: PLAN's writer test asks for ``_fake_span``
# from ``tests.unit.traces.test_exporter``. We re-export it from the
# helpers module so the symbol is available in either place.
from tests.unit.traces._helpers import fake_span as _fake_span


@pytest.mark.asyncio
async def test_writer_drains_queue_into_sqlite(tmp_path):
    """Spans pushed onto the exporter's queue land in the SQLite DB."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'tw.db'}"

    # Create tables via SQLAlchemy metadata (alembic adds GENERATED columns
    # on PG, but SQLite has no analogue — the writer stamps total_tokens
    # explicitly, so a plain create_all is the right shape here).
    setup_engine = create_async_engine(url)
    async with setup_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await setup_engine.dispose()

    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        exporter.export([_fake_span() for _ in range(5)])
        # Allow the writer enough loop ticks to drain.
        for _ in range(40):
            await asyncio.sleep(0.05)
            async with sm() as session:
                from idun_agent_standalone.infrastructure.db.models.span import (
                    StandaloneSpanRow,
                )
                from sqlalchemy import func, select

                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            if count == 5:
                break
    finally:
        await writer.stop()
        await engine.dispose()

    assert count == 5


@pytest.mark.asyncio
async def test_writer_failopen_logs_and_continues(tmp_path, caplog):
    """A batch insert failure is logged but the writer keeps going."""
    import logging

    url = f"sqlite+aiosqlite:///{tmp_path / 'fail.db'}"
    # Intentionally do NOT create tables — INSERT will fail.
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    exporter = StandaloneSpanExporter(max_queue_size=10)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=5,
        schedule_delay_millis=20,
    )
    with caplog.at_level(logging.ERROR):
        await writer.start()
        try:
            exporter.export([_fake_span() for _ in range(3)])
            await asyncio.sleep(0.2)
        finally:
            await writer.stop()
            await engine.dispose()

    # Writer task must have logged the batch failure and continued (no
    # uncaught exception escaped through the wait_for in stop()).
    failure_records = [
        r for r in caplog.records if "trace writer batch insert failed" in r.message
    ]
    assert failure_records, "writer must log batch failures, not propagate"
