"""Tests for Slack integration setup and teardown."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.slack import SlackIntegrationConfig
from idun_agent_schema.engine.integrations.whatsapp import WhatsAppIntegrationConfig

from idun_agent_engine.integrations.slack.integration import SlackIntegration


def _make_config() -> IntegrationConfig:
    return IntegrationConfig(
        provider="SLACK",
        enabled=True,
        config=SlackIntegrationConfig(
            bot_token="xoxb-test-token",
            signing_secret="test-secret",
        ),
    )


@pytest.mark.unit
class TestSlackIntegration:
    @pytest.mark.asyncio
    async def test_setup_stores_client_and_secret_on_app_state(self):
        integration = SlackIntegration(_make_config())
        app = FastAPI()
        agent = AsyncMock()

        await integration.setup(app, agent)

        assert hasattr(app.state, "slack_client")
        assert hasattr(app.state, "slack_signing_secret")
        assert app.state.slack_signing_secret == "test-secret"

    @pytest.mark.asyncio
    async def test_setup_registers_slack_webhook_route(self):
        integration = SlackIntegration(_make_config())
        app = FastAPI()
        agent = AsyncMock()

        await integration.setup(app, agent)

        route_paths = [r.path for r in app.routes]
        assert "/integrations/slack/webhook" in route_paths

    @pytest.mark.asyncio
    async def test_shutdown_closes_client(self):
        integration = SlackIntegration(_make_config())
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
            SlackIntegration(wrong_config)
