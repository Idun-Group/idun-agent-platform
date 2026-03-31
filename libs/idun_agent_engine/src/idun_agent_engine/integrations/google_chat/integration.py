"""Google Chat integration — wires the webhook client into app state."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.google_chat import (
    GoogleChatIntegrationConfig,
)

from ..base import BaseIntegration
from .client import GoogleChatClient
from .handler import router

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ...agent.base import BaseAgent

logger = logging.getLogger(__name__)


class GoogleChatIntegration(BaseIntegration):
    """Concrete integration for Google Chat."""

    def __init__(self, config: IntegrationConfig) -> None:
        if not isinstance(config.config, GoogleChatIntegrationConfig):
            raise TypeError(
                f"Expected GoogleChatIntegrationConfig, "
                f"got {type(config.config).__name__}"
            )
        self._config = config
        self._google_chat_config = config.config
        self._client: GoogleChatClient | None = None

    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        """Store Google Chat client and project number on app state."""
        logger.info("Setting up Google Chat integration")
        self._client = GoogleChatClient(
            self._google_chat_config.service_account_credentials_json,
        )
        app.state.google_chat_client = self._client
        app.state.google_chat_project_number = (
            self._google_chat_config.project_number
        )
        app.state.google_chat_local_mode = self._google_chat_config.local_mode
        app.include_router(router, prefix="/integrations/google-chat")
        logger.info("Google Chat integration configured")

    async def shutdown(self) -> None:
        """Close the Google Chat HTTP client."""
        if self._client:
            await self._client.close()
            logger.info("Google Chat integration shut down")
