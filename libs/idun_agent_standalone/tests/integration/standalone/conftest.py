"""ASGI fixtures that boot the real standalone app for integration tests."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
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


@pytest.fixture(autouse=True)
def _graph_module_in_cwd(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """Materialize ``agent.py:graph`` in cwd for round-2.5 probes.

    See the matching fixture in ``tests/integration/api/v1/conftest.py``
    for rationale. Uses ``tmp_path_factory`` so the chdir target does
    not collide with the per-test ``tmp_path`` used for SQLite DBs and
    other fixture-owned files.
    """
    cwd_dir = tmp_path_factory.mktemp("graph_cwd")
    src = (
        "from langgraph.graph import StateGraph\n"
        "from typing_extensions import TypedDict\n"
        "class S(TypedDict, total=False):\n"
        "    x: int\n"
        "graph = StateGraph(S)\n"
        "other_graph = StateGraph(S)\n"
    )
    (cwd_dir / "agent.py").write_text(src)
    cwd = os.getcwd()
    os.chdir(cwd_dir)
    try:
        yield
    finally:
        os.chdir(cwd)


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
