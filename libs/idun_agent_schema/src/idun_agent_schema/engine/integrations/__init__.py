"""Integration schemas for external messaging providers."""

from .base import IntegrationConfig, IntegrationProvider  # noqa: F401
from .discord import DiscordIntegrationConfig  # noqa: F401
from .discord_webhook import (  # noqa: F401
    DiscordCommandData,
    DiscordCommandOption,
    DiscordInteraction,
    DiscordMember,
    DiscordUser,
    InteractionResponseType,
    InteractionType,
)
from .whatsapp import WhatsAppIntegrationConfig  # noqa: F401
from .whatsapp_webhook import (  # noqa: F401
    WhatsAppChange,
    WhatsAppEntry,
    WhatsAppMessage,
    WhatsAppTextBody,
    WhatsAppValue,
    WhatsAppWebhookPayload,
)
