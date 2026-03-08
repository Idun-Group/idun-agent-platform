"""Integration tests for MCP tool discovery (require real MCP servers).

Run with: uv run pytest -m integration
- stdio tests require `uvx` to be available on PATH.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.engine.mcp_server import MCPServer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    ProjectAccess,
    get_current_user,
    get_session,
    require_workspace,
)
from app.api.v1.routers.mcp_servers import _discover_tools
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel

WORKSPACE_ID = uuid4()
PROJECT_ID = uuid4()
FAKE_USER = CurrentUser(
    user_id=str(uuid4()),
    email="test@test.com",
    workspace_ids=[str(WORKSPACE_ID)],
)


@pytest_asyncio.fixture(scope="function")
async def client_with_mcp(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Test client with auth overrides."""

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    from app.main import create_app

    @asynccontextmanager
    async def _noop_lifespan(_app):
        yield

    app = create_app()
    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[require_workspace] = lambda: WORKSPACE_ID

    fake_access = ProjectAccess(
        project_id=PROJECT_ID,
        workspace_id=WORKSPACE_ID,
        role="admin",
        is_workspace_owner=True,
    )

    transport = ASGITransport(app=app)
    with patch(
        "app.api.v1.routers.mcp_servers.require_project_role",
        return_value=fake_access,
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest_asyncio.fixture
async def seeded_stdio_mcp(db_session: AsyncSession) -> ManagedMCPServerModel:
    """Seed the aws-docs stdio MCP server in the DB."""
    model = ManagedMCPServerModel(
        id=uuid4(),
        name="aws-docs",
        mcp_server_config={
            "name": "aws-docs",
            "transport": "stdio",
            "command": "uvx",
            "args": ["awslabs.aws-documentation-mcp-server@latest"],
            "env": {
                "FASTMCP_LOG_LEVEL": "ERROR",
                "AWS_DOCUMENTATION_PARTITION": "aws",
            },
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        workspace_id=WORKSPACE_ID,
        project_id=PROJECT_ID,
    )
    db_session.add(model)
    await db_session.flush()
    return model


@pytest.mark.integration
class TestDiscoverTools:
    @pytest.mark.asyncio
    async def test_discovers_tools_from_stdio_server(self):
        config = MCPServer(
            name="aws-docs",
            transport="stdio",
            command="uvx",
            args=["awslabs.aws-documentation-mcp-server@latest"],
            env={
                "FASTMCP_LOG_LEVEL": "ERROR",
                "AWS_DOCUMENTATION_PARTITION": "aws",
            },
        )
        tools = await _discover_tools(config)

        assert len(tools) > 0
        assert all(t.name for t in tools)
        tool_names = [t.name for t in tools]
        assert any("search" in name.lower() for name in tool_names)

    # TODO: Add streamable_http integration test when a hosted MCP server is available.


@pytest.mark.integration
class TestDiscoverToolsEndpoint:
    @pytest.mark.asyncio
    async def test_endpoint_returns_tools_from_stdio_server(
        self,
        client_with_mcp: AsyncClient,
        seeded_stdio_mcp: ManagedMCPServerModel,
    ):
        resp = await client_with_mcp.post(
            f"/api/v1/projects/{PROJECT_ID}/mcp-servers/{seeded_stdio_mcp.id}/tools"
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tools"]) > 0
        assert all("name" in t for t in data["tools"])
