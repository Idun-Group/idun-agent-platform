"""Session history schemas — populated by /agent/sessions endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SessionSummary(BaseModel):
    """One row in /agent/sessions list view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(
        ...,
        description="Session id (thread_id for LangGraph, session_id for ADK).",
    )
    last_update_time: float | None = Field(default=None, description="Epoch seconds.")
    user_id: str | None = Field(default=None)
    thread_id: str | None = Field(
        default=None,
        description="AG-UI thread id; equals id for LangGraph, may differ for ADK.",
    )
    preview: str | None = Field(
        default=None,
        description="First user-authored text, ~120 chars max.",
    )


class SessionMessage(BaseModel):
    """One message in a restored session detail."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: float | None = Field(default=None)


class SessionDetail(BaseModel):
    """Full /agent/sessions/{id} response. Messages are text-only."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    last_update_time: float | None = Field(default=None)
    user_id: str | None = Field(default=None)
    thread_id: str | None = Field(default=None)
    messages: list[SessionMessage] = Field(default_factory=list)


class HistoryCapabilities(BaseModel):
    """Adapter-declared support flags for session history.

    Surfaces via :class:`AgentCapabilities.history` so consumers (eg. the
    standalone chat UI) can hide / disable history features when the
    active memory backend doesn't support them.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    can_list: bool = False
    can_get: bool = False
