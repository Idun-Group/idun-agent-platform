from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import APIRouter, FastAPI, Request
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.engine.integrations import IntegrationConfig, IntegrationProvider

from idun_agent_engine.integrations import base as integrations_base
from idun_agent_engine.integrations.base import BaseIntegration, setup_integrations
from idun_agent_engine.server.lifespan import cleanup_agent


class _FakeIntegration(BaseIntegration):
    def __init__(self, instance_id: str) -> None:
        self.instance_id = instance_id
        self.shutdown_called = False

    async def setup(self, app: FastAPI, agent) -> None:
        app.state.fake_instance = self.instance_id
        router = APIRouter()

        @router.post("/webhook")
        async def webhook(request: Request) -> dict:
            return {"instance": request.app.state.fake_instance}

        app.include_router(router, prefix="/integrations/fake")

    async def shutdown(self) -> None:
        self.shutdown_called = True


def _any_config() -> IntegrationConfig:
    return IntegrationConfig(
        provider=IntegrationProvider.WHATSAPP,
        enabled=True,
        config={
            "access_token": "tok",
            "phone_number_id": "123",
            "verify_token": "verify",
        },
    )


@pytest.mark.asyncio
async def test_webhook_lifecycle_through_real_http(monkeypatch):
    instances = iter([_FakeIntegration("v1"), _FakeIntegration("v2")])
    monkeypatch.setattr(
        integrations_base, "_create_integration", lambda _cfg: next(instances)
    )

    app = FastAPI()
    agent = AsyncMock()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await setup_integrations(app, [_any_config()], agent)
        first = await client.post("/integrations/fake/webhook")
        assert first.status_code == 200
        assert first.json() == {"instance": "v1"}

        await cleanup_agent(app)
        gone = await client.post("/integrations/fake/webhook")
        assert gone.status_code == 404

        await setup_integrations(app, [_any_config()], agent)
        second = await client.post("/integrations/fake/webhook")
        assert second.status_code == 200
        assert second.json() == {"instance": "v2"}


@pytest.mark.asyncio
async def test_cleanup_preserves_non_integration_routes(monkeypatch):
    monkeypatch.setattr(
        integrations_base, "_create_integration", lambda _cfg: _FakeIntegration("v1")
    )

    app = FastAPI()

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await setup_integrations(app, [_any_config()], AsyncMock())
        webhook_before = await client.post("/integrations/fake/webhook")
        assert webhook_before.status_code == 200

        await cleanup_agent(app)
        health_after = await client.get("/health")
        webhook_after = await client.post("/integrations/fake/webhook")

    assert health_after.status_code == 200
    assert webhook_after.status_code == 404


class _FailingIntegration(BaseIntegration):
    async def setup(self, app: FastAPI, agent) -> None:
        raise RuntimeError("setup boom")

    async def shutdown(self) -> None:
        return None


@pytest.mark.asyncio
async def test_partial_setup_failure_still_cleans_up(monkeypatch):
    instances = iter([_FakeIntegration("ok"), _FailingIntegration()])
    monkeypatch.setattr(
        integrations_base, "_create_integration", lambda _cfg: next(instances)
    )

    app = FastAPI()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await setup_integrations(app, [_any_config(), _any_config()], AsyncMock())
        ok_response = await client.post("/integrations/fake/webhook")
        assert ok_response.status_code == 200

        await cleanup_agent(app)
        gone = await client.post("/integrations/fake/webhook")

    assert gone.status_code == 404
