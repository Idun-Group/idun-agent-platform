"""FastAPI dependencies shared by every admin route."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select

from idun_agent_standalone.auth.session import (
    SessionExpiredError,
    SessionInvalidError,
    verify_session_with_meta,
)
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.settings import AuthMode, StandaloneSettings


def get_settings(request: Request) -> StandaloneSettings:
    return request.app.state.settings


SettingsDep = Annotated[StandaloneSettings, Depends(get_settings)]


# Refresh the cookie when its age exceeds 90% of the TTL — i.e. the
# remaining lifetime is in the bottom 10%. Spec §3.4.
_SLIDING_REFRESH_RATIO = 0.9


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _to_utc(dt: datetime) -> datetime:
    """Coerce naive datetimes to UTC so subtraction is well-defined."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def _password_rotated_at(request: Request) -> datetime | None:
    """Read ``AdminUserRow.password_rotated_at`` once per request, cache on state."""
    cached = getattr(request.state, "_password_rotated_at_cached", None)
    if cached is not None:
        # Sentinel: a "no row" hit caches None as ``False`` to avoid
        # repeated DB roundtrips when the singleton is missing.
        return None if cached is False else cached
    sm = getattr(request.app.state, "sessionmaker", None)
    if sm is None:
        request.state._password_rotated_at_cached = False
        return None
    async with sm() as s:
        row = (await s.execute(select(AdminUserRow))).scalar_one_or_none()
    if row is None or row.password_rotated_at is None:
        request.state._password_rotated_at_cached = False
        return None
    rotated = _to_utc(row.password_rotated_at)
    request.state._password_rotated_at_cached = rotated
    return rotated


async def require_auth(
    request: Request,
    settings: SettingsDep,
) -> dict | None:
    """Verify the session cookie; flag for sliding refresh if near TTL.

    Sets ``request.state.refresh_session = True`` when the remaining
    lifetime falls below 10% of the TTL. The
    :func:`refresh_session_cookie_middleware` middleware reads that flag
    and re-signs the cookie on the outgoing response.
    """
    if settings.auth_mode == AuthMode.NONE:
        return None
    token = request.cookies.get("sid")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="auth_required"
        )
    try:
        payload, signed_at = verify_session_with_meta(
            secret=settings.session_secret or "",
            token=token,
            max_age_s=settings.session_ttl_seconds,
        )
    except SessionExpiredError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session_expired"
        ) from e
    except SessionInvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session_invalid"
        ) from e

    rotated_at = await _password_rotated_at(request)
    iat_value = payload.get("iat")
    if rotated_at is not None and isinstance(iat_value, int):
        # Floor both sides to whole seconds. ``iat`` is stamped via
        # ``int(time.time())`` (sign_session) and the row's
        # ``password_rotated_at`` defaults to ``datetime.now(UTC)``,
        # which is microsecond-precision. Without flooring, a session
        # minted in the same second the row was inserted is rejected
        # because the row's fractional seconds put rotated_at strictly
        # ahead of the integer iat.
        rotated_int = int(rotated_at.timestamp())
        if iat_value < rotated_int:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session_revoked",
            )

    # Sliding renewal: when age > 90% of TTL, mark for refresh.
    age = (_utcnow() - _to_utc(signed_at)).total_seconds()
    if age >= settings.session_ttl_seconds * _SLIDING_REFRESH_RATIO:
        request.state.refresh_session = True
        request.state.session_payload = {
            k: v for k, v in payload.items() if k != "iat"
        }

    return payload
