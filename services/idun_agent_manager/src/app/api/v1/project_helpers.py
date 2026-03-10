"""Shared helpers for project-aware resource routers."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.project import ProjectModel


async def resolve_project_id(
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID | None = None,
) -> UUID:
    """Resolve which project a new resource should be assigned to.

    If project_id is provided and valid, returns it.
    Otherwise returns the workspace's default project ID.
    Raises ValueError if no project can be resolved.
    """
    if project_id is not None:
        project = await session.get(ProjectModel, project_id)
        if project is not None and project.workspace_id == workspace_id:
            return project_id

    stmt = select(ProjectModel).where(
        ProjectModel.workspace_id == workspace_id,
        ProjectModel.is_default.is_(True),
    )
    default_project = (await session.execute(stmt)).scalar_one_or_none()
    if default_project is None:
        raise ValueError(f"No default project for workspace {workspace_id}")
    return default_project.id


def apply_project_filter(stmt, model_class, project_id: UUID | None):
    """Apply optional project filter to a SELECT statement.

    Now uses direct project_id column instead of junction table JOIN.
    """
    if project_id is None:
        return stmt
    return stmt.where(model_class.project_id == project_id)
