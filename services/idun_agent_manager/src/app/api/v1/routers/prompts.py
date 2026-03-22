"""Managed Prompt API.

CRUD for workspace-scoped prompts with append-only versioning.
Prompts are assigned to agents via a many-to-many junction table.
The engine fetches assigned prompts via ``/config`` using the agent's
Bearer token (same key used for ``/api/v1/agents/config``).

Session-authenticated endpoints are scoped to the caller's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.manager.managed_prompt import (
    ManagedPromptCreate,
    ManagedPromptPatch,
    ManagedPromptRead,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.agent_prompt_assignment import (
    AgentPromptAssignmentModel,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_prompt import ManagedPromptModel

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_prompt(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedPromptModel:
    """Get prompt by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedPromptModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedPromptModel) -> ManagedPromptRead:
    """Transform database model to response schema."""
    return ManagedPromptRead(
        id=model.id,
        prompt_id=model.prompt_id,
        version=model.version,
        content=model.content,
        tags=model.tags or [],
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedPromptRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new prompt version",
)
async def create_prompt(
    request: ManagedPromptCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedPromptRead:
    """Create a new prompt version.

    Auto-increments the version number for the given ``prompt_id`` within the
    workspace.  The ``latest`` tag is added automatically and removed from any
    previous version that carried it.
    """
    now = datetime.now(UTC)

    # Determine next version number
    max_version_stmt = select(
        func.coalesce(func.max(ManagedPromptModel.version), 0)
    ).where(
        ManagedPromptModel.workspace_id == workspace_id,
        ManagedPromptModel.prompt_id == request.prompt_id,
    )
    result = await session.execute(max_version_stmt)
    next_version = result.scalar_one() + 1

    # Remove "latest" tag from previous versions
    prev_stmt = select(ManagedPromptModel).where(
        ManagedPromptModel.workspace_id == workspace_id,
        ManagedPromptModel.prompt_id == request.prompt_id,
    )
    prev_result = await session.execute(prev_stmt)
    for prev in prev_result.scalars().all():
        if "latest" in (prev.tags or []):
            prev.tags = [t for t in prev.tags if t != "latest"]

    # Ensure "latest" is in the new version's tags
    tags = list(request.tags)
    if "latest" not in tags:
        tags.append("latest")

    model = ManagedPromptModel(
        id=uuid4(),
        prompt_id=request.prompt_id,
        version=next_version,
        content=request.content,
        tags=tags,
        created_at=now,
        updated_at=now,
        workspace_id=workspace_id,
    )

    session.add(model)
    try:
        await session.flush()
    except IntegrityError as err:
        logger.warning(
            "Version conflict for prompt_id '%s' in workspace %s",
            request.prompt_id,
            workspace_id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version conflict for prompt_id '{request.prompt_id}'. Retry the request.",
        ) from err
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/",
    response_model=list[ManagedPromptRead],
    summary="List prompts",
)
async def list_prompts(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    prompt_id: str | None = None,
    tag: str | None = None,
    version: int | None = None,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedPromptRead]:
    """List prompts with optional filters and pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be >= 0",
        )

    stmt = select(ManagedPromptModel).where(
        ManagedPromptModel.workspace_id == workspace_id
    )

    if prompt_id is not None:
        stmt = stmt.where(ManagedPromptModel.prompt_id == prompt_id)
    if tag is not None:
        stmt = stmt.where(ManagedPromptModel.tags.contains([tag]))
    if version is not None:
        stmt = stmt.where(ManagedPromptModel.version == version)

    stmt = (
        stmt.order_by(ManagedPromptModel.prompt_id, ManagedPromptModel.version.desc())
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(stmt)
    return [_model_to_schema(r) for r in result.scalars().all()]


@router.get(
    "/agent/{agent_id}",
    response_model=list[ManagedPromptRead],
    summary="List prompts assigned to an agent",
)
async def list_agent_prompts(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedPromptRead]:
    """List all prompts assigned to a specific agent."""
    agent = await _get_agent(agent_id, session, workspace_id)

    stmt = (
        select(ManagedPromptModel)
        .join(
            AgentPromptAssignmentModel,
            AgentPromptAssignmentModel.prompt_id == ManagedPromptModel.id,
        )
        .where(
            AgentPromptAssignmentModel.agent_id == agent.id,
            ManagedPromptModel.workspace_id == workspace_id,
        )
        .order_by(ManagedPromptModel.prompt_id, ManagedPromptModel.version.desc())
    )
    result = await session.execute(stmt)
    return [_model_to_schema(r) for r in result.scalars().all()]


@router.get(
    "/{id}",
    response_model=ManagedPromptRead,
    summary="Get prompt by ID",
)
async def get_prompt(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedPromptRead:
    """Get a prompt by its UUID."""
    model = await _get_prompt(id, session, workspace_id)
    return _model_to_schema(model)


@router.patch(
    "/{id}",
    response_model=ManagedPromptRead,
    summary="Update prompt tags",
)
async def patch_prompt(
    id: str,
    request: ManagedPromptPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedPromptRead:
    """Update a prompt's tags. Content is immutable.

    The ``latest`` tag is auto-managed and cannot be manually added or removed.
    """
    model = await _get_prompt(id, session, workspace_id)

    # Strip "latest" from incoming tags — it's auto-managed
    tags = [t for t in request.tags if t != "latest"]

    # Re-derive: if this is the highest version, it keeps "latest"
    max_version_stmt = select(func.max(ManagedPromptModel.version)).where(
        ManagedPromptModel.workspace_id == workspace_id,
        ManagedPromptModel.prompt_id == model.prompt_id,
    )
    result = await session.execute(max_version_stmt)
    if model.version == result.scalar_one():
        tags.append("latest")

    model.tags = tags
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete prompt",
)
async def delete_prompt(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a prompt version permanently.

    If the deleted version carried the ``latest`` tag, the next-highest
    version is promoted automatically.
    """
    model = await _get_prompt(id, session, workspace_id)
    was_latest = "latest" in (model.tags or [])
    prompt_id = model.prompt_id

    await session.delete(model)
    await session.flush()

    if was_latest:
        stmt = (
            select(ManagedPromptModel)
            .where(
                ManagedPromptModel.workspace_id == workspace_id,
                ManagedPromptModel.prompt_id == prompt_id,
            )
            .order_by(ManagedPromptModel.version.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        new_latest = result.scalar_one_or_none()
        if new_latest:
            tags = list(new_latest.tags or [])
            if "latest" not in tags:
                tags.append("latest")
            new_latest.tags = tags
            await session.flush()


async def _get_agent(
    agent_id: str,
    session: AsyncSession,
    workspace_id: UUID,
) -> ManagedAgentModel:
    """Get agent by ID, scoped to workspace."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent_id format",
        ) from err

    agent = await session.get(ManagedAgentModel, agent_uuid)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    return agent


@router.post(
    "/{id}/assign/{agent_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Assign prompt to agent",
)
async def assign_prompt(
    id: str,
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> dict[str, str]:
    """Assign a prompt to an agent. Both must belong to the same workspace."""
    prompt = await _get_prompt(id, session, workspace_id)
    agent = await _get_agent(agent_id, session, workspace_id)

    assignment = AgentPromptAssignmentModel(
        agent_id=agent.id,
        prompt_id=prompt.id,
    )
    session.add(assignment)
    try:
        await session.flush()
    except IntegrityError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Prompt is already assigned to this agent",
        ) from err

    return {"status": "assigned"}


@router.delete(
    "/{id}/assign/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unassign prompt from agent",
)
async def unassign_prompt(
    id: str,
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Remove a prompt assignment from an agent."""
    prompt = await _get_prompt(id, session, workspace_id)
    agent = await _get_agent(agent_id, session, workspace_id)

    stmt = select(AgentPromptAssignmentModel).where(
        AgentPromptAssignmentModel.agent_id == agent.id,
        AgentPromptAssignmentModel.prompt_id == prompt.id,
    )
    result = await session.execute(stmt)
    assignment = result.scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    await session.delete(assignment)
    await session.flush()
