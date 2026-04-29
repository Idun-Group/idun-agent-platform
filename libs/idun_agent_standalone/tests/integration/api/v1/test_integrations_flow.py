"""Integration tests for ``/admin/api/v1/integrations`` against the real reload pipeline."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.integrations import (
    router as integrations_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(integrations_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


async def _seed_agent(async_session) -> None:
    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()


def _whatsapp_body(name: str = "Customer Support") -> dict:
    """Minimal POST body for a WhatsApp integration."""
    return {
        "name": name,
        "integration": {
            "provider": "WHATSAPP",
            "enabled": True,
            "config": {
                "accessToken": "test-token",
                "phoneNumberId": "1234567890",
                "verifyToken": "verify-secret",
            },
        },
    }


async def test_list_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/integrations")
    assert response.status_code == 200
    assert response.json() == []


async def test_create_happy_path(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/integrations", json=_whatsapp_body()
        )
    assert response.status_code == 201
    body = response.json()
    assert body["data"]["slug"] == "customer-support"
    assert body["data"]["integration"]["provider"] == "WHATSAPP"
    assert body["reload"]["status"] in ("reloaded", "restart_required")
    stub_reload_callable.assert_called_once()


async def test_create_invalid_name_422(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/integrations", json=_whatsapp_body(name="!!!")
        )
    assert response.status_code == 422


async def test_create_collision_appends_suffix(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        second = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["data"]["slug"] == "customer-support"
    assert second.json()["data"]["slug"] == "customer-support-2"


async def test_get_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        row_id = created.json()["data"]["id"]
        response = await client.get(f"/admin/api/v1/integrations/{row_id}")
    assert response.status_code == 200
    assert response.json()["id"] == row_id


async def test_get_404(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/admin/api/v1/integrations/{uuid4()}")
    assert response.status_code == 404


async def test_patch_toggles_enabled(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        row_id = created.json()["data"]["id"]
        original_slug = created.json()["data"]["slug"]
        stub_reload_callable.reset_mock()
        response = await client.patch(
            f"/admin/api/v1/integrations/{row_id}",
            json={"enabled": False},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["enabled"] is False
    assert body["data"]["slug"] == original_slug
    stub_reload_callable.assert_called_once()


async def test_patch_empty_body_noop(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        row_id = created.json()["data"]["id"]
        response = await client.patch(f"/admin/api/v1/integrations/{row_id}", json={})
    assert response.status_code == 200
    assert response.json()["reload"]["message"] == "No changes."


async def test_patch_404(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/admin/api/v1/integrations/{uuid4()}", json={"enabled": False}
        )
    assert response.status_code == 404


async def test_delete_happy_path(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        row_id = created.json()["data"]["id"]
        response = await client.delete(f"/admin/api/v1/integrations/{row_id}")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == row_id


async def test_delete_404(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(f"/admin/api/v1/integrations/{uuid4()}")
    assert response.status_code == 404


async def test_round3_failure_rolls_back(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        post = await client.post("/admin/api/v1/integrations", json=_whatsapp_body())
        listed = await client.get("/admin/api/v1/integrations")
    assert post.status_code == 500
    assert listed.json() == []
