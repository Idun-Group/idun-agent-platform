"""Shared pytest fixtures for idun_agent_standalone (spec §7.2).

These fixtures back the integration tests so individual files don't have
to repeat env setup, app construction, and admin auth dance.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.auth.password import hash_password
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.testing_app import make_test_app


@pytest_asyncio.fixture
async def standalone_app(
    tmp_path, monkeypatch
) -> AsyncIterator[tuple[FastAPI, Any]]:
    """In-memory SQLite app with no auth — admin endpoints are open.

    Yields ``(app, sessionmaker)``. Disposes the engine after the test.
    """
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'standalone.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, sm = await make_test_app()
    try:
        yield app, sm
    finally:
        await app.state.db_engine.dispose()


@pytest_asyncio.fixture
async def authed_client(
    tmp_path, monkeypatch
) -> AsyncIterator[AsyncClient]:
    """Password-mode app + httpx client with a valid session cookie.

    Builds the app, seeds an admin row, posts /auth/login to get a fresh
    cookie. Tests using this fixture get a ready-to-use client whose
    requests already carry ``sid``.
    """
    pw = "test-password-1234"
    pw_hash = hash_password(pw)
    secret = "x" * 64
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'authed.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", pw_hash)
    monkeypatch.setenv("IDUN_SESSION_SECRET", secret)

    app, sm = await make_test_app()

    async with sm() as session:
        session.add(AdminUserRow(id="admin", password_hash=pw_hash))
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        login = await client.post(
            "/admin/api/v1/auth/login", json={"password": pw}
        )
        assert login.status_code == 200, login.text
        try:
            yield client
        finally:
            await app.state.db_engine.dispose()


@pytest.fixture
def fake_run() -> list[dict[str, Any]]:
    """A scripted AG-UI run: RunStarted → 2 text deltas → tool call → RunFinished.

    Used by traces tests to push deterministic event sequences through the
    observer without needing the real engine.
    """
    return [
        {"type": "RunStarted", "thread_id": "t1", "run_id": "r1"},
        {
            "type": "TextMessageContent",
            "delta": "Hello ",
            "thread_id": "t1",
            "run_id": "r1",
        },
        {
            "type": "TextMessageContent",
            "delta": "world",
            "thread_id": "t1",
            "run_id": "r1",
        },
        {
            "type": "ToolCallStart",
            "tool_call_id": "tc1",
            "tool_call_name": "lookup",
            "thread_id": "t1",
            "run_id": "r1",
        },
        {
            "type": "ToolCallEnd",
            "tool_call_id": "tc1",
            "result": {"status": "ok"},
            "thread_id": "t1",
            "run_id": "r1",
        },
        {"type": "RunFinished", "thread_id": "t1", "run_id": "r1"},
    ]
