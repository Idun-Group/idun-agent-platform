"""Pydantic models for Slack Events API webhook payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SlackMessageEvent(BaseModel):
    """A single message event from the Slack Events API."""

    type: str
    text: str = ""
    user: str = ""
    channel: str = ""
    ts: str = ""
    bot_id: str | None = None
    subtype: str | None = None
    app_id: str | None = None


class SlackEventPayload(BaseModel):
    """Top-level Slack Events API payload.

    Handles both ``url_verification`` challenges and ``event_callback``
    dispatches.
    """

    token: str = ""
    type: str
    challenge: str | None = None
    event: SlackMessageEvent | None = None
    team_id: str = Field(default="", alias="team_id")
    api_app_id: str = ""
    event_id: str = ""
    event_time: int = 0
