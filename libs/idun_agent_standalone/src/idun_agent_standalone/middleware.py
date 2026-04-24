"""Request-scoped helpers (request ID context var + middleware)."""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

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
