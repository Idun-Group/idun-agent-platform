"""Integration tests for ``/admin/api/v1/onboarding/*``."""

from __future__ import annotations

import textwrap
from pathlib import Path

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
from idun_agent_standalone.api.v1.routers.onboarding import (
    router as onboarding_router,
)
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)


@pytest.fixture
async def admin_app(async_session, stub_reload_callable, tmp_path):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(onboarding_router)
    app.state.reload_callable = stub_reload_callable
    app.state.onboarding_scan_root = tmp_path

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable
    return app


def _seed_langgraph_file(root: Path, *, var: str = "graph") -> None:
    (root / "agent.py").write_text(
        textwrap.dedent(
            f"""
            from langgraph.graph import StateGraph
            from typing import TypedDict

            class State(TypedDict):
                m: str

            {var} = StateGraph(State).compile()
            """
        ).lstrip()
    )


def _seed_adk_file(root: Path) -> None:
    (root / "main_adk.py").write_text(
        textwrap.dedent(
            """
            from google.adk.agents import Agent

            agent = Agent(name="x", model="gemini-2.5-flash")
            """
        ).lstrip()
    )


async def _seed_existing_agent(async_session) -> StandaloneAgentRow:
    row = StandaloneAgentRow(
        name="Existing",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "existing", "graph_definition": "agent.py:graph"},
            },
        },
    )
    async_session.add(row)
    await async_session.commit()
    return row


# ---- /scan ----------------------------------------------------------------


async def test_scan_state_empty(admin_app, tmp_path) -> None:
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "EMPTY"
    assert body["scanResult"]["hasPythonFiles"] is False
    assert body["currentAgent"] is None


async def test_scan_state_no_supported(admin_app, tmp_path) -> None:
    (tmp_path / "hello.py").write_text("print('hi')\n")
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "NO_SUPPORTED"
    assert body["scanResult"]["hasPythonFiles"] is True
    assert body["scanResult"]["detected"] == []


async def test_scan_state_one_detected(admin_app, tmp_path) -> None:
    _seed_langgraph_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "ONE_DETECTED"
    assert len(body["scanResult"]["detected"]) == 1
    detection = body["scanResult"]["detected"][0]
    assert detection["framework"] == "LANGGRAPH"
    assert detection["filePath"] == "agent.py"
    assert detection["variableName"] == "graph"


async def test_scan_state_many_detected(admin_app, tmp_path) -> None:
    _seed_langgraph_file(tmp_path)
    _seed_adk_file(tmp_path)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "MANY_DETECTED"
    frameworks = {d["framework"] for d in body["scanResult"]["detected"]}
    assert frameworks == {"LANGGRAPH", "ADK"}


async def test_scan_state_already_configured_returns_current_agent(
    admin_app, async_session, tmp_path
) -> None:
    """When the agent row exists, state is ALREADY_CONFIGURED regardless of
    what's on disk. The scanner still runs (so direct-curl callers see truthful
    has_python_files / has_idun_config / detected values), but the wizard UI
    switches on `state` and short-circuits to chat without re-querying GET /agent.
    """
    await _seed_existing_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/onboarding/scan")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "ALREADY_CONFIGURED"
    assert body["currentAgent"] is not None
    assert body["currentAgent"]["name"] == "Existing"
    # tmp_path has no Python files so the (now-unconditional) walk reports empty.
    assert body["scanResult"]["detected"] == []
