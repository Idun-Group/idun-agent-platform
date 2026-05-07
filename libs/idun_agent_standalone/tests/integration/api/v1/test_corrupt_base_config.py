from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(observability_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


async def _seed_corrupt_agent(async_session) -> None:
    async_session.add(
        StandaloneAgentRow(
            name="bad",
            base_engine_config={
                "agent": {"type": "LANGGRAPH", "config": {"name": "x"}},
            },
        )
    )
    await async_session.commit()


async def test_corrupt_agent_config_rejects_admin_patch_with_422(
    admin_app, async_session, stub_reload_callable
):
    await _seed_corrupt_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/observability",
            json={
                "observability": {
                    "provider": "LANGFUSE",
                    "enabled": True,
                    "config": {
                        "publicKey": "pub",
                        "secretKey": "sec",
                        "host": "https://example.com",
                    },
                }
            },
        )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_failed"
    field_paths = {fe["field"] for fe in body["error"]["fieldErrors"]}
    assert any("agent" in p for p in field_paths)
    stub_reload_callable.assert_not_called()


async def test_corrupt_agent_config_does_not_persist_observability_row(
    admin_app, async_session, stub_reload_callable
):
    await _seed_corrupt_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/observability",
            json={
                "observability": {
                    "provider": "LANGFUSE",
                    "enabled": True,
                    "config": {
                        "publicKey": "pub",
                        "secretKey": "sec",
                        "host": "https://example.com",
                    },
                }
            },
        )
        listed = await client.get("/admin/api/v1/observability")
    assert listed.status_code == 404
