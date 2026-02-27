"""Tests for integration setup factory."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from idun_agent_schema.engine.integrations import IntegrationConfig, IntegrationProvider

from idun_agent_engine.integrations.base import setup_integrations


def _make_whatsapp_config(enabled: bool = True) -> IntegrationConfig:
    return IntegrationConfig(
        provider=IntegrationProvider.WHATSAPP,
        enabled=enabled,
        config={
            "access_token": "test-token",
            "phone_number_id": "123456",
            "verify_token": "my-verify-secret",
        },
    )


@pytest.mark.unit
class TestSetupIntegrations:
    """Test setup_integrations factory function."""

    @pytest.mark.asyncio
    async def test_enabled_integration_stores_client_on_app_state(self):
        app = FastAPI()
        agent = AsyncMock()
        config = _make_whatsapp_config(enabled=True)

        integrations = await setup_integrations(app, [config], agent)

        assert len(integrations) == 1
        assert hasattr(app.state, "whatsapp_client")
        assert app.state.whatsapp_verify_token == "my-verify-secret"

    @pytest.mark.asyncio
    async def test_disabled_integration_is_skipped(self):
        app = FastAPI()
        agent = AsyncMock()
        config = _make_whatsapp_config(enabled=False)

        integrations = await setup_integrations(app, [config], agent)

        assert len(integrations) == 0

    @pytest.mark.asyncio
    async def test_empty_config_list(self):
        app = FastAPI()
        agent = AsyncMock()

        integrations = await setup_integrations(app, [], agent)

        assert len(integrations) == 0
