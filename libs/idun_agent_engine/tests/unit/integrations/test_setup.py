"""Tests for integration setup factory."""

from unittest.mock import AsyncMock

import pytest
from fastapi import APIRouter, FastAPI
from idun_agent_schema.engine.integrations import IntegrationConfig, IntegrationProvider

from idun_agent_engine.integrations import base as integrations_base
from idun_agent_engine.integrations.base import BaseIntegration, setup_integrations


class _RouteRegisteringFake(BaseIntegration):
    async def setup(self, app, agent) -> None:
        router = APIRouter()

        @router.post("/webhook")
        async def webhook() -> dict:
            return {"ok": True}

        app.include_router(router, prefix="/integrations/fake")

    async def shutdown(self) -> None:
        return None


class _FailingFake(BaseIntegration):
    async def setup(self, app, agent) -> None:
        raise RuntimeError("setup boom")

    async def shutdown(self) -> None:
        return None


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

    @pytest.mark.asyncio
    async def test_records_added_routes_on_app_state(self, monkeypatch):
        monkeypatch.setattr(
            integrations_base,
            "_create_integration",
            lambda _cfg: _RouteRegisteringFake(),
        )
        app = FastAPI()
        agent = AsyncMock()
        before = len(app.router.routes)

        await setup_integrations(app, [_make_whatsapp_config()], agent)

        tracked = app.state.integration_routes
        assert isinstance(tracked, list)
        assert len(tracked) == 1
        assert all(r in app.router.routes for r in tracked)
        assert len(app.router.routes) == before + 1

    @pytest.mark.asyncio
    async def test_disabled_integration_does_not_add_tracked_routes(self):
        app = FastAPI()
        agent = AsyncMock()

        await setup_integrations(app, [_make_whatsapp_config(enabled=False)], agent)

        assert app.state.integration_routes == []

    @pytest.mark.asyncio
    async def test_empty_config_list_initializes_empty_tracking(self):
        app = FastAPI()
        agent = AsyncMock()

        await setup_integrations(app, [], agent)

        assert app.state.integration_routes == []

    @pytest.mark.asyncio
    async def test_partial_failure_still_tracks_succeeded_routes(self, monkeypatch):
        instances = iter([_RouteRegisteringFake(), _FailingFake()])
        monkeypatch.setattr(
            integrations_base,
            "_create_integration",
            lambda _cfg: next(instances),
        )
        app = FastAPI()
        agent = AsyncMock()

        integrations = await setup_integrations(
            app, [_make_whatsapp_config(), _make_whatsapp_config()], agent
        )

        assert len(integrations) == 1
        assert len(app.state.integration_routes) == 1
