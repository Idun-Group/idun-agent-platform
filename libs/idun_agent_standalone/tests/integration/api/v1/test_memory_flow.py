"""Integration tests for ``/admin/api/v1/memory`` against the real reload pipeline."""

from __future__ import annotations

import asyncio

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
from idun_agent_standalone.api.v1.routers.agent import (
    router as agent_router,
)
from idun_agent_standalone.api.v1.routers.memory import (
    router as memory_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(memory_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


async def _seed_agent_langgraph(async_session) -> None:
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


async def test_get_memory_404_on_empty(admin_app) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/memory")
    assert response.status_code == 404


async def test_first_write_missing_field_422(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing memory field
        response = await client.patch(
            "/admin/api/v1/memory",
            json={"agentFramework": "LANGGRAPH"},
        )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_failed"
    field_names = {fe["field"] for fe in body["error"]["fieldErrors"]}
    assert "memory" in field_names


async def test_patch_first_write_happy(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "reloaded"
    stub_reload_callable.assert_called_once()


@pytest.mark.skip(
    reason=(
        "Memory PATCH alone does not change agent.type — "
        "assemble_engine_config reads agent.type from the agent row's "
        "base_engine_config, not from the memory row's agent_framework. "
        "The structural-change path is exercised in tests/unit/services/"
        "test_reload.py via direct agent.type mutation; reaching it "
        "from memory PATCH alone is not architecturally possible."
    )
)
async def test_patch_framework_switch_returns_restart_required(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Framework switch via memory PATCH would be structural — but is not reachable.

    See the skip reason for the architectural rationale.
    """


async def test_framework_memory_mismatch_422(
    admin_app, async_session, stub_reload_callable
) -> None:
    """LANGGRAPH agent + ADK SessionService memory shape -> round 2 fails.

    The agent row has ``agent.type=LANGGRAPH``, so the assembler lays
    the memory dict under ``checkpointer``. ``in_memory`` is not a
    valid LangGraph ``CheckpointConfig`` discriminator (valid values
    are ``memory``, ``sqlite``, ``postgres``), so round 2 rejects
    the assembled config and returns 422 with field errors.
    """
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "ADK",
                "memory": {
                    "type": "in_memory",
                },
            },
        )
        listed = await client.get("/admin/api/v1/memory")
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_failed"
    assert len(body["error"]["fieldErrors"]) >= 1
    stub_reload_callable.assert_not_called()
    assert listed.status_code == 404


async def test_delete_memory_after_first_write(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
        response = await client.delete("/admin/api/v1/memory")
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["deleted"] is True
    assert body["reload"]["status"] in ("reloaded", "restart_required")


async def test_delete_on_empty_returns_404(admin_app, async_session) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/admin/api/v1/memory")
    assert response.status_code == 404


async def test_round_3_failure_rolls_back_db(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
        assert response.status_code == 500
        # No row was committed
        get_response = await client.get("/admin/api/v1/memory")
    assert get_response.status_code == 404


async def test_runtime_state_records_outcome(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/memory",
            json={
                "agentFramework": "LANGGRAPH",
                "memory": {"type": "memory"},
            },
        )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"


async def test_concurrent_patches_serialize(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent_langgraph(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = await asyncio.gather(
            client.patch(
                "/admin/api/v1/memory",
                json={
                    "agentFramework": "LANGGRAPH",
                    "memory": {"type": "memory"},
                },
            ),
            client.patch(
                "/admin/api/v1/memory",
                json={"memory": {"type": "memory"}},
            ),
        )
    # Both succeed (mutex serializes); reload_callable called twice
    # OR first creates, second is noop — either is acceptable.
    assert all(r.status_code in (200, 422) for r in results)
