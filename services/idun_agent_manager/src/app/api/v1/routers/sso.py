"""Router for Managed SSO configurations."""

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.infrastructure.db.models.managed_sso import ManagedSSOModel
from idun_agent_schema.manager.managed_sso import (
    ManagedSSOCreate,
    ManagedSSOPatch,
    ManagedSSORead,
)
from idun_agent_schema.engine.sso import SSOConfiguration

router = APIRouter(prefix="/sso", tags=["Managed SSO"])


@router.post(
    "",
    response_model=ManagedSSORead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new managed SSO configuration",
)
async def create_managed_sso(
    sso_in: ManagedSSOCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ManagedSSORead:
    """Create a new managed SSO configuration."""
    sso_dict = sso_in.sso.model_dump(by_alias=True)
    db_obj = ManagedSSOModel(
        id=uuid4(),
        name=sso_in.name,
        sso_config=sso_dict,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return ManagedSSORead(
        id=db_obj.id,
        name=db_obj.name,
        sso=SSOConfiguration(**db_obj.sso_config),
        created_at=db_obj.created_at,
        updated_at=db_obj.updated_at,
    )


@router.get(
    "/{sso_id}",
    response_model=ManagedSSORead,
    summary="Get a managed SSO configuration by ID",
)
async def get_managed_sso(
    sso_id: UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ManagedSSORead:
    """Get a managed SSO configuration by ID."""
    stmt = select(ManagedSSOModel).where(ManagedSSOModel.id == sso_id)
    result = await db.execute(stmt)
    db_obj = result.scalar_one_or_none()

    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Managed SSO with ID {sso_id} not found",
        )

    return ManagedSSORead(
        id=db_obj.id,
        name=db_obj.name,
        sso=SSOConfiguration(**db_obj.sso_config),
        created_at=db_obj.created_at,
        updated_at=db_obj.updated_at,
    )


@router.get(
    "",
    response_model=list[ManagedSSORead],
    summary="List all managed SSO configurations",
)
async def list_managed_ssos(
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[ManagedSSORead]:
    """List all managed SSO configurations."""
    stmt = select(ManagedSSOModel)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        ManagedSSORead(
            id=row.id,
            name=row.name,
            sso=SSOConfiguration(**row.sso_config),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.put(
    "/{sso_id}",
    response_model=ManagedSSORead,
    summary="Update a managed SSO configuration",
)
async def update_managed_sso(
    sso_id: UUID,
    sso_in: ManagedSSOPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ManagedSSORead:
    """Update a managed SSO configuration."""
    stmt = select(ManagedSSOModel).where(ManagedSSOModel.id == sso_id)
    result = await db.execute(stmt)
    db_obj = result.scalar_one_or_none()

    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Managed SSO with ID {sso_id} not found",
        )

    db_obj.name = sso_in.name
    db_obj.sso_config = sso_in.sso.model_dump(by_alias=True)

    await db.commit()
    await db.refresh(db_obj)

    return ManagedSSORead(
        id=db_obj.id,
        name=db_obj.name,
        sso=SSOConfiguration(**db_obj.sso_config),
        created_at=db_obj.created_at,
        updated_at=db_obj.updated_at,
    )


@router.delete(
    "/{sso_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a managed SSO configuration",
)
async def delete_managed_sso(
    sso_id: UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Delete a managed SSO configuration."""
    stmt = select(ManagedSSOModel).where(ManagedSSOModel.id == sso_id)
    result = await db.execute(stmt)
    db_obj = result.scalar_one_or_none()

    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Managed SSO with ID {sso_id} not found",
        )

    await db.delete(db_obj)
    await db.commit()
