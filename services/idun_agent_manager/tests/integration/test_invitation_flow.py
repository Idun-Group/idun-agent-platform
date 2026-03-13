"""Integration tests for end-to-end invitation flows.

Covers invitation creation, signup consumption, accept-invitation materialisation,
and full resource access verification through the invitation pipeline.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import (
    MINIMAL_AGENT_PAYLOAD,
    create_agent_in_project,
    create_workspace_with_project,
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
async def invitee_client(db_session: AsyncSession):
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


# ---------------------------------------------------------------------------
# Signup consumes invitation
# ---------------------------------------------------------------------------


class TestSignupConsumesInvitation:
    async def test_signup_consumes_invitation_and_materialises_projects(
        self, owner_client: AsyncClient, invitee_client: AsyncClient
    ):
        """Invitation with project assignments → signup → workspace + project access."""
        await signup_and_login(owner_client, "owner@flow.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Invite non-existing user with project assignment
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={
                "email": "newuser@flow.com",
                "project_assignments": [{"project_id": pid, "role": "contributor"}],
            },
        )

        # Signup with that email
        data = await signup_and_login(invitee_client, "newuser@flow.com", name="New")

        # Should be in the workspace
        assert ws_id in data["workspace_ids"]

        # Should have project access
        proj_resp = await invitee_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) == 1
        assert proj_resp.json()[0]["id"] == pid

    async def test_signup_with_owner_invitation_no_project_rows(
        self, owner_client: AsyncClient, invitee_client: AsyncClient
    ):
        """Owner invitation → signup → implicit admin, sees all projects."""
        await signup_and_login(owner_client, "owner@ownflow.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Create another project
        await owner_client.post(
            "/api/v1/projects/",
            json={"name": "Extra Project"},
            headers={"X-Workspace-Id": ws_id},
        )

        # Invite as owner
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "newowner@ownflow.com", "is_owner": True},
        )

        data = await signup_and_login(
            invitee_client, "newowner@ownflow.com", name="NewOwner"
        )
        assert ws_id in data["workspace_ids"]

        # Should see all projects (implicit admin)
        proj_resp = await invitee_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) == 2

    async def test_signup_with_multiple_workspace_invitations(
        self, owner_client: AsyncClient, invitee_client: AsyncClient, db_session
    ):
        """User invited to 2 workspaces → signup → both in session."""
        await signup_and_login(owner_client, "owner@multi.com")
        ws_id_1, _ = await create_workspace_with_project(owner_client, "WS One")
        ws_id_2, _ = await create_workspace_with_project(owner_client, "WS Two")

        # Invite same email to both workspaces
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id_1}/members",
            json={"email": "multi@multi.com"},
        )
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id_2}/members",
            json={"email": "multi@multi.com"},
        )

        data = await signup_and_login(invitee_client, "multi@multi.com", name="Multi")
        assert ws_id_1 in data["workspace_ids"]
        assert ws_id_2 in data["workspace_ids"]

    async def test_cancelled_invitation_not_consumed_on_signup(
        self, owner_client: AsyncClient, invitee_client: AsyncClient
    ):
        """Cancelled invitation should NOT be consumed on signup."""
        await signup_and_login(owner_client, "owner@cancel.com")
        ws_id, _ = await create_workspace_with_project(owner_client)

        inv_resp = await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"email": "cancelled@cancel.com"},
        )
        inv_id = inv_resp.json()["id"]

        # Cancel it
        resp = await owner_client.delete(
            f"/api/v1/workspaces/{ws_id}/invitations/{inv_id}",
        )
        assert resp.status_code == 204

        # Signup with that email
        data = await signup_and_login(
            invitee_client, "cancelled@cancel.com", name="Cancelled"
        )
        # Should NOT be in the workspace
        assert ws_id not in data.get("workspace_ids", [])


# ---------------------------------------------------------------------------
# Accept invitation endpoint
# ---------------------------------------------------------------------------


class TestAcceptInvitationFlow:
    async def test_accept_invitation_endpoint_materialises_projects(
        self, owner_client: AsyncClient, invitee_client: AsyncClient, db_session
    ):
        """Existing user: invitation → accept-invitation → project access."""
        from uuid import UUID, uuid4

        from app.infrastructure.db.models.invitation import InvitationModel
        from app.infrastructure.db.models.invitation_project import (
            InvitationProjectModel,
        )

        await signup_and_login(owner_client, "owner@acceptflow.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        # Signup first (no invitation yet)
        await signup_and_login(invitee_client, "accepter@acceptflow.com", name="Acc")

        # Create invitation + project assignment directly in DB
        inv_id = uuid4()
        inv = InvitationModel(
            id=inv_id,
            workspace_id=UUID(ws_id),
            email="accepter@acceptflow.com",
            is_owner=False,
        )
        db_session.add(inv)
        ip = InvitationProjectModel(
            id=uuid4(),
            invitation_id=inv_id,
            project_id=UUID(pid),
            role="reader",
        )
        db_session.add(ip)
        await db_session.flush()

        # Accept
        resp = await invitee_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 201

        # Should have project access
        await refresh_session(invitee_client)
        proj_resp = await invitee_client.get(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert proj_resp.status_code == 200
        assert len(proj_resp.json()) == 1


# ---------------------------------------------------------------------------
# Full flow: invite → signup/accept → access resource
# ---------------------------------------------------------------------------


class TestFullFlowInviteToResource:
    async def test_full_flow_invite_signup_access_resource(
        self, owner_client: AsyncClient, invitee_client: AsyncClient
    ):
        """Owner invites email with contributor role → signup → can PATCH agent."""
        await signup_and_login(owner_client, "owner@fullflow.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        agent_id = await create_agent_in_project(owner_client, ws_id, pid)

        # Invite with contributor role
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={
                "email": "contrib@fullflow.com",
                "project_assignments": [{"project_id": pid, "role": "contributor"}],
            },
        )

        # Signup
        await signup_and_login(invitee_client, "contrib@fullflow.com", name="Contrib")

        # Can PATCH the agent
        headers = {"X-Workspace-Id": ws_id}
        resp = await invitee_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Patched by Contrib"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Patched by Contrib"

    async def test_full_flow_invite_accept_access_resource(
        self, owner_client: AsyncClient, invitee_client: AsyncClient, db_session
    ):
        """Existing user: owner creates invitation (via DB) → accept → access agent."""
        from uuid import UUID, uuid4

        from app.infrastructure.db.models.invitation import InvitationModel
        from app.infrastructure.db.models.invitation_project import (
            InvitationProjectModel,
        )

        await signup_and_login(owner_client, "owner@fullaccept.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        agent_id = await create_agent_in_project(owner_client, ws_id, pid)

        # Signup first
        await signup_and_login(invitee_client, "reader@fullaccept.com", name="Reader")

        # Create invitation + project assignment via DB
        inv_id = uuid4()
        inv = InvitationModel(
            id=inv_id,
            workspace_id=UUID(ws_id),
            email="reader@fullaccept.com",
            is_owner=False,
        )
        db_session.add(inv)
        ip = InvitationProjectModel(
            id=uuid4(),
            invitation_id=inv_id,
            project_id=UUID(pid),
            role="reader",
        )
        db_session.add(ip)
        await db_session.flush()

        # Accept
        resp = await invitee_client.post(
            f"/api/v1/workspaces/{ws_id}/accept-invitation",
        )
        assert resp.status_code == 201

        await refresh_session(invitee_client)

        # Can read
        headers = {"X-Workspace-Id": ws_id}
        resp = await invitee_client.get(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 200

    async def test_invitation_project_role_respected(
        self, owner_client: AsyncClient, invitee_client: AsyncClient
    ):
        """Invited as reader → cannot PATCH agent (only GET)."""
        await signup_and_login(owner_client, "owner@rolecheck.com")
        ws_id, pid = await create_workspace_with_project(owner_client)

        agent_id = await create_agent_in_project(owner_client, ws_id, pid)

        # Invite as reader
        await owner_client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={
                "email": "onlyread@rolecheck.com",
                "project_assignments": [{"project_id": pid, "role": "reader"}],
            },
        )

        await signup_and_login(invitee_client, "onlyread@rolecheck.com", name="Only")

        headers = {"X-Workspace-Id": ws_id}

        # GET succeeds
        resp = await invitee_client.get(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 200

        # PATCH denied (reader, not contributor)
        resp = await invitee_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Hacked"},
            headers=headers,
        )
        assert resp.status_code == 403
