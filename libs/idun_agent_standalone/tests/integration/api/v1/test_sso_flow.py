"""Integration tests for ``/admin/api/v1/sso`` (singleton).

PATCH upserts the singleton row, DELETE removes it. First write
requires the ``sso`` field; later PATCHes can be partial. Reload
pipeline runs on every mutation.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.sso import router as sso_router
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(sso_router)
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


def _google_body() -> dict:
    return {
        "sso": {
            "enabled": True,
            "issuer": "https://accounts.google.com",
            "clientId": "123456.apps.googleusercontent.com",
            "audience": None,
            "allowedDomains": ["company.com"],
            "allowedEmails": None,
        }
    }


async def test_get_404_on_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/sso")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_first_write_missing_field_422(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/admin/api/v1/sso", json={})
    assert response.status_code == 422


async def test_patch_first_write_happy(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/admin/api/v1/sso", json=_google_body())
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["sso"]["issuer"] == "https://accounts.google.com"
    assert body["data"]["sso"]["clientId"] == "123456.apps.googleusercontent.com"
    assert body["reload"]["status"] in ("reloaded", "restart_required")
    stub_reload_callable.assert_called_once()


async def test_get_after_write_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/sso", json=_google_body())
        response = await client.get("/admin/api/v1/sso")
    assert response.status_code == 200
    body = response.json()
    assert body["sso"]["issuer"] == "https://accounts.google.com"
    assert body["sso"]["allowedDomains"] == ["company.com"]


async def test_patch_partial_update_replaces_sso(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/sso", json=_google_body())
        stub_reload_callable.reset_mock()
        response = await client.patch(
            "/admin/api/v1/sso",
            json={
                "sso": {
                    "enabled": False,
                    "issuer": "https://login.microsoftonline.com/tenant",
                    "clientId": "ms-client-id",
                }
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["sso"]["enabled"] is False
    assert body["data"]["sso"]["issuer"] == "https://login.microsoftonline.com/tenant"
    stub_reload_callable.assert_called_once()


async def test_patch_empty_body_after_initial_is_noop(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/sso", json=_google_body())
        stub_reload_callable.reset_mock()
        response = await client.patch("/admin/api/v1/sso", json={})
    assert response.status_code == 200
    assert response.json()["reload"]["message"] == "No changes."
    stub_reload_callable.assert_not_called()


async def test_delete_happy_path(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/sso", json=_google_body())
        delete_response = await client.delete("/admin/api/v1/sso")
        get_response = await client.get("/admin/api/v1/sso")
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True
    assert get_response.status_code == 404


async def test_delete_404_on_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/admin/api/v1/sso")
    assert response.status_code == 404


async def test_missing_required_field_422(admin_app, async_session) -> None:
    """Pydantic rejects an SSO body that omits required fields."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/sso",
            json={"sso": {"enabled": True, "clientId": "x"}},
        )
    assert response.status_code == 422


async def test_round_3_failure_rolls_back_db(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        patch = await client.patch("/admin/api/v1/sso", json=_google_body())
        get = await client.get("/admin/api/v1/sso")
    assert patch.status_code == 500
    assert patch.json()["error"]["code"] == "reload_failed"
    assert patch.json()["error"]["details"] == {"recovered": True}
    assert get.status_code == 404
