"""Managed Integration configuration API.

This router exposes endpoints to create, read, list, update, and delete
managed integration configurations. All CRUD endpoints are project-scoped
with RBAC enforcement.

Endpoints (mounted at /projects/{project_id}/integrations):
    POST   /          - Create a new integration config      (contributor)
    GET    /          - List integration configs (pagination) (reader)
    GET    /{id}      - Get a specific integration by ID     (reader)
    PATCH  /{id}      - Update an integration config         (contributor)
    DELETE /{id}      - Delete an integration config         (admin)
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.manager.managed_integration import (
    ManagedIntegrationCreate,
    ManagedIntegrationPatch,
    ManagedIntegrationRead,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_project_role,
    require_workspace,
)
from app.infrastructure.db.models.managed_integration import (
    ManagedIntegrationModel,
)

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_integration(
    id: str,
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID,
) -> ManagedIntegrationModel:
    """Get integration config by ID, scoped to workspace and project."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedIntegrationModel, uuid_id)
    if not model or model.workspace_id != workspace_id or model.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedIntegrationModel,
) -> ManagedIntegrationRead:
    """Transform database model to response schema."""
    integration = IntegrationConfig(**model.integration_config)
    return ManagedIntegrationRead(
        id=model.id,
        name=model.name,
        integration=integration,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedIntegrationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed integration",
)
async def create_integration(
    project_id: str,
    request: ManagedIntegrationCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Create a new managed integration configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")

    now = datetime.now(UTC)

    integration_config = IntegrationConfig(**request.integration.model_dump())

    model = ManagedIntegrationModel(
        id=uuid4(),
        name=request.name,
        integration_config=integration_config.model_dump(),
        created_at=now,
        updated_at=now,
        workspace_id=access.workspace_id,
        project_id=project_uuid,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/",
    response_model=list[ManagedIntegrationRead],
    summary="List managed integrations",
)
async def list_integrations(
    project_id: str,
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedIntegrationRead]:
    """List managed integration configurations with pagination."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")

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

    stmt = (
        select(ManagedIntegrationModel)
        .where(
            ManagedIntegrationModel.workspace_id == access.workspace_id,
            ManagedIntegrationModel.project_id == project_uuid,
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedIntegrationRead,
    summary="Get managed integration by ID",
)
async def get_integration(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Get a managed integration configuration by ID."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")
    model = await _get_integration(id, session, access.workspace_id, project_uuid)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed integration",
)
async def delete_integration(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed integration configuration permanently."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "admin")
    model = await _get_integration(id, session, access.workspace_id, project_uuid)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedIntegrationRead,
    summary="Update managed integration",
)
async def patch_integration(
    project_id: str,
    id: str,
    request: ManagedIntegrationPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Update an integration configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_integration(id, session, access.workspace_id, project_uuid)

    model.name = request.name
    integration_config = IntegrationConfig(
        **request.integration.model_dump()
    )
    model.integration_config = integration_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
