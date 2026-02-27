"""Tests for Discord REST API client."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from idun_agent_schema.engine.integrations.discord import DiscordIntegrationConfig

from idun_agent_engine.integrations.discord.client import DiscordClient


@pytest.mark.unit
class TestDiscordClient:
    def _make_client(self) -> DiscordClient:
        config = DiscordIntegrationConfig(
            bot_token="test-bot-token",
            application_id="123456789",
            public_key="ab" * 32,
        )
        return DiscordClient(config)

    @pytest.mark.asyncio
    async def test_edit_interaction_response_correct_request(self):
        client = self._make_client()
        mock_response = httpx.Response(
            200,
            json={"id": "msg_1"},
            request=httpx.Request(
                "PATCH",
                "https://discord.com/api/v10/webhooks/123456789/test-token/messages/@original",
            ),
        )

        with patch.object(
            client._http, "patch", new_callable=AsyncMock, return_value=mock_response
        ) as mock_patch:
            result = await client.edit_interaction_response("test-token", "Hello!")

            mock_patch.assert_called_once_with(
                "/webhooks/123456789/test-token/messages/@original",
                json={"content": "Hello!"},
            )
            assert result == {"id": "msg_1"}

    @pytest.mark.asyncio
    async def test_edit_interaction_response_raises_on_error(self):
        client = self._make_client()
        mock_response = httpx.Response(
            404,
            json={"message": "Unknown Webhook"},
            request=httpx.Request(
                "PATCH",
                "https://discord.com/api/v10/webhooks/123456789/bad-token/messages/@original",
            ),
        )

        with patch.object(
            client._http, "patch", new_callable=AsyncMock, return_value=mock_response
        ):
            with pytest.raises(httpx.HTTPStatusError):
                await client.edit_interaction_response("bad-token", "fail")
