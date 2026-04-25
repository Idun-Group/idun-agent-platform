"""Request-scoped helpers (request ID + proxy headers + session refresh)."""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from idun_agent_standalone.auth.session import sign_session
from idun_agent_standalone.settings import AuthMode

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_ctx.set(rid)
        try:
            response: Response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-Id"] = rid
        return response


def install_request_id_middleware(app: FastAPI) -> None:
    app.add_middleware(RequestIdMiddleware)


def install_proxy_headers_middleware(app: FastAPI) -> None:
    """Honour ``X-Forwarded-Proto`` / ``X-Forwarded-For`` from upstream proxies.

    Cloud Run, Fly, Railway, and most ingress controllers terminate TLS
    upstream and forward the request to the app over plain HTTP. Without
    this middleware ``request.url.scheme`` is always ``http`` and the
    session cookie ships without ``Secure`` even when the public URL is
    HTTPS.

    ``trusted_hosts="*"`` matches uvicorn's ``--proxy-headers
    --forwarded-allow-ips=*`` default — the standalone is single-process
    behind a managed proxy, so trusting all forwarders is correct here.
    Operators on dedicated hardware can pin this further if needed.
    """
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")


class SessionRefreshMiddleware(BaseHTTPMiddleware):
    """Re-sign the session cookie when ``require_auth`` flagged it.

    The auth dependency runs inside the route stack (it can't mutate the
    response), so it sets ``request.state.refresh_session = True`` and
    stashes the payload on ``request.state.session_payload``. This
    middleware reads those flags after the route returns and writes a
    fresh cookie with an updated ``iat`` and full TTL.
    """

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if not getattr(request.state, "refresh_session", False):
            return response
        settings = getattr(request.app.state, "settings", None)
        if settings is None or settings.auth_mode != AuthMode.PASSWORD:
            return response
        payload = getattr(request.state, "session_payload", None)
        if not isinstance(payload, dict):
            return response
        token = sign_session(
            secret=settings.session_secret or "", payload=payload
        )
        # ``Secure`` follows the public scheme; ProxyHeadersMiddleware
        # already rewrote ``request.url.scheme`` upstream.
        response.set_cookie(
            "sid",
            token,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
            max_age=settings.session_ttl_seconds,
            path="/",
        )
        return response


def install_session_refresh_middleware(app: FastAPI) -> None:
    app.add_middleware(SessionRefreshMiddleware)
