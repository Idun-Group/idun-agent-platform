"""Shared test helpers for multi-user integration tests."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


def _make_app(db_session: AsyncSession):
    """Build a FastAPI app wired to the given db_session."""
    from app.main import create_app

    app = create_app()
    app.router.lifespan_context = _noop_lifespan

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    return app


async def make_client(db_session: AsyncSession) -> AsyncClient:
    """Create a new AsyncClient sharing the same db_session."""
    app = _make_app(db_session)
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def signup_and_login(
    client: AsyncClient,
    email: str,
    password: str = "password123",
    name: str = "Test User",
) -> dict:
    """Signup a user and return the response data. Session cookie is set on client."""
    resp = await client.post(
        "/api/v1/auth/basic/signup",
        json={"email": email, "password": password, "name": name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def create_workspace_with_project(
    client: AsyncClient,
    ws_name: str = "Test Workspace",
) -> tuple[str, str]:
    """Create workspace → return (workspace_id, default_project_id).

    After creation, refreshes the session cookie via /me so subsequent
    calls carry the new workspace_id.
    """
    ws_resp = await client.post("/api/v1/workspaces/", json={"name": ws_name})
    assert ws_resp.status_code == 201, ws_resp.text
    ws_id = ws_resp.json()["id"]

    # Refresh session cookie to include the new workspace
    me_resp = await client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200

    # Get the default project
    projects_resp = await client.get(
        "/api/v1/projects/",
        headers={"X-Workspace-Id": ws_id},
    )
    assert projects_resp.status_code == 200, projects_resp.text
    projects = projects_resp.json()
    assert len(projects) >= 1
    default_project = next(p for p in projects if p["is_default"])
    return ws_id, default_project["id"]


async def invite_existing_user(
    owner_client: AsyncClient,
    workspace_id: str,
    email: str,
    is_owner: bool = False,
    project_assignments: list[dict] | None = None,
) -> dict:
    """Owner invites an existing user → returns MemberRead dict."""
    body: dict = {
        "email": email,
        "is_owner": is_owner,
        "project_assignments": project_assignments or [],
    }
    resp = await owner_client.post(
        f"/api/v1/workspaces/{workspace_id}/members",
        json=body,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def invite_new_user(
    owner_client: AsyncClient,
    workspace_id: str,
    email: str,
    is_owner: bool = False,
    project_assignments: list[dict] | None = None,
) -> dict:
    """Owner invites a non-existing user → returns InvitationRead dict."""
    body: dict = {
        "email": email,
        "is_owner": is_owner,
        "project_assignments": project_assignments or [],
    }
    resp = await owner_client.post(
        f"/api/v1/workspaces/{workspace_id}/members",
        json=body,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def refresh_session(client: AsyncClient) -> dict:
    """Call /me to refresh session cookie and return principal."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    return resp.json()["session"]["principal"]


# Minimal valid EngineConfig for agent creation
MINIMAL_AGENT_PAYLOAD = {
    "name": "Test Agent",
    "engine_config": {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test-agent",
                "graph_definition": "tests.fake:graph",
            },
        },
    },
}


async def create_agent_in_project(
    client: AsyncClient,
    workspace_id: str,
    project_id: str,
    name: str = "Test Agent",
) -> str:
    """Create a minimal agent in a specific project → returns agent_id."""
    payload = {
        **MINIMAL_AGENT_PAYLOAD,
        "name": name,
    }
    resp = await client.post(
        "/api/v1/agents/",
        json=payload,
        headers={
            "X-Workspace-Id": workspace_id,
            "X-Project-Id": project_id,
        },
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])
