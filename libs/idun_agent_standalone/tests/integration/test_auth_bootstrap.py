"""Integration test for the password-mode admin user bootstrap.

In password mode the login route reads ``AdminUserRow`` from the DB to
verify a submitted bcrypt hash. Without an explicit bootstrap pass the
row is never written and every login attempt returns 401 — the standalone
becomes effectively unusable.

These tests boot the real ``create_standalone_app`` with a password env
var set and assert that ``POST /admin/api/v1/auth/login`` succeeds.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.auth.password import hash_password
from idun_agent_standalone.db.base import Base, create_db_engine
from idun_agent_standalone.settings import StandaloneSettings


@asynccontextmanager
async def _create_schema(database_url: str):
    engine = create_db_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


def _echo_yaml() -> dict:
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test-echo",
                "graph_definition": ("idun_agent_standalone.testing:echo_graph"),
                "checkpointer": {"type": "memory"},
            },
        }
    }


@pytest.fixture
def password_env(tmp_path: Path, monkeypatch):
    """Wire env vars + on-disk config so create_standalone_app can boot in password mode."""
    db_path = tmp_path / "auth.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(_echo_yaml()))
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "x" * 48)
    return tmp_path, monkeypatch, db_path


@pytest.mark.asyncio
async def test_login_succeeds_after_bootstrap(password_env):
    """Boot in password mode without a pre-existing admin row, login must work."""
    _, monkeypatch, db_path = password_env
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("hunter2"))

    async with _create_schema(f"sqlite+aiosqlite:///{db_path}"):
        settings = StandaloneSettings()
        app = await create_standalone_app(settings)
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    "/admin/api/v1/auth/login", json={"password": "hunter2"}
                )
                assert r.status_code == 200, r.text
                assert "sid" in r.cookies


@pytest.mark.asyncio
async def test_force_reset_rotates_stored_hash(password_env):
    """IDUN_FORCE_ADMIN_PASSWORD_RESET=1 re-seeds the admin row from env."""
    _, monkeypatch, db_path = password_env
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("first"))

    async with _create_schema(f"sqlite+aiosqlite:///{db_path}"):
        settings = StandaloneSettings()
        app = await create_standalone_app(settings)
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    "/admin/api/v1/auth/login", json={"password": "first"}
                )
                assert r.status_code == 200

        # Simulate operator rotating the env var AND opting into the
        # one-shot re-seed.
        monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("second"))
        monkeypatch.setenv("IDUN_FORCE_ADMIN_PASSWORD_RESET", "1")
        settings = StandaloneSettings()
        app = await create_standalone_app(settings)
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                # Old password rejected.
                r_old = await client.post(
                    "/admin/api/v1/auth/login", json={"password": "first"}
                )
                assert r_old.status_code == 401
                # New password accepted.
                r_new = await client.post(
                    "/admin/api/v1/auth/login", json={"password": "second"}
                )
                assert r_new.status_code == 200, r_new.text
