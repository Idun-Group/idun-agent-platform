"""Shared helpers for project-aware resource routers."""

from uuid import UUID, uuid4

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_resource import ProjectResourceModel


async def assign_resource_to_default_project(
    session: AsyncSession,
    workspace_id: UUID,
    resource_id: UUID,
    resource_type: str,
    project_id: UUID | None = None,
) -> None:
    """Assign a newly created resource to a project.

    If project_id is provided, assigns to that project.
    Otherwise, assigns to the workspace's default project.
    """
    target_project_id = project_id
    if target_project_id is None:
        stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
            ProjectModel.is_default.is_(True),
        )
        result = await session.execute(stmt)
        default_project = result.scalar_one_or_none()
        if default_project is None:
            return
        target_project_id = default_project.id

    assignment = ProjectResourceModel(
        id=uuid4(),
        project_id=target_project_id,
        resource_id=resource_id,
        resource_type=resource_type,
    )
    session.add(assignment)
    await session.flush()


async def cleanup_resource_project_assignments(
    session: AsyncSession,
    resource_id: UUID,
    resource_type: str,
) -> None:
    """Remove all project_resources rows for a deleted resource."""
    stmt = delete(ProjectResourceModel).where(
        and_(
            ProjectResourceModel.resource_id == resource_id,
            ProjectResourceModel.resource_type == resource_type,
        )
    )
    await session.execute(stmt)


def apply_project_filter(stmt, model_class, resource_type: str, project_id: UUID | None):
    """Apply optional project filter to a SELECT statement via JOIN."""
    if project_id is None:
        return stmt
    return stmt.join(
        ProjectResourceModel,
        and_(
            ProjectResourceModel.resource_id == model_class.id,
            ProjectResourceModel.resource_type == resource_type,
            ProjectResourceModel.project_id == project_id,
        ),
    )
