"""Integration tests for Project CRUD + visibility + deletion."""

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
async def owner_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def member_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def outsider_client(db_session: AsyncSession):
    """A client that is NOT a member of the workspace."""
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


async def _setup_workspace(owner_client, member_client):
    """Setup owner + workspace + invite member. Returns (ws_id, default_project_id, member_user_id)."""
    await signup_and_login(owner_client, "owner@test.com", name="Owner")
    ws_id, default_pid = await create_workspace_with_project(owner_client, "Test WS")

    await signup_and_login(member_client, "member@test.com", name="Member")
    member_data = await invite_existing_user(
        owner_client,
        ws_id,
        "member@test.com",
        project_assignments=[{"project_id": default_pid, "role": "reader"}],
    )
    # Refresh member's session to include the new workspace
    await refresh_session(member_client)

    return ws_id, default_pid, member_data["user_id"]


# ---------------------------------------------------------------------------
# Project Creation
# ---------------------------------------------------------------------------


class TestProjectCreation:
    async def test_owner_can_create_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner_create@test.com", name="Owner")
        ws_id, _ = await create_workspace_with_project(owner_client)

        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "New Project"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Project"
        assert data["workspace_id"] == ws_id
        assert data["is_default"] is False

    async def test_non_owner_cannot_create_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await member_client.post(
            "/api/v1/projects/",
            json={"name": "Sneaky Project"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403

    async def test_unauthenticated_cannot_create_project(
        self, owner_client: AsyncClient, db_session: AsyncSession
    ):
        await signup_and_login(owner_client, "owner_unauth@test.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        anon = await make_client(db_session)
        try:
            resp = await anon.post(
                "/api/v1/projects/",
                json={"name": "Ghost Project"},
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 401
        finally:
            await anon.aclose()

    async def test_create_project_name_validation(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner_valid@test.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        # Empty name
        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": ""},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 422

        # Too long
        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "x" * 256},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Project Listing (visibility)
# ---------------------------------------------------------------------------


class TestProjectListing:
    async def test_owner_sees_all_projects(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create a second project
        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Project B"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 201

        # Owner sees both
        resp = await owner_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        projects = resp.json()
        assert len(projects) == 2

    async def test_non_owner_sees_only_assigned_projects(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create a second project (member is NOT assigned to it)
        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Project B"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 201

        # Member only sees the default project (assigned as reader)
        resp = await member_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        projects = resp.json()
        assert len(projects) == 1
        assert projects[0]["id"] == default_pid

    async def test_non_owner_with_no_assignments_sees_nothing(
        self, owner_client: AsyncClient, db_session: AsyncSession
    ):
        await signup_and_login(owner_client, "owner_empty@test.com")
        ws_id, default_pid = await create_workspace_with_project(owner_client)

        # Create a member with NO project assignments
        member = await make_client(db_session)
        try:
            await signup_and_login(member, "noassign@test.com")
            await invite_existing_user(owner_client, ws_id, "noassign@test.com")
            await refresh_session(member)

            resp = await member.get(
                "/api/v1/projects/",
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            await member.aclose()


# ---------------------------------------------------------------------------
# Project Get
# ---------------------------------------------------------------------------


class TestProjectGet:
    async def test_owner_can_get_any_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await owner_client.get(
            f"/api/v1/projects/{default_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == default_pid

    async def test_member_can_get_assigned_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await member_client.get(
            f"/api/v1/projects/{default_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Project Update
# ---------------------------------------------------------------------------


class TestProjectUpdate:
    async def test_owner_can_update_project_name(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await owner_client.patch(
            f"/api/v1/projects/{default_pid}",
            json={"name": "Renamed"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    async def test_owner_can_update_project_description(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await owner_client.patch(
            f"/api/v1/projects/{default_pid}",
            json={"description": "A description"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "A description"

    async def test_non_owner_cannot_update_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await member_client.patch(
            f"/api/v1/projects/{default_pid}",
            json={"name": "Hacked"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Project Deletion
# ---------------------------------------------------------------------------


class TestProjectDeletion:
    async def test_owner_can_delete_non_default_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create a second project
        create_resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Deletable"},
            headers={"X-Workspace-Id": ws_id},
        )
        new_pid = create_resp.json()["id"]

        resp = await owner_client.delete(
            f"/api/v1/projects/{new_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 204

    async def test_cannot_delete_last_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        resp = await owner_client.delete(
            f"/api/v1/projects/{default_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 400
        assert "last project" in resp.json()["detail"].lower()

    async def test_non_owner_cannot_delete_project(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create second project so it's deletable
        create_resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "To Delete"},
            headers={"X-Workspace-Id": ws_id},
        )
        new_pid = create_resp.json()["id"]

        resp = await member_client.delete(
            f"/api/v1/projects/{new_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403

    async def test_delete_project_migrates_resources_to_default(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create a second project
        create_resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "With Agent"},
            headers={"X-Workspace-Id": ws_id},
        )
        new_pid = create_resp.json()["id"]

        # Create an agent in the new project
        agent_id = await create_agent_in_project(
            owner_client, ws_id, new_pid, name="Migrating Agent"
        )

        # Delete the project (resources should migrate to default)
        resp = await owner_client.delete(
            f"/api/v1/projects/{new_pid}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 204

        # Verify agent is now in the default project
        agent_resp = await owner_client.get(
            f"/api/v1/agents/{agent_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert agent_resp.status_code == 200

    async def test_delete_project_with_explicit_migration_target(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        ws_id, default_pid, _ = await _setup_workspace(owner_client, member_client)

        # Create two extra projects
        resp_b = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Project B"},
            headers={"X-Workspace-Id": ws_id},
        )
        pid_b = resp_b.json()["id"]

        resp_c = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Project C"},
            headers={"X-Workspace-Id": ws_id},
        )
        pid_c = resp_c.json()["id"]

        # Create agent in B
        agent_id = await create_agent_in_project(
            owner_client, ws_id, pid_b, name="Agent in B"
        )

        # Delete B, migrating to C
        resp = await owner_client.post(
            f"/api/v1/projects/{pid_b}/delete",
            json={"move_resources_to": pid_c},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 204

        # Agent should still be accessible
        agent_resp = await owner_client.get(
            f"/api/v1/agents/{agent_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert agent_resp.status_code == 200
