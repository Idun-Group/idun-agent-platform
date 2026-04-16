"""Integration tests for agent resource associations.

Tests the full flow: create managed resources, create agent with resource
references, verify materialized engine_config, update resources and verify
cascade recompute, and RESTRICT delete policy.
"""


from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

# Valid EngineConfig payloads
LANGGRAPH_CONFIG = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {"name": "test-agent", "graph_definition": "mod:graph"},
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _auth(client: AsyncClient) -> None:
    """Sign up, create workspace, refresh cookie so workspace is active."""
    await client.post(
        "/api/v1/auth/basic/signup",
        json={"email": "test@example.com", "password": "password123", "name": "Test"},
    )
    await client.post("/api/v1/workspaces/", json={"name": "ws"})
    # /me re-signs the session cookie with workspace_ids populated
    await client.get("/api/v1/auth/me")


async def _create_agent(client: AsyncClient, resources: dict | None = None) -> dict:
    """Create an agent, optionally with resource references."""
    payload: dict = {
        "name": "test-agent",
        "base_url": "http://localhost:9000",
        "version": "0.1.0",
        "engine_config": LANGGRAPH_CONFIG,
    }
    if resources is not None:
        payload["resources"] = resources
    resp = await client.post("/api/v1/agents/", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_memory(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/memory/",
        json={
            "name": "test-mem",
            "agent_framework": "LANGGRAPH",
            "memory": {"type": "postgres", "db_url": "postgresql://localhost/db"},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_sso(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/sso/",
        json={
            "name": "test-sso",
            "sso": {
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "cid",
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_mcp(client: AsyncClient, name: str = "github") -> dict:
    resp = await client.post(
        "/api/v1/mcp-servers/",
        json={
            "name": name,
            "mcp_server": {"name": name, "url": f"http://{name}:8080"},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_observability(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/observability/",
        json={
            "name": "test-obs",
            "observability": {
                "provider": "LANGFUSE",
                "config": {
                    "host": "https://cloud.langfuse.com",
                    "public_key": "pk",
                    "secret_key": "sk",
                },
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_integration(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/integrations/",
        json={
            "name": "test-discord",
            "integration": {
                "provider": "DISCORD",
                "config": {
                    "bot_token": "tok",
                    "application_id": "aid",
                    "public_key": "pk",
                },
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_guardrail(client: AsyncClient, name: str = "test-guard") -> dict:
    resp = await client.post(
        "/api/v1/guardrails/",
        json={
            "name": name,
            "guardrail": {"config_id": "ban_list", "banned_words": ["bad"]},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestAgentResourceAssociations:
    """Test creating agents with resource references and reading them back."""

    async def test_create_agent_no_resources(self, client: AsyncClient):
        await _auth(client)
        agent = await _create_agent(client)

        res = agent["resources"]
        assert res["memory_id"] is None
        assert res["sso_id"] is None
        assert res["guardrail_ids"] == []
        assert res["mcp_server_ids"] == []
        assert res["observability_ids"] == []
        assert res["integration_ids"] == []

    async def test_create_agent_with_memory(self, client: AsyncClient):
        await _auth(client)
        mem = await _create_memory(client)
        agent = await _create_agent(
            client, resources={"memory_id": mem["id"]}
        )

        assert agent["resources"]["memory_id"] == mem["id"]
        # Materialized config should have checkpointer
        config = agent["engine_config"]
        assert config["agent"]["config"]["checkpointer"]["type"] == "postgres"

    async def test_create_agent_with_sso(self, client: AsyncClient):
        await _auth(client)
        sso = await _create_sso(client)
        agent = await _create_agent(
            client, resources={"sso_id": sso["id"]}
        )

        assert agent["resources"]["sso_id"] == sso["id"]
        assert agent["engine_config"]["sso"]["issuer"] == "https://accounts.google.com"

    async def test_create_agent_with_mcp_servers(self, client: AsyncClient):
        await _auth(client)
        mcp1 = await _create_mcp(client, "github")
        mcp2 = await _create_mcp(client, "slack")
        agent = await _create_agent(
            client,
            resources={"mcp_server_ids": [mcp1["id"], mcp2["id"]]},
        )

        assert set(agent["resources"]["mcp_server_ids"]) == {mcp1["id"], mcp2["id"]}
        names = {s["name"] for s in agent["engine_config"]["mcp_servers"]}
        assert names == {"github", "slack"}

    async def test_create_agent_with_observability(self, client: AsyncClient):
        await _auth(client)
        obs = await _create_observability(client)
        agent = await _create_agent(
            client, resources={"observability_ids": [obs["id"]]}
        )

        assert agent["resources"]["observability_ids"] == [obs["id"]]
        assert agent["engine_config"]["observability"][0]["provider"] == "LANGFUSE"

    async def test_create_agent_with_integration(self, client: AsyncClient):
        await _auth(client)
        integ = await _create_integration(client)
        agent = await _create_agent(
            client, resources={"integration_ids": [integ["id"]]}
        )

        assert agent["resources"]["integration_ids"] == [integ["id"]]
        assert agent["engine_config"]["integrations"][0]["provider"] == "DISCORD"

    async def test_get_agent_preserves_resources(self, client: AsyncClient):
        """GET /{id} returns the same resource IDs as POST."""
        await _auth(client)
        mem = await _create_memory(client)
        mcp = await _create_mcp(client)
        agent = await _create_agent(
            client,
            resources={"memory_id": mem["id"], "mcp_server_ids": [mcp["id"]]},
        )

        resp = await client.get(f"/api/v1/agents/{agent['id']}")
        assert resp.status_code == 200
        fetched = resp.json()

        assert fetched["resources"]["memory_id"] == mem["id"]
        assert fetched["resources"]["mcp_server_ids"] == [mcp["id"]]


class TestPatchAgentResources:
    """Test updating agent resource associations via PATCH."""

    async def test_patch_adds_resources(self, client: AsyncClient):
        await _auth(client)
        agent = await _create_agent(client)
        mem = await _create_memory(client)

        resp = await client.patch(
            f"/api/v1/agents/{agent['id']}",
            json={
                "name": agent["name"],
                "base_url": agent["base_url"],
                "engine_config": LANGGRAPH_CONFIG,
                "resources": {"memory_id": mem["id"]},
            },
        )
        assert resp.status_code == 200
        patched = resp.json()
        assert patched["resources"]["memory_id"] == mem["id"]
        assert patched["engine_config"]["agent"]["config"]["checkpointer"]["type"] == "postgres"

    async def test_patch_removes_resources(self, client: AsyncClient):
        await _auth(client)
        mem = await _create_memory(client)
        agent = await _create_agent(
            client, resources={"memory_id": mem["id"]}
        )
        assert agent["resources"]["memory_id"] == mem["id"]

        # Patch without memory → should clear it
        resp = await client.patch(
            f"/api/v1/agents/{agent['id']}",
            json={
                "name": agent["name"],
                "base_url": agent["base_url"],
                "engine_config": LANGGRAPH_CONFIG,
                "resources": {},
            },
        )
        assert resp.status_code == 200
        patched = resp.json()
        assert patched["resources"]["memory_id"] is None
        # Default in-memory checkpointer should be injected
        assert patched["engine_config"]["agent"]["config"]["checkpointer"] == {"type": "memory"}

    async def test_patch_replaces_mcp_servers(self, client: AsyncClient):
        await _auth(client)
        mcp1 = await _create_mcp(client, "github")
        mcp2 = await _create_mcp(client, "slack")
        agent = await _create_agent(
            client, resources={"mcp_server_ids": [mcp1["id"]]}
        )

        # Replace github with slack
        resp = await client.patch(
            f"/api/v1/agents/{agent['id']}",
            json={
                "name": agent["name"],
                "base_url": agent["base_url"],
                "engine_config": LANGGRAPH_CONFIG,
                "resources": {"mcp_server_ids": [mcp2["id"]]},
            },
        )
        assert resp.status_code == 200
        patched = resp.json()
        assert patched["resources"]["mcp_server_ids"] == [mcp2["id"]]
        assert patched["engine_config"]["mcp_servers"][0]["name"] == "slack"


class TestCascadeRecompute:
    """Test that updating a managed resource recomputes referencing agents."""

    async def test_update_mcp_cascades(self, client: AsyncClient):
        await _auth(client)
        mcp = await _create_mcp(client, "github")
        agent = await _create_agent(
            client, resources={"mcp_server_ids": [mcp["id"]]}
        )
        assert agent["engine_config"]["mcp_servers"][0]["name"] == "github"

        # Update the MCP server name
        resp = await client.patch(
            f"/api/v1/mcp-servers/{mcp['id']}",
            json={
                "name": "github-updated",
                "mcp_server": {"name": "github-updated", "url": "http://new:8080"},
            },
        )
        assert resp.status_code == 200

        # Agent's materialized config should reflect the update
        resp = await client.get(f"/api/v1/agents/{agent['id']}")
        assert resp.status_code == 200
        updated_agent = resp.json()
        assert updated_agent["engine_config"]["mcp_servers"][0]["name"] == "github-updated"

    async def test_update_sso_cascades(self, client: AsyncClient):
        await _auth(client)
        sso = await _create_sso(client)
        agent = await _create_agent(
            client, resources={"sso_id": sso["id"]}
        )

        # Update SSO issuer
        resp = await client.patch(
            f"/api/v1/sso/{sso['id']}",
            json={
                "name": "updated-sso",
                "sso": {
                    "enabled": True,
                    "issuer": "https://new-issuer.com",
                    "client_id": "new-cid",
                },
            },
        )
        assert resp.status_code == 200

        resp = await client.get(f"/api/v1/agents/{agent['id']}")
        updated_agent = resp.json()
        assert updated_agent["engine_config"]["sso"]["issuer"] == "https://new-issuer.com"


class TestRestrictDelete:
    """Test RESTRICT delete policy: can't delete resources referenced by agents."""

    async def test_delete_unreferenced_mcp_succeeds(self, client: AsyncClient):
        await _auth(client)
        mcp = await _create_mcp(client)
        resp = await client.delete(f"/api/v1/mcp-servers/{mcp['id']}")
        assert resp.status_code == 204

    async def test_delete_referenced_mcp_fails(self, client: AsyncClient):
        await _auth(client)
        mcp = await _create_mcp(client)
        await _create_agent(
            client, resources={"mcp_server_ids": [mcp["id"]]}
        )
        resp = await client.delete(f"/api/v1/mcp-servers/{mcp['id']}")
        assert resp.status_code == 409

    async def test_delete_referenced_guardrail_fails(self, client: AsyncClient, monkeypatch):
        monkeypatch.setenv("GUARDRAILS_API_KEY", "test-key")
        await _auth(client)
        guard = await _create_guardrail(client)
        await _create_agent(
            client,
            resources={
                "guardrail_ids": [
                    {"id": guard["id"], "position": "input", "sort_order": 0}
                ]
            },
        )
        resp = await client.delete(f"/api/v1/guardrails/{guard['id']}")
        assert resp.status_code == 409

    async def test_delete_agent_frees_resource(self, client: AsyncClient):
        """Deleting an agent (CASCADE) should free the resource for deletion."""
        await _auth(client)
        mcp = await _create_mcp(client)
        agent = await _create_agent(
            client, resources={"mcp_server_ids": [mcp["id"]]}
        )

        # Delete the agent first
        resp = await client.delete(f"/api/v1/agents/{agent['id']}")
        assert resp.status_code == 204

        # Now deleting the MCP server should succeed
        resp = await client.delete(f"/api/v1/mcp-servers/{mcp['id']}")
        assert resp.status_code == 204


class TestProjectScopedResources:
    async def test_memory_list_is_scoped_to_active_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )
        from app.infrastructure.db.models.user import UserModel

        await _auth(client)
        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = UUID(principal["default_workspace_id"])
        default_project_id = principal["workspaces"][0]["default_project_id"]

        user = (
            await db_session.execute(
                select(UserModel).where(UserModel.email == "test@example.com")
            )
        ).scalar_one()
        second_project = ProjectModel(
            id=uuid4(),
            workspace_id=workspace_id,
            name="Second Project",
            is_default=False,
        )
        db_session.add(second_project)
        await db_session.flush()
        db_session.add(
            ProjectMembershipModel(
                id=uuid4(),
                project_id=second_project.id,
                user_id=user.id,
                role="admin",
            )
        )
        await db_session.flush()

        memory = await _create_memory(client)

        default_list = await client.get(
            "/api/v1/memory/",
            headers={"X-Project-Id": default_project_id},
        )
        assert default_list.status_code == 200
        assert len(default_list.json()) == 1
        assert default_list.json()[0]["id"] == memory["id"]

        second_list = await client.get(
            "/api/v1/memory/",
            headers={"X-Project-Id": str(second_project.id)},
        )
        assert second_list.status_code == 200
        assert second_list.json() == []

    async def test_agent_cannot_reference_resource_from_another_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )
        from app.infrastructure.db.models.user import UserModel

        await _auth(client)
        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = UUID(principal["default_workspace_id"])
        default_project_id = principal["workspaces"][0]["default_project_id"]

        user = (
            await db_session.execute(
                select(UserModel).where(UserModel.email == "test@example.com")
            )
        ).scalar_one()
        second_project = ProjectModel(
            id=uuid4(),
            workspace_id=workspace_id,
            name="Resource Project Two",
            is_default=False,
        )
        db_session.add(second_project)
        await db_session.flush()
        db_session.add(
            ProjectMembershipModel(
                id=uuid4(),
                project_id=second_project.id,
                user_id=user.id,
                role="admin",
            )
        )
        await db_session.flush()

        foreign_memory_response = await client.post(
            "/api/v1/memory/",
            headers={"X-Project-Id": str(second_project.id)},
            json={
                "name": "foreign-mem",
                "agent_framework": "LANGGRAPH",
                "memory": {"type": "postgres", "db_url": "postgresql://localhost/db"},
            },
        )
        assert foreign_memory_response.status_code == 201, foreign_memory_response.text
        foreign_memory_id = foreign_memory_response.json()["id"]

        create_agent_response = await client.post(
            "/api/v1/agents/",
            headers={"X-Project-Id": default_project_id},
            json={
                "name": "cross-project-agent",
                "base_url": "http://localhost:9000",
                "version": "0.1.0",
                "engine_config": LANGGRAPH_CONFIG,
                "resources": {"memory_id": foreign_memory_id},
            },
        )
        assert create_agent_response.status_code == 400
