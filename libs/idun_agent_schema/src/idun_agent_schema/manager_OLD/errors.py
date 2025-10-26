"""RFC 9457 Problem Details model (shared)."""

from typing import Any

from pydantic import BaseModel, Field


class ProblemDetail(BaseModel):
    """RFC 9457 Problem Details model."""

    type: str = Field(default="about:blank")
    title: str = Field()
    status: int = Field()
    detail: str | None = Field(default=None)
    instance: str | None = Field(default=None)

    # Extension members
    timestamp: str | None = Field(default=None)
    request_id: str | None = Field(default=None)
    errors: dict[str, Any] | None = Field(default=None)

    model_config = {"extra": "allow"}
