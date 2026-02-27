"""Tests for WhatsApp webhook integration endpoints."""

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


def _make_app_with_whatsapp() -> TestClient:
    """Create a test app with a WhatsApp integration configured."""
    config_dict = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
            },
        },
        "integrations": [
            {
                "provider": "WHATSAPP",
                "enabled": True,
                "config": {
                    "access_token": "test-token",
                    "phone_number_id": "123456",
                    "verify_token": "my-verify-secret",
                },
            }
        ],
    }
    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)
    return TestClient(app)


@pytest.mark.unit
class TestWhatsAppWebhookVerification:
    """Test GET /integrations/whatsapp/webhook — Meta verification."""

    def test_correct_token_returns_challenge(self):
        with _make_app_with_whatsapp() as client:
            resp = client.get(
                "/integrations/whatsapp/webhook",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "my-verify-secret",
                    "hub.challenge": "challenge_abc",
                },
            )
            assert resp.status_code == 200
            assert resp.text == "challenge_abc"

    def test_wrong_token_returns_403(self):
        with _make_app_with_whatsapp() as client:
            resp = client.get(
                "/integrations/whatsapp/webhook",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "wrong-token",
                    "hub.challenge": "challenge_abc",
                },
            )
            assert resp.status_code == 403


@pytest.mark.unit
class TestWhatsAppWebhookReceive:
    """Test POST /integrations/whatsapp/webhook — incoming messages."""

    VALID_MESSAGE_PAYLOAD = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "BIZ_ID",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "33600000000",
                                "phone_number_id": "123456",
                            },
                            "messages": [
                                {
                                    "from": "33612345678",
                                    "id": "msg_id_1",
                                    "timestamp": "1234567890",
                                    "text": {"body": "Hello agent!"},
                                    "type": "text",
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
                "id": "BIZ_ID",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "33600000000",
                                "phone_number_id": "123456",
                            },
                            "statuses": [
                                {
                                    "id": "msg_id_1",
                                    "status": "delivered",
                                    "timestamp": "1234567890",
                                    "recipient_id": "33612345678",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    def test_valid_message_invokes_agent_and_replies(self):
        from unittest.mock import AsyncMock, patch

        with _make_app_with_whatsapp() as client:
            with patch(
                "idun_agent_engine.integrations.whatsapp.client.WhatsAppClient.send_text_message",
                new_callable=AsyncMock,
            ) as mock_send:
                resp = client.post(
                    "/integrations/whatsapp/webhook",
                    json=self.VALID_MESSAGE_PAYLOAD,
                )
                assert resp.status_code == 200
                mock_send.assert_called_once()
                call_kwargs = mock_send.call_args
                assert call_kwargs[1]["to"] == "33612345678"

    def test_status_update_does_not_invoke_agent(self):
        from unittest.mock import AsyncMock, patch

        with _make_app_with_whatsapp() as client:
            with patch(
                "idun_agent_engine.integrations.whatsapp.client.WhatsAppClient.send_text_message",
                new_callable=AsyncMock,
            ) as mock_send:
                resp = client.post(
                    "/integrations/whatsapp/webhook",
                    json=self.STATUS_UPDATE_PAYLOAD,
                )
                assert resp.status_code == 200
                mock_send.assert_not_called()

    def test_empty_entry_returns_200(self):
        with _make_app_with_whatsapp() as client:
            resp = client.post(
                "/integrations/whatsapp/webhook",
                json={"object": "whatsapp_business_account", "entry": []},
            )
            assert resp.status_code == 200
