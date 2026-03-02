"""Pydantic models for Discord Interactions Endpoint webhook payloads.

ref: https://discord.com/developers/docs/interactions/receiving-and-responding
"""

from __future__ import annotations

from enum import IntEnum

from pydantic import BaseModel


class InteractionType(IntEnum):
    PING = 1
    APPLICATION_COMMAND = 2


class InteractionResponseType(IntEnum):
    PONG = 1
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5


class DiscordUser(BaseModel):
    id: str
    username: str = ""


class DiscordMember(BaseModel):
    user: DiscordUser | None = None


class DiscordCommandOption(BaseModel):
    name: str
    type: int
    value: str | int | float | bool | None = None


class DiscordCommandData(BaseModel):
    name: str
    options: list[DiscordCommandOption] = []


class DiscordInteraction(BaseModel):
    id: str
    type: int
    token: str = ""
    data: DiscordCommandData | None = None
    member: DiscordMember | None = None
    user: DiscordUser | None = None

    def resolve_user_id(self) -> str:
        """Return the user ID from member or top-level user, falling back to interaction id."""
        if self.member and self.member.user:
            return self.member.user.id
        if self.user:
            return self.user.id
        return self.id

    def extract_command_text(self) -> str:
        """Extract text from STRING-typed command options, or the command name."""
        if not self.data:
            return ""
        string_values = [
            str(opt.value) for opt in self.data.options if opt.type == 3 and opt.value is not None
        ]
        return " ".join(string_values) if string_values else self.data.name
