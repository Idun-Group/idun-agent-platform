"""Integration tests for the three MVP connection-check endpoints.

The probes themselves are unit-tested; here we verify the HTTP plumbing:
- 404 when the row is absent (memory + observability singletons; mcp by id)
- happy path returns the wire shape (camelCase keys; ``ok``, ``details``,
  ``error``)
- the probe is invoked with the row's stored config

The actual network calls (Langfuse HEAD, MCP stdio, etc.) are stubbed at
the service layer so these tests stay deterministic and offline.
"""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.standalone import StandaloneConnectionCheck
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.mcp_servers import router as mcp_router
from idun_agent_standalone.api.v1.routers.memory import router as memory_router
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(memory_router)
    app.include_router(observability_router)
    app.include_router(mcp_router)
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


# ---- memory ---------------------------------------------------------------


async def test_memory_check_404_when_no_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/memory/check-connection")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_memory_check_invokes_probe_with_stored_config(
    admin_app, async_session, monkeypatch
) -> None:
    """Stored framework + memory config flow through to the probe call."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First write the memory row
        await client.patch(
            "/admin/api/v1/memory",
            json={"agentFramework": "LANGGRAPH", "memory": {"type": "memory"}},
        )

        captured: dict = {}

        async def fake_check(framework, memory_config):
            captured["framework"] = framework
            captured["config"] = memory_config
            return StandaloneConnectionCheck(
                ok=True, details={"backend": "in-memory"}, error=None
            )

        monkeypatch.setattr(
            "idun_agent_standalone.api.v1.routers.memory.check_memory",
            fake_check,
        )

        response = await client.post("/admin/api/v1/memory/check-connection")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "details": {"backend": "in-memory"},
        "error": None,
    }
    assert captured["framework"] == "LANGGRAPH"
    assert captured["config"] == {"type": "memory"}


async def test_memory_check_surfaces_probe_failure(
    admin_app, async_session, monkeypatch
) -> None:
    """Probe failure is returned as ``ok=False`` in the body, HTTP stays 200."""
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/memory",
            json={"agentFramework": "LANGGRAPH", "memory": {"type": "memory"}},
        )
        monkeypatch.setattr(
            "idun_agent_standalone.api.v1.routers.memory.check_memory",
            AsyncMock(
                return_value=StandaloneConnectionCheck(
                    ok=False, details=None, error="boom"
                )
            ),
        )
        response = await client.post("/admin/api/v1/memory/check-connection")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["error"] == "boom"


# ---- observability --------------------------------------------------------


async def test_observability_check_404_when_no_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/observability/check-connection")
    assert response.status_code == 404


async def test_observability_check_happy_path(
    admin_app, async_session, monkeypatch
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch(
            "/admin/api/v1/observability",
            json={
                "observability": {
                    "provider": "LANGFUSE",
                    "enabled": True,
                    "config": {
                        "host": "https://cloud.langfuse.com",
                        "publicKey": "pk-test",
                        "secretKey": "sk-test",
                    },
                }
            },
        )

        captured = {}

        async def fake_check(observability_config):
            captured["config"] = observability_config
            return StandaloneConnectionCheck(
                ok=True,
                details={"provider": "LANGFUSE", "status": 200},
                error=None,
            )

        monkeypatch.setattr(
            "idun_agent_standalone.api.v1.routers.observability.check_observability",
            fake_check,
        )

        response = await client.post("/admin/api/v1/observability/check-connection")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["details"]["provider"] == "LANGFUSE"
    assert captured["config"]["provider"] == "LANGFUSE"


# ---- mcp servers ----------------------------------------------------------


async def test_mcp_tools_404_unknown_id(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/admin/api/v1/mcp-servers/{uuid4()}/tools")
    assert response.status_code == 404


async def test_mcp_tools_happy_path(admin_app, async_session, monkeypatch) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "Time Server",
                "mcpServer": {
                    "name": "time",
                    "transport": "stdio",
                    "command": "docker",
                    "args": ["run", "-i", "--rm", "mcp/time"],
                },
            },
        )
        row_id = created.json()["data"]["id"]

        async def fake_check(mcp_server_config):
            return StandaloneConnectionCheck(
                ok=True,
                details={
                    "name": mcp_server_config["name"],
                    "transport": "stdio",
                    "tools": ["get_current_time"],
                    "toolCount": 1,
                },
                error=None,
            )

        monkeypatch.setattr(
            "idun_agent_standalone.api.v1.routers.mcp_servers.check_mcp_server",
            fake_check,
        )

        response = await client.post(f"/admin/api/v1/mcp-servers/{row_id}/tools")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["details"]["tools"] == ["get_current_time"]
    assert body["details"]["toolCount"] == 1
