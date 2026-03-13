"""Integration tests for resource-level RBAC (agent endpoints).

Tests the permission matrix across all role combinations:
  - Workspace owner: full access
  - Project admin: full access
  - Project contributor: full access (read + modify)
  - Project reader: read-only
  - Non-project member: denied
  - Non-workspace member: denied
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import (
    MINIMAL_AGENT_PAYLOAD,
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


@pytest.fixture
async def non_project_client(db_session: AsyncSession):
    """Workspace member but NOT assigned to the project."""
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


@pytest.fixture
async def outsider_client(db_session: AsyncSession):
    """Not a workspace member at all."""
    c = await make_client(db_session)
    try:
        yield c
    finally:
        await c.aclose()


async def _setup_full(
    owner_client,
    admin_client,
    contributor_client,
    reader_client,
    non_project_client,
    outsider_client,
):
    """Setup workspace with all role types. Returns (ws_id, pid, agent_id)."""
    await signup_and_login(owner_client, "owner@rbac.com", name="Owner")
    ws_id, pid = await create_workspace_with_project(owner_client)

    # Create an agent
    agent_id = await create_agent_in_project(owner_client, ws_id, pid)

    # Project admin
    await signup_and_login(admin_client, "admin@rbac.com", name="Admin")
    await invite_existing_user(
        owner_client,
        ws_id,
        "admin@rbac.com",
        project_assignments=[{"project_id": pid, "role": "admin"}],
    )
    await refresh_session(admin_client)

    # Project contributor
    await signup_and_login(contributor_client, "contrib@rbac.com", name="Contrib")
    await invite_existing_user(
        owner_client,
        ws_id,
        "contrib@rbac.com",
        project_assignments=[{"project_id": pid, "role": "contributor"}],
    )
    await refresh_session(contributor_client)

    # Project reader
    await signup_and_login(reader_client, "reader@rbac.com", name="Reader")
    await invite_existing_user(
        owner_client,
        ws_id,
        "reader@rbac.com",
        project_assignments=[{"project_id": pid, "role": "reader"}],
    )
    await refresh_session(reader_client)

    # Non-project member (workspace member, no project assignment)
    await signup_and_login(non_project_client, "noproj@rbac.com", name="NoProj")
    await invite_existing_user(owner_client, ws_id, "noproj@rbac.com")
    await refresh_session(non_project_client)

    # Outsider (not in workspace)
    await signup_and_login(outsider_client, "outsider@rbac.com", name="Outsider")

    return ws_id, pid, agent_id


# ---------------------------------------------------------------------------
# Full access: owner, admin, contributor
# ---------------------------------------------------------------------------


class TestOwnerFullAccess:
    async def test_owner_full_access_to_agent(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        # GET
        resp = await owner_client.get(f"/api/v1/agents/{agent_id}", headers=headers)
        assert resp.status_code == 200

        # PATCH
        resp = await owner_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Owner Patched"},
            headers=headers,
        )
        assert resp.status_code == 200

        # PUT status
        resp = await owner_client.put(
            f"/api/v1/agents/{agent_id}/status",
            json={"status": "active"},
            headers=headers,
        )
        assert resp.status_code == 200


class TestProjectAdminAccess:
    async def test_project_admin_full_access(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        resp = await admin_client.get(f"/api/v1/agents/{agent_id}", headers=headers)
        assert resp.status_code == 200

        resp = await admin_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Admin Patched"},
            headers=headers,
        )
        assert resp.status_code == 200


class TestContributorAccess:
    async def test_contributor_can_read_and_modify(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        # GET
        resp = await contributor_client.get(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 200

        # PATCH
        resp = await contributor_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Contrib Patched"},
            headers=headers,
        )
        assert resp.status_code == 200

        # PUT status
        resp = await contributor_client.put(
            f"/api/v1/agents/{agent_id}/status",
            json={"status": "active"},
            headers=headers,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Read-only: reader
# ---------------------------------------------------------------------------


class TestReaderAccess:
    async def test_reader_can_only_read(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        # GET succeeds
        resp = await reader_client.get(f"/api/v1/agents/{agent_id}", headers=headers)
        assert resp.status_code == 200

        # PATCH denied
        resp = await reader_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Reader Patched"},
            headers=headers,
        )
        assert resp.status_code == 403

        # DELETE denied
        resp = await reader_client.delete(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 403

        # PUT status denied
        resp = await reader_client.put(
            f"/api/v1/agents/{agent_id}/status",
            json={"status": "active"},
            headers=headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Denied: non-project member, non-workspace member
# ---------------------------------------------------------------------------


class TestNonProjectMemberDenied:
    async def test_non_project_member_denied(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        # GET denied
        resp = await non_project_client.get(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 403

        # PATCH denied
        resp = await non_project_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "NoProj Patched"},
            headers=headers,
        )
        assert resp.status_code == 403

        # DELETE denied
        resp = await non_project_client.delete(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 403


class TestNonWorkspaceMemberDenied:
    async def test_non_workspace_member_denied(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, agent_id = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )
        headers = {"X-Workspace-Id": ws_id}

        # Outsider can't even use the workspace header
        resp = await outsider_client.get(
            f"/api/v1/agents/{agent_id}", headers=headers
        )
        assert resp.status_code == 403

        resp = await outsider_client.patch(
            f"/api/v1/agents/{agent_id}",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Outsider Patched"},
            headers=headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Create/List (workspace-scoped, no per-resource RBAC)
# ---------------------------------------------------------------------------


class TestAgentCreateList:
    async def test_any_workspace_member_can_create_agent(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, _ = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )

        # Even non-project member can create (workspace-scoped)
        resp = await non_project_client.post(
            "/api/v1/agents/",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "NP Agent"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 201

    async def test_any_workspace_member_can_list_agents(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, _ = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )

        resp = await reader_client.get(
            "/api/v1/agents/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 200

    async def test_non_workspace_member_cannot_create_or_list(
        self,
        owner_client,
        admin_client,
        contributor_client,
        reader_client,
        non_project_client,
        outsider_client,
    ):
        ws_id, pid, _ = await _setup_full(
            owner_client,
            admin_client,
            contributor_client,
            reader_client,
            non_project_client,
            outsider_client,
        )

        resp = await outsider_client.post(
            "/api/v1/agents/",
            json={**MINIMAL_AGENT_PAYLOAD, "name": "Outsider Agent"},
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403

        resp = await outsider_client.get(
            "/api/v1/agents/",
            headers={"X-Workspace-Id": ws_id},
        )
        assert resp.status_code == 403
