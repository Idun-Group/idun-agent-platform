"""WhatsApp Cloud API client for sending messages."""

from __future__ import annotations

import logging

import httpx
from idun_agent_schema.engine.integrations.whatsapp import WhatsAppIntegrationConfig

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com"


class WhatsAppClient:
    """Async client for the WhatsApp Business Cloud API."""

    def __init__(self, config: WhatsAppIntegrationConfig) -> None:
        self._config = config
        self._http = httpx.AsyncClient(
            base_url=f"{GRAPH_API_BASE}/{config.api_version}",
            headers={"Authorization": f"Bearer {config.access_token}"},
            timeout=30.0,
        )
        logger.info(
            f"WhatsApp client initialized for phone_number_id={config.phone_number_id}"
        )

    async def send_text_message(self, *, to: str, text: str) -> dict:
        """Send a text message to a WhatsApp user."""
        url = f"/{self._config.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        logger.debug(f"Sending message to {to}")
        try:
            response = await self._http.post(url, json=payload)
            response.raise_for_status()
            logger.info(f"Message sent to {to} successfully")
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "WhatsApp API error sending message to %s: %s %s",
                to,
                exc.response.status_code,
                exc.response.text,
            )
            raise

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()
        logger.debug("WhatsApp client closed")
