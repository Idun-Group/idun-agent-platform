"""Discord REST API client for interaction responses."""

from __future__ import annotations

import logging

import httpx
from idun_agent_schema.engine.integrations.discord import DiscordIntegrationConfig

logger = logging.getLogger(__name__)

DISCORD_API_BASE = "https://discord.com/api/v10"


class DiscordClient:
    """Async client for the Discord REST API (interaction callbacks)."""

    def __init__(self, config: DiscordIntegrationConfig) -> None:
        self._config = config
        self._http = httpx.AsyncClient(
            base_url=DISCORD_API_BASE,
            headers={"Authorization": f"Bot {config.bot_token}"},
            timeout=30.0,
        )
        logger.info(
            f"Discord client initialized for application_id={config.application_id}"
        )

    async def edit_interaction_response(
        self,
        interaction_token: str,
        content: str,
    ) -> dict:
        """Edit the original deferred interaction response.

        Uses ``PATCH /webhooks/{application_id}/{interaction_token}/messages/@original``
        to update the deferred "thinking" response with the agent's reply.
        """
        url = (
            f"/webhooks/{self._config.application_id}"
            f"/{interaction_token}/messages/@original"
        )
        payload = {"content": content}
        logger.debug(f"Editing interaction response for token {interaction_token[:8]}…")
        try:
            response = await self._http.patch(url, json=payload)
            response.raise_for_status()
            logger.info("Interaction response updated successfully")
            return response.json()
        except httpx.HTTPStatusError:
            logger.exception("Discord API error editing interaction response")
            raise

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()
        logger.debug("Discord client closed")
