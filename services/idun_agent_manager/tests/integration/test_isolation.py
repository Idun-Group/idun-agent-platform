"""Integration tests for cross-workspace and cross-project isolation.

Verifies that users cannot access resources, projects, or members
belonging to workspaces or projects they don't have access to.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import (
    create_agent_in_project,
    create_workspace_with_project,
    invite_existing_user,
    make_client,
    refresh_session,
    signup_and_login,
)

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def user_a_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def user_b_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


# ---------------------------------------------------------------------------
# Cross-workspace isolation
# ---------------------------------------------------------------------------


class TestCrossWorkspaceIsolation:
    async def test_cannot_access_other_workspace_agents(
        self, user_a_client: AsyncClient, user_b_client: AsyncClient
    ):
        """User in WS-A cannot access agent in WS-B."""
        await signup_and_login(user_a_client, "usera@iso.com", name="UserA")
        ws_a, pid_a = await create_workspace_with_project(user_a_client, "WS-A")
        agent_id = await create_agent_in_project(user_a_client, ws_a, pid_a)

        await signup_and_login(user_b_client, "userb@iso.com", name="UserB")
        ws_b, _ = await create_workspace_with_project(user_b_client, "WS-B")

        # UserB tries to access UserA's agent using WS-B header
        resp = await user_b_client.get(
            f"/api/v1/agents/{agent_id}",
            headers={"X-Workspace-Id": ws_b},
        )
        assert resp.status_code == 404

    async def test_cannot_access_other_workspace_projects(
        self, user_a_client: AsyncClient, user_b_client: AsyncClient
    ):
        """User in WS-A cannot GET project in WS-B."""
        await signup_and_login(user_a_client, "usera2@iso.com", name="UserA")
        ws_a, pid_a = await create_workspace_with_project(user_a_client, "WS-A2")

        await signup_and_login(user_b_client, "userb2@iso.com", name="UserB")
        ws_b, _ = await create_workspace_with_project(user_b_client, "WS-B2")

        # UserB tries to access UserA's project
        resp = await user_b_client.get(
            f"/api/v1/projects/{pid_a}",
            headers={"X-Workspace-Id": ws_b},
        )
        assert resp.status_code == 404

    async def test_cannot_invite_to_other_workspace(
        self, user_a_client: AsyncClient, user_b_client: AsyncClient
    ):
        """Owner of WS-A cannot invite to WS-B."""
        await signup_and_login(user_a_client, "usera3@iso.com", name="UserA")
        ws_a, _ = await create_workspace_with_project(user_a_client, "WS-A3")

        await signup_and_login(user_b_client, "userb3@iso.com", name="UserB")
        ws_b, _ = await create_workspace_with_project(user_b_client, "WS-B3")

        # UserA tries to invite to WS-B
        resp = await user_a_client.post(
            f"/api/v1/workspaces/{ws_b}/members",
            json={"email": "victim@iso.com"},
        )
        assert resp.status_code in (403, 404)

    async def test_workspace_id_header_validated_against_session(
        self, user_a_client: AsyncClient, user_b_client: AsyncClient
    ):
        """X-Workspace-Id for non-member workspace → 403."""
        await signup_and_login(user_a_client, "usera4@iso.com", name="UserA")
        ws_a, _ = await create_workspace_with_project(user_a_client, "WS-A4")

        await signup_and_login(user_b_client, "userb4@iso.com", name="UserB")
        ws_b, _ = await create_workspace_with_project(user_b_client, "WS-B4")

        # UserA tries to use WS-B's workspace ID
        resp = await user_a_client.get(
            "/api/v1/agents/",
            headers={"X-Workspace-Id": ws_b},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Cross-project isolation
# ---------------------------------------------------------------------------


class TestCrossProjectIsolation:
    async def test_agent_in_project_a_not_accessible_from_project_b_reader(
        self,
        user_a_client: AsyncClient,
        user_b_client: AsyncClient,
    ):
        """Reader on project B cannot GET agent in project A."""
        await signup_and_login(user_a_client, "owner@cross.com", name="Owner")
        ws_id, pid_a = await create_workspace_with_project(user_a_client, "Cross WS")

        # Create project B
        resp = await user_a_client.post(
            "/api/v1/projects/",
            json={"name": "Project B"},
            headers={"X-Workspace-Id": ws_id},
        )
        pid_b = resp.json()["id"]

        # Create agent in project A
        agent_id = await create_agent_in_project(
            user_a_client, ws_id, pid_a, name="Secret Agent"
        )

        # Invite user_b as reader on project B only
        await signup_and_login(user_b_client, "breader@cross.com", name="BReader")
        await invite_existing_user(
            user_a_client,
            ws_id,
            "breader@cross.com",
            project_assignments=[{"project_id": pid_b, "role": "reader"}],
        )
        await refresh_session(user_b_client)

        # user_b tries to access agent in project A
        resp = await user_b_client.get(
            f"/api/v1/agents/{agent_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403

    async def test_project_in_wrong_workspace_returns_404(
        self, user_a_client: AsyncClient, user_b_client: AsyncClient
    ):
        """Project exists but in different workspace → 404."""
        await signup_and_login(user_a_client, "ownerx@cross2.com", name="OwnerX")
        ws_x, pid_x = await create_workspace_with_project(user_a_client, "WS-X")

        await signup_and_login(user_b_client, "ownery@cross2.com", name="OwnerY")
        ws_y, _ = await create_workspace_with_project(user_b_client, "WS-Y")

        # UserB tries to get project from WS-X using WS-Y header
        resp = await user_b_client.get(
            f"/api/v1/projects/{pid_x}",
            headers={"X-Workspace-Id": ws_y},
        )
        assert resp.status_code == 404
