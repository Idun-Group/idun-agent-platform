"""Global exception handlers — every response carries an X-Request-Id."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from idun_agent_standalone.middleware import request_id_ctx

logger = logging.getLogger(__name__)


class EngineInitError(Exception):
    """Raised when ``engine.initialize`` fails during a reload."""


def _resp(code: int, error: str, **extra) -> JSONResponse:
    body = {"error": error, "request_id": request_id_ctx.get()}
    body.update(extra)
    return JSONResponse(status_code=code, content=body)


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _rv(_: Request, exc: RequestValidationError):
        return _resp(400, "validation_failed", details=exc.errors())

    @app.exception_handler(ValidationError)
    async def _v(_: Request, exc: ValidationError):
        return _resp(400, "validation_failed", details=exc.errors())

    @app.exception_handler(SQLAlchemyError)
    async def _sa(_: Request, exc: SQLAlchemyError):
        logger.exception("database error")
        return _resp(500, "db_error")

    @app.exception_handler(EngineInitError)
    async def _engine(_: Request, exc: EngineInitError):
        logger.exception("engine init failed")
        return _resp(500, "engine_init_failed", message=str(exc))

    @app.exception_handler(Exception)
    async def _catch(_: Request, exc: Exception):
        logger.exception("unhandled exception")
        return _resp(500, "internal")
