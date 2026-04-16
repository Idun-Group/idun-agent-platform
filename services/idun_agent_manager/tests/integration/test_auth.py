"""Integration tests for auth endpoints."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _signup(
    client: AsyncClient,
    email: str = "test@example.com",
    password: str = "password123",
    name: str | None = "Test User",
):
    payload: dict = {"email": email, "password": password}
    if name is not None:
        payload["name"] = name
    return await client.post("/api/v1/auth/basic/signup", json=payload)


async def _login(client: AsyncClient, email: str, password: str = "password123"):
    return await client.post(
        "/api/v1/auth/basic/login",
        json={"email": email, "password": password},
    )


async def _create_workspace(client: AsyncClient, name: str = "My Workspace"):
    return await client.post("/api/v1/workspaces/", json={"name": name})


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------


class TestBasicSignup:
    async def test_signup_success(self, client: AsyncClient):
        response = await _signup(client)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"
        assert "id" in data
        assert "workspace_ids" in data

    async def test_signup_without_name(self, client: AsyncClient):
        response = await _signup(client, email="noname@example.com", name=None)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "noname@example.com"
        assert data["name"] is None

    async def test_signup_duplicate_email(self, client: AsyncClient):
        await _signup(client, email="duplicate@example.com")
        response = await _signup(
            client, email="duplicate@example.com", password="different456"
        )
        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    async def test_signup_short_password(self, client: AsyncClient):
        response = await _signup(client, email="short@example.com", password="short")
        assert response.status_code == 422

    async def test_signup_invalid_email(self, client: AsyncClient):
        response = await _signup(client, email="not-an-email")
        assert response.status_code == 422

    async def test_signup_sets_session_cookie(self, client: AsyncClient):
        response = await _signup(client, email="cookie@example.com")
        assert response.status_code == 200
        assert "sid" in response.cookies

    async def test_signup_does_not_create_workspace(self, client: AsyncClient):
        """Signup should NOT auto-create a workspace."""
        response = await _signup(client, email="nows@example.com")
        assert response.status_code == 200
        data = response.json()
        assert data["workspace_ids"] == []
        assert data["default_workspace_id"] is None

    async def test_signup_consumes_pending_invitation(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """If a pending invitation exists for the email, signup consumes it."""
        from app.infrastructure.db.models.invitation import InvitationModel
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.workspace import WorkspaceModel

        # Create a workspace first (directly in DB)
        ws_id = uuid4()
        ws = WorkspaceModel(id=ws_id, name="Invited WS", slug="invited-ws")
        db_session.add(ws)
        db_session.add(
            ProjectModel(
                id=uuid4(),
                workspace_id=ws_id,
                name="Default Project",
                is_default=True,
            )
        )
        await db_session.flush()

        # Create a pending invitation
        inv = InvitationModel(
            id=uuid4(),
            workspace_id=ws_id,
            email="invited@example.com",
            is_owner=False,
        )
        db_session.add(inv)
        await db_session.flush()

        response = await _signup(client, email="invited@example.com")
        assert response.status_code == 200
        data = response.json()
        assert str(ws_id) in data["workspace_ids"]
        assert data["default_workspace_id"] == str(ws_id)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


class TestBasicLogin:
    async def test_login_success(self, client: AsyncClient):
        await _signup(client, email="login@example.com")
        response = await _login(client, email="login@example.com")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "login@example.com"
        assert "id" in data
        assert "workspace_ids" in data

    async def test_login_wrong_password(self, client: AsyncClient):
        await _signup(client, email="wrongpwd@example.com")
        response = await _login(
            client, email="wrongpwd@example.com", password="wrongpassword"
        )
        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await _login(client, email="nonexistent@example.com")
        assert response.status_code == 401

    async def test_login_sets_session_cookie(self, client: AsyncClient):
        await _signup(client, email="logincookie@example.com")
        response = await _login(client, email="logincookie@example.com")
        assert "sid" in response.cookies

    async def test_login_returns_workspace_ids(self, client: AsyncClient):
        """After signup + workspace creation, login returns the workspace."""
        await _signup(client, email="wslogin@example.com")
        ws_resp = await _create_workspace(client, name="Login WS")
        assert ws_resp.status_code == 201

        response = await _login(client, email="wslogin@example.com")
        assert response.status_code == 200
        data = response.json()
        assert len(data["workspace_ids"]) == 1
        assert data["default_workspace_id"] is not None

    async def test_login_backfills_default_workspace_id(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Login should set default_workspace_id if user has workspaces but NULL default."""
        from sqlalchemy import select

        from app.infrastructure.db.models.membership import MembershipModel
        from app.infrastructure.db.models.user import UserModel
        from app.infrastructure.db.models.workspace import WorkspaceModel

        # Signup (no workspace)
        await _signup(client, email="backfill@example.com")

        # Create workspace and membership directly in DB (simulating pre-migration state)
        user_result = await db_session.execute(
            select(UserModel).where(UserModel.email == "backfill@example.com")
        )
        user = user_result.scalar_one()
        # Ensure default_workspace_id is NULL
        user.default_workspace_id = None
        await db_session.flush()

        ws_id = uuid4()
        ws = WorkspaceModel(id=ws_id, name="Backfill WS", slug="backfill-ws")
        db_session.add(ws)
        membership = MembershipModel(
            id=uuid4(), user_id=user.id, workspace_id=ws_id, is_owner=True
        )
        db_session.add(membership)
        await db_session.flush()

        # Login should backfill default_workspace_id
        response = await _login(client, email="backfill@example.com")
        assert response.status_code == 200
        data = response.json()
        assert data["default_workspace_id"] == str(ws_id)

        # Verify in DB
        await db_session.refresh(user)
        assert user.default_workspace_id == ws_id


# ---------------------------------------------------------------------------
# /me endpoint
# ---------------------------------------------------------------------------


class TestAuthMe:
    async def test_me_authenticated(self, client: AsyncClient):
        await _signup(client, email="me@example.com")
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["session"]["principal"]["email"] == "me@example.com"

    async def test_me_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    async def test_me_returns_empty_workspace_ids_after_signup(
        self, client: AsyncClient
    ):
        """After signup with no invitations, /me returns empty workspace_ids."""
        await _signup(client, email="nows-me@example.com")
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 200
        principal = response.json()["session"]["principal"]
        assert principal["workspace_ids"] == []
        assert principal["default_workspace_id"] is None

    async def test_me_refreshes_workspace_ids_after_creation(self, client: AsyncClient):
        """After creating a workspace, /me returns the updated workspace_ids."""
        await _signup(client, email="refresh@example.com")

        # Verify empty initially
        me_resp = await client.get("/api/v1/auth/me")
        assert me_resp.json()["session"]["principal"]["workspace_ids"] == []

        # Create workspace
        ws_resp = await _create_workspace(client, name="Fresh WS")
        assert ws_resp.status_code == 201
        ws_id = ws_resp.json()["id"]

        # /me should now show the workspace
        me_resp = await client.get("/api/v1/auth/me")
        assert me_resp.status_code == 200
        principal = me_resp.json()["session"]["principal"]
        assert ws_id in principal["workspace_ids"]
        assert principal["default_workspace_id"] == ws_id

    async def test_me_re_signs_cookie_on_workspace_change(self, client: AsyncClient):
        """When workspace data changes, /me should set a new cookie."""
        await _signup(client, email="resign@example.com")

        # First /me — no change expected (empty workspace, same as cookie)
        me_resp1 = await client.get("/api/v1/auth/me")
        assert me_resp1.status_code == 200

        # Create workspace
        await _create_workspace(client, name="Cookie WS")

        # /me should re-sign the cookie (set-cookie header present)
        me_resp2 = await client.get("/api/v1/auth/me")
        assert me_resp2.status_code == 200
        assert "sid" in me_resp2.cookies


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


class TestLogout:
    async def test_logout_clears_cookie(self, client: AsyncClient):
        await _signup(client, email="logout@example.com")
        response = await client.post("/api/v1/auth/logout")
        assert response.status_code == 200
        assert response.json()["ok"] is True

    async def test_logout_invalidates_session(self, client: AsyncClient):
        await _signup(client, email="logout2@example.com")
        assert (await client.get("/api/v1/auth/me")).status_code == 200

        await client.post("/api/v1/auth/logout")
        client.cookies.delete("sid")

        assert (await client.get("/api/v1/auth/me")).status_code == 401


# ---------------------------------------------------------------------------
# Workspace creation (onboarding flow)
# ---------------------------------------------------------------------------


class TestWorkspaceOnboardingFlow:
    """Tests the full onboarding flow: signup → create workspace → verify session."""

    async def test_create_workspace_after_signup(self, client: AsyncClient):
        """User with no workspaces can create one."""
        await _signup(client, email="onboard@example.com")
        response = await _create_workspace(client, name="First WS")
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "First WS"
        assert "id" in data

    async def test_first_workspace_sets_default(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Creating the first workspace sets it as default_workspace_id."""
        from sqlalchemy import select

        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="default@example.com")
        ws_resp = await _create_workspace(client, name="Default WS")
        assert ws_resp.status_code == 201
        ws_id = ws_resp.json()["id"]

        # Verify in DB
        result = await db_session.execute(
            select(UserModel).where(UserModel.email == "default@example.com")
        )
        user = result.scalar_one()
        assert str(user.default_workspace_id) == ws_id

    async def test_second_workspace_does_not_change_default(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Creating a second workspace should not overwrite default_workspace_id."""
        from sqlalchemy import select

        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="twoworkspaces@example.com")
        ws1_resp = await _create_workspace(client, name="First")
        assert ws1_resp.status_code == 201
        ws1_id = ws1_resp.json()["id"]

        ws2_resp = await _create_workspace(client, name="Second")
        assert ws2_resp.status_code == 201

        # Default should still be the first workspace
        result = await db_session.execute(
            select(UserModel).where(UserModel.email == "twoworkspaces@example.com")
        )
        user = result.scalar_one()
        assert str(user.default_workspace_id) == ws1_id

    async def test_full_onboarding_flow(self, client: AsyncClient):
        """End-to-end: signup → empty workspaces → create workspace → /me has workspace → agents accessible."""
        # 1. Signup
        signup_resp = await _signup(client, email="e2e@example.com")
        assert signup_resp.status_code == 200
        assert signup_resp.json()["workspace_ids"] == []

        # 2. /me returns empty workspaces
        me_resp = await client.get("/api/v1/auth/me")
        assert me_resp.json()["session"]["principal"]["workspace_ids"] == []

        # 3. Create workspace
        ws_resp = await _create_workspace(client, name="E2E Workspace")
        assert ws_resp.status_code == 201
        ws_id = ws_resp.json()["id"]

        # 4. /me returns updated workspaces + re-signs cookie
        me_resp = await client.get("/api/v1/auth/me")
        principal = me_resp.json()["session"]["principal"]
        assert ws_id in principal["workspace_ids"]
        assert principal["default_workspace_id"] == ws_id
        assert "sid" in me_resp.cookies  # Cookie was re-signed

        # 5. Agents endpoint should now work (no 400)
        agents_resp = await client.get("/api/v1/agents/")
        assert agents_resp.status_code != 400
