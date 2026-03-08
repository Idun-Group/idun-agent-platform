"""Managed SSO configuration API.

This router exposes endpoints to create, read, list, update, and delete
managed SSO configurations. All CRUD endpoints are project-scoped
with RBAC enforcement.

Endpoints (mounted at /projects/{project_id}/sso):
    POST   /          - Create a new SSO config              (contributor)
    GET    /          - List SSO configs (pagination)         (reader)
    GET    /{id}      - Get a specific SSO config by ID      (reader)
    PATCH  /{id}      - Update an SSO config                 (contributor)
    DELETE /{id}      - Delete an SSO config                  (admin)
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.sso import SSOConfig
from idun_agent_schema.manager.managed_sso import (
    ManagedSSOCreate,
    ManagedSSOPatch,
    ManagedSSORead,
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
from app.infrastructure.db.models.managed_sso import ManagedSSOModel

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_sso(
    id: str,
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID,
) -> ManagedSSOModel:
    """Get SSO config by ID, scoped to workspace and project."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedSSOModel, uuid_id)
    if not model or model.workspace_id != workspace_id or model.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SSO config with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedSSOModel) -> ManagedSSORead:
    """Transform database model to response schema."""
    sso = SSOConfig(**model.sso_config)
    return ManagedSSORead(
        id=model.id,
        name=model.name,
        sso=sso,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedSSORead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed SSO config",
)
async def create_sso(
    project_id: str,
    request: ManagedSSOCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Create a new managed SSO configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")

    now = datetime.now(UTC)

    sso_config = SSOConfig(**request.sso.model_dump())

    model = ManagedSSOModel(
        id=uuid4(),
        name=request.name,
        sso_config=sso_config.model_dump(),
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
    response_model=list[ManagedSSORead],
    summary="List managed SSO configs",
)
async def list_ssos(
    project_id: str,
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedSSORead]:
    """List managed SSO configurations with pagination."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")

    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    stmt = (
        select(ManagedSSOModel)
        .where(
            ManagedSSOModel.workspace_id == access.workspace_id,
            ManagedSSOModel.project_id == project_uuid,
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedSSORead,
    summary="Get managed SSO config by ID",
)
async def get_sso(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Get a managed SSO configuration by ID."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")
    model = await _get_sso(id, session, access.workspace_id, project_uuid)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed SSO config",
)
async def delete_sso(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed SSO configuration permanently."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "admin")
    model = await _get_sso(id, session, access.workspace_id, project_uuid)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedSSORead,
    summary="Update managed SSO config",
)
async def patch_sso(
    project_id: str,
    id: str,
    request: ManagedSSOPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Update an SSO configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_sso(id, session, access.workspace_id, project_uuid)

    model.name = request.name
    sso_config = SSOConfig(**request.sso.model_dump())
    model.sso_config = sso_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
