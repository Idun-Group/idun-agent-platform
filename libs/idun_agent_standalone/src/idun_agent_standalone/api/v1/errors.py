"""Admin API error envelope and exception translation.

The standalone admin surface (``/admin/api/v1/*``) returns errors in a
structured envelope so the UI can branch on stable codes. This module
wires four things.

``AdminAPIError`` is what routers raise when they need to return a
typed admin error. The handler renders the body as
``{"error": StandaloneAdminError}``.

``admin_request_validation_handler`` translates Pydantic body
validation failures into the same envelope so the UI sees one error
shape from body validation and from cross resource assembly checks
alike. Non admin paths fall through to a default 422 shape so engine
routes keep their own contract.

``admin_unhandled_exception_handler`` catches anything else that
bubbles out of an admin route (DB errors, corrupted row decode, etc.)
and renders it as ``internal_error`` so admin clients always see the
same envelope. Non admin paths fall through to a generic 500.

``field_errors_from_validation_error`` is the helper routers use when
they catch a Pydantic ``ValidationError`` raised during cross resource
config assembly, so they can attach structured ``field_errors`` to a
422 response.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi import status as http_status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)
from pydantic import ValidationError

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)

_ADMIN_PREFIX = "/admin/api/v1"


class AdminAPIError(Exception):
    """Raised by admin routers to return a structured error envelope."""

    def __init__(self, status_code: int, error: StandaloneAdminError) -> None:
        self.status_code = status_code
        self.error = error
        super().__init__(error.message)


def field_errors_from_validation_error(
    exc: ValidationError,
) -> list[StandaloneFieldError]:
    """Translate a Pydantic ``ValidationError`` to admin field errors.

    Joins each error location into a dotted path so the UI can target
    nested fields like ``agent.config.name``.
    """
    return [
        StandaloneFieldError(
            field=".".join(str(part) for part in err["loc"]),
            message=err["msg"],
            code=err.get("type"),
        )
        for err in exc.errors()
    ]


def _render(error: StandaloneAdminError, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error.model_dump(by_alias=True, exclude_none=True)},
    )


async def admin_api_error_handler(request: Request, exc: AdminAPIError) -> JSONResponse:
    """Render ``AdminAPIError`` as the standalone admin envelope."""
    logger.info(
        "admin.error path=%s status=%s code=%s",
        request.url.path,
        exc.status_code,
        exc.error.code.value,
    )
    return _render(exc.error, exc.status_code)


async def admin_request_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Render Pydantic body validation failures in the admin envelope.

    Only applies to admin paths. Non admin paths fall through to a
    minimal default 422 shape so the engine's own routes keep their
    contract.
    """
    if not request.url.path.startswith(_ADMIN_PREFIX):
        return JSONResponse(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )

    field_errors = [
        StandaloneFieldError(
            field=".".join(str(part) for part in err["loc"]),
            message=err["msg"],
            code=err.get("type"),
        )
        for err in exc.errors()
    ]
    error = StandaloneAdminError(
        code=StandaloneErrorCode.VALIDATION_FAILED,
        message="Request body failed validation.",
        field_errors=field_errors,
    )
    logger.info(
        "admin.validation path=%s field_count=%s",
        request.url.path,
        len(field_errors),
    )
    return _render(error, http_status.HTTP_422_UNPROCESSABLE_ENTITY)


async def admin_unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch anything that bubbles out of an admin route.

    Wraps the exception in the ``internal_error`` envelope so admin
    clients keep one error shape. Logs the traceback so operators have
    something to debug from. Non admin paths fall through to a generic
    500 detail.
    """
    logger.exception(
        "admin.unhandled path=%s error=%s", request.url.path, exc.__class__.__name__
    )
    if not request.url.path.startswith(_ADMIN_PREFIX):
        return JSONResponse(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal Server Error"},
        )
    error = StandaloneAdminError(
        code=StandaloneErrorCode.INTERNAL_ERROR,
        message="An unexpected error occurred. See server logs for details.",
    )
    return _render(error, http_status.HTTP_500_INTERNAL_SERVER_ERROR)


def register_admin_exception_handlers(app: FastAPI) -> None:
    """Wire the admin envelope handlers on the given FastAPI app."""
    # FastAPI's add_exception_handler stub types its handler argument as
    # Callable[[Request, Exception], ...]. Our handlers are deliberately
    # narrow to AdminAPIError / RequestValidationError because FastAPI
    # dispatches by exception class at runtime, so the wider stub type
    # is not enforceable on the call site. Suppress the arg-type warning
    # for the narrow handlers and let the runtime guarantee stand.
    app.add_exception_handler(
        AdminAPIError,
        admin_api_error_handler,  # type: ignore[arg-type]
    )
    app.add_exception_handler(
        RequestValidationError,
        admin_request_validation_handler,  # type: ignore[arg-type]
    )
    app.add_exception_handler(Exception, admin_unhandled_exception_handler)
