"""RFC 9457 Problem Details for HTTP APIs implementation."""

from datetime import UTC
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field


class ProblemDetail(BaseModel):
    """RFC 9457 Problem Details model."""

    type: str = Field(
        default="about:blank",
        description="A URI reference that identifies the problem type",
    )
    title: str = Field(description="A short, human-readable summary of the problem")
    status: int = Field(description="The HTTP status code")
    detail: str | None = Field(
        default=None, description="A human-readable explanation of the problem"
    )
    instance: str | None = Field(
        default=None,
        description="A URI reference that identifies the specific occurrence",
    )

    # Extension members
    timestamp: str | None = Field(default=None)
    request_id: str | None = Field(default=None)
    errors: dict[str, Any] | None = Field(default=None)

    model_config = {"extra": "allow"}


class ProblemException(HTTPException):
    """Exception that carries Problem Details information."""

    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str | None = None,
        type_uri: str = "about:blank",
        instance: str | None = None,
        errors: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)

        self.problem_detail = ProblemDetail(
            type=type_uri,
            title=title,
            status=status_code,
            detail=detail,
            instance=instance,
            errors=errors,
            **kwargs,
        )


# Predefined problem types
class AuthenticationError(ProblemException):
    """Authentication-related errors."""

    def __init__(
        self,
        detail: str = "Authentication required",
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title="Authentication Required",
            detail=detail,
            type_uri="https://api.idun.com/problems/authentication-required",
            instance=instance,
            **kwargs,
        )


class AuthorizationError(ProblemException):
    """Authorization-related errors."""

    def __init__(
        self,
        detail: str = "Insufficient permissions",
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            title="Forbidden",
            detail=detail,
            type_uri="https://api.idun.com/problems/forbidden",
            instance=instance,
            **kwargs,
        )


class ValidationError(ProblemException):
    """Validation-related errors."""

    def __init__(
        self,
        detail: str = "Validation failed",
        errors: dict[str, Any] | None = None,
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            title="Validation Error",
            detail=detail,
            type_uri="https://api.idun.com/problems/validation-error",
            errors=errors,
            instance=instance,
            **kwargs,
        )


class NotFoundError(ProblemException):
    """Resource not found errors."""

    def __init__(
        self,
        resource_type: str = "Resource",
        resource_id: str | None = None,
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        detail = f"{resource_type} not found"
        if resource_id:
            detail += f" with ID: {resource_id}"

        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Not Found",
            detail=detail,
            type_uri="https://api.idun.com/problems/not-found",
            instance=instance,
            **kwargs,
        )


class ConflictError(ProblemException):
    """Resource conflict errors."""

    def __init__(
        self,
        detail: str = "Resource conflict",
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title="Conflict",
            detail=detail,
            type_uri="https://api.idun.com/problems/conflict",
            instance=instance,
            **kwargs,
        )


class RateLimitError(ProblemException):
    """Rate limit exceeded errors."""

    def __init__(
        self,
        detail: str = "Rate limit exceeded",
        retry_after: int | None = None,
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        headers = {}
        if retry_after:
            headers["Retry-After"] = str(retry_after)

        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            title="Too Many Requests",
            detail=detail,
            type_uri="https://api.idun.com/problems/rate-limit-exceeded",
            instance=instance,
            headers=headers,
            **kwargs,
        )


class InternalServerError(ProblemException):
    """Internal server errors."""

    def __init__(
        self,
        detail: str = "An internal server error occurred",
        instance: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            title="Internal Server Error",
            detail=detail,
            type_uri="https://api.idun.com/problems/internal-server-error",
            instance=instance,
            **kwargs,
        )


def create_problem_response(
    problem: ProblemDetail | ProblemException,
    request: Request | None = None,
) -> ORJSONResponse:
    """Create a Problem Details response."""
    from datetime import datetime

    if isinstance(problem, ProblemException):
        problem_detail = problem.problem_detail
        status_code = problem.status_code
        headers = problem.headers
    else:
        problem_detail = problem
        status_code = problem.status
        headers = None

    # Add request context
    if request:
        problem_detail.request_id = getattr(request.state, "request_id", str(uuid4()))
        if not problem_detail.instance:
            problem_detail.instance = str(request.url)

    # Add timestamp
    if not problem_detail.timestamp:
        problem_detail.timestamp = datetime.now(UTC).isoformat()

    return ORJSONResponse(
        status_code=status_code,
        content=problem_detail.model_dump(exclude_none=True),
        headers={
            "Content-Type": "application/problem+json",
            **(headers or {}),
        },
    )


async def problem_exception_handler(
    request: Request, exc: ProblemException
) -> ORJSONResponse:
    """FastAPI exception handler for ProblemException."""
    return create_problem_response(exc, request)


async def http_exception_handler(
    request: Request, exc: HTTPException
) -> ORJSONResponse:
    """Convert HTTPException to Problem Details format."""
    problem = ProblemDetail(
        type="about:blank",
        title=_get_status_phrase(exc.status_code),
        status=exc.status_code,
        detail=str(exc.detail) if exc.detail else None,
        instance=str(request.url),
    )
    return create_problem_response(problem, request)


async def validation_exception_handler(
    request: Request, exc: Exception
) -> ORJSONResponse:
    """Convert validation exceptions to Problem Details format."""
    from fastapi.exceptions import RequestValidationError

    if isinstance(exc, RequestValidationError):
        errors = {}
        for error in exc.errors():
            field = ".".join(str(x) for x in error["loc"][1:])  # Skip 'body'
            errors[field] = error["msg"]

        problem = ValidationError(
            detail="Request validation failed",
            errors=errors,
            instance=str(request.url),
        )
        return create_problem_response(problem, request)

    # Fallback for other validation errors
    problem = ValidationError(
        detail=str(exc),
        instance=str(request.url),
    )
    return create_problem_response(problem, request)


def _get_status_phrase(status_code: int) -> str:
    """Get HTTP status phrase for status code."""
    status_phrases = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
        504: "Gateway Timeout",
    }
    return status_phrases.get(status_code, f"HTTP {status_code}")
