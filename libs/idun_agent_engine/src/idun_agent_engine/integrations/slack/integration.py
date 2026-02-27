"""Slack integration — wires the webhook client into app state."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.slack import SlackIntegrationConfig

from ..base import BaseIntegration
from .client import SlackClient
from .handler import router

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ...agent.base import BaseAgent

logger = logging.getLogger(__name__)


class SlackIntegration(BaseIntegration):
    """Concrete integration for Slack Events API."""

    def __init__(self, config: IntegrationConfig) -> None:
        if not isinstance(config.config, SlackIntegrationConfig):
            raise TypeError(
                f"Expected SlackIntegrationConfig, got {type(config.config).__name__}"
            )
        self._config = config
        self._slack_config = config.config
        self._client: SlackClient | None = None

    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        """Store Slack client and signing secret on app state, include router."""
        logger.info("Setting up Slack integration")
        self._client = SlackClient(self._slack_config)
        app.state.slack_client = self._client
        app.state.slack_signing_secret = self._slack_config.signing_secret
        app.include_router(router, prefix="/integrations/slack")
        logger.info("Slack integration configured")

    async def shutdown(self) -> None:
        """Close the Slack HTTP client."""
        if self._client:
            await self._client.close()
            logger.info("Slack integration shut down")
