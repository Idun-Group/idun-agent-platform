"""Managed Guardrail API.

This router exposes endpoints to create, read, list, update, and delete
managed guardrail configurations. All CRUD endpoints are project-scoped
with RBAC enforcement.

Endpoints (mounted at /projects/{project_id}/guardrails):
    POST   /          - Create a new guardrail config       (contributor)
    GET    /          - List guardrail configs (pagination)  (reader)
    GET    /{id}      - Get a specific guardrail by ID       (reader)
    PATCH  /{id}      - Update a guardrail config            (contributor)
    DELETE /{id}      - Delete a guardrail config            (admin)
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.manager.guardrail_configs import (
    ManagerGuardrailConfig as GuardrailConfig,
)
from idun_agent_schema.manager.managed_guardrail import (
    ManagedGuardrailCreate,
    ManagedGuardrailPatch,
    ManagedGuardrailRead,
)
from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_project_role,
    require_workspace,
)
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_guardrail(
    id: str,
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID,
) -> ManagedGuardrailModel:
    """Get guardrail config by ID, scoped to workspace and project."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedGuardrailModel, uuid_id)
    if not model or model.workspace_id != workspace_id or model.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guardrail config with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedGuardrailModel) -> ManagedGuardrailRead:
    """Transform database model to response schema."""
    guardrail = TypeAdapter(GuardrailConfig).validate_python(model.guardrail_config)
    return ManagedGuardrailRead(
        id=model.id,  # type: ignore
        name=model.name,
        guardrail=guardrail,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedGuardrailRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed guardrail config",
)
async def create_guardrail(
    project_id: str,
    request: ManagedGuardrailCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedGuardrailRead:
    """Create a new managed guardrail configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")

    now = datetime.now(UTC)

    guardrail_config = request.guardrail

    model = ManagedGuardrailModel(
        id=uuid4(),
        name=request.name,
        guardrail_config=guardrail_config.model_dump(),
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
    response_model=list[ManagedGuardrailRead],
    summary="List managed guardrail configs",
)
async def list_guardrails(
    project_id: str,
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedGuardrailRead]:
    """List managed guardrail configurations with pagination."""
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
        select(ManagedGuardrailModel)
        .where(
            ManagedGuardrailModel.workspace_id == access.workspace_id,
            ManagedGuardrailModel.project_id == project_uuid,
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Get managed guardrail config by ID",
)
async def get_guardrail(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedGuardrailRead:
    """Get a managed guardrail configuration by ID."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")
    model = await _get_guardrail(id, session, access.workspace_id, project_uuid)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed guardrail config",
)
async def delete_guardrail(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed guardrail configuration permanently."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "admin")
    model = await _get_guardrail(id, session, access.workspace_id, project_uuid)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Update managed guardrail config",
)
async def patch_guardrail(
    project_id: str,
    id: str,
    request: ManagedGuardrailPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedGuardrailRead:
    """Update a guardrail configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_guardrail(id, session, access.workspace_id, project_uuid)

    model.name = request.name
    guardrail_config = request.guardrail
    model.guardrail_config = guardrail_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
