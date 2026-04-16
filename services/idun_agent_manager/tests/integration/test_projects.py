"""Integration tests for project provisioning and project-scoped access."""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def _signup(
    client: AsyncClient,
    email: str = "projects@example.com",
    password: str = "password123",
    name: str | None = "Project User",
):
    payload: dict[str, str | None] = {"email": email, "password": password, "name": name}
    return await client.post("/api/v1/auth/basic/signup", json=payload)


async def _create_workspace(client: AsyncClient, name: str = "Projects WS"):
    return await client.post("/api/v1/workspaces/", json={"name": name})

LANGGRAPH_CONFIG = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {"name": "test-agent", "graph_definition": "mod:graph"},
    },
}


class TestDefaultProjectProvisioning:
    async def test_create_workspace_creates_default_project_and_admin_membership(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        await _signup(client)

        workspace_response = await _create_workspace(client)
        assert workspace_response.status_code == 201, workspace_response.text
        workspace_id = UUID(workspace_response.json()["id"])

        # Refresh auth state the same way the frontend does after onboarding.
        me_response = await client.get("/api/v1/auth/me")
        assert me_response.status_code == 200, me_response.text

        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )
        from app.infrastructure.db.models.user import UserModel

        project_result = await db_session.execute(
            select(ProjectModel).where(ProjectModel.workspace_id == workspace_id)
        )
        projects = project_result.scalars().all()

        assert len(projects) == 1
        default_project = projects[0]
        assert default_project.is_default is True

        user_result = await db_session.execute(
            select(UserModel).where(UserModel.email == "projects@example.com")
        )
        user = user_result.scalar_one()

        membership_result = await db_session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.project_id == default_project.id,
                ProjectMembershipModel.user_id == user.id,
            )
        )
        project_membership = membership_result.scalar_one()
        assert project_membership.role == "admin"

        list_response = await client.get("/api/v1/projects/")
        assert list_response.status_code == 200, list_response.text
        listed_projects = list_response.json()
        assert len(listed_projects) == 1
        assert listed_projects[0]["id"] == str(default_project.id)
        assert listed_projects[0]["is_default"] is True


class TestPromptProjectScoping:
    async def test_same_prompt_id_versions_independently_per_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )
        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="prompt-projects@example.com")
        workspace_response = await _create_workspace(client, name="Prompt Projects")
        assert workspace_response.status_code == 201, workspace_response.text

        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = UUID(principal["default_workspace_id"])
        default_project_id = principal["workspaces"][0]["default_project_id"]

        user = (
            await db_session.execute(
                select(UserModel).where(UserModel.email == "prompt-projects@example.com")
            )
        ).scalar_one()
        second_project = ProjectModel(
            id=uuid4(),
            workspace_id=workspace_id,
            name="Prompt Project Two",
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

        first_response = await client.post(
            "/api/v1/prompts/",
            headers={"X-Project-Id": default_project_id},
            json={"prompt_id": "greeting", "content": "Hello"},
        )
        assert first_response.status_code == 201, first_response.text
        assert first_response.json()["version"] == 1

        second_response = await client.post(
            "/api/v1/prompts/",
            headers={"X-Project-Id": str(second_project.id)},
            json={"prompt_id": "greeting", "content": "Bonjour"},
        )
        assert second_response.status_code == 201, second_response.text
        assert second_response.json()["version"] == 1


class TestProjectAdministration:
    async def test_owner_can_create_update_and_delete_project(self, client: AsyncClient):
        await _signup(client, email="owner-projects@example.com")
        workspace_response = await _create_workspace(client, name="Admin Projects")
        assert workspace_response.status_code == 201, workspace_response.text

        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = principal["default_workspace_id"]

        create_response = await client.post(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": workspace_id},
            json={"name": "Second Project", "description": "Secondary scope"},
        )
        assert create_response.status_code == 201, create_response.text
        project_id = create_response.json()["id"]
        assert create_response.json()["name"] == "Second Project"

        patch_response = await client.patch(
            f"/api/v1/projects/{project_id}",
            headers={"X-Workspace-Id": workspace_id, "X-Project-Id": project_id},
            json={"name": "Renamed Project"},
        )
        assert patch_response.status_code == 200, patch_response.text
        assert patch_response.json()["name"] == "Renamed Project"

        delete_response = await client.delete(
            f"/api/v1/projects/{project_id}",
            headers={"X-Workspace-Id": workspace_id},
        )
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["deleted"] is True
        assert delete_response.json()["resource_count"] == 0

    async def test_project_admin_can_add_workspace_member_to_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="project-admin@example.com")
        workspace_response = await _create_workspace(client, name="Project Members")
        assert workspace_response.status_code == 201, workspace_response.text

        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = principal["default_workspace_id"]

        create_response = await client.post(
            "/api/v1/projects/",
            headers={"X-Workspace-Id": workspace_id},
            json={"name": "Team Project"},
        )
        assert create_response.status_code == 201, create_response.text
        project_id = create_response.json()["id"]

        member = UserModel(
            id=uuid4(),
            email="project-member@example.com",
            name="Project Member",
            provider="local",
        )
        db_session.add(member)
        await db_session.flush()

        workspace_member_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/members",
            json={"email": member.email, "is_owner": False},
        )
        assert workspace_member_response.status_code == 201, workspace_member_response.text

        add_project_member_response = await client.post(
            f"/api/v1/projects/{project_id}/members",
            headers={"X-Workspace-Id": workspace_id, "X-Project-Id": project_id},
            json={"email": member.email, "role": "contributor"},
        )
        assert add_project_member_response.status_code == 201, add_project_member_response.text
        assert add_project_member_response.json()["role"] == "contributor"

        list_response = await client.get(
            f"/api/v1/projects/{project_id}/members",
            headers={"X-Workspace-Id": workspace_id, "X-Project-Id": project_id},
        )
        assert list_response.status_code == 200, list_response.text
        listed_emails = {item["email"]: item["role"] for item in list_response.json()}
        assert listed_emails["project-member@example.com"] == "contributor"

    async def test_assign_prompt_rejects_agent_from_another_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )
        from app.infrastructure.db.models.user import UserModel

        await _signup(client, email="prompt-assignment@example.com")
        workspace_response = await _create_workspace(client, name="Prompt Assignments")
        assert workspace_response.status_code == 201, workspace_response.text

        me_response = await client.get("/api/v1/auth/me")
        principal = me_response.json()["session"]["principal"]
        workspace_id = UUID(principal["default_workspace_id"])
        default_project_id = principal["workspaces"][0]["default_project_id"]

        user = (
            await db_session.execute(
                select(UserModel).where(UserModel.email == "prompt-assignment@example.com")
            )
        ).scalar_one()
        second_project = ProjectModel(
            id=uuid4(),
            workspace_id=workspace_id,
            name="Agent Project",
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

        prompt_response = await client.post(
            "/api/v1/prompts/",
            headers={"X-Project-Id": default_project_id},
            json={"prompt_id": "cross-project", "content": "Hello"},
        )
        assert prompt_response.status_code == 201, prompt_response.text
        prompt_id = prompt_response.json()["id"]

        agent_response = await client.post(
            "/api/v1/agents/",
            headers={"X-Project-Id": str(second_project.id)},
            json={
                "name": "second-project-agent",
                "base_url": "http://localhost:9000",
                "version": "0.1.0",
                "engine_config": LANGGRAPH_CONFIG,
            },
        )
        assert agent_response.status_code == 201, agent_response.text
        agent_id = agent_response.json()["id"]

        assign_response = await client.post(
            f"/api/v1/prompts/{prompt_id}/assign/{agent_id}",
            headers={"X-Project-Id": default_project_id},
        )
        assert assign_response.status_code == 404
