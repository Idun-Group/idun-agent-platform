"""``/admin/api/v1/auth`` — strict-minimum password auth.

Four endpoints:

- ``GET /me`` — returns the current auth state. ``auth_mode=none``
  short-circuits to ``authenticated=true``; password mode reflects
  the cookie/session check.
- ``POST /login`` — verifies the password, sets the signed
  ``idun_session`` cookie. 503 in ``auth_mode=none`` (login is not
  meaningful when auth is disabled).
- ``POST /logout`` — drops the session row, clears the cookie.
- ``POST /change-password`` — gated by ``require_auth``; verifies the
  current password and writes the new hash. Outstanding sessions are
  not invalidated by design (strict-minimum scope).

Errors map to the standard standalone admin envelope (see
``api/v1/errors.py``). Login failure returns ``401`` with a generic
``invalid_credentials`` code so the response does not leak whether the
admin row exists.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneAuthChangePasswordBody,
    StandaloneAuthLoginBody,
    StandaloneAuthMe,
    StandaloneAuthMutationResult,
    StandaloneErrorCode,
)

from idun_agent_standalone.api.v1.deps import SessionDep, require_auth
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.security import SESSION_COOKIE_NAME
from idun_agent_standalone.core.settings import AuthMode
from idun_agent_standalone.services import auth as auth_service

router = APIRouter(prefix="/admin/api/v1/auth", tags=["admin"])

logger = get_logger(__name__)


def _is_secure_request(request: Request) -> bool:
    """Decide the cookie ``Secure`` flag from request scheme.

    Browsers refuse ``Secure`` cookies over plain HTTP; flipping this
    automatically lets ``localhost`` and TLS-terminating reverse
    proxies both work without an extra env knob.
    """
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    return forwarded_proto == "https"


def _set_session_cookie(
    response: Response, signed_value: str, *, request: Request, ttl_hours: int
) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=signed_value,
        max_age=ttl_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=_is_secure_request(request),
        path="/",
    )


def _clear_session_cookie(response: Response, *, request: Request) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_is_secure_request(request),
    )


@router.get("/me", response_model=StandaloneAuthMe)
async def me(request: Request, session: SessionDep) -> StandaloneAuthMe:
    """Return the current auth state."""
    settings = request.app.state.settings
    if settings.auth_mode == AuthMode.NONE:
        return StandaloneAuthMe(authenticated=True, auth_mode="none")
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    ok = await auth_service.validate_session(
        session, signed_cookie=cookie, settings=settings
    )
    return StandaloneAuthMe(authenticated=ok, auth_mode="password")


@router.post("/login", response_model=StandaloneAuthMutationResult)
async def login(
    body: StandaloneAuthLoginBody,
    request: Request,
    response: Response,
    session: SessionDep,
) -> StandaloneAuthMutationResult:
    """Verify the password and set the signed session cookie."""
    settings = request.app.state.settings
    if settings.auth_mode != AuthMode.PASSWORD:
        raise AdminAPIError(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.UNSUPPORTED_MODE,
                message=(
                    "Login is not available — IDUN_ADMIN_AUTH_MODE is not 'password'."
                ),
            ),
        )
    try:
        signed = await auth_service.login(
            session, password=body.password, settings=settings
        )
    except (
        auth_service.InvalidCredentialsError,
        auth_service.AdminNotSeededError,
    ) as exc:
        # Both surface as 401 with a generic message — the response must
        # not disclose whether the admin row exists.
        logger.info("admin.auth.login failed reason=%s", type(exc).__name__)
        raise AdminAPIError(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.AUTH_REQUIRED,
                message="Invalid credentials.",
            ),
        ) from exc

    _set_session_cookie(
        response,
        signed,
        request=request,
        ttl_hours=settings.session_ttl_hours,
    )
    return StandaloneAuthMutationResult(ok=True)


@router.post("/logout", response_model=StandaloneAuthMutationResult)
async def logout(
    request: Request, response: Response, session: SessionDep
) -> StandaloneAuthMutationResult:
    """Drop the session row and clear the cookie."""
    settings = request.app.state.settings
    if settings.auth_mode == AuthMode.PASSWORD:
        cookie = request.cookies.get(SESSION_COOKIE_NAME)
        await auth_service.logout(session, signed_cookie=cookie, settings=settings)
    # Clear the cookie regardless of mode — defensive against an old
    # cookie carrying over after the operator flips back to ``none``.
    _clear_session_cookie(response, request=request)
    return StandaloneAuthMutationResult(ok=True)


@router.post(
    "/change-password",
    response_model=StandaloneAuthMutationResult,
    dependencies=[Depends(require_auth)],
)
async def change_password(
    body: StandaloneAuthChangePasswordBody,
    session: SessionDep,
) -> StandaloneAuthMutationResult:
    """Replace the admin password hash."""
    if not body.new_password or len(body.new_password) < 8:
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="New password must be at least 8 characters.",
            ),
        )
    try:
        await auth_service.change_password(
            session,
            current_password=body.current_password,
            new_password=body.new_password,
        )
    except auth_service.InvalidCredentialsError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.AUTH_REQUIRED,
                message="Current password is incorrect.",
            ),
        ) from exc
    except auth_service.AdminNotSeededError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.UNSUPPORTED_MODE,
                message="Admin row missing — check startup seed.",
            ),
        ) from exc
    return StandaloneAuthMutationResult(ok=True)
