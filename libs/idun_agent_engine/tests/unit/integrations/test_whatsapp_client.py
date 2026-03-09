"""Tests for WhatsApp Cloud API client and webhook payload parsing."""

from unittest.mock import AsyncMock, patch

import pytest
from idun_agent_schema.engine.integrations.whatsapp import WhatsAppIntegrationConfig
from idun_agent_schema.engine.integrations.whatsapp_webhook import (
    WhatsAppWebhookPayload,
)
from pydantic import ValidationError

from idun_agent_engine.integrations.whatsapp.client import WhatsAppClient


@pytest.mark.unit
class TestWhatsAppClient:
    """Test WhatsApp Cloud API client."""

    def _make_client(self) -> WhatsAppClient:
        config = WhatsAppIntegrationConfig(
            access_token="test-token",
            phone_number_id="123456",
            verify_token="my-verify-secret",
        )
        return WhatsAppClient(config)

    @pytest.mark.asyncio
    async def test_send_text_message_correct_request(self):
        """send_text_message sends correct payload to Graph API."""
        import httpx

        client = self._make_client()
        mock_response = httpx.Response(
            200,
            json={"messages": [{"id": "wamid.123"}]},
            request=httpx.Request(
                "POST", "https://graph.facebook.com/v21.0/123456/messages"
            ),
        )

        with patch.object(
            client._http, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            result = await client.send_text_message(to="33612345678", text="Hello!")

            mock_post.assert_called_once_with(
                "/123456/messages",
                json={
                    "messaging_product": "whatsapp",
                    "to": "33612345678",
                    "type": "text",
                    "text": {"body": "Hello!"},
                },
            )
            assert result == {"messages": [{"id": "wamid.123"}]}

    @pytest.mark.asyncio
    async def test_send_text_message_raises_on_error(self):
        """send_text_message raises when the API returns an error."""
        import httpx

        client = self._make_client()
        mock_response = httpx.Response(
            401,
            json={"error": {"message": "Invalid token"}},
            request=httpx.Request(
                "POST", "https://graph.facebook.com/v21.0/123456/messages"
            ),
        )

        with patch.object(
            client._http, "post", new_callable=AsyncMock, return_value=mock_response
        ):
            with pytest.raises(httpx.HTTPStatusError):
                await client.send_text_message(to="123", text="fail")


@pytest.mark.unit
class TestWhatsAppWebhookPayloadParsing:
    """Test Pydantic parsing of WhatsApp Cloud API webhook payloads.

    ref: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages
    """

    VALID_TEXT_MESSAGE_PAYLOAD = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "102290129340398",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550783881",
                                "phone_number_id": "106540352242922",
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Sheena Nelson"},
                                    "wa_id": "16505551234",
                                }
                            ],
                            "messages": [
                                {
                                    "from": "16505551234",
                                    "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgA=",
                                    "timestamp": "1749416383",
                                    "type": "text",
                                    "text": {"body": "Does it come in another color?"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    STATUS_UPDATE_PAYLOAD = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "102290129340398",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550783881",
                                "phone_number_id": "106540352242922",
                            },
                            "statuses": [
                                {
                                    "id": "wamid.123",
                                    "status": "delivered",
                                    "timestamp": "1749416383",
                                    "recipient_id": "16505551234",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    def test_parses_valid_text_message(self):
        payload = WhatsAppWebhookPayload.model_validate(self.VALID_TEXT_MESSAGE_PAYLOAD)
        assert payload.object == "whatsapp_business_account"
        assert len(payload.entry) == 1
        assert len(payload.entry[0].changes) == 1

        value = payload.entry[0].changes[0].value
        assert value.messages is not None
        assert len(value.messages) == 1

        message = value.messages[0]
        assert message.sender == "16505551234"
        assert message.type == "text"
        assert message.text is not None
        assert message.text.body == "Does it come in another color?"

    def test_parses_status_update_no_messages(self):
        payload = WhatsAppWebhookPayload.model_validate(self.STATUS_UPDATE_PAYLOAD)
        value = payload.entry[0].changes[0].value
        assert value.messages is None

    def test_parses_empty_entry_list(self):
        payload = WhatsAppWebhookPayload.model_validate(
            {"object": "whatsapp_business_account", "entry": []}
        )
        assert len(payload.entry) == 0

    def test_rejects_missing_object_field(self):
        with pytest.raises(ValidationError):
            WhatsAppWebhookPayload.model_validate({"entry": []})

    def test_rejects_missing_entry_field(self):
        with pytest.raises(ValidationError):
            WhatsAppWebhookPayload.model_validate(
                {"object": "whatsapp_business_account"}
            )
