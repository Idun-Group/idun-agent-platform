"""Discord integration — wires the webhook client into app state."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.discord import DiscordIntegrationConfig

from ..base import BaseIntegration
from .client import DiscordClient

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ...agent.base import BaseAgent

logger = logging.getLogger(__name__)


class DiscordIntegration(BaseIntegration):
    """Concrete integration for Discord Interactions Endpoint."""

    def __init__(self, config: IntegrationConfig) -> None:
        if not isinstance(config.config, DiscordIntegrationConfig):
            raise TypeError(
                f"Expected DiscordIntegrationConfig, got {type(config.config).__name__}"
            )
        self._config = config
        self._discord_config = config.config
        self._client: DiscordClient | None = None

    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        """Store Discord client and public key on app state."""
        logger.info("Setting up Discord integration")
        self._client = DiscordClient(self._discord_config)
        app.state.discord_client = self._client
        app.state.discord_public_key = self._discord_config.public_key
        from .handler import router

        app.include_router(router, prefix="/integrations/discord", tags=["Discord"])
        logger.info("Discord integration configured")

    async def shutdown(self) -> None:
        """Close the Discord HTTP client."""
        if self._client:
            await self._client.close()
            logger.info("Discord integration shut down")
