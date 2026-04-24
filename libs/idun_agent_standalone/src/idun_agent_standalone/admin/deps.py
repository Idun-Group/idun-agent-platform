"""FastAPI dependencies shared by every admin route."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from idun_agent_standalone.auth.session import (
    SessionExpiredError,
    SessionInvalidError,
    verify_session,
)
from idun_agent_standalone.settings import AuthMode, StandaloneSettings


def get_settings(request: Request) -> StandaloneSettings:
    return request.app.state.settings


SettingsDep = Annotated[StandaloneSettings, Depends(get_settings)]


def require_auth(
    request: Request,
    settings: SettingsDep,
) -> dict | None:
    if settings.auth_mode == AuthMode.NONE:
        return None
    token = request.cookies.get("sid")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="auth_required"
        )
    try:
        return verify_session(
            secret=settings.session_secret or "",
            token=token,
            max_age_s=settings.session_ttl_seconds,
        )
    except SessionExpiredError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session_expired"
        ) from e
    except SessionInvalidError as e:  # noqa: F841
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session_invalid"
        ) from e
