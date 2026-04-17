"""Integration tests for workspace member removal side effects."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.infrastructure.db.models.user import UserModel

pytestmark = pytest.mark.asyncio


async def _signup(
    client: AsyncClient,
    email: str,
    password: str = "password123",
    name: str = "Test User",
):
    return await client.post(
        "/api/v1/auth/basic/signup",
        json={"email": email, "password": password, "name": name},
    )


async def _create_workspace(client: AsyncClient, name: str = "Workspace"):
    return await client.post("/api/v1/workspaces/", json={"name": name})


async def _seed_target_user(
    db_session: AsyncSession, email: str = "target@example.com"
) -> UserModel:
    from app.infrastructure.db.models.user import UserModel

    user = UserModel(
        id=uuid4(),
        email=email,
        name="Target User",
        provider="local",
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _seed_workspace(
    db_session: AsyncSession,
    *,
    user_id: UUID,
    name: str,
    is_owner: bool = False,
) -> tuple[UUID, UUID]:
    """Create a workspace + default project + memberships for ``user_id``.

    Returns ``(workspace_id, membership_id)``.
    """
    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.project import ProjectModel
    from app.infrastructure.db.models.project_membership import (
        ProjectMembershipModel,
    )
    from app.infrastructure.db.models.workspace import WorkspaceModel

    now = datetime.now(UTC)
    ws_id = uuid4()
    workspace = WorkspaceModel(
        id=ws_id,
        name=name,
        slug=f"ws-{ws_id.hex[:8]}",
        created_at=now,
        updated_at=now,
    )
    db_session.add(workspace)
    await db_session.flush()

    membership = MembershipModel(
        id=uuid4(),
        user_id=user_id,
        workspace_id=ws_id,
        is_owner=is_owner,
    )
    db_session.add(membership)

    default_project = ProjectModel(
        id=uuid4(),
        workspace_id=ws_id,
        name="Default Project",
        description="",
        created_by=user_id,
        is_default=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(default_project)
    await db_session.flush()

    db_session.add(
        ProjectMembershipModel(
            id=uuid4(),
            project_id=default_project.id,
            user_id=user_id,
            role="admin",
        )
    )
    await db_session.flush()
    return ws_id, membership.id


class TestRemoveMemberClearsDefaultWorkspace:
    async def test_removing_only_membership_clears_default_workspace_id(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Scenario A: user's only membership is deleted.

        Pre: user has exactly one membership; that workspace is the user's
        default_workspace_id.

        Post: membership deleted, default_workspace_id is NULL.
        """
        from app.infrastructure.db.models.membership import MembershipModel
        from app.infrastructure.db.models.user import UserModel

        # Owner signs up and creates the workspace that will contain the target.
        await _signup(client, email="owner-a@example.com", name="Owner A")
        ws_response = await _create_workspace(client, name="Owner A WS")
        assert ws_response.status_code == 201, ws_response.text
        workspace_id = ws_response.json()["id"]

        # Seed target user directly in DB, then let the owner add them as a member.
        target = await _seed_target_user(db_session, email="target-a@example.com")

        add_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/members",
            json={"email": target.email, "is_owner": False},
        )
        assert add_response.status_code == 201, add_response.text
        membership_id = add_response.json()["id"]

        # Make that workspace the target's default_workspace_id.
        target_row = (
            await db_session.execute(select(UserModel).where(UserModel.id == target.id))
        ).scalar_one()
        target_row.default_workspace_id = UUID(workspace_id)
        await db_session.flush()

        # Owner removes the member.
        remove_response = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/members/{membership_id}"
        )
        assert remove_response.status_code == 204, remove_response.text

        # Membership gone.
        mem = (
            await db_session.execute(
                select(MembershipModel).where(MembershipModel.id == UUID(membership_id))
            )
        ).scalar_one_or_none()
        assert mem is None

        # default_workspace_id must be NULL (no remaining memberships anywhere).
        await db_session.refresh(target_row)
        assert target_row.default_workspace_id is None

    async def test_removing_default_when_multiple_memberships_clears_to_null(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Scenario B: user has 2 memberships; the default matches the deleted one.

        Post: default_workspace_id is NULL (per the simple "null-and-done" rule).
        The other membership remains intact.
        """
        from app.infrastructure.db.models.membership import MembershipModel
        from app.infrastructure.db.models.user import UserModel

        # Owner / workspace that is about to drop the member.
        await _signup(client, email="owner-b@example.com", name="Owner B")
        ws_response = await _create_workspace(client, name="Owner B WS")
        assert ws_response.status_code == 201, ws_response.text
        workspace_id = ws_response.json()["id"]

        # Seed target + a second workspace they belong to.
        target = await _seed_target_user(db_session, email="target-b@example.com")
        other_ws_id, _other_membership_id = await _seed_workspace(
            db_session, user_id=target.id, name="Other WS", is_owner=False
        )

        add_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/members",
            json={"email": target.email, "is_owner": False},
        )
        assert add_response.status_code == 201, add_response.text
        membership_id = add_response.json()["id"]

        target_row = (
            await db_session.execute(select(UserModel).where(UserModel.id == target.id))
        ).scalar_one()
        target_row.default_workspace_id = UUID(workspace_id)
        await db_session.flush()

        remove_response = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/members/{membership_id}"
        )
        assert remove_response.status_code == 204, remove_response.text

        await db_session.refresh(target_row)
        assert target_row.default_workspace_id is None

        # Other membership still intact.
        remaining = (
            (
                await db_session.execute(
                    select(MembershipModel).where(MembershipModel.user_id == target.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(remaining) == 1
        assert remaining[0].workspace_id == other_ws_id

    async def test_removing_non_default_membership_leaves_default_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Scenario C: default_workspace_id points at a workspace that is NOT
        the one being removed. It must stay unchanged.
        """
        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="owner-c@example.com", name="Owner C")
        ws_response = await _create_workspace(client, name="Owner C WS")
        assert ws_response.status_code == 201, ws_response.text
        workspace_id = ws_response.json()["id"]

        target = await _seed_target_user(db_session, email="target-c@example.com")
        other_ws_id, _ = await _seed_workspace(
            db_session, user_id=target.id, name="Other WS C", is_owner=False
        )

        add_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/members",
            json={"email": target.email, "is_owner": False},
        )
        assert add_response.status_code == 201, add_response.text
        membership_id = add_response.json()["id"]

        # Default points at the OTHER workspace (the one NOT being removed).
        target_row = (
            await db_session.execute(select(UserModel).where(UserModel.id == target.id))
        ).scalar_one()
        target_row.default_workspace_id = other_ws_id
        await db_session.flush()

        remove_response = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/members/{membership_id}"
        )
        assert remove_response.status_code == 204, remove_response.text

        await db_session.refresh(target_row)
        assert target_row.default_workspace_id == other_ws_id
