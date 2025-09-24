"""OIDC authentication routes: login and callback (PKCE)."""

import base64
import os
import hashlib
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse, JSONResponse

from app.core.settings import get_settings
from app.infrastructure.auth.oidc import get_provider
from app.infrastructure.cache.redis_client import get_redis_client
import json
import secrets


router = APIRouter()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_pkce_pair() -> tuple[str, str]:
    code_verifier = _b64url(os.urandom(32))
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = _b64url(digest)
    return code_verifier, code_challenge


@router.get("/login", summary="Start OIDC login")
async def login(request: Request) -> RedirectResponse:
    settings = get_settings()
    provider = get_provider()

    state = _b64url(os.urandom(16))
    code_verifier, code_challenge = generate_pkce_pair()

    # Persist ephemeral state in secure cookies (could be Redis in prod)
    response = RedirectResponse(url="/")
    response.set_cookie("oidc_state", state, httponly=True, secure=not settings.is_development, samesite="lax")
    response.set_cookie("oidc_code_verifier", code_verifier, httponly=True, secure=not settings.is_development, samesite="lax")

    redirect_uri = settings.auth.redirect_uri or str(request.url_for("callback"))
    auth_url = await provider.get_authorization_url(
        state=state,
        redirect_uri=redirect_uri,
        scopes=settings.auth.scopes,
        code_challenge=code_challenge,
    )
    response.headers["Location"] = auth_url
    response.status_code = status.HTTP_302_FOUND
    return response


@router.get("/callback", name="callback", summary="OIDC callback")
async def callback(request: Request) -> Response:
    settings = get_settings()
    provider = get_provider()

    params = dict(request.query_params)
    code = params.get("code")
    state = params.get("state")
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code/state")

    cookie_state = request.cookies.get("oidc_state")
    code_verifier = request.cookies.get("oidc_code_verifier")
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state")

    token = await provider.exchange_code_for_token(
        code=code,
        redirect_uri=settings.auth.redirect_uri or str(request.url_for("callback")),
        code_verifier=code_verifier,
    )

    id_token = token.get("id_token")
    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")
    expires_in = token.get("expires_in")  # seconds
    if not id_token and not access_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No token returned")

    # Create opaque session id and store tokens server-side
    sid = secrets.token_urlsafe(32)
    # Optional dev override
    override_ttl = settings.auth.test_access_ttl_seconds
    effective_expires = int(override_ttl) if override_ttl else int(expires_in or 3600)

    data = {
        "id_token": id_token,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": (int(__import__("time").time()) + effective_expires),
        "provider": "oidc",
    }
    redis = get_redis_client()
    client = await redis.get_client()
    await client.set(f"sid:{sid}", json.dumps(data), ex=max(effective_expires, 60))

    resp = RedirectResponse(url="/")
    resp.set_cookie("sid", sid, httponly=True, secure=not settings.is_development, samesite="lax", max_age=60*60*24*7)
    # clear temporary cookies
    resp.delete_cookie("oidc_state")
    resp.delete_cookie("oidc_code_verifier")
    return resp


@router.get("/me")
async def me(request: Request) -> JSONResponse:
    sid = request.cookies.get("sid")
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No session")
    redis = get_redis_client()
    raw = await redis.get(f"sid:{sid}")
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return JSONResponse(content={"session": json.loads(raw)})


