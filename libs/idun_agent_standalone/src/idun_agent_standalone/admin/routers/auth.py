"""Login / logout / me / change-password — only enforced in password mode."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from idun_agent_standalone.admin.deps import (
    SettingsDep,
    require_auth,
)
from idun_agent_standalone.auth.password import hash_password, verify_password
from idun_agent_standalone.auth.session import sign_session
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.settings import AuthMode

router = APIRouter(prefix="/admin/api/v1/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


class ChangePasswordBody(BaseModel):
    current: str
    new: str = Field(..., min_length=8)


AuthDep = Annotated[dict | None, Depends(require_auth)]


@router.post("/login")
async def login(
    body: LoginBody,
    response: Response,
    request: Request,
    settings: SettingsDep,
):
    if settings.auth_mode == AuthMode.NONE:
        return {"ok": True, "auth_mode": "none"}

    sm = request.app.state.sessionmaker
    async with sm() as session:
        admin = (await session.execute(select(AdminUserRow))).scalar_one_or_none()
    if admin is None or not verify_password(body.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials"
        )

    token = sign_session(
        secret=settings.session_secret or "", payload={"uid": "admin"}
    )
    response.set_cookie(
        "sid",
        token,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@router.get("/me")
async def me(settings: SettingsDep, _claims: AuthDep):
    return {"authenticated": True, "auth_mode": settings.auth_mode.value}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    request: Request,
    response: Response,
    settings: SettingsDep,
    _claims: AuthDep,
):
    """Rotate the admin password. Stamps ``password_rotated_at``.

    All sessions issued before the new ``password_rotated_at`` are
    invalidated by ``require_auth`` on their next request (it compares
    the cookie's ``iat`` to the row's ``password_rotated_at``). This
    response also re-signs the cookie for the caller so they remain
    logged in immediately after rotating.
    """
    if settings.auth_mode != AuthMode.PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="password_mode_required",
        )

    sm = request.app.state.sessionmaker
    async with sm() as session:
        admin = (await session.execute(select(AdminUserRow))).scalar_one_or_none()
        if admin is None or not verify_password(body.current, admin.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_credentials",
            )
        admin.password_hash = hash_password(body.new)
        admin.password_rotated_at = datetime.now(UTC)
        await session.commit()

    # Drop any cached rotation timestamp on this request so the new cookie
    # we issue below is not also rejected on its way out the door.
    request.state._password_rotated_at_cached = False

    # Re-sign the caller's cookie so they stay logged in.
    token = sign_session(
        secret=settings.session_secret or "", payload={"uid": "admin"}
    )
    response.set_cookie(
        "sid",
        token,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    return {"ok": True}
