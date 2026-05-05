"""ASGI fixtures that boot the real standalone app for integration tests."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.core.security import hash_password
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.db.migrate import upgrade_head
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.infrastructure.db.session import (
    create_db_engine,
    create_sessionmaker,
)


_LANGGRAPH_AGENT_BODY = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {"name": "ada", "graph_definition": "agent.py:graph"},
    },
}


def _sqlite_url(db_path: Path) -> str:
    return f"sqlite+aiosqlite:///{db_path}"


async def _migrate(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", _sqlite_url(db_path))
    # Alembic env runs asyncio.run internally, which clashes with the
    # pytest_asyncio event loop. Run it in a worker thread.
    await asyncio.to_thread(upgrade_head)


@pytest.fixture
async def standalone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[FastAPI]:
    db_path = tmp_path / "standalone.db"
    await _migrate(db_path, monkeypatch)
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", AuthMode.NONE.value)
    settings = StandaloneSettings()
    app = await create_standalone_app(settings)
    try:
        yield app
    finally:
        await app.state.db_engine.dispose()


@pytest.fixture
async def standalone_password(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[FastAPI]:
    db_path = tmp_path / "standalone.db"
    await _migrate(db_path, monkeypatch)
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", AuthMode.PASSWORD.value)
    monkeypatch.setenv("IDUN_SESSION_SECRET", "x" * 64)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("hunter2"))
    settings = StandaloneSettings()
    app = await create_standalone_app(settings)
    try:
        yield app
    finally:
        await app.state.db_engine.dispose()


@pytest.fixture
async def seeded_agent(request: pytest.FixtureRequest) -> str:
    """Seed a LangGraph agent row into whichever booted app is in scope."""
    app: FastAPI
    if "standalone_password" in request.fixturenames:
        app = request.getfixturevalue("standalone_password")
    else:
        app = request.getfixturevalue("standalone")
    async with app.state.sessionmaker() as session:
        row = StandaloneAgentRow(
            name="Ada",
            base_engine_config=_LANGGRAPH_AGENT_BODY,
        )
        session.add(row)
        await session.commit()
        return row.id


@pytest.fixture
async def standalone_with_agent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[FastAPI]:
    db_path = tmp_path / "standalone.db"
    db_url = _sqlite_url(db_path)
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", AuthMode.NONE.value)
    await asyncio.to_thread(upgrade_head)

    db_engine = create_db_engine(db_url)
    sessionmaker = create_sessionmaker(db_engine)
    async with sessionmaker() as session:
        session.add(
            StandaloneAgentRow(name="Ada", base_engine_config=_LANGGRAPH_AGENT_BODY)
        )
        await session.commit()
    await db_engine.dispose()

    settings = StandaloneSettings()
    app = await create_standalone_app(settings)
    try:
        yield app
    finally:
        await app.state.db_engine.dispose()
