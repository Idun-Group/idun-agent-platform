"""Tests for Google Chat API client."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from idun_agent_engine.integrations.google_chat.client import GoogleChatClient

FAKE_CREDENTIALS = json.dumps(
    {
        "type": "service_account",
        "project_id": "test-project",
        "private_key_id": "key-id",
        "private_key": "dummy-private-key",
        "client_email": "test@test-project.iam.gserviceaccount.com",
        "client_id": "123",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
)


@pytest.mark.unit
class TestGoogleChatClient:
    @patch(
        "idun_agent_engine.integrations.google_chat.client.service_account"
        ".Credentials.from_service_account_info"
    )
    def _make_client(self, mock_from_info) -> GoogleChatClient:
        mock_creds = MagicMock()
        mock_from_info.return_value = mock_creds
        return GoogleChatClient(FAKE_CREDENTIALS)

    @pytest.mark.asyncio
    async def test_send_message_calls_chat_api(self):
        client = self._make_client()
        client._credentials = MagicMock()
        client._credentials.token = "fake-access-token"

        mock_response = MagicMock()
        mock_response.json.return_value = {"name": "spaces/AAAA/messages/msg1"}
        mock_response.raise_for_status = MagicMock()

        client._http_client = AsyncMock()
        client._http_client.post = AsyncMock(return_value=mock_response)

        result = await client.send_message(
            space_name="spaces/AAAA", text="Hello!"
        )

        client._http_client.post.assert_called_once()
        call_args = client._http_client.post.call_args
        assert "spaces/AAAA/messages" in call_args[0][0]
        assert call_args[1]["json"] == {"text": "Hello!"}
        assert result == {"name": "spaces/AAAA/messages/msg1"}

    @pytest.mark.asyncio
    async def test_send_message_raises_on_http_error(self):
        client = self._make_client()
        client._credentials = MagicMock()
        client._credentials.token = "fake-access-token"

        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("HTTP 403")

        client._http_client = AsyncMock()
        client._http_client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(Exception, match="HTTP 403"):
            await client.send_message(
                space_name="spaces/AAAA", text="fail"
            )

    @pytest.mark.asyncio
    async def test_close_closes_http_client(self):
        client = self._make_client()
        client._http_client = AsyncMock()

        await client.close()

        client._http_client.aclose.assert_called_once()
