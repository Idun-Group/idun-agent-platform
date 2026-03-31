"""Tests for Google Chat integration setup and teardown."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.google_chat import (
    GoogleChatIntegrationConfig,
)
from idun_agent_schema.engine.integrations.whatsapp import WhatsAppIntegrationConfig

from idun_agent_engine.integrations.google_chat.integration import (
    GoogleChatIntegration,
)

FAKE_CREDENTIALS = '{"type": "service_account", "project_id": "test"}'


def _make_config() -> IntegrationConfig:
    return IntegrationConfig(
        provider="GOOGLE_CHAT",
        enabled=True,
        config=GoogleChatIntegrationConfig(
            service_account_credentials_json=FAKE_CREDENTIALS,
            project_number="123456",
        ),
    )


@pytest.mark.unit
class TestGoogleChatIntegration:
    @pytest.mark.asyncio
    @patch(
        "idun_agent_engine.integrations.google_chat.integration.GoogleChatClient"
    )
    async def test_setup_stores_client_and_project_number_on_app_state(
        self, mock_client_cls
    ):
        mock_client_cls.return_value = AsyncMock()
        integration = GoogleChatIntegration(_make_config())
        app = FastAPI()
        agent = AsyncMock()

        await integration.setup(app, agent)

        assert hasattr(app.state, "google_chat_client")
        assert hasattr(app.state, "google_chat_project_number")
        assert app.state.google_chat_project_number == "123456"

    @pytest.mark.asyncio
    @patch(
        "idun_agent_engine.integrations.google_chat.integration.GoogleChatClient"
    )
    async def test_setup_registers_google_chat_webhook_route(
        self, mock_client_cls
    ):
        mock_client_cls.return_value = AsyncMock()
        integration = GoogleChatIntegration(_make_config())
        app = FastAPI()
        agent = AsyncMock()

        await integration.setup(app, agent)

        route_paths = [r.path for r in app.routes]
        assert "/integrations/google-chat/webhook" in route_paths

    @pytest.mark.asyncio
    @patch(
        "idun_agent_engine.integrations.google_chat.integration.GoogleChatClient"
    )
    async def test_shutdown_closes_client(self, mock_client_cls):
        mock_client_cls.return_value = AsyncMock()
        integration = GoogleChatIntegration(_make_config())
        app = FastAPI()
        agent = AsyncMock()

        await integration.setup(app, agent)
        integration._client = AsyncMock()

        await integration.shutdown()

        integration._client.close.assert_called_once()

    def test_rejects_wrong_config_type(self):
        wrong_config = IntegrationConfig(
            provider="WHATSAPP",
            enabled=True,
            config=WhatsAppIntegrationConfig(
                access_token="EAA...",
                phone_number_id="123",
                verify_token="secret",
            ),
        )
        with pytest.raises(TypeError):
            GoogleChatIntegration(wrong_config)
