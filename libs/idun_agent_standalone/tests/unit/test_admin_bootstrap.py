"""Unit tests for ``_bootstrap_admin_user`` — password durability (P2.3).

Spec: the env hash seeds the admin row only on first boot. Subsequent boots
leave the DB row alone so UI-driven password changes survive restarts.
``IDUN_FORCE_ADMIN_PASSWORD_RESET=1`` opts into a one-shot re-seed for
recovery scenarios (lost UI password, etc.).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from idun_agent_standalone.app import _bootstrap_admin_user
from idun_agent_standalone.auth.password import hash_password
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.settings import StandaloneSettings
from sqlalchemy import select


@asynccontextmanager
async def _schema(database_url: str):
    engine = create_db_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


def _password_env(
    monkeypatch, *, db_path: Path, password_hash: str, force_reset: bool = False
) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", password_hash)
    monkeypatch.setenv("IDUN_SESSION_SECRET", "x" * 64)
    if force_reset:
        monkeypatch.setenv("IDUN_FORCE_ADMIN_PASSWORD_RESET", "1")
    else:
        monkeypatch.delenv("IDUN_FORCE_ADMIN_PASSWORD_RESET", raising=False)


async def _read_hash(sm) -> str | None:
    async with sm() as session:
        row = (await session.execute(select(AdminUserRow))).scalar_one_or_none()
        return None if row is None else row.password_hash


@pytest.mark.asyncio
async def test_first_boot_seeds_from_env(tmp_path: Path, monkeypatch):
    """An empty DB plus IDUN_ADMIN_PASSWORD_HASH must seed the admin row."""
    db_path = tmp_path / "first.db"
    env_hash = hash_password("hunter2")
    _password_env(monkeypatch, db_path=db_path, password_hash=env_hash)

    async with _schema(f"sqlite+aiosqlite:///{db_path}") as engine:
        sm = create_sessionmaker(engine)
        settings = StandaloneSettings()

        await _bootstrap_admin_user(settings, sm)

        assert await _read_hash(sm) == env_hash


@pytest.mark.asyncio
async def test_second_boot_does_not_overwrite_existing_row(tmp_path: Path, monkeypatch):
    """If the row exists, the env hash must NOT clobber it on subsequent boots."""
    db_path = tmp_path / "second.db"
    original_hash = hash_password("ui-rotated-password")
    env_hash = hash_password("stale-env-password")
    _password_env(monkeypatch, db_path=db_path, password_hash=env_hash)

    async with _schema(f"sqlite+aiosqlite:///{db_path}") as engine:
        sm = create_sessionmaker(engine)
        # Pre-seed the DB with a hash the operator changed via the UI.
        async with sm() as session:
            session.add(AdminUserRow(id="admin", password_hash=original_hash))
            await session.commit()

        settings = StandaloneSettings()
        await _bootstrap_admin_user(settings, sm)

        # DB still holds the UI-rotated hash, not the env hash.
        assert await _read_hash(sm) == original_hash


@pytest.mark.asyncio
async def test_force_reset_overwrites_existing_row(tmp_path: Path, monkeypatch):
    """IDUN_FORCE_ADMIN_PASSWORD_RESET=1 re-seeds from the env hash."""
    db_path = tmp_path / "force.db"
    original_hash = hash_password("ui-rotated-password")
    env_hash = hash_password("operator-recovery-password")
    _password_env(
        monkeypatch,
        db_path=db_path,
        password_hash=env_hash,
        force_reset=True,
    )

    async with _schema(f"sqlite+aiosqlite:///{db_path}") as engine:
        sm = create_sessionmaker(engine)
        async with sm() as session:
            session.add(AdminUserRow(id="admin", password_hash=original_hash))
            await session.commit()

        settings = StandaloneSettings()
        assert settings.force_admin_password_reset is True

        await _bootstrap_admin_user(settings, sm)

        assert await _read_hash(sm) == env_hash
