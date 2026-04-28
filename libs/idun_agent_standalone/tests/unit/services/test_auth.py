"""Unit tests for ``services/auth.py`` against an in-memory async session."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from idun_agent_standalone.core.security import hash_password, sign_session_id
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.admin_user import (
    StandaloneAdminUserRow,
)
from idun_agent_standalone.infrastructure.db.models.session import (
    StandaloneSessionRow,
)
from idun_agent_standalone.services import auth as auth_service
from sqlalchemy import select


def _settings(*, hash_value: str = "", secret: str = "x" * 64) -> StandaloneSettings:
    return StandaloneSettings(
        auth_mode=AuthMode.PASSWORD,
        session_secret=secret,
        admin_password_hash=hash_value,
        session_ttl_hours=24,
    )


# ---- ensure_admin_seeded ---------------------------------------------------


async def test_ensure_admin_seeded_creates_row(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    row = (
        await async_session.execute(select(StandaloneAdminUserRow))
    ).scalar_one_or_none()
    assert row is not None
    assert row.id == "singleton"


async def test_ensure_admin_seeded_idempotent(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    await auth_service.ensure_admin_seeded(async_session, settings)
    rows = (await async_session.execute(select(StandaloneAdminUserRow))).scalars().all()
    assert len(rows) == 1


async def test_ensure_admin_seeded_fails_without_hash(async_session) -> None:
    """Empty IDUN_ADMIN_PASSWORD_HASH is a fail-fast."""
    settings = _settings(hash_value="")
    with pytest.raises(auth_service.SeedHashMissingError):
        await auth_service.ensure_admin_seeded(async_session, settings)


# ---- login -----------------------------------------------------------------


async def test_login_happy_path(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    signed = await auth_service.login(
        async_session, password="hunter2", settings=settings
    )
    assert signed
    rows = (await async_session.execute(select(StandaloneSessionRow))).scalars().all()
    assert len(rows) == 1


async def test_login_bad_password(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    with pytest.raises(auth_service.InvalidCredentialsError):
        await auth_service.login(async_session, password="wrong", settings=settings)


async def test_login_no_admin_row(async_session) -> None:
    settings = _settings(hash_value="")
    with pytest.raises(auth_service.AdminNotSeededError):
        await auth_service.login(async_session, password="anything", settings=settings)


# ---- logout ----------------------------------------------------------------


async def test_logout_drops_session_row(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    signed = await auth_service.login(
        async_session, password="hunter2", settings=settings
    )
    await auth_service.logout(async_session, signed_cookie=signed, settings=settings)
    rows = (await async_session.execute(select(StandaloneSessionRow))).scalars().all()
    assert rows == []


async def test_logout_silent_on_missing_cookie(async_session) -> None:
    settings = _settings(hash_value="")
    # Must not raise even with no admin row + no cookie.
    await auth_service.logout(async_session, signed_cookie=None, settings=settings)
    await auth_service.logout(async_session, signed_cookie="garbage", settings=settings)


# ---- validate_session ------------------------------------------------------


async def test_validate_session_happy_path(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    signed = await auth_service.login(
        async_session, password="hunter2", settings=settings
    )
    assert (
        await auth_service.validate_session(
            async_session, signed_cookie=signed, settings=settings
        )
        is True
    )


async def test_validate_session_rejects_no_cookie(async_session) -> None:
    settings = _settings()
    assert (
        await auth_service.validate_session(
            async_session, signed_cookie=None, settings=settings
        )
        is False
    )


async def test_validate_session_rejects_bad_signature(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    await auth_service.login(async_session, password="hunter2", settings=settings)
    # Sign with the wrong secret → unsign fails → False
    bad = sign_session_id("anything", "y" * 64)
    assert (
        await auth_service.validate_session(
            async_session, signed_cookie=bad, settings=settings
        )
        is False
    )


async def test_validate_session_drops_expired_row(async_session) -> None:
    """An expired row is False AND removed inline."""
    settings = _settings()
    expired_id = "expired-session-id"
    async_session.add(
        StandaloneSessionRow(
            id=expired_id,
            user_id="singleton",
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    await async_session.commit()
    signed = sign_session_id(expired_id, settings.session_secret)
    assert (
        await auth_service.validate_session(
            async_session, signed_cookie=signed, settings=settings
        )
        is False
    )
    rows = (await async_session.execute(select(StandaloneSessionRow))).scalars().all()
    assert rows == []


# ---- change_password -------------------------------------------------------


async def test_change_password_happy_path(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    await auth_service.change_password(
        async_session, current_password="hunter2", new_password="newPass123"
    )
    # Old password no longer works
    with pytest.raises(auth_service.InvalidCredentialsError):
        await auth_service.login(async_session, password="hunter2", settings=settings)
    # New one does
    await auth_service.login(async_session, password="newPass123", settings=settings)


async def test_change_password_wrong_current(async_session) -> None:
    settings = _settings(hash_value=hash_password("hunter2"))
    await auth_service.ensure_admin_seeded(async_session, settings)
    with pytest.raises(auth_service.InvalidCredentialsError):
        await auth_service.change_password(
            async_session, current_password="wrong", new_password="newPass123"
        )


async def test_change_password_no_admin_row(async_session) -> None:
    with pytest.raises(auth_service.AdminNotSeededError):
        await auth_service.change_password(
            async_session, current_password="x", new_password="newPass123"
        )
