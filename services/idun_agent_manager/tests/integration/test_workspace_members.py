"""Integration tests for Workspace Member management (invite, accept, remove, promote/demote)."""

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
async def member_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


# ---------------------------------------------------------------------------
# Invite Existing User
# ---------------------------------------------------------------------------


class TestInviteExistingUser:
    async def test_owner_invites_existing_user_as_member(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@inv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "exist@inv.com", name="Exist")
        resp_data = await invite_existing_user(owner_client, ws_id, "exist@inv.com")
        assert "user_id" in resp_data  # MemberRead (not InvitationRead)
        assert resp_data["is_owner"] is False

    async def test_owner_invites_existing_user_as_owner(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner2@inv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "coowner@inv.com", name="CoOwner")
        resp_data = await invite_existing_user(
            owner_client, ws_id, "coowner@inv.com", is_owner=True
        )
        assert resp_data["is_owner"] is True

    async def test_owner_invites_with_project_assignments(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner3@inv.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "assigned@inv.com", name="Assigned")
        resp_data = await invite_existing_user(
            owner_client,
            ws_id,
            "assigned@inv.com",
            project_assignments=[{"project_id": pid, "role": "contributor"}],
        )
        assert resp_data["user_id"] is not None

        # Verify they can see the project
        await refresh_session(member_client)
        proj_resp = await member_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) == 1

    async def test_non_owner_cannot_invite(
        self,
        owner_client: AsyncClient,
        member_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner4@inv.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "mem@inv.com", name="Mem")
        await invite_existing_user(owner_client, ws_id, "mem@inv.com")
        await refresh_session(member_client)

        # Create a third user to invite
        third = await make_client(db_session)
        try:
            await signup_and_login(third, "third@inv.com", name="Third")

            resp = await member_client.post(
                f"/api/v1/workspaces/{ws_id}/members",
                json={"email": "third@inv.com"},
            )
            assert resp.status_code == 403
        finally:
            await third.aclose()

    async def test_duplicate_membership_rejected(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner5@inv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "dup@inv.com", name="Dup")
        await invite_existing_user(owner_client, ws_id, "dup@inv.com")

        # Try again
        resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "dup@inv.com"},
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Invite Non-Existing User (Pending Invitation)
# ---------------------------------------------------------------------------


class TestInviteNewUser:
    async def test_owner_invites_nonexistent_email(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner@newinv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "future@newinv.com"},
        )
        assert resp.status_code == 201
        data = resp.json()
        # Should be InvitationRead (has "email" but no "user_id")
        assert data["email"] == "future@newinv.com"
        assert "id" in data

    async def test_invitation_with_project_assignments_stored(
        self, owner_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@stored.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={
                "email": "stored@newinv.com",
                "project_assignments": [{"project_id": pid, "role": "reader"}],
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data.get("project_assignments", [])) == 1
        assert data["project_assignments"][0]["project_id"] == pid

    async def test_duplicate_invitation_rejected(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner@dupinv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "dupfuture@newinv.com"},
        )

        resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "dupfuture@newinv.com"},
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Accept Invitation
# ---------------------------------------------------------------------------


class TestAcceptInvitation:
    async def test_user_accepts_pending_invitation(
        self, owner_client: AsyncClient, member_client: AsyncClient, db_session
    ):
        """Create invitation via DB (simulating edge case), then accept via API."""
        from uuid import uuid4

        from app.infrastructure.db.models.invitation import InvitationModel

        await signup_and_login(owner_client, "owner@accept.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # User signs up first (no invitation exists yet)
        await signup_and_login(member_client, "accepter@accept.com", name="Accepter")

        # Create invitation directly in DB (simulates invitation created
        # after user signup, e.g. via admin panel or external system)
        from uuid import UUID

        inv = InvitationModel(
            id=uuid4(),
            workspace_id=UUID(ws_id),
            email="accepter@accept.com",
            is_owner=False,
        )
        db_session.add(inv)
        await db_session.flush()

        # User accepts the invitation
        resp = await member_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 201
        assert resp.json()["is_owner"] is False

    async def test_accept_materialises_project_assignments(
        self, owner_client: AsyncClient, member_client: AsyncClient, db_session
    ):
        """Accept invitation with project assignments creates ProjectMembership rows."""
        from uuid import UUID, uuid4

        from app.infrastructure.db.models.invitation import InvitationModel
        from app.infrastructure.db.models.invitation_project import (
            InvitationProjectModel,
        )

        await signup_and_login(owner_client, "owner@mat.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "matuser@mat.com", name="Mat")

        # Create invitation + project assignment directly in DB
        inv_id = uuid4()
        inv = InvitationModel(
            id=inv_id,
            workspace_id=UUID(ws_id),
            email="matuser@mat.com",
            is_owner=False,
        )
        db_session.add(inv)
        await db_session.flush()

        ip = InvitationProjectModel(
            id=uuid4(),
            invitation_id=inv_id,
            project_id=UUID(pid),
            role="contributor",
        )
        db_session.add(ip)
        await db_session.flush()

        resp = await member_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 201

        # Verify project access
        await refresh_session(member_client)
        proj_resp = await member_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) == 1

    async def test_accept_owner_invitation_no_project_rows(
        self, owner_client: AsyncClient, member_client: AsyncClient, db_session
    ):
        """Owner invitation → accept → implicit admin on all projects."""
        from uuid import UUID, uuid4

        from app.infrastructure.db.models.invitation import InvitationModel

        await signup_and_login(owner_client, "owner@ownaccept.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(
            member_client, "ownaccepter@ownaccept.com", name="OwnAccepter"
        )

        inv = InvitationModel(
            id=uuid4(),
            workspace_id=UUID(ws_id),
            email="ownaccepter@ownaccept.com",
            is_owner=True,
        )
        db_session.add(inv)
        await db_session.flush()

        resp = await member_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 201
        assert resp.json()["is_owner"] is True

        # Owner should see all projects (implicit admin)
        await refresh_session(member_client)
        proj_resp = await member_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) >= 1

    async def test_accept_when_already_member_returns_409(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@alrmem.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "alrmem@alrmem.com", name="AlrMem")
        await invite_existing_user(owner_client, ws_id, "alrmem@alrmem.com")
        await refresh_session(member_client)

        # Already a member, try to accept
        resp = await member_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 409

    async def test_accept_without_invitation_returns_404(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@noinv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "noinv@noinv.com", name="NoInv")

        resp = await member_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Cancel Invitation
# ---------------------------------------------------------------------------


class TestCancelInvitation:
    async def test_owner_cancels_pending_invitation(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner@cancel.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        inv_resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "cancelled@cancel.com"},
        )
        inv_id = inv_resp.json()["id"]

        resp = await owner_client.delete(
            f"/api/v1/workspaces/{ws_id}/invitations/{inv_id}",
        )
        assert resp.status_code == 204

    async def test_non_owner_cannot_cancel_invitation(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@ncancel.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "mem@ncancel.com", name="Mem")
        await invite_existing_user(owner_client, ws_id, "mem@ncancel.com")
        await refresh_session(member_client)

        inv_resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "victim@ncancel.com"},
        )
        inv_id = inv_resp.json()["id"]

        resp = await member_client.delete(
            f"/api/v1/workspaces/{ws_id}/invitations/{inv_id}",
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Remove Member
# ---------------------------------------------------------------------------


class TestRemoveMember:
    async def test_owner_removes_member(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@rm.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "removeme@rm.com", name="RemoveMe")
        mem_data = await invite_existing_user(owner_client, ws_id, "removeme@rm.com")
        mem_id = mem_data["id"]

        resp = await owner_client.delete(
            f"/api/v1/workspaces/{ws_id}/members/{mem_id}",
        )
        assert resp.status_code == 204

    async def test_cannot_remove_last_owner(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner@lastowner.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        # Get owner's membership id
        members_resp = await owner_client.get(
            f"/api/v1/workspaces/{ws_id}/members",
        )
        owner_mem = next(
            m for m in members_resp.json()["members"] if m["is_owner"]
        )

        resp = await owner_client.delete(
            f"/api/v1/workspaces/{ws_id}/members/{owner_mem['id']}",
        )
        assert resp.status_code == 400
        assert "last" in resp.json()["detail"].lower()

    async def test_non_owner_cannot_remove_member(
        self,
        owner_client: AsyncClient,
        member_client: AsyncClient,
        db_session: AsyncSession,
    ):
        await signup_and_login(owner_client, "owner@nrm.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "mem1@nrm.com", name="Mem1")
        await invite_existing_user(owner_client, ws_id, "mem1@nrm.com")
        await refresh_session(member_client)

        # Create another member
        other = await make_client(db_session)
        try:
            await signup_and_login(other, "mem2@nrm.com", name="Mem2")
            mem2_data = await invite_existing_user(owner_client, ws_id, "mem2@nrm.com")

            # mem1 tries to remove mem2
            resp = await member_client.delete(
                f"/api/v1/workspaces/{ws_id}/members/{mem2_data['id']}",
            )
            assert resp.status_code == 403
        finally:
            await other.aclose()

    async def test_remove_member_cascades_project_memberships(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@cascade.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "cascade@cascade.com", name="Cascade")
        mem_data = await invite_existing_user(
            owner_client,
            ws_id,
            "cascade@cascade.com",
            project_assignments=[{"project_id": pid, "role": "contributor"}],
        )

        # Remove member
        resp = await owner_client.delete(
            f"/api/v1/workspaces/{ws_id}/members/{mem_data['id']}",
        )
        assert resp.status_code == 204

        # Verify project membership was also removed by listing members
        pm_resp = await owner_client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"X-Workspace-Id": ws_id},
        )
        assert pm_resp.status_code == 200
        user_ids = [m["user_id"] for m in pm_resp.json()["members"]]
        assert mem_data["user_id"] not in user_ids


# ---------------------------------------------------------------------------
# Promote / Demote
# ---------------------------------------------------------------------------


class TestPromoteDemote:
    async def test_promote_member_to_owner(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@promo.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "promo@promo.com", name="Promo")
        mem_data = await invite_existing_user(
            owner_client,
            ws_id,
            "promo@promo.com",
            project_assignments=[{"project_id": pid, "role": "reader"}],
        )

        resp = await owner_client.patch(
            f"/api/v1/workspaces/{ws_id}/members/{mem_data['id']}",
            json={"is_owner": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_owner"] is True

    async def test_demote_owner_to_member(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@demote.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Add a second owner
        await signup_and_login(member_client, "demote@demote.com", name="Demote")
        mem_data = await invite_existing_user(
            owner_client, ws_id, "demote@demote.com", is_owner=True
        )

        # Demote the second owner
        resp = await owner_client.patch(
            f"/api/v1/workspaces/{ws_id}/members/{mem_data['id']}",
            json={"is_owner": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_owner"] is False

        # Demoted user should now have project memberships as admin
        await refresh_session(member_client)
        proj_resp = await member_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) >= 1

    async def test_cannot_demote_last_owner(self, owner_client: AsyncClient):
        await signup_and_login(owner_client, "owner@lastdemote.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        members_resp = await owner_client.get(
            f"/api/v1/workspaces/{ws_id}/members",
        )
        owner_mem = next(
            m for m in members_resp.json()["members"] if m["is_owner"]
        )

        resp = await owner_client.patch(
            f"/api/v1/workspaces/{ws_id}/members/{owner_mem['id']}",
            json={"is_owner": False},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# List Members
# ---------------------------------------------------------------------------


class TestListMembers:
    async def test_any_member_can_list_members(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@list.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "lister@list.com", name="Lister")
        await invite_existing_user(owner_client, ws_id, "lister@list.com")
        await refresh_session(member_client)

        resp = await member_client.get(
            f"/api/v1/workspaces/{ws_id}/members",
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    async def test_list_includes_pending_invitations(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        await signup_and_login(owner_client, "owner@listinv.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        await signup_and_login(member_client, "listmem@listinv.com", name="ListMem")
        await invite_existing_user(owner_client, ws_id, "listmem@listinv.com")
        await refresh_session(member_client)

        # Create a pending invitation
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "pending@listinv.com"},
        )

        resp = await member_client.get(
            f"/api/v1/workspaces/{ws_id}/members",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["invitations"]) == 1
        assert data["invitations"][0]["email"] == "pending@listinv.com"


# ---------------------------------------------------------------------------
# Leave Workspace
# ---------------------------------------------------------------------------


class TestLeaveWorkspace:
    async def test_non_owner_can_leave_workspace(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        """Non-owner member can leave a workspace voluntarily."""
        await signup_and_login(owner_client, "owner@leave.com", name="Owner")
        ws_id, _ = await create_workspace_with_project(owner_client, "Leave WS")

        await signup_and_login(member_client, "leaver@leave.com", name="Leaver")
        await invite_existing_user(owner_client, ws_id, "leaver@leave.com")
        await refresh_session(member_client)

        resp = await member_client.post(f"/api/v1/workspaces/{ws_id}/leave")
        assert resp.status_code == 204

        # Verify no longer a member
        await refresh_session(member_client)
        me = await member_client.get("/api/v1/auth/me")
        assert ws_id not in me.json()["session"]["principal"].get("workspace_ids", [])

    async def test_sole_owner_cannot_leave(
        self, owner_client: AsyncClient
    ):
        """Sole owner cannot leave their own workspace."""
        await signup_and_login(owner_client, "solo@leave.com", name="Solo")
        ws_id, _ = await create_workspace_with_project(owner_client, "Solo WS")

        resp = await owner_client.post(f"/api/v1/workspaces/{ws_id}/leave")
        assert resp.status_code == 400

    async def test_non_member_cannot_leave(
        self, owner_client: AsyncClient, member_client: AsyncClient
    ):
        """Non-member gets 404 when trying to leave."""
        await signup_and_login(owner_client, "owner2@leave.com", name="Owner")
        ws_id, _ = await create_workspace_with_project(owner_client, "Other WS")

        await signup_and_login(member_client, "stranger@leave.com", name="Stranger")

        resp = await member_client.post(f"/api/v1/workspaces/{ws_id}/leave")
        assert resp.status_code == 404
