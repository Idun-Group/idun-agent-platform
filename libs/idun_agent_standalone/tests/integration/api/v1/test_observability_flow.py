"""Integration tests for ``/admin/api/v1/observability`` (singleton).

The shape mirrors the memory router: there is no id in the URL, the
row is a singleton, ``PATCH`` upserts and ``DELETE`` removes. First
write requires the ``observability`` field; subsequent PATCHes can be
partial.
"""

from __future__ import annotations

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
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(observability_router)
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


def _langfuse_body() -> dict:
    return {
        "observability": {
            "provider": "LANGFUSE",
            "enabled": True,
            "config": {
                "host": "https://cloud.langfuse.com",
                "publicKey": "pk-test",
                "secretKey": "sk-test",
            },
        }
    }


async def test_get_404_on_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/observability")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_first_write_missing_field_422(admin_app, async_session) -> None:
    """First write must include ``observability``; otherwise 422."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/admin/api/v1/observability", json={})
    assert response.status_code == 422


async def test_patch_first_write_happy(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/observability", json=_langfuse_body()
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["observability"]["provider"] == "LANGFUSE"
    assert body["reload"]["status"] in ("reloaded", "restart_required")
    stub_reload_callable.assert_called_once()


async def test_patch_empty_body_after_first_write_is_noop(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/observability", json=_langfuse_body())
        stub_reload_callable.reset_mock()
        response = await client.patch("/admin/api/v1/observability", json={})
    assert response.status_code == 200
    assert response.json()["reload"]["message"] == "No changes."
    stub_reload_callable.assert_not_called()


async def test_get_after_first_write_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/observability", json=_langfuse_body())
        response = await client.get("/admin/api/v1/observability")
    assert response.status_code == 200
    assert response.json()["observability"]["provider"] == "LANGFUSE"


async def test_delete_after_first_write(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/observability", json=_langfuse_body())
        response = await client.delete("/admin/api/v1/observability")
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["deleted"] is True
    assert body["reload"]["status"] in ("reloaded", "restart_required")


async def test_delete_404_on_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/admin/api/v1/observability")
    assert response.status_code == 404


async def test_round3_failure_rolls_back(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        patch = await client.patch("/admin/api/v1/observability", json=_langfuse_body())
        get = await client.get("/admin/api/v1/observability")
    assert patch.status_code == 500
    assert patch.json()["error"]["code"] == "reload_failed"
    assert patch.json()["error"]["details"] == {"recovered": True}
    assert get.status_code == 404
