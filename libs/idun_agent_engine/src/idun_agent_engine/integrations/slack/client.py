"""Slack Web API client for sending messages."""

from __future__ import annotations

import logging

from idun_agent_schema.engine.integrations.slack import SlackIntegrationConfig
from slack_sdk.errors import SlackApiError
from slack_sdk.web.async_client import AsyncWebClient

logger = logging.getLogger(__name__)


class SlackClient:
    """Async client for the Slack Web API."""

    def __init__(self, config: SlackIntegrationConfig) -> None:
        self._config = config
        self._web_client = AsyncWebClient(token=config.bot_token)
        logger.info("Slack client initialized")

    async def send_message(self, *, channel: str, text: str):
        """Send a message to a Slack channel via chat.postMessage."""
        try:
            response = await self._web_client.chat_postMessage(
                channel=channel, text=text
            )
            logger.info("Message sent to channel %s", channel)
            return response
        except SlackApiError as exc:
            logger.error(
                "Slack API error sending to %s: %s",
                channel,
                exc.response.data if hasattr(exc.response, "data") else exc,
            )
            raise

    async def close(self) -> None:
        """Close the underlying HTTP session."""
        if self._web_client.session and not self._web_client.session.closed:
            await self._web_client.session.close()
        logger.debug("Slack client closed")
