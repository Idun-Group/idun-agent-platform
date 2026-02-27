"""WhatsApp integration — wires the webhook client into app state."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from idun_agent_schema.engine.integrations import IntegrationConfig

from ..base import BaseIntegration
from .client import WhatsAppClient

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ...agent.base import BaseAgent

logger = logging.getLogger(__name__)


class WhatsAppIntegration(BaseIntegration):
    """Concrete integration for WhatsApp Business Cloud API."""

    def __init__(self, config: IntegrationConfig) -> None:
        self._config = config
        self._client: WhatsAppClient | None = None

    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        """Store WhatsApp client and verify token on app state."""
        logger.info("Setting up WhatsApp integration")
        self._client = WhatsAppClient(self._config.config)
        app.state.whatsapp_client = self._client
        app.state.whatsapp_verify_token = self._config.config.verify_token
        logger.info("WhatsApp integration configured")

    async def shutdown(self) -> None:
        """Close the WhatsApp HTTP client."""
        if self._client:
            await self._client.close()
            logger.info("WhatsApp integration shut down")
