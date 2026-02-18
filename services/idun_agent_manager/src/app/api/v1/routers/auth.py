"""Auth router – Google OIDC SSO + username/password authentication.

Auth mode controlled by AUTH__DISABLE_USERNAME_PASSWORD:
- False (default): username/password enabled, SSO disabled
- True: SSO enabled, username/password disabled

Endpoints:
    POST /basic/signup  – Register with email/password
    POST /basic/login   – Login with email/password
    GET  /login         – Redirect to Google authorization endpoint
    GET  /callback      – Exchange code for tokens, set session cookie
    GET  /me            – Return current session from cookie
    POST /logout        – Clear session cookie
"""

import hashlib
import logging
import os
import time
from typing import Any
from uuid import uuid4

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from itsdangerous import (  # type: ignore[import-untyped]
    BadSignature,
    SignatureExpired,
    URLSafeTimedSerializer,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import RedirectResponse

from app.api.v1.deps import get_session
from app.api.v1.schemas.auth import LoginRequest, RegisterRequest
from app.core.security import hash_password, verify_password
from app.core.settings import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_oauth: OAuth | None = None
_serializer: URLSafeTimedSerializer | None = None

SESSION_COOKIE = "sid"


def _get_serializer() -> URLSafeTimedSerializer:
    global _serializer
    if _serializer is None:
        settings = get_settings()
        _serializer = URLSafeTimedSerializer(settings.auth.session_secret)
    return _serializer


def _get_oauth() -> OAuth:
    """Lazily initialise the OAuth registry with Google provider."""
    global _oauth
    if _oauth is None:
        settings = get_settings()
        _oauth = OAuth()
        _oauth.register(
            name="google",
            client_id=settings.auth.client_id,
            client_secret=settings.auth.client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": " ".join(settings.auth.scopes)},
        )
    return _oauth


def _set_session_cookie(
    response: Response,
    payload: dict[str, Any],
    max_age: int | None = None,
) -> None:
    """Sign *payload* and set it as an HTTP-only cookie."""
    settings = get_settings()
    if max_age is None:
        max_age = settings.auth.session_ttl_seconds
    token = _get_serializer().dumps(payload)
    is_prod = settings.environment not in ("development", "test")
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _read_session_cookie(request: Request) -> dict[str, Any] | None:
    """Decode and verify the session cookie. Returns *None* on failure."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    settings = get_settings()
    try:
        payload: dict[str, Any] = _get_serializer().loads(
            token, max_age=settings.auth.session_ttl_seconds
        )
        return payload
    except (BadSignature, SignatureExpired):
        return None


def encrypt_payload(payload: str) -> bytes:
    """Derive a deterministic key for a payload using scrypt.

    Salt is taken from AUTH__SECRET_KEY environment variable.
    Returns 32-byte derived key.
    """
    secret = os.environ.get("AUTH__SECRET_KEY")
    if not secret:
        raise ValueError("AUTH__SECRET_KEY environment variable is required")
    return hashlib.scrypt(
        password=payload.encode(),
        salt=secret.encode(),
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/login",
    summary="Redirect to Google OIDC login",
    description="Initiates the Google OIDC authorization code flow.",
)
async def login(request: Request) -> RedirectResponse:
    """Redirect the user-agent to Google's authorization page."""
    settings = get_settings()
    if not settings.auth.disable_username_password:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SSO auth is disabled",
        )
    oauth = _get_oauth()
    redirect_uri = settings.auth.redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)  # type: ignore[union-attr]


@router.get(
    "/callback",
    summary="OIDC callback",
    description="Exchanges the authorization code for tokens and sets a session cookie.",
)
async def callback(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RedirectResponse:
    """Handle the OIDC callback from Google."""
    settings = get_settings()
    if not settings.auth.disable_username_password:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SSO auth is disabled",
        )
    oauth = _get_oauth()

    try:
        token = await oauth.google.authorize_access_token(request)  # type: ignore[union-attr]
    except Exception as exc:
        logger.exception("OIDC token exchange failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {exc}",
        ) from exc

    userinfo: dict[str, Any] = token.get("userinfo", {})
    if not userinfo:
        # Fall back to fetching from the userinfo endpoint
        try:
            resp = await oauth.google.get(
                "https://openidconnect.googleapis.com/v1/userinfo", token=token
            )  # type: ignore[union-attr]
            userinfo = resp.json()
        except Exception:
            pass

    if not userinfo or not userinfo.get("email"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not retrieve user info from provider",
        )

    email: str = userinfo["email"]
    name: str = userinfo.get("name", "")
    picture: str = userinfo.get("picture", "")
    provider_sub: str = userinfo.get("sub", "")

    # Upsert user (import here to avoid circular import at module level)
    from app.infrastructure.db.models.user import UserModel

    stmt = select(UserModel).where(UserModel.email == email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        # First-time login: create user + default workspace + membership
        from app.infrastructure.db.models.membership import MembershipModel
        from app.infrastructure.db.models.workspace import WorkspaceModel

        user = UserModel(
            id=uuid4(),
            email=email,
            name=name,
            picture_url=picture,
            provider="google",
            provider_sub=provider_sub,
        )
        session.add(user)
        await session.flush()

        workspace = WorkspaceModel(
            id=uuid4(),
            name=f"{name or email.split('@')[0]}'s Workspace",
            slug=f"ws-{uuid4().hex[:8]}",
        )
        session.add(workspace)
        await session.flush()

        membership = MembershipModel(
            id=uuid4(),
            user_id=user.id,
            workspace_id=workspace.id,
            role="admin",
        )
        session.add(membership)
        await session.flush()

        workspace_ids = [str(workspace.id)]
    else:
        # Update profile fields if changed
        if user.name != name and name:
            user.name = name
        if user.picture_url != picture and picture:
            user.picture_url = picture
        if user.provider_sub != provider_sub and provider_sub:
            user.provider_sub = provider_sub
        await session.flush()

        # Fetch workspace memberships
        from app.infrastructure.db.models.membership import MembershipModel

        ws_stmt = select(MembershipModel.workspace_id).where(
            MembershipModel.user_id == user.id
        )
        ws_result = await session.execute(ws_stmt)
        workspace_ids = [str(wid) for (wid,) in ws_result.all()]

    # Build session payload matching the frontend Session interface
    session_payload = {
        "provider": "google",
        "principal": {
            "user_id": str(user.id),
            "email": email,
            "roles": ["admin"] if not workspace_ids else ["admin"],
            "workspace_ids": workspace_ids,
        },
        "expires_at": int(time.time()) + settings.auth.session_ttl_seconds,
    }

    redirect_url = f"{settings.auth.frontend_url}/agents"
    response = RedirectResponse(url=redirect_url, status_code=302)
    _set_session_cookie(response, session_payload)
    return response


@router.get(
    "/me",
    summary="Get current session",
    description="Returns the current user session from the session cookie.",
)
async def me(request: Request) -> dict[str, Any]:
    """Return the current session or 401."""
    payload = _read_session_cookie(request)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return {"session": payload}


@router.post(
    "/logout",
    summary="Logout",
    description="Clears the session cookie.",
)
async def logout(response: Response) -> dict[str, bool]:
    """Clear the session cookie."""
    settings = get_settings()
    is_prod = settings.environment not in ("development", "test")
    response.delete_cookie(
        key=SESSION_COOKIE,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
    )
    return {"ok": True}


@router.post("/basic/signup")
async def basic_signup(
    request: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    settings = get_settings()

    _salt = settings.auth.session_secret

    if settings.auth.disable_username_password:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Username/password auth is disabled",
        )

    from app.infrastructure.db.models.user import UserModel

    try:
        stmt = select(UserModel).where(UserModel.email == request.email)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()
    except Exception as e:
        logger.error(f"Database error checking existing user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error",
        ) from e

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.workspace import WorkspaceModel

    try:
        user = UserModel(
            id=uuid4(),
            email=request.email,
            name=request.name,
            provider="local",
            password_hash=hash_password(request.password, _salt).decode("utf-8"),
        )
        session.add(user)
        await session.flush()

        workspace = WorkspaceModel(
            id=uuid4(),
            name=f"{request.name or request.email.split('@')[0]}'s Workspace",
            slug=f"ws-{uuid4().hex[:8]}",
        )
        session.add(workspace)
        await session.flush()

        membership = MembershipModel(
            id=uuid4(),
            user_id=user.id,
            workspace_id=workspace.id,
            role="admin",
        )
        session.add(membership)
        await session.flush()
    except Exception as e:
        logger.error(f"Database error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error",
        ) from e

    session_payload = {
        "provider": "local",
        "principal": {
            "user_id": str(user.id),
            "email": request.email,
            "roles": ["admin"],
            "workspace_ids": [str(workspace.id)],
        },
        "expires_at": int(time.time()) + settings.auth.session_ttl_seconds,
    }
    _set_session_cookie(response, session_payload)

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "workspace_ids": [str(workspace.id)],
    }


@router.post("/basic/login")
async def basic_login(
    request: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    settings = get_settings()
    if settings.auth.disable_username_password:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Username/password auth is disabled",
        )

    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.user import UserModel

    try:
        stmt = select(UserModel).where(UserModel.email == request.email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
    except Exception as e:
        logger.error(f"Database error during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error",
        ) from e

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(request.password, user.password_hash.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    try:
        ws_stmt = select(MembershipModel.workspace_id).where(
            MembershipModel.user_id == user.id
        )
        ws_result = await session.execute(ws_stmt)
        workspace_ids = [str(wid) for (wid,) in ws_result.all()]
    except Exception as e:
        logger.error(f"Database error fetching workspaces: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error",
        ) from e

    session_payload = {
        "provider": "local",
        "principal": {
            "user_id": str(user.id),
            "email": user.email,
            "roles": ["admin"],
            "workspace_ids": workspace_ids,
        },
        "expires_at": int(time.time()) + settings.auth.session_ttl_seconds,
    }
    _set_session_cookie(response, session_payload)

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "workspace_ids": workspace_ids,
    }
