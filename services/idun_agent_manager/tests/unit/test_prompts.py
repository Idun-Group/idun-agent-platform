"""Tests for the managed prompts router."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.manager.project import ProjectRole
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    ProjectAccess,
    get_current_user,
    get_session,
    require_project_admin,
    require_project_contributor,
    require_project_reader,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_prompt import ManagedPromptModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.workspace import WorkspaceModel

pytestmark = pytest.mark.asyncio

WORKSPACE_ID = uuid4()
PROJECT_ID = uuid4()
FAKE_USER = CurrentUser(
    user_id=str(uuid4()),
    email="test@test.com",
    workspace_ids=[str(WORKSPACE_ID)],
    default_workspace_id=str(WORKSPACE_ID),
)


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


@pytest_asyncio.fixture(autouse=True)
async def seeded_workspace(db_session: AsyncSession) -> WorkspaceModel:
    ws = WorkspaceModel(
        id=WORKSPACE_ID,
        name="test-workspace",
        slug="test-workspace",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(ws)
    db_session.add(
        ProjectModel(
            id=PROJECT_ID,
            workspace_id=WORKSPACE_ID,
            name="Default Project",
            is_default=True,
        )
    )
    db_session.add(
        ProjectMembershipModel(
            id=uuid4(),
            project_id=PROJECT_ID,
            user_id=UUID(FAKE_USER.user_id),
            role="admin",
        )
    )
    await db_session.flush()
    return ws


@pytest_asyncio.fixture(scope="function")
async def authed_client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    from app.main import create_app

    app = create_app()
    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[require_workspace] = lambda: WORKSPACE_ID
    app.dependency_overrides[require_project_reader] = lambda: ProjectAccess(
        project_id=PROJECT_ID,
        workspace_id=WORKSPACE_ID,
        role=ProjectRole.ADMIN,
        is_default=True,
    )
    app.dependency_overrides[require_project_contributor] = lambda: ProjectAccess(
        project_id=PROJECT_ID,
        workspace_id=WORKSPACE_ID,
        role=ProjectRole.ADMIN,
        is_default=True,
    )
    app.dependency_overrides[require_project_admin] = lambda: ProjectAccess(
        project_id=PROJECT_ID,
        workspace_id=WORKSPACE_ID,
        role=ProjectRole.ADMIN,
        is_default=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_prompt(db_session: AsyncSession) -> ManagedPromptModel:
    model = ManagedPromptModel(
        id=uuid4(),
        prompt_id="system-prompt",
        version=1,
        content="You are a helpful assistant.",
        tags=["latest"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        workspace_id=WORKSPACE_ID,
        project_id=PROJECT_ID,
    )
    db_session.add(model)
    await db_session.flush()
    return model


@pytest_asyncio.fixture
async def seeded_agent(db_session: AsyncSession) -> ManagedAgentModel:
    model = ManagedAgentModel(
        id=uuid4(),
        name="test-agent",
        status="ACTIVE",
        engine_config={
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "test", "graph_definition": "test:app"},
            }
        },
        agent_hash="test-hash-123",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        workspace_id=WORKSPACE_ID,
        project_id=PROJECT_ID,
    )
    db_session.add(model)
    await db_session.flush()
    return model


class TestCreatePrompt:
    async def test_create_first_version(self, authed_client: AsyncClient):
        resp = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "greeting", "content": "Hello {{ name }}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["prompt_id"] == "greeting"
        assert data["version"] == 1
        assert "latest" in data["tags"]

    async def test_create_second_version_increments(self, authed_client: AsyncClient):
        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "greeting", "content": "v1"},
        )
        resp = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "greeting", "content": "v2"},
        )
        assert resp.status_code == 201
        assert resp.json()["version"] == 2

    async def test_latest_tag_moves_to_new_version(self, authed_client: AsyncClient):
        resp1 = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "greeting", "content": "v1"},
        )
        v1_id = resp1.json()["id"]

        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "greeting", "content": "v2"},
        )

        resp = await authed_client.get(f"/api/v1/prompts/{v1_id}")
        assert "latest" not in resp.json()["tags"]

    async def test_create_preserves_user_tags(self, authed_client: AsyncClient):
        resp = await authed_client.post(
            "/api/v1/prompts/",
            json={
                "prompt_id": "greeting",
                "content": "Hello",
                "tags": ["production", "en"],
            },
        )
        tags = resp.json()["tags"]
        assert "production" in tags
        assert "en" in tags
        assert "latest" in tags

    async def test_different_prompt_ids_version_independently(
        self, authed_client: AsyncClient
    ):
        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "a", "content": "a"},
        )
        resp = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "b", "content": "b"},
        )
        assert resp.json()["version"] == 1


class TestListPrompts:
    async def test_list_empty(self, authed_client: AsyncClient):
        resp = await authed_client.get("/api/v1/prompts/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_returns_seeded(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.get("/api/v1/prompts/")
        assert len(resp.json()) == 1
        assert resp.json()[0]["prompt_id"] == "system-prompt"

    async def test_filter_by_prompt_id(self, authed_client: AsyncClient):
        await authed_client.post(
            "/api/v1/prompts/", json={"prompt_id": "a", "content": "a"}
        )
        await authed_client.post(
            "/api/v1/prompts/", json={"prompt_id": "b", "content": "b"}
        )

        resp = await authed_client.get("/api/v1/prompts/", params={"prompt_id": "a"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["prompt_id"] == "a"

    @pytest.mark.skip(reason="JSONB contains() not supported on SQLite test backend")
    async def test_filter_by_tag(self, authed_client: AsyncClient):
        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "a", "content": "a", "tags": ["prod"]},
        )
        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "b", "content": "b", "tags": ["staging"]},
        )

        resp = await authed_client.get("/api/v1/prompts/", params={"tag": "prod"})
        data = resp.json()
        assert len(data) == 1
        assert data[0]["prompt_id"] == "a"

    async def test_filter_by_version(self, authed_client: AsyncClient):
        await authed_client.post(
            "/api/v1/prompts/", json={"prompt_id": "a", "content": "v1"}
        )
        await authed_client.post(
            "/api/v1/prompts/", json={"prompt_id": "a", "content": "v2"}
        )

        resp = await authed_client.get("/api/v1/prompts/", params={"version": 1})
        assert len(resp.json()) == 1
        assert resp.json()[0]["version"] == 1

    async def test_pagination(self, authed_client: AsyncClient):
        for i in range(3):
            await authed_client.post(
                "/api/v1/prompts/",
                json={"prompt_id": f"p{i}", "content": f"c{i}"},
            )

        resp = await authed_client.get(
            "/api/v1/prompts/", params={"limit": 2, "offset": 0}
        )
        assert len(resp.json()) == 2

        resp = await authed_client.get(
            "/api/v1/prompts/", params={"limit": 2, "offset": 2}
        )
        assert len(resp.json()) == 1

    async def test_invalid_limit(self, authed_client: AsyncClient):
        resp = await authed_client.get("/api/v1/prompts/", params={"limit": 0})
        assert resp.status_code == 400

    async def test_negative_offset(self, authed_client: AsyncClient):
        resp = await authed_client.get("/api/v1/prompts/", params={"offset": -1})
        assert resp.status_code == 400


class TestGetPrompt:
    async def test_get_by_id(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.get(f"/api/v1/prompts/{seeded_prompt.id}")
        assert resp.status_code == 200
        assert resp.json()["prompt_id"] == "system-prompt"

    async def test_get_not_found(self, authed_client: AsyncClient):
        resp = await authed_client.get(f"/api/v1/prompts/{uuid4()}")
        assert resp.status_code == 404

    async def test_get_invalid_uuid(self, authed_client: AsyncClient):
        resp = await authed_client.get("/api/v1/prompts/not-a-uuid")
        assert resp.status_code == 400


class TestPatchPrompt:
    async def test_update_tags(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.patch(
            f"/api/v1/prompts/{seeded_prompt.id}",
            json={"tags": ["production", "en"]},
        )
        assert resp.status_code == 200
        tags = resp.json()["tags"]
        assert "production" in tags
        assert "en" in tags
        assert "latest" in tags

    async def test_cannot_remove_latest_from_highest_version(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.patch(
            f"/api/v1/prompts/{seeded_prompt.id}",
            json={"tags": []},
        )
        assert "latest" in resp.json()["tags"]

    async def test_latest_not_added_to_older_version(self, authed_client: AsyncClient):
        resp1 = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "x", "content": "v1"},
        )
        v1_id = resp1.json()["id"]

        await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "x", "content": "v2"},
        )

        resp = await authed_client.patch(
            f"/api/v1/prompts/{v1_id}",
            json={"tags": ["latest", "old"]},
        )
        assert "latest" not in resp.json()["tags"]
        assert "old" in resp.json()["tags"]

    async def test_patch_not_found(self, authed_client: AsyncClient):
        resp = await authed_client.patch(
            f"/api/v1/prompts/{uuid4()}",
            json={"tags": ["x"]},
        )
        assert resp.status_code == 404


class TestDeletePrompt:
    async def test_delete(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.delete(f"/api/v1/prompts/{seeded_prompt.id}")
        assert resp.status_code == 204

        resp = await authed_client.get(f"/api/v1/prompts/{seeded_prompt.id}")
        assert resp.status_code == 404

    async def test_delete_latest_promotes_previous(self, authed_client: AsyncClient):
        resp1 = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "x", "content": "v1"},
        )
        v1_id = resp1.json()["id"]

        resp2 = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "x", "content": "v2"},
        )
        v2_id = resp2.json()["id"]

        await authed_client.delete(f"/api/v1/prompts/{v2_id}")

        resp = await authed_client.get(f"/api/v1/prompts/{v1_id}")
        assert "latest" in resp.json()["tags"]

    async def test_delete_not_found(self, authed_client: AsyncClient):
        resp = await authed_client.delete(f"/api/v1/prompts/{uuid4()}")
        assert resp.status_code == 404

    async def test_delete_cascades_assignments(
        self,
        authed_client: AsyncClient,
        seeded_prompt: ManagedPromptModel,
        seeded_agent: ManagedAgentModel,
    ):
        await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        await authed_client.delete(f"/api/v1/prompts/{seeded_prompt.id}")

        resp = await authed_client.post(
            "/api/v1/prompts/",
            json={"prompt_id": "new", "content": "new"},
        )
        new_id = resp.json()["id"]
        resp = await authed_client.post(
            f"/api/v1/prompts/{new_id}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 201


class TestAssignPrompt:
    async def test_assign(
        self,
        authed_client: AsyncClient,
        seeded_prompt: ManagedPromptModel,
        seeded_agent: ManagedAgentModel,
    ):
        resp = await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "assigned"

    async def test_assign_duplicate(
        self,
        authed_client: AsyncClient,
        seeded_prompt: ManagedPromptModel,
        seeded_agent: ManagedAgentModel,
    ):
        await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        resp = await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 409

    async def test_assign_nonexistent_agent(
        self, authed_client: AsyncClient, seeded_prompt: ManagedPromptModel
    ):
        resp = await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{uuid4()}"
        )
        assert resp.status_code == 404

    async def test_assign_nonexistent_prompt(
        self, authed_client: AsyncClient, seeded_agent: ManagedAgentModel
    ):
        resp = await authed_client.post(
            f"/api/v1/prompts/{uuid4()}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 404


class TestUnassignPrompt:
    async def test_unassign(
        self,
        authed_client: AsyncClient,
        seeded_prompt: ManagedPromptModel,
        seeded_agent: ManagedAgentModel,
    ):
        await authed_client.post(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        resp = await authed_client.delete(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 204

    async def test_unassign_not_found(
        self,
        authed_client: AsyncClient,
        seeded_prompt: ManagedPromptModel,
        seeded_agent: ManagedAgentModel,
    ):
        resp = await authed_client.delete(
            f"/api/v1/prompts/{seeded_prompt.id}/assign/{seeded_agent.id}"
        )
        assert resp.status_code == 404
