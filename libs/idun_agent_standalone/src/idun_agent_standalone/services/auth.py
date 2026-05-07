"""Service layer for the strict-minimum password auth flow.

Five operations:

- ``ensure_admin_seeded`` — at boot, if no admin row exists in password
  mode, write one from ``IDUN_ADMIN_PASSWORD_HASH``. Fails loudly if the
  env hash is empty so misconfigured deploys do not silently start with
  an unseeded admin.
- ``login`` — verify the password, allocate a session row, return the
  signed cookie value.
- ``logout`` — drop the session row.
- ``change_password`` — verify the current password, update the hash.
- ``validate_session`` — used by the ``require_auth`` dependency to
  resolve the cookie back to a non-expired session row.

Anything more elaborate (rate limit, CSRF, sliding renewal, rotation
invalidates outstanding sessions) is deferred. The shape here leaves
room for those additions.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.security import (
    hash_password,
    new_session_id,
    sign_session_id,
    verify_password,
    verify_session_id,
)
from idun_agent_standalone.core.settings import StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.admin_user import (
    StandaloneAdminUserRow,
)
from idun_agent_standalone.infrastructure.db.models.session import (
    StandaloneSessionRow,
)

logger = get_logger(__name__)

ADMIN_USER_ID = "singleton"


class AuthError(Exception):
    """Base class for ``services.auth`` errors caught by routers."""


class InvalidCredentialsError(AuthError):
    """Raised when the supplied password does not match the stored hash."""


class AdminNotSeededError(AuthError):
    """Raised when password mode is requested but no admin row exists."""


class SeedHashMissingError(AuthError):
    """Raised when ``IDUN_ADMIN_PASSWORD_HASH`` is empty at first boot."""


# ---- seed -----------------------------------------------------------------


async def ensure_admin_seeded(
    session: AsyncSession, settings: StandaloneSettings
) -> None:
    """Create the singleton admin row from ``IDUN_ADMIN_PASSWORD_HASH``.

    Idempotent — if a row already exists this is a no-op. Called from
    ``app.create_standalone_app`` once the engine has built; only runs
    in password mode.
    """
    existing = (
        await session.execute(
            select(StandaloneAdminUserRow).where(
                StandaloneAdminUserRow.id == ADMIN_USER_ID
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return

    if not settings.admin_password_hash:
        raise SeedHashMissingError(
            "IDUN_ADMIN_AUTH_MODE=password is set but no admin row exists "
            "and IDUN_ADMIN_PASSWORD_HASH is empty. Generate one with "
            "`idun-standalone hash-password` and export it."
        )

    session.add(
        StandaloneAdminUserRow(
            id=ADMIN_USER_ID,
            password_hash=settings.admin_password_hash,
        )
    )
    await session.commit()
    logger.info("admin.auth.seed admin row created from env")


# ---- session lifecycle ----------------------------------------------------


async def login(
    session: AsyncSession,
    *,
    password: str,
    settings: StandaloneSettings,
) -> str:
    """Verify the password and allocate a session.

    Returns the **signed** cookie value the router should set on the
    response. Raises ``InvalidCredentialsError`` on a bad password and
    ``AdminNotSeededError`` if no admin row exists.
    """
    user = (
        await session.execute(
            select(StandaloneAdminUserRow).where(
                StandaloneAdminUserRow.id == ADMIN_USER_ID
            )
        )
    ).scalar_one_or_none()
    if user is None:
        raise AdminNotSeededError("admin row missing; check startup seed configuration")

    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError("password did not match")

    session_id = new_session_id()
    expires_at = datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours)
    session.add(
        StandaloneSessionRow(
            id=session_id,
            user_id=ADMIN_USER_ID,
            expires_at=expires_at,
        )
    )
    await session.commit()
    logger.info(
        "admin.auth.login ok session_id=%s... ttl_hours=%d",
        session_id[:8],
        settings.session_ttl_hours,
    )
    return sign_session_id(session_id, settings.session_secret)


async def logout(
    session: AsyncSession,
    *,
    signed_cookie: str | None,
    settings: StandaloneSettings,
) -> None:
    """Drop the session row referenced by the signed cookie.

    Silent on missing/invalid cookie — logout is idempotent and the
    response simply clears the cookie regardless.
    """
    if not signed_cookie:
        return
    session_id = verify_session_id(signed_cookie, settings.session_secret)
    if not session_id:
        return
    await session.execute(
        delete(StandaloneSessionRow).where(StandaloneSessionRow.id == session_id)
    )
    await session.commit()
    logger.info("admin.auth.logout session_id=%s...", session_id[:8])


async def validate_session(
    session: AsyncSession,
    *,
    signed_cookie: str | None,
    settings: StandaloneSettings,
) -> bool:
    """Return True iff the cookie maps to a non-expired session row.

    Pure read path — does not extend or rotate the session.
    """
    if not signed_cookie:
        return False
    session_id = verify_session_id(signed_cookie, settings.session_secret)
    if not session_id:
        return False
    row = (
        await session.execute(
            select(StandaloneSessionRow).where(StandaloneSessionRow.id == session_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        # SQLite stores naive UTC timestamps; coerce so the comparison is sound.
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        # Drop the stale row inline; cheaper than a sweeper for the common case.
        await session.execute(
            delete(StandaloneSessionRow).where(StandaloneSessionRow.id == session_id)
        )
        await session.commit()
        return False
    return True


# ---- password rotation ----------------------------------------------------


async def change_password(
    session: AsyncSession,
    *,
    current_password: str,
    new_password: str,
) -> None:
    """Replace the admin password hash.

    Strict-minimum semantics: outstanding sessions are *not* invalidated.
    The current request's session keeps working. Adding rotation-based
    invalidation later is a one-line ``DELETE FROM standalone_session``
    followed by a fresh login from the operator's UI.
    """
    user = (
        await session.execute(
            select(StandaloneAdminUserRow).where(
                StandaloneAdminUserRow.id == ADMIN_USER_ID
            )
        )
    ).scalar_one_or_none()
    if user is None:
        raise AdminNotSeededError("admin row missing")
    if not verify_password(current_password, user.password_hash):
        raise InvalidCredentialsError("current password did not match")

    user.password_hash = hash_password(new_password)
    user.password_rotated_at = datetime.now(UTC)
    await session.commit()
    logger.info("admin.auth.change_password rotated")
