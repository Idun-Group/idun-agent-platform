"""Unit tests for MCP tool discovery."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.engine.mcp_server import MCPServer
from idun_agent_schema.manager.managed_mcp_server import MCPToolSchema
from idun_agent_schema.manager.project import ProjectRole
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    ProjectAccess,
    get_current_user,
    get_session,
    require_project_reader,
    require_workspace,
)
from app.api.v1.routers.mcp_servers import _get_transport, _list_tools
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel

WORKSPACE_ID = uuid4()
PROJECT_ID = uuid4()
FAKE_USER = CurrentUser(
    user_id=str(uuid4()),
    email="test@test.com",
    workspace_ids=[str(WORKSPACE_ID)],
    default_workspace_id=str(WORKSPACE_ID),
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
    app.dependency_overrides[require_project_reader] = lambda: ProjectAccess(
        project_id=PROJECT_ID,
        workspace_id=WORKSPACE_ID,
        role=ProjectRole.ADMIN,
        is_default=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_mcp(db_session: AsyncSession) -> ManagedMCPServerModel:
    """Seed a stdio MCP server in the DB."""
    model = ManagedMCPServerModel(
        id=uuid4(),
        name="test-server",
        mcp_server_config={
            "name": "test-server",
            "transport": "stdio",
            "command": "echo",
            "args": ["hello"],
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        workspace_id=WORKSPACE_ID,
        project_id=PROJECT_ID,
    )
    db_session.add(model)
    await db_session.flush()
    return model


class TestGetTransport:
    @patch("app.api.v1.routers.mcp_servers.stdio_client")
    def test_stdio_calls_stdio_client_with_server_params(self, mock_stdio):
        config = MCPServer(
            name="my-stdio",
            transport="stdio",
            command="uvx",
            args=["some-package@latest"],
            env={"KEY": "val"},
        )
        _get_transport(config)

        mock_stdio.assert_called_once()
        params = mock_stdio.call_args.kwargs["server"]
        assert params.command == "uvx"
        assert params.args == ["some-package@latest"]
        assert params.env == {"KEY": "val"}

    @patch("app.api.v1.routers.mcp_servers.streamablehttp_client")
    def test_streamable_http_calls_correct_client(self, mock_http):
        config = MCPServer(
            name="my-http",
            transport="streamable_http",
            url="http://localhost:9999/mcp",
            headers={"Authorization": "Bearer tok"},
        )
        _get_transport(config)

        mock_http.assert_called_once_with(
            url="http://localhost:9999/mcp",
            headers={"Authorization": "Bearer tok"},
        )

    @patch("app.api.v1.routers.mcp_servers.sse_client")
    def test_sse_calls_correct_client(self, mock_sse):
        config = MCPServer(
            name="my-sse",
            transport="sse",
            url="http://localhost:8080/sse",
            headers={"X-Api-Key": "secret"},
        )
        _get_transport(config)

        mock_sse.assert_called_once_with(
            url="http://localhost:8080/sse",
            headers={"X-Api-Key": "secret"},
        )

    @patch("app.api.v1.routers.mcp_servers.websocket_client")
    def test_websocket_calls_correct_client(self, mock_ws):
        config = MCPServer(
            name="my-ws",
            transport="websocket",
            url="ws://localhost:9999/ws",
        )
        _get_transport(config)

        mock_ws.assert_called_once_with(url="ws://localhost:9999/ws")

    @patch("app.api.v1.routers.mcp_servers.streamablehttp_client")
    def test_none_headers_passed_when_headers_empty(self, mock_http):
        config = MCPServer(
            name="no-headers",
            transport="streamable_http",
            url="http://localhost:9999/mcp",
        )
        _get_transport(config)

        mock_http.assert_called_once_with(
            url="http://localhost:9999/mcp",
            headers=None,
        )

    def test_unsupported_transport_raises_value_error(self):
        config = MCPServer(name="bad", transport="stdio", command="echo", args=["test"])
        config.transport = "carrier_pigeon"
        with pytest.raises(ValueError, match="Unsupported transport: carrier_pigeon"):
            _get_transport(config)


class TestListTools:
    @pytest.mark.asyncio
    async def test_maps_tool_fields_correctly(self):
        tool_a = MagicMock()
        tool_a.name = "search_docs"
        tool_a.description = "Search AWS documentation"
        tool_a.inputSchema = {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        }

        tool_b = MagicMock()
        tool_b.name = "read_doc"
        tool_b.description = None
        tool_b.inputSchema = {}

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.tools = [tool_a, tool_b]
        mock_session.list_tools.return_value = mock_result

        tools = await _list_tools(mock_session)

        assert len(tools) == 2
        assert tools[0].name == "search_docs"
        assert tools[0].description == "Search AWS documentation"
        assert tools[0].input_schema == tool_a.inputSchema
        assert tools[1].name == "read_doc"
        assert tools[1].description is None
        assert tools[1].input_schema == {}

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_tools(self):
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.tools = []
        mock_session.list_tools.return_value = mock_result

        tools = await _list_tools(mock_session)
        assert tools == []

    @pytest.mark.asyncio
    async def test_wraps_exception_as_runtime_error(self):
        mock_session = AsyncMock()
        mock_session.list_tools.side_effect = Exception("transport closed")

        with pytest.raises(RuntimeError, match="Failed to list tools: transport closed"):
            await _list_tools(mock_session)


class TestDiscoverToolsEndpoint:
    @pytest.mark.asyncio
    async def test_nonexistent_server_returns_404(self, client_with_mcp: AsyncClient):
        fake_id = uuid4()
        resp = await client_with_mcp.post(f"/api/v1/mcp-servers/{fake_id}/tools")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_connection_failure_returns_502(
        self,
        client_with_mcp: AsyncClient,
        seeded_mcp: ManagedMCPServerModel,
    ):
        with patch(
            "app.api.v1.routers.mcp_servers._discover_tools",
            side_effect=ConnectionError("Failed to connect to MCP server: timeout"),
        ):
            resp = await client_with_mcp.post(
                f"/api/v1/mcp-servers/{seeded_mcp.id}/tools"
            )
        assert resp.status_code == 502
        assert "Failed to connect" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_successful_discovery_returns_tools(
        self,
        client_with_mcp: AsyncClient,
        seeded_mcp: ManagedMCPServerModel,
    ):
        fake_tools = [
            MCPToolSchema(
                name="search_docs",
                description="Search AWS documentation",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                },
            ),
            MCPToolSchema(
                name="read_doc",
                description="Read a specific document",
                input_schema=None,
            ),
        ]
        with patch(
            "app.api.v1.routers.mcp_servers._discover_tools",
            return_value=fake_tools,
        ):
            resp = await client_with_mcp.post(
                f"/api/v1/mcp-servers/{seeded_mcp.id}/tools"
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tools"]) == 2
        assert data["tools"][0]["name"] == "search_docs"
        assert data["tools"][0]["description"] == "Search AWS documentation"
        assert data["tools"][0]["input_schema"]["type"] == "object"
        assert data["tools"][1]["name"] == "read_doc"
        assert data["tools"][1]["input_schema"] is None
