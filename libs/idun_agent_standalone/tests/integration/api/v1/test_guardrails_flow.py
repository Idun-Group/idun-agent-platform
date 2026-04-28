"""Integration tests for ``/admin/api/v1/guardrails`` against the real reload pipeline.

Drives the FastAPI router through HTTPX with an injected stub reload
callable. Covers the collection contract (POST/PATCH/DELETE/list/get),
the slug normalization + uniqueness branches, and the round-3 reload
failure rollback.
"""

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
from idun_agent_standalone.api.v1.routers.guardrails import router as guardrails_router
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(guardrails_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


async def _seed_agent(async_session) -> None:
    """Seed a LangGraph agent row so engine config assembly succeeds."""
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


def _ban_list_body(name: str = "Profanity filter") -> dict:
    """Minimal POST body for a BAN_LIST guardrail.

    The outer envelope is camelCase (standalone schema) but the inner
    ``ManagerGuardrailConfig`` variants are plain snake_case BaseModels
    with no alias generator.
    """
    return {
        "name": name,
        "position": "input",
        "guardrail": {
            "config_id": "ban_list",
            "api_key": "test-key",
            "banned_words": ["foo", "bar"],
        },
    }


async def test_list_guardrails_empty(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/guardrails")
    assert response.status_code == 200
    assert response.json() == []


async def test_create_happy_path(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
    assert response.status_code == 201
    body = response.json()
    assert body["data"]["slug"] == "profanity-filter"
    assert body["data"]["position"] == "input"
    assert body["reload"]["status"] == "reloaded"
    stub_reload_callable.assert_called_once()


async def test_create_invalid_name_422(admin_app, async_session) -> None:
    """A name that normalizes to an empty slug is rejected."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        body = _ban_list_body(name="!!!@@@###")
        response = await client.post("/admin/api/v1/guardrails", json=body)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_failed"
    field_names = {fe["field"] for fe in error["fieldErrors"]}
    assert "name" in field_names


async def test_create_collision_appends_suffix(admin_app, async_session) -> None:
    """Re-using a name produces ``-2``, ``-3``... instead of erroring."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        second = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["data"]["slug"] == "profanity-filter"
    assert second.json()["data"]["slug"] == "profanity-filter-2"


async def test_get_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        row_id = created.json()["data"]["id"]
        response = await client.get(f"/admin/api/v1/guardrails/{row_id}")
    assert response.status_code == 200
    assert response.json()["id"] == row_id


async def test_get_404_unknown_id(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/admin/api/v1/guardrails/{uuid4()}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_patch_renames_keeps_slug(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Slug is sticky — renaming the row leaves the URL stable."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        row_id = created.json()["data"]["id"]
        original_slug = created.json()["data"]["slug"]
        stub_reload_callable.reset_mock()
        response = await client.patch(
            f"/admin/api/v1/guardrails/{row_id}",
            json={"name": "Renamed Filter"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["name"] == "Renamed Filter"
    assert body["data"]["slug"] == original_slug
    stub_reload_callable.assert_called_once()


async def test_patch_empty_body_noop(admin_app, async_session) -> None:
    """An empty PATCH does not commit a row write or call reload."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        row_id = created.json()["data"]["id"]
        response = await client.patch(f"/admin/api/v1/guardrails/{row_id}", json={})
    assert response.status_code == 200
    assert response.json()["reload"]["message"] == "No changes."


async def test_patch_404_unknown_id(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/admin/api/v1/guardrails/{uuid4()}", json={"name": "x"}
        )
    assert response.status_code == 404


async def test_delete_happy_path(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        row_id = created.json()["data"]["id"]
        response = await client.delete(f"/admin/api/v1/guardrails/{row_id}")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == row_id
    assert response.json()["reload"]["status"] in ("reloaded", "restart_required")


async def test_delete_404_unknown_id(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(f"/admin/api/v1/guardrails/{uuid4()}")
    assert response.status_code == 404


async def test_round3_failure_rolls_back(
    admin_app, async_session, stub_reload_callable
) -> None:
    """A failing reload aborts the create — no row in the DB after."""
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        post = await client.post("/admin/api/v1/guardrails", json=_ban_list_body())
        listed = await client.get("/admin/api/v1/guardrails")
    assert post.status_code == 500
    assert listed.json() == []
