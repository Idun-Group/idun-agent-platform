"""Base integration classes and factory function."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from idun_agent_schema.engine.integrations import IntegrationConfig, IntegrationProvider

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ..agent.base import BaseAgent

logger = logging.getLogger(__name__)


class BaseIntegration(ABC):
    """Abstract base class for messaging provider integrations."""

    @abstractmethod
    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        """Register webhook routes and initialize provider client."""

    @abstractmethod
    async def shutdown(self) -> None:
        """Release resources held by the integration."""


def _create_integration(config: IntegrationConfig) -> BaseIntegration:
    """Instantiate a concrete integration from its config."""
    match config.provider:
        case IntegrationProvider.WHATSAPP:
            from .whatsapp.integration import WhatsAppIntegration

            return WhatsAppIntegration(config)
        case IntegrationProvider.DISCORD:
            from .discord.integration import DiscordIntegration

            return DiscordIntegration(config)
        case IntegrationProvider.SLACK:
            from .slack.integration import SlackIntegration

            return SlackIntegration(config)
        case IntegrationProvider.GOOGLE_CHAT:
            from .google_chat.integration import GoogleChatIntegration

            return GoogleChatIntegration(config)
        case _:
            raise ValueError(f"Unsupported integration provider: {config.provider}")


async def setup_integrations(
    app: FastAPI,
    configs: list[IntegrationConfig],
    agent: BaseAgent,
) -> list[BaseIntegration]:
    """Create and wire all enabled integrations into the FastAPI app."""
    integrations: list[BaseIntegration] = []
    for config in configs:
        if not config.enabled:
            logger.debug(f"Integration {config.provider} is disabled, skipping")
            continue
        try:
            integration = _create_integration(config)
            await integration.setup(app, agent)
            integrations.append(integration)
            logger.info(f"Integration {config.provider} set up successfully")
        except Exception:
            logger.exception(f"Failed to set up integration {config.provider}")
    return integrations
