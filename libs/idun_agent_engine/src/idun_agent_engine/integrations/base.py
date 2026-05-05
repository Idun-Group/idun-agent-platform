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
        """Register webhook routes and initialize provider client.

        All routes and ``app.state`` mutations must be registered
        synchronously inside this call. Anything registered after
        ``setup()`` returns will not be cleaned up by ``cleanup_agent``
        and will leak across reloads.
        """

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
        case IntegrationProvider.TEAMS:
            from .teams.integration import TeamsIntegration

            return TeamsIntegration(config)
        case _:
            raise ValueError(f"Unsupported integration provider: {config.provider}")


async def setup_integrations(
    app: FastAPI,
    configs: list[IntegrationConfig],
    agent: BaseAgent,
) -> list[BaseIntegration]:
    """Create and wire all enabled integrations into the FastAPI app.

    Routes added by each integration's ``setup()`` are tracked on
    ``app.state.integration_routes`` so ``cleanup_agent`` can remove
    them on reload. Each integration must register its routes and
    ``app.state`` mutations synchronously inside ``setup()``; lazy
    registration after ``setup()`` returns is not tracked and will
    leak across reloads.
    """
    before = list(app.router.routes)
    logger.info(
        "setup_integrations: starting configs=%d existing_routes=%d",
        len(configs),
        len(before),
    )
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
    tracked = [r for r in app.router.routes if r not in before]
    app.state.integration_routes = tracked
    logger.info(
        "setup_integrations: complete integrations=%d routes_tracked=%d paths=%s",
        len(integrations),
        len(tracked),
        [getattr(r, "path", "<unknown>") for r in tracked],
    )
    return integrations
