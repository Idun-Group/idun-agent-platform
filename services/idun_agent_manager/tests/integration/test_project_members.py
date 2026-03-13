"""Integration tests for Project Member management."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import (
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
async def admin_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def contributor_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def reader_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


async def _setup_with_roles(
    owner_client, admin_client, contributor_client, reader_client, ws_id, pid
):
    """Invite admin, contributor, reader to the project. Returns their user_ids."""
    await signup_and_login(admin_client, "admin@test.com", name="Admin")
    admin_data = await invite_existing_user(
        owner_client,
        ws_id,
        "admin@test.com",
        project_assignments=[{"project_id": pid, "role": "admin"}],
    )
    await refresh_session(admin_client)

    await signup_and_login(contributor_client, "contributor@test.com", name="Contrib")
    contrib_data = await invite_existing_user(
        owner_client,
        ws_id,
        "contributor@test.com",
        project_assignments=[{"project_id": pid, "role": "contributor"}],
    )
    await refresh_session(contributor_client)

    await signup_and_login(reader_client, "reader@test.com", name="Reader")
    reader_data = await invite_existing_user(
        owner_client,
        ws_id,
        "reader@test.com",
        project_assignments=[{"project_id": pid, "role": "reader"}],
    )
    await refresh_session(reader_client)

    return admin_data["user_id"], contrib_data["user_id"], reader_data["user_id"]


# ---------------------------------------------------------------------------
# Add Member
# ---------------------------------------------------------------------------


class TestAddProjectMember:
    async def test_owner_can_add_member_to_project(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner_add@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Create a new project to add to
        resp = await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Project B"},
            headers={"X-Workspace-Id": ws_id},
        )
        pid_b = resp.json()["id"]

        # Invite a user as workspace member
        await signup_and_login(admin_client, "target@test.com", name="Target")
        member_data = await invite_existing_user(
            owner_client, ws_id, "target@test.com"
        )
        target_user_id = member_data["user_id"]

        # Owner adds target to project B
        resp = await owner_client.post(
            f"/api/v1/projects/{pid_b}/members",
            json={"user_id": target_user_id, "role": "contributor"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 201
        assert resp.json()["role"] == "contributor"

    async def test_project_admin_can_add_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner_padmin@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        # Create a new workspace member to add to project
        new_member = await make_client(db_session)
        try:
            await signup_and_login(new_member, "newbie@test.com", name="Newbie")
            nm_data = await invite_existing_user(
                owner_client, ws_id, "newbie@test.com"
            )

            # Admin adds the new member
            resp = await admin_client.post(
                f"/api/v1/projects/{pid}/members",
                json={"user_id": nm_data["user_id"], "role": "reader"},
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 201
        finally:
            await new_member.aclose()

    async def test_contributor_cannot_add_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner_cno@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        new_member = await make_client(db_session)
        try:
            await signup_and_login(new_member, "blocked@test.com", name="Blocked")
            nm_data = await invite_existing_user(
                owner_client, ws_id, "blocked@test.com"
            )

            resp = await contributor_client.post(
                f"/api/v1/projects/{pid}/members",
                json={"user_id": nm_data["user_id"], "role": "reader"},
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 403
        finally:
            await new_member.aclose()

    async def test_reader_cannot_add_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner_rno@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        new_member = await make_client(db_session)
        try:
            await signup_and_login(new_member, "rblocked@test.com", name="RBlocked")
            nm_data = await invite_existing_user(
                owner_client, ws_id, "rblocked@test.com"
            )

            resp = await reader_client.post(
                f"/api/v1/projects/{pid}/members",
                json={"user_id": nm_data["user_id"], "role": "reader"},
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 403
        finally:
            await new_member.aclose()

    async def test_cannot_add_workspace_owner_to_project(
        self, owner_client: AsyncClient, admin_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner_impl@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Get owner's user_id from /me
        me = await owner_client.get("/api/v1/auth/me")
        owner_user_id = me.json()["session"]["principal"]["user_id"]

        resp = await owner_client.post(
            f"/api/v1/projects/{pid}/members",
            json={"user_id": owner_user_id, "role": "admin"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 400
        assert "implicit" in resp.json()["detail"].lower()

    async def test_cannot_add_duplicate_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_dup@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(admin_client, "dupmem@test.com", name="DupMem")
        mem_data = await invite_existing_user(
            owner_client,
            ws_id,
            "dupmem@test.com",
            project_assignments=[{"project_id": pid, "role": "reader"}],
        )

        # Try to add again
        resp = await owner_client.post(
            f"/api/v1/projects/{pid}/members",
            json={"user_id": mem_data["user_id"], "role": "contributor"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 409

    async def test_cannot_add_non_workspace_member(
        self, owner_client: AsyncClient, db_session: AsyncSession
    ):
        await signup_and_login(owner_client, "owner_nws@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Create user who is NOT in the workspace
        outsider = await make_client(db_session)
        try:
            data = await signup_and_login(outsider, "outsider@test.com", name="Out")
            outsider_user_id = data["id"]

            resp = await owner_client.post(
                f"/api/v1/projects/{pid}/members",
                json={"user_id": outsider_user_id, "role": "reader"},
                headers={"X-Workspace-Id": ws_id},
            )
            assert resp.status_code == 404
        finally:
            await outsider.aclose()


# ---------------------------------------------------------------------------
# Update Member Role
# ---------------------------------------------------------------------------


class TestUpdateProjectMemberRole:
    async def _get_project_membership_id(self, client, ws_id, pid, user_id):
        """Get the project membership id for a user."""
        resp = await client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        for m in resp.json()["members"]:
            if m["user_id"] == user_id and not m.get("is_workspace_owner"):
                return m["id"]
        raise ValueError(f"No project membership found for user {user_id}")

    async def test_owner_can_change_member_role(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_role@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            owner_client, ws_id, pid, reader_uid
        )

        resp = await owner_client.patch(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            json={"role": "contributor"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "contributor"

    async def test_project_admin_can_change_member_role(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_arole@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            admin_client, ws_id, pid, reader_uid
        )

        resp = await admin_client.patch(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            json={"role": "admin"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    async def test_contributor_cannot_change_roles(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_cnorole@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            owner_client, ws_id, pid, reader_uid
        )

        resp = await contributor_client.patch(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            json={"role": "admin"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403

    async def test_reader_cannot_change_roles(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_rnorole@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, contrib_uid, _ = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            owner_client, ws_id, pid, contrib_uid
        )

        resp = await reader_client.patch(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            json={"role": "admin"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Remove Member
# ---------------------------------------------------------------------------


class TestRemoveProjectMember:
    async def _get_project_membership_id(self, client, ws_id, pid, user_id):
        resp = await client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        for m in resp.json()["members"]:
            if m["user_id"] == user_id and not m.get("is_workspace_owner"):
                return m["id"]
        raise ValueError(f"No project membership found for user {user_id}")

    async def test_owner_can_remove_project_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_rm@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            owner_client, ws_id, pid, reader_uid
        )

        resp = await owner_client.delete(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 204

    async def test_project_admin_can_remove_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_arm@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            admin_client, ws_id, pid, reader_uid
        )

        resp = await admin_client.delete(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 204

    async def test_contributor_cannot_remove_member(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_crm@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        _, _, reader_uid = await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        mem_id = await self._get_project_membership_id(
            owner_client, ws_id, pid, reader_uid
        )

        resp = await contributor_client.delete(
            f"/api/v1/projects/{pid}/members/{mem_id}",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# List Members
# ---------------------------------------------------------------------------


class TestListProjectMembers:
    async def test_reader_can_list_project_members(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_list@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        resp = await reader_client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Owner (implicit) + admin + contributor + reader = 4
        assert data["total"] == 4

    async def test_workspace_owners_appear_as_implicit_admin(
        self,
        owner_client: AsyncClient,
        admin_client: AsyncClient,
        contributor_client: AsyncClient,
        reader_client: AsyncClient,
    ):
        await signup_and_login(owner_client, "owner_impl2@test.com")
        ws_id, pid = await create_workspace_with_project(owner_client)
        await _setup_with_roles(
            owner_client, admin_client, contributor_client, reader_client, ws_id, pid
        )

        resp = await owner_client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200
        members = resp.json()["members"]
        owner_entries = [m for m in members if m["is_workspace_owner"]]
        assert len(owner_entries) == 1
        assert owner_entries[0]["role"] == "admin"
