"""Google Chat API client for sending messages."""

from __future__ import annotations

import json
import logging

import httpx
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

CHAT_API_BASE = "https://chat.googleapis.com/v1"
SCOPES = ["https://www.googleapis.com/auth/chat.bot"]


class GoogleChatClient:
    """Async client for the Google Chat API."""

    def __init__(self, credentials_json: str) -> None:
        creds_info = json.loads(credentials_json)
        self._credentials = service_account.Credentials.from_service_account_info(
            creds_info,
            scopes=SCOPES,
        )
        self._http_client = httpx.AsyncClient()
        logger.info("Google Chat client initialized")

    async def _get_access_token(self) -> str:
        """Obtain a fresh access token from the service account credentials."""
        from google.auth.transport import requests as google_requests

        self._credentials.refresh(google_requests.Request())
        return self._credentials.token

    async def send_message(self, *, space_name: str, text: str) -> dict:
        """Send a text message to a Google Chat space."""
        token = await self._get_access_token()
        url = f"{CHAT_API_BASE}/{space_name}/messages"
        response = await self._http_client.post(
            url,
            headers={"Authorization": f"Bearer {token}"},
            json={"text": text},
        )
        response.raise_for_status()
        data = response.json()
        logger.info("Message sent to %s", space_name)
        return data

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http_client.aclose()
        logger.debug("Google Chat client closed")
