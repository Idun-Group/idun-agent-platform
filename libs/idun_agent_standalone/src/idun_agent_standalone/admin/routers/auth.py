"""Login / logout / me — only enforced in password mode."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from idun_agent_standalone.admin.deps import (
    SettingsDep,
    require_auth,
)
from idun_agent_standalone.auth.password import verify_password
from idun_agent_standalone.auth.session import sign_session
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.settings import AuthMode

router = APIRouter(prefix="/admin/api/v1/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


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
