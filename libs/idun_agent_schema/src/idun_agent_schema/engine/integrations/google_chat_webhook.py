"""Pydantic models for Google Chat interaction event payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class GoogleChatUser(BaseModel):
    """A Google Chat user."""

    name: str = ""
    display_name: str = Field(default="", alias="displayName")
    type: str = ""
    email: str = ""


class GoogleChatSpace(BaseModel):
    """A Google Chat space (room, DM, or group)."""

    name: str = ""
    type: str = ""
    display_name: str = Field(default="", alias="displayName")


class GoogleChatThread(BaseModel):
    """A Google Chat thread."""

    name: str = ""


class GoogleChatMessage(BaseModel):
    """A message within a Google Chat interaction event."""

    name: str = ""
    text: str = ""
    argument_text: str = Field(default="", alias="argumentText")
    sender: GoogleChatUser | None = None
    space: GoogleChatSpace | None = None
    thread: GoogleChatThread | None = None


class GoogleChatMessagePayload(BaseModel):
    """The messagePayload wrapper inside the chat object."""

    message: GoogleChatMessage | None = None
    space: GoogleChatSpace | None = None


class GoogleChatAddedToSpacePayload(BaseModel):
    """The addedToSpacePayload wrapper inside the chat object."""

    space: GoogleChatSpace | None = None


class GoogleChatInnerPayload(BaseModel):
    """The inner 'chat' object in the Google Chat event."""

    user: GoogleChatUser | None = None
    event_time: str = Field(default="", alias="eventTime")
    message_payload: GoogleChatMessagePayload | None = Field(
        default=None, alias="messagePayload"
    )
    added_to_space_payload: GoogleChatAddedToSpacePayload | None = Field(
        default=None, alias="addedToSpacePayload"
    )
    removed_from_space_payload: dict | None = Field(
        default=None, alias="removedFromSpacePayload"
    )


class GoogleChatEventPayload(BaseModel):
    """Top-level Google Chat interaction event payload.

    Google Chat wraps the event data inside a ``chat`` object.
    The event type is inferred from which payload field is present
    (``messagePayload``, ``addedToSpacePayload``, etc.).
    """

    chat: GoogleChatInnerPayload | None = None
    type: str = ""
    message: GoogleChatMessage | None = None
    user: GoogleChatUser | None = None
    space: GoogleChatSpace | None = None

    @model_validator(mode="after")
    def _unwrap_chat(self) -> GoogleChatEventPayload:
        """Unwrap the nested chat object into top-level fields."""
        if not self.chat:
            return self
        inner = self.chat
        if inner.message_payload:
            self.type = "MESSAGE"
            mp = inner.message_payload
            self.message = mp.message
            if not self.space and mp.space:
                self.space = mp.space
        elif inner.added_to_space_payload:
            self.type = "ADDED_TO_SPACE"
            if not self.space and inner.added_to_space_payload.space:
                self.space = inner.added_to_space_payload.space
        elif inner.removed_from_space_payload is not None:
            self.type = "REMOVED_FROM_SPACE"
        if not self.user and inner.user:
            self.user = inner.user
        return self
