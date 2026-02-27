"""Tests for Slack Web API client."""

from unittest.mock import AsyncMock, patch

import pytest
from idun_agent_schema.engine.integrations.slack import SlackIntegrationConfig
from slack_sdk.errors import SlackApiError
from slack_sdk.web.async_slack_response import AsyncSlackResponse

from idun_agent_engine.integrations.slack.client import SlackClient


@pytest.mark.unit
class TestSlackClient:
    def _make_client(self) -> SlackClient:
        config = SlackIntegrationConfig(
            bot_token="xoxb-test-token",
            signing_secret="test-secret",
        )
        return SlackClient(config)

    @pytest.mark.asyncio
    async def test_send_message_calls_chat_post_message(self):
        client = self._make_client()
        mock_response = AsyncMock()
        mock_response.data = {"ok": True, "ts": "1234567890.123456"}

        with patch.object(
            client._web_client,
            "chat_postMessage",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_post:
            result = await client.send_message(channel="C67890", text="Hello!")

            mock_post.assert_called_once_with(channel="C67890", text="Hello!")
            assert result == mock_response

    @pytest.mark.asyncio
    async def test_send_message_raises_on_api_error(self):
        client = self._make_client()
        error_response = AsyncSlackResponse(
            client=client._web_client,
            http_verb="POST",
            api_url="https://slack.com/api/chat.postMessage",
            req_args={},
            data={"ok": False, "error": "channel_not_found"},
            headers={},
            status_code=200,
        )

        with patch.object(
            client._web_client,
            "chat_postMessage",
            new_callable=AsyncMock,
            side_effect=SlackApiError("channel_not_found", error_response),
        ):
            with pytest.raises(SlackApiError):
                await client.send_message(channel="C_INVALID", text="fail")
