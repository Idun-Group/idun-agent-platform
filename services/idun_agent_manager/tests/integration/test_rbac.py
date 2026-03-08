"""Comprehensive RBAC permission tests for project-scoped resource access.

Tests the full permission matrix from the RBAC plan:

    | Role                | CREATE | LIST | READ | UPDATE | DELETE |
    |---------------------|--------|------|------|--------|--------|
    | workspace_owner     |  201   | 200  | 200  |  200   |  204   |
    | project_admin       |  201   | 200  | 200  |  200   |  204   |
    | project_contributor |  201   | 200  | 200  |  200   |  403   |
    | project_reader      |  403   | 200  | 200  |  403   |  403   |
    | no_project_access   |  404   | 404  | 404  |  404   |  404   |

Also tests:
    - Cross-project isolation
    - Cross-workspace isolation
    - Project CRUD (create, list, get, update, delete)
    - Project member management (add, remove, role change, constraints)
    - Workspace member management with project assignments
    - Session invalidation on role change/removal
    - Project deletion two-step flow
    - Invitation acceptance with project pre-assignments
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.invitation import InvitationModel
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.user import UserModel
from app.infrastructure.db.models.workspace import WorkspaceModel

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Shared IDs
# ---------------------------------------------------------------------------

WORKSPACE_ID = uuid.uuid4()
WORKSPACE_B_ID = uuid.uuid4()  # Second workspace for cross-workspace tests
PROJECT_ID = uuid.uuid4()
PROJECT_B_ID = uuid.uuid4()  # Second project for cross-project tests

OWNER_USER_ID = uuid.uuid4()
ADMIN_USER_ID = uuid.uuid4()
CONTRIBUTOR_USER_ID = uuid.uuid4()
READER_USER_ID = uuid.uuid4()
NO_ACCESS_USER_ID = uuid.uuid4()
OUTSIDER_USER_ID = uuid.uuid4()  # Not in workspace at all


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(uid: uuid.UUID, email: str, ws_ids: list[uuid.UUID] | None = None) -> CurrentUser:
    workspace_ids = [str(wid) for wid in (ws_ids or [WORKSPACE_ID])]
    return CurrentUser(
        user_id=str(uid),
        email=email,
        roles=["admin"],
        workspace_ids=workspace_ids,
    )


OWNER = _make_user(OWNER_USER_ID, "owner@test.com")
ADMIN = _make_user(ADMIN_USER_ID, "admin@test.com")
CONTRIBUTOR = _make_user(CONTRIBUTOR_USER_ID, "contributor@test.com")
READER = _make_user(READER_USER_ID, "reader@test.com")
NO_ACCESS = _make_user(NO_ACCESS_USER_ID, "noaccess@test.com")
OUTSIDER = _make_user(OUTSIDER_USER_ID, "outsider@test.com", ws_ids=[WORKSPACE_B_ID])


AGENT_PAYLOAD = {
    "name": "Test Agent",
    "engine_config": {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test-agent",
                "graph_definition": "agent:graph",
            },
        },
        "server": {"api": {"port": 8000}},
    },
}


async def _seed_data(session: AsyncSession) -> None:
    """Seed workspace, projects, users, memberships, and project memberships."""
    # Workspaces
    session.add(WorkspaceModel(id=WORKSPACE_ID, name="Test Workspace", slug="test-workspace"))
    session.add(WorkspaceModel(id=WORKSPACE_B_ID, name="Other Workspace", slug="other-workspace"))
    await session.flush()

    # Projects
    session.add(ProjectModel(
        id=PROJECT_ID,
        name="Project A",
        slug="project-a",
        workspace_id=WORKSPACE_ID,
        is_default=True,
    ))
    session.add(ProjectModel(
        id=PROJECT_B_ID,
        name="Project B",
        slug="project-b",
        workspace_id=WORKSPACE_ID,
        is_default=False,
    ))
    await session.flush()

    # Users
    for uid, email in [
        (OWNER_USER_ID, "owner@test.com"),
        (ADMIN_USER_ID, "admin@test.com"),
        (CONTRIBUTOR_USER_ID, "contributor@test.com"),
        (READER_USER_ID, "reader@test.com"),
        (NO_ACCESS_USER_ID, "noaccess@test.com"),
        (OUTSIDER_USER_ID, "outsider@test.com"),
    ]:
        session.add(UserModel(id=uid, email=email, provider="local"))
    await session.flush()

    # Workspace memberships
    for uid, is_owner in [
        (OWNER_USER_ID, True),
        (ADMIN_USER_ID, False),
        (CONTRIBUTOR_USER_ID, False),
        (READER_USER_ID, False),
        (NO_ACCESS_USER_ID, False),
    ]:
        session.add(MembershipModel(
            id=uuid.uuid4(), user_id=uid, workspace_id=WORKSPACE_ID, is_owner=is_owner,
        ))
    # Outsider is member of workspace B only
    session.add(MembershipModel(
        id=uuid.uuid4(), user_id=OUTSIDER_USER_ID, workspace_id=WORKSPACE_B_ID, is_owner=True,
    ))
    await session.flush()

    # Project memberships for Project A
    for uid, role in [
        (OWNER_USER_ID, "admin"),   # workspace owner → explicit admin row
        (ADMIN_USER_ID, "admin"),
        (CONTRIBUTOR_USER_ID, "contributor"),
        (READER_USER_ID, "reader"),
        # NO_ACCESS_USER_ID intentionally NOT in Project A
    ]:
        session.add(ProjectMembershipModel(
            id=uuid.uuid4(), project_id=PROJECT_ID, user_id=uid, role=role,
        ))
    await session.flush()

    # NO_ACCESS user only has access to Project B (admin on B, no access on A)
    session.add(ProjectMembershipModel(
        id=uuid.uuid4(), project_id=PROJECT_B_ID, user_id=NO_ACCESS_USER_ID, role="admin",
    ))
    # Owner also gets explicit admin row on Project B
    session.add(ProjectMembershipModel(
        id=uuid.uuid4(), project_id=PROJECT_B_ID, user_id=OWNER_USER_ID, role="admin",
    ))
    await session.flush()

    await session.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


def _client_factory(db_session: AsyncSession, user: CurrentUser):
    """Build an AsyncClient authenticated as the given user."""
    from app.main import create_app

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app = create_app()
    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_workspace] = lambda: WORKSPACE_ID

    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        follow_redirects=True,
    )


@pytest_asyncio.fixture(scope="function")
async def seeded_session(db_session: AsyncSession) -> AsyncSession:
    """Seed the DB with test data and return the session."""
    await _seed_data(db_session)
    return db_session


# ---------------------------------------------------------------------------
# 1. Agent CRUD Permission Tests (parametrized)
# ---------------------------------------------------------------------------


class TestAgentPermissions:
    """Test CRUD permissions for agents scoped to a project."""

    @pytest.mark.parametrize(
        "user, expected_status",
        [
            (OWNER, 201),
            (ADMIN, 201),
            (CONTRIBUTOR, 201),
            (READER, 403),
            (NO_ACCESS, 404),
        ],
        ids=["owner", "admin", "contributor", "reader", "no_access"],
    )
    async def test_create_agent(
        self, seeded_session: AsyncSession, user: CurrentUser, expected_status: int
    ):
        async with _client_factory(seeded_session, user) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents",
                json=AGENT_PAYLOAD,
            )
            assert resp.status_code == expected_status, (
                f"Expected {expected_status} for {user.email}, got {resp.status_code}: {resp.text}"
            )

    @pytest.mark.parametrize(
        "user, expected_status",
        [
            (OWNER, 200),
            (ADMIN, 200),
            (CONTRIBUTOR, 200),
            (READER, 200),
            (NO_ACCESS, 404),
        ],
        ids=["owner", "admin", "contributor", "reader", "no_access"],
    )
    async def test_list_agents(
        self, seeded_session: AsyncSession, user: CurrentUser, expected_status: int
    ):
        async with _client_factory(seeded_session, user) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/agents")
            assert resp.status_code == expected_status

    async def test_read_agent(self, seeded_session: AsyncSession):
        """Reader can read, no_access cannot."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        # Reader can read
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/agents/{agent_id}")
            assert resp.status_code == 200

        # No access → 404
        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/agents/{agent_id}")
            assert resp.status_code == 404

    async def test_update_agent_permissions(self, seeded_session: AsyncSession):
        """Contributor can update, reader cannot."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        patch_payload = {"name": "Updated Agent", "engine_config": AGENT_PAYLOAD["engine_config"]}

        # Contributor can update
        async with _client_factory(seeded_session, CONTRIBUTOR) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}/agents/{agent_id}", json=patch_payload,
            )
            assert resp.status_code == 200

        # Reader cannot update
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}/agents/{agent_id}", json=patch_payload,
            )
            assert resp.status_code == 403

    async def test_delete_agent_permissions(self, seeded_session: AsyncSession):
        """Admin/Owner can delete, contributor/reader cannot."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp1 = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents",
                json={**AGENT_PAYLOAD, "name": "Delete Test 1"},
            )
            assert resp1.status_code == 201
            agent1_id = resp1.json()["id"]

            resp2 = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents",
                json={**AGENT_PAYLOAD, "name": "Delete Test 2"},
            )
            assert resp2.status_code == 201
            agent2_id = resp2.json()["id"]

        # Contributor cannot delete
        async with _client_factory(seeded_session, CONTRIBUTOR) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_ID}/agents/{agent1_id}")
            assert resp.status_code == 403

        # Reader cannot delete
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_ID}/agents/{agent1_id}")
            assert resp.status_code == 403

        # Admin can delete
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_ID}/agents/{agent1_id}")
            assert resp.status_code == 204

        # Owner can delete
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_ID}/agents/{agent2_id}")
            assert resp.status_code == 204


# ---------------------------------------------------------------------------
# 2. Cross-Project Isolation
# ---------------------------------------------------------------------------


class TestCrossProjectIsolation:
    """Ensure resources in one project are not accessible from another."""

    async def test_cross_project_agent_read_denied(self, seeded_session: AsyncSession):
        """Agent in Project A is invisible from Project B."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        # NO_ACCESS is admin on Project B but has no access to Project A
        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_B_ID}/agents/{agent_id}")
            assert resp.status_code == 404

    async def test_cross_project_list_isolation(self, seeded_session: AsyncSession):
        """Agents created in Project A don't appear in Project B list."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201

        # List Project B — should be empty
        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_B_ID}/agents")
            assert resp.status_code == 200
            assert len(resp.json()) == 0

    async def test_cross_project_update_denied(self, seeded_session: AsyncSession):
        """Admin on Project B cannot update agent in Project A."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_B_ID}/agents/{agent_id}",
                json={"name": "Hacked"},
            )
            assert resp.status_code == 404

    async def test_cross_project_delete_denied(self, seeded_session: AsyncSession):
        """Admin on Project B cannot delete agent in Project A."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_B_ID}/agents/{agent_id}")
            assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. Cross-Workspace Isolation
# ---------------------------------------------------------------------------


class TestCrossWorkspaceIsolation:
    """Users from one workspace cannot access projects in another workspace."""

    async def test_outsider_cannot_access_project(self, seeded_session: AsyncSession):
        """User in workspace B cannot access project in workspace A."""
        async with _client_factory(seeded_session, OUTSIDER) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/agents")
            # Outsider has no workspace membership in WORKSPACE_ID, so require_project_role
            # will fail at the workspace membership check → 404
            assert resp.status_code == 404

    async def test_outsider_cannot_create_in_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, OUTSIDER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 4. Project CRUD Tests
# ---------------------------------------------------------------------------


class TestProjectCRUD:
    """Test project create/list/get/update/delete operations."""

    async def test_owner_can_create_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                "/api/v1/projects",
                json={"name": "New Project", "description": "A test project"},
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["name"] == "New Project"
            assert data["description"] == "A test project"
            assert data["slug"]  # auto-generated slug
            assert data["is_default"] is False

    async def test_non_owner_cannot_create_project(self, seeded_session: AsyncSession):
        """Only workspace owners can create projects."""
        for user in [ADMIN, CONTRIBUTOR, READER]:
            async with _client_factory(seeded_session, user) as client:
                resp = await client.post(
                    "/api/v1/projects",
                    json={"name": f"Forbidden Project by {user.email}"},
                )
                assert resp.status_code == 403, f"{user.email} should get 403"

    async def test_list_projects_owner_sees_all(self, seeded_session: AsyncSession):
        """Workspace owner sees all projects."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.get("/api/v1/projects")
            assert resp.status_code == 200
            projects = resp.json()
            slugs = {p["slug"] for p in projects}
            assert "project-a" in slugs
            assert "project-b" in slugs

    async def test_list_projects_member_sees_own(self, seeded_session: AsyncSession):
        """Regular member only sees projects where they have membership."""
        # READER only has access to Project A, not Project B
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.get("/api/v1/projects")
            assert resp.status_code == 200
            projects = resp.json()
            slugs = {p["slug"] for p in projects}
            assert "project-a" in slugs
            # Reader is NOT a member of project B
            assert "project-b" not in slugs

    async def test_get_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}")
            assert resp.status_code == 200
            assert resp.json()["name"] == "Project A"

    async def test_admin_can_update_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}",
                json={"description": "Updated by admin"},
            )
            assert resp.status_code == 200
            assert resp.json()["description"] == "Updated by admin"

    async def test_contributor_cannot_update_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, CONTRIBUTOR) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}",
                json={"description": "Forbidden update"},
            )
            assert resp.status_code == 403

    async def test_reader_cannot_update_project(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}",
                json={"description": "Forbidden update"},
            )
            assert resp.status_code == 403

    async def test_cannot_delete_default_project(self, seeded_session: AsyncSession):
        """Default project cannot be deleted even by owner."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.delete(
                f"/api/v1/projects/{PROJECT_ID}?action=delete_resources"
            )
            assert resp.status_code == 400

    async def test_non_owner_cannot_delete_project(self, seeded_session: AsyncSession):
        """Only workspace owners can delete projects."""
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_B_ID}")
            assert resp.status_code == 403

    async def test_owner_can_create_and_auto_membership(self, seeded_session: AsyncSession):
        """Creating a project auto-creates admin membership for all workspace owners."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                "/api/v1/projects",
                json={"name": "Auto Membership Test"},
            )
            assert resp.status_code == 201
            new_project_id = resp.json()["id"]

        # Verify owner has admin membership on the new project
        pm = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.project_id == uuid.UUID(new_project_id),
                ProjectMembershipModel.user_id == OWNER_USER_ID,
            )
        )
        membership = pm.scalar_one_or_none()
        assert membership is not None
        assert membership.role == "admin"


# ---------------------------------------------------------------------------
# 5. Project Member Management
# ---------------------------------------------------------------------------


class TestProjectMemberManagement:
    """Test project member CRUD operations and role constraints."""

    async def test_any_member_can_list_members(self, seeded_session: AsyncSession):
        """Even readers can view the project member list."""
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] >= 4  # owner, admin, contributor, reader

    async def test_admin_can_add_member(self, seeded_session: AsyncSession):
        """Project admin can add a workspace member to the project."""
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            assert resp.status_code == 201
            assert resp.json()["role"] == "reader"

    async def test_contributor_cannot_add_member(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, CONTRIBUTOR) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            assert resp.status_code == 403

    async def test_reader_cannot_add_member(self, seeded_session: AsyncSession):
        async with _client_factory(seeded_session, READER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            assert resp.status_code == 403

    async def test_project_admin_cannot_grant_admin(self, seeded_session: AsyncSession):
        """Project admins can only assign contributor/reader, not admin."""
        async with _client_factory(seeded_session, ADMIN) as client:
            # Add user first
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            # Could be 201 (new) or 409 (already exists from another test)
            if resp.status_code == 201:
                membership_id = resp.json()["id"]
            else:
                list_resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
                members = list_resp.json()["members"]
                membership_id = next(
                    m["id"] for m in members if m["user_id"] == str(NO_ACCESS_USER_ID)
                )

            # Try to promote to admin → should fail for non-owner admin
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}/members/{membership_id}",
                json={"role": "admin"},
            )
            assert resp.status_code == 403

    async def test_workspace_owner_can_grant_admin(self, seeded_session: AsyncSession):
        """Workspace owners can assign any role including admin."""
        async with _client_factory(seeded_session, OWNER) as client:
            # Add user as reader first
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            if resp.status_code == 201:
                membership_id = resp.json()["id"]
            else:
                list_resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
                members = list_resp.json()["members"]
                membership_id = next(
                    m["id"] for m in members if m["user_id"] == str(NO_ACCESS_USER_ID)
                )

            # Promote to admin → should succeed for workspace owner
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}/members/{membership_id}",
                json={"role": "admin"},
            )
            assert resp.status_code == 200
            assert resp.json()["role"] == "admin"

    async def test_cannot_remove_workspace_owner_from_project(self, seeded_session: AsyncSession):
        """Workspace owners cannot be removed from projects."""
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
            members = resp.json()["members"]
            owner_pm = next(
                (m for m in members if m["user_id"] == str(OWNER_USER_ID)), None
            )
            assert owner_pm is not None

            resp = await client.delete(
                f"/api/v1/projects/{PROJECT_ID}/members/{owner_pm['id']}"
            )
            assert resp.status_code == 400

    async def test_admin_can_remove_non_owner_member(self, seeded_session: AsyncSession):
        """Admin can remove contributor/reader from project."""
        async with _client_factory(seeded_session, ADMIN) as client:
            # First add the user
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            if resp.status_code == 201:
                membership_id = resp.json()["id"]
            else:
                list_resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
                members = list_resp.json()["members"]
                membership_id = next(
                    m["id"] for m in members if m["user_id"] == str(NO_ACCESS_USER_ID)
                )

            # Remove
            resp = await client.delete(
                f"/api/v1/projects/{PROJECT_ID}/members/{membership_id}"
            )
            assert resp.status_code == 204

    async def test_duplicate_member_returns_409(self, seeded_session: AsyncSession):
        """Adding a user who is already a project member returns 409."""
        async with _client_factory(seeded_session, OWNER) as client:
            # READER_USER_ID is already in Project A
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(READER_USER_ID), "role": "contributor"},
            )
            assert resp.status_code == 409

    async def test_no_access_user_cannot_list_members(self, seeded_session: AsyncSession):
        """User without project access cannot list members."""
        async with _client_factory(seeded_session, NO_ACCESS) as client:
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
            assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 6. Workspace Member Management with Project Assignments
# ---------------------------------------------------------------------------


class TestWorkspaceMemberManagement:
    """Test workspace invitation and member flows with project pre-assignments."""

    async def test_owner_can_invite_with_project_assignments(self, seeded_session: AsyncSession):
        """Owner invites a new email with pre-assigned project roles."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={
                    "email": "newuser@test.com",
                    "is_owner": False,
                    "project_assignments": [
                        {"project_id": str(PROJECT_ID), "role": "contributor"},
                        {"project_id": str(PROJECT_B_ID), "role": "reader"},
                    ],
                },
            )
            assert resp.status_code == 201

    async def test_non_owner_cannot_invite(self, seeded_session: AsyncSession):
        """Non-owners cannot invite to workspace."""
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={"email": "blocked@test.com", "is_owner": False},
            )
            assert resp.status_code == 403

    async def test_duplicate_invitation_returns_409(self, seeded_session: AsyncSession):
        """Inviting an email that already has a pending invitation returns 409."""
        async with _client_factory(seeded_session, OWNER) as client:
            # First invitation
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={"email": "dup@test.com", "is_owner": False},
            )
            assert resp.status_code == 201

            # Duplicate
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={"email": "dup@test.com", "is_owner": False},
            )
            assert resp.status_code == 409

    async def test_remove_member_cascades_project_memberships(
        self, seeded_session: AsyncSession
    ):
        """Removing a workspace member removes all their project memberships and bumps session_version."""
        # First verify contributor has project membership
        pm_result = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == CONTRIBUTOR_USER_ID,
                ProjectMembershipModel.project_id == PROJECT_ID,
            )
        )
        assert pm_result.scalar_one_or_none() is not None

        # Get contributor's session_version
        contrib_user = await seeded_session.get(UserModel, CONTRIBUTOR_USER_ID)
        original_version = contrib_user.session_version

        # Find contributor's workspace membership
        ms_result = await seeded_session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == CONTRIBUTOR_USER_ID,
                MembershipModel.workspace_id == WORKSPACE_ID,
            )
        )
        ws_membership = ms_result.scalar_one()

        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.delete(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members/{ws_membership.id}"
            )
            assert resp.status_code == 204

        # Project memberships should be gone
        pm_result = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == CONTRIBUTOR_USER_ID,
            )
        )
        assert pm_result.scalars().all() == []

        # Session version should be bumped
        await seeded_session.refresh(contrib_user)
        assert contrib_user.session_version > original_version

    async def test_cannot_remove_last_workspace_owner(self, seeded_session: AsyncSession):
        """Cannot remove the only workspace owner."""
        ms_result = await seeded_session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == OWNER_USER_ID,
                MembershipModel.workspace_id == WORKSPACE_ID,
            )
        )
        owner_membership = ms_result.scalar_one()

        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.delete(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members/{owner_membership.id}"
            )
            assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 7. Session Invalidation
# ---------------------------------------------------------------------------


class TestSessionInvalidation:
    """Test that session_version bumps on role change/removal."""

    async def test_session_version_bumps_on_role_change(self, seeded_session: AsyncSession):
        """Changing a user's project role bumps their session_version."""
        contrib_user = await seeded_session.get(UserModel, CONTRIBUTOR_USER_ID)
        original_version = contrib_user.session_version

        async with _client_factory(seeded_session, ADMIN) as client:
            # Find contributor's project membership
            resp = await client.get(f"/api/v1/projects/{PROJECT_ID}/members")
            members = resp.json()["members"]
            contrib_pm = next(
                m for m in members if m["user_id"] == str(CONTRIBUTOR_USER_ID)
            )

            # Demote to reader
            resp = await client.patch(
                f"/api/v1/projects/{PROJECT_ID}/members/{contrib_pm['id']}",
                json={"role": "reader"},
            )
            assert resp.status_code == 200

        await seeded_session.refresh(contrib_user)
        assert contrib_user.session_version > original_version

    async def test_session_version_bumps_on_project_removal(self, seeded_session: AsyncSession):
        """Removing a user from a project bumps their session_version."""
        # First add NO_ACCESS to Project A so we can remove them
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/members",
                json={"user_id": str(NO_ACCESS_USER_ID), "role": "reader"},
            )
            assert resp.status_code == 201
            membership_id = resp.json()["id"]

        no_access_user = await seeded_session.get(UserModel, NO_ACCESS_USER_ID)
        original_version = no_access_user.session_version

        # Remove from project
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.delete(
                f"/api/v1/projects/{PROJECT_ID}/members/{membership_id}"
            )
            assert resp.status_code == 204

        await seeded_session.refresh(no_access_user)
        assert no_access_user.session_version > original_version


# ---------------------------------------------------------------------------
# 8. Project Deletion Two-Step Flow
# ---------------------------------------------------------------------------


class TestProjectDeletion:
    """Test the two-step project deletion flow."""

    async def test_delete_info_returns_resource_counts(self, seeded_session: AsyncSession):
        """Step 1: DELETE without action returns resource counts."""
        # Create an agent in Project B
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_B_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201

            # Step 1: get deletion info
            resp = await client.delete(f"/api/v1/projects/{PROJECT_B_ID}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total_resources"] >= 1
            assert "agents" in data["resource_counts"]

    async def test_delete_with_delete_resources(self, seeded_session: AsyncSession):
        """Step 2: DELETE with action=delete_resources removes project and resources."""
        # Create a fresh non-default project
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                "/api/v1/projects",
                json={"name": "Doomed Project"},
            )
            assert resp.status_code == 201
            doomed_id = resp.json()["id"]

            # Create an agent in it
            resp = await client.post(
                f"/api/v1/projects/{doomed_id}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201

            # Delete with action
            resp = await client.delete(f"/api/v1/projects/{doomed_id}?action=delete_resources")
            assert resp.status_code == 204

            # Verify project is gone
            resp = await client.get(f"/api/v1/projects/{doomed_id}")
            assert resp.status_code == 404

    async def test_cannot_delete_default_project(self, seeded_session: AsyncSession):
        """Default project cannot be deleted."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.delete(
                f"/api/v1/projects/{PROJECT_ID}?action=delete_resources"
            )
            assert resp.status_code == 400

    async def test_non_owner_cannot_delete_project(self, seeded_session: AsyncSession):
        """Only workspace owners can delete projects."""
        async with _client_factory(seeded_session, ADMIN) as client:
            resp = await client.delete(f"/api/v1/projects/{PROJECT_B_ID}")
            assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 9. Invitation Acceptance with Project Assignments
# ---------------------------------------------------------------------------


class TestInvitationAcceptance:
    """Test the invitation acceptance flow materializing project memberships.

    The invite endpoint has two paths:
    1. User exists in system → MembershipModel created directly (no invitation)
    2. User doesn't exist → InvitationModel created → user signs up → accepts

    Test both paths.
    """

    async def test_invite_existing_user_creates_membership_directly(
        self, seeded_session: AsyncSession
    ):
        """Inviting an existing user creates membership + project memberships immediately."""
        new_user_id = uuid.uuid4()
        new_email = "existing-invite@test.com"

        # Create user in DB (exists in system but not in workspace)
        new_user = UserModel(id=new_user_id, email=new_email, provider="local")
        seeded_session.add(new_user)
        await seeded_session.flush()

        # Owner invites with project assignments
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={
                    "email": new_email,
                    "is_owner": False,
                    "project_assignments": [
                        {"project_id": str(PROJECT_ID), "role": "contributor"},
                    ],
                },
            )
            assert resp.status_code == 201

        # Verify workspace membership created directly (no invitation needed)
        ms_result = await seeded_session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == new_user_id,
                MembershipModel.workspace_id == WORKSPACE_ID,
            )
        )
        assert ms_result.scalar_one_or_none() is not None

        # Verify project membership was created with correct role
        pm_result = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == new_user_id,
                ProjectMembershipModel.project_id == PROJECT_ID,
            )
        )
        pm = pm_result.scalar_one_or_none()
        assert pm is not None
        assert pm.role == "contributor"

    async def test_invite_existing_user_auto_adds_to_default_project(
        self, seeded_session: AsyncSession
    ):
        """Inviting an existing user with only Project B assignment also auto-adds reader on default."""
        new_user_id = uuid.uuid4()
        new_email = "auto-default@test.com"

        new_user = UserModel(id=new_user_id, email=new_email, provider="local")
        seeded_session.add(new_user)
        await seeded_session.flush()

        # Invite with assignment only on Project B (not the default)
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={
                    "email": new_email,
                    "is_owner": False,
                    "project_assignments": [
                        {"project_id": str(PROJECT_B_ID), "role": "contributor"},
                    ],
                },
            )
            assert resp.status_code == 201

        # Verify auto-added as reader on default project (Project A)
        pm_result = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == new_user_id,
                ProjectMembershipModel.project_id == PROJECT_ID,
            )
        )
        pm = pm_result.scalar_one_or_none()
        assert pm is not None
        assert pm.role == "reader"

        # And contributor on Project B from explicit assignment
        pm_result = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == new_user_id,
                ProjectMembershipModel.project_id == PROJECT_B_ID,
            )
        )
        pm = pm_result.scalar_one_or_none()
        assert pm is not None
        assert pm.role == "contributor"

    async def test_accept_invitation_for_nonexistent_user(
        self, seeded_session: AsyncSession
    ):
        """When user doesn't exist at invite time, invitation is created. After signup, accept works."""
        from app.infrastructure.db.models.invitation_project import (
            InvitationProjectModel,
        )

        nonexistent_email = "not-yet-signed-up@test.com"

        # Owner invites a non-existent user → creates InvitationModel
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={
                    "email": nonexistent_email,
                    "is_owner": False,
                    "project_assignments": [
                        {"project_id": str(PROJECT_ID), "role": "contributor"},
                        {"project_id": str(PROJECT_B_ID), "role": "reader"},
                    ],
                },
            )
            assert resp.status_code == 201

        # Verify invitation was created (not a membership, since user doesn't exist)
        inv_result = await seeded_session.execute(
            select(InvitationModel).where(
                InvitationModel.email == nonexistent_email,
                InvitationModel.workspace_id == WORKSPACE_ID,
            )
        )
        invitation = inv_result.scalar_one_or_none()
        assert invitation is not None

        # Verify invitation project assignments were stored
        ip_result = await seeded_session.execute(
            select(InvitationProjectModel).where(
                InvitationProjectModel.invitation_id == invitation.id,
            )
        )
        ip_rows = ip_result.scalars().all()
        assert len(ip_rows) == 2

        # Now simulate user signs up (create user in DB)
        new_user_id = uuid.uuid4()
        new_user = UserModel(id=new_user_id, email=nonexistent_email, provider="local")
        seeded_session.add(new_user)
        await seeded_session.flush()

        # User accepts the invitation
        new_user_cu = _make_user(new_user_id, nonexistent_email)
        async with _client_factory(seeded_session, new_user_cu) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/accept-invitation"
            )
            assert resp.status_code == 201

        # Verify workspace membership
        ms_result = await seeded_session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == new_user_id,
                MembershipModel.workspace_id == WORKSPACE_ID,
            )
        )
        assert ms_result.scalar_one_or_none() is not None

        # Verify project memberships materialized from invitation
        pm_a = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == new_user_id,
                ProjectMembershipModel.project_id == PROJECT_ID,
            )
        )
        pm = pm_a.scalar_one_or_none()
        assert pm is not None
        assert pm.role == "contributor"

        pm_b = await seeded_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.user_id == new_user_id,
                ProjectMembershipModel.project_id == PROJECT_B_ID,
            )
        )
        pm = pm_b.scalar_one_or_none()
        assert pm is not None
        assert pm.role == "reader"

        # Verify invitation was deleted
        inv_result = await seeded_session.execute(
            select(InvitationModel).where(
                InvitationModel.email == nonexistent_email,
                InvitationModel.workspace_id == WORKSPACE_ID,
            )
        )
        assert inv_result.scalar_one_or_none() is None

    async def test_invite_owner_gets_admin_on_all_projects(
        self, seeded_session: AsyncSession
    ):
        """Inviting a user as workspace owner auto-creates admin on all projects."""
        new_user_id = uuid.uuid4()
        new_email = "new-owner@test.com"

        new_user = UserModel(id=new_user_id, email=new_email, provider="local")
        seeded_session.add(new_user)
        await seeded_session.flush()

        # Invite as owner with no explicit project assignments
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members",
                json={"email": new_email, "is_owner": True},
            )
            assert resp.status_code == 201

        # Verify admin on all projects (both A and B)
        for project_id in [PROJECT_ID, PROJECT_B_ID]:
            pm_result = await seeded_session.execute(
                select(ProjectMembershipModel).where(
                    ProjectMembershipModel.user_id == new_user_id,
                    ProjectMembershipModel.project_id == project_id,
                )
            )
            pm = pm_result.scalar_one_or_none()
            assert pm is not None, f"Expected admin membership on project {project_id}"
            assert pm.role == "admin"


# ---------------------------------------------------------------------------
# 10. Dual FK Defense-in-Depth
# ---------------------------------------------------------------------------


class TestDualFKIntegrity:
    """Test that resources have both workspace_id and project_id correctly set."""

    async def test_created_agent_has_both_fks(self, seeded_session: AsyncSession):
        """Agent created via API has both workspace_id and project_id."""
        async with _client_factory(seeded_session, OWNER) as client:
            resp = await client.post(
                f"/api/v1/projects/{PROJECT_ID}/agents", json=AGENT_PAYLOAD,
            )
            assert resp.status_code == 201
            agent_id = resp.json()["id"]

        # Verify in DB
        agent = await seeded_session.get(ManagedAgentModel, uuid.UUID(agent_id))
        assert agent is not None
        assert agent.workspace_id == WORKSPACE_ID
        assert agent.project_id == PROJECT_ID
