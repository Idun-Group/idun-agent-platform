"""OIDC authentication routes: login and callback (PKCE)."""

import base64
import hashlib
import json
import os
import secrets

from fastapi import APIRouter, HTTPException, Request, Response, status, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.core.settings import get_settings
from app.infrastructure.auth.oidc import get_provider
from app.infrastructure.cache.redis_client import get_redis_client
from app.infrastructure.auth.passwords import verify_password, hash_password
from app.infrastructure.db.session import get_async_session
from app.api.v1.deps import get_principal, get_session
from idun_agent_schema.manager.deps import Principal
from app.infrastructure.db.models.roles import RoleModel, UserRoleModel
from app.infrastructure.db.models.users import UserModel

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
    response.set_cookie(
        "oidc_state",
        state,
        httponly=True,
        secure=not settings.is_development,
        samesite="lax",
    )
    response.set_cookie(
        "oidc_code_verifier",
        code_verifier,
        httponly=True,
        secure=not settings.is_development,
        samesite="lax",
    )

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code/state"
        )

    cookie_state = request.cookies.get("oidc_state")
    code_verifier = request.cookies.get("oidc_code_verifier")
    if not cookie_state or cookie_state != state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state"
        )

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No token returned"
        )

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
    resp.set_cookie(
        "sid",
        sid,
        httponly=True,
        secure=not settings.is_development,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )
    # clear temporary cookies
    resp.delete_cookie("oidc_state")
    resp.delete_cookie("oidc_code_verifier")
    return resp


@router.get("/me")
async def me(request: Request) -> JSONResponse:
    sid = request.cookies.get("sid")
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No session"
        )
    redis = get_redis_client()
    raw = await redis.get(f"sid:{sid}")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    return JSONResponse(content={"session": json.loads(raw)})


# ==== Basic auth endpoints ====


class BasicLoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/basic/login", summary="Basic email/password login")
async def basic_login(request: BasicLoginRequest) -> JSONResponse:
    async for session in get_async_session():
        stmt = select(UserModel).where(UserModel.email == str(request.email))
        result = await session.execute(stmt)
        user: UserModel | None = result.scalar_one_or_none()
        if not user or not user.is_active or not user.password_hash:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not verify_password(request.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # Update last_login_at
        from datetime import datetime, timezone

        user.last_login_at = datetime.now(timezone.utc)
        await session.flush()

        # Create basic session in Redis
        import json as _json
        import secrets as _secrets
        from app.core.settings import get_settings

        sid = _secrets.token_urlsafe(32)
        # Default 24h
        expires_in = 60 * 60 * 24
        # Load roles for session
        stmt_roles = (
            select(RoleModel.name)
            .join(UserRoleModel, UserRoleModel.role_id == RoleModel.id)
            .where(UserRoleModel.user_id == user.id)
        )
        rres = await session.execute(stmt_roles)
        role_names = [r for (r,) in rres.all()]
        data = {
            "provider": "basic",
            "principal": {
                "user_id": str(user.id),
                "email": user.email,
                "roles": role_names,
                "workspace_ids": [],
            },
            "expires_at": int(__import__("time").time()) + expires_in,
        }
        redis = get_redis_client()
        await redis.set(f"sid:{sid}", _json.dumps(data), ex=expires_in)

        resp = JSONResponse(content={"ok": True})
        settings = get_settings()
        resp.set_cookie(
            "sid",
            sid,
            httponly=True,
            secure=not settings.is_development,
            samesite="lax",
            max_age=expires_in,
        )
        return resp


@router.post("/basic/logout", summary="Basic logout")
async def basic_logout(request: Request) -> JSONResponse:
    sid = request.cookies.get("sid")
    if sid:
        redis = get_redis_client()
        await redis.delete(f"sid:{sid}")
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie("sid")
    return resp


class BasicSignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    roles: list[str] = []
    workspaces: list[str] = []  # list of workspace UUIDs to grant membership


@router.post("/basic/signup", summary="Create user (admin only)", status_code=status.HTTP_201_CREATED)
async def basic_signup(
    request: BasicSignupRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    # Require admin role
    if "admin" not in (principal.roles or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")

    # Uniqueness check
    exists = await session.execute(select(UserModel).where(UserModel.email == str(request.email)))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = UserModel(
        id=uuid4(),
        email=str(request.email),
        name=request.name,
        avatar_url=None,
        password_hash=hash_password(request.password),
        is_active=True,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)

    # Assign tenant membership to the caller's tenant
    from sqlalchemy import text as _sql_text
    await session.execute(
        _sql_text(
            """
            INSERT INTO tenant_users (id, tenant_id, user_id)
            VALUES (:id, :tenant_id, :user_id)
            ON CONFLICT (tenant_id, user_id) DO NOTHING
            """
        ),
        {"id": str(uuid4()), "tenant_id": str(principal.tenant_id), "user_id": str(user.id)},
    )

    # Assign roles if provided
    assigned_roles: list[str] = []
    if request.roles:
        # Fetch roles by name
        db_roles = (
            await session.execute(select(RoleModel).where(RoleModel.name.in_(request.roles)))
        ).scalars().all()
        found = {r.name: r for r in db_roles}
        missing = [r for r in request.roles if r not in found]
        if missing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Roles not found: {', '.join(missing)}")
        for role in db_roles:
            # Upsert user_roles
            existing = (
                await session.execute(
                    select(UserRoleModel).where(
                        UserRoleModel.user_id == user.id, UserRoleModel.role_id == role.id
                    )
                )
            ).scalar_one_or_none()
            if not existing:
                session.add(UserRoleModel(id=uuid4(), user_id=user.id, role_id=role.id))
            assigned_roles.append(role.name)
        await session.flush()

    # Assign workspace memberships if provided (validate tenant)
    assigned_workspaces: list[str] = []
    if request.workspaces:
        from sqlalchemy import text as _t
        # Validate workspaces belong to caller's tenant
        rows = await session.execute(
            _t(
                "SELECT id FROM workspaces WHERE tenant_id = :tid AND id = ANY(:ids)"
            ),
            {"tid": str(principal.tenant_id), "ids": request.workspaces},
        )
        valid_ids = {str(r[0]) for r in rows.fetchall()}
        invalid = [w for w in request.workspaces if w not in valid_ids]
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid workspaces: {', '.join(invalid)}")
        for wid in valid_ids:
            await session.execute(
                _t(
                    """
                    INSERT INTO workspace_users (id, workspace_id, user_id)
                    VALUES (:id, :wid, :uid)
                    ON CONFLICT (workspace_id, user_id) DO NOTHING
                    """
                ),
                {"id": str(uuid4()), "wid": wid, "uid": str(user.id)},
            )
        assigned_workspaces = list(valid_ids)

    return JSONResponse(status_code=status.HTTP_201_CREATED, content={
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "roles": assigned_roles,
        "workspace_ids": assigned_workspaces,
    })


# Admin-only RBAC endpoints


class AssignRoleRequest(BaseModel):
    user_id: str
    role: str


@router.get("/roles", summary="List available roles")
async def list_roles(principal: Principal = Depends(get_principal)) -> JSONResponse:
    if "admin" not in (principal.roles or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    async for session in get_async_session():
        rows = (await session.execute(select(RoleModel.name))).scalars().all()
        return JSONResponse(content={"roles": rows})


@router.post("/roles/assign", summary="Assign role to user")
async def assign_role(req: AssignRoleRequest, principal: Principal = Depends(get_principal)) -> JSONResponse:
    if "admin" not in (principal.roles or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    async for session in get_async_session():
        role_row = (await session.execute(select(RoleModel).where(RoleModel.name == req.role))).scalar_one_or_none()
        if not role_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        # insert if not exists
        from uuid import UUID
        try:
            uid = UUID(req.user_id)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user_id")
        exists = (
            await session.execute(
                select(UserRoleModel).where(
                    UserRoleModel.user_id == uid, UserRoleModel.role_id == role_row.id
                )
            )
        ).scalar_one_or_none()
        if not exists:
            session.add(UserRoleModel(id=uuid4(), user_id=uid, role_id=role_row.id))
            await session.flush()
        return JSONResponse(content={"ok": True})
