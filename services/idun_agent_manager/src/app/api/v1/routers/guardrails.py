"""Managed Guardrail API.

This router exposes endpoints to create, read, list, update, and delete
managed guardrail configurations.
"""

import logging
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.guardrails_v2 import GuardrailConfig, GuardrailsV2
from idun_agent_schema.manager.managed_guardrail import (
    ManagedGuardrailCreate,
    ManagedGuardrailPatch,
    ManagedGuardrailRead,
)
from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


def _enrich_old_guardrail_config(guardrail_dict: dict) -> dict:
    if guardrail_dict.get("config_id") == "ban_list":
        top_level_banned_words = guardrail_dict.get("banned_words", [])

        if top_level_banned_words:
            if (
                isinstance(top_level_banned_words[0], str)
                and "," in top_level_banned_words[0]
            ):
                top_level_banned_words = [
                    word.strip()
                    for word in top_level_banned_words[0].split(",")
                    if word.strip()
                ]

        if "api_key" in guardrail_dict:
            if top_level_banned_words:
                if "guard_params" not in guardrail_dict:
                    guardrail_dict["guard_params"] = {}
                guardrail_dict["guard_params"]["banned_words"] = top_level_banned_words
            return guardrail_dict

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            raise ValueError("GUARDRAILS_API_KEY not found in environment")

        reject_message = os.getenv(
            "GUARDRAILS_DEFAULT_REJECT_MESSAGE", "Content blocked by guardrails"
        )

        return {
            "config_id": "ban_list",
            "api_key": api_key,
            "guard_url": "hub://guardrails/ban_list",
            "reject_message": reject_message,
            "guard_params": {"banned_words": top_level_banned_words},
        }

    return guardrail_dict


async def _get_guardrail(id: str, session: AsyncSession) -> ManagedGuardrailModel:
    """Get guardrail config by ID."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedGuardrailModel, uuid_id)
    if not model:
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
    request_body: dict,
    session: AsyncSession = Depends(get_session),
) -> ManagedGuardrailRead:
    """Create a new managed guardrail configuration."""
    now = datetime.now(UTC)

    guardrail_dict = _enrich_old_guardrail_config(request_body.get("guardrail", {}))
    guardrail_config = TypeAdapter(GuardrailConfig).validate_python(guardrail_dict)

    import pdb

    pdb.set_trace()
    model = ManagedGuardrailModel(
        id=uuid4(),
        name=request_body.get("name"),
        guardrail_config=guardrail_config.model_dump(),
        created_at=now,
        updated_at=now,
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
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> list[ManagedGuardrailRead]:
    """List managed guardrail configurations with pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    stmt = select(ManagedGuardrailModel).limit(limit).offset(offset)
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Get managed guardrail config by ID",
)
async def get_guardrail(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> ManagedGuardrailRead:
    """Get a managed guardrail configuration by ID."""
    model = await _get_guardrail(id, session)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed guardrail config",
)
async def delete_guardrail(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a managed guardrail configuration permanently."""
    model = await _get_guardrail(id, session)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Update managed guardrail config",
)
async def patch_guardrail(
    id: str,
    request_body: dict,
    session: AsyncSession = Depends(get_session),
) -> ManagedGuardrailRead:
    """Update a guardrail configuration."""
    model = await _get_guardrail(id, session)

    model.name = request_body.get("name")
    guardrail_dict = _enrich_old_guardrail_config(request_body.get("guardrail", {}))
    guardrail_config = TypeAdapter(GuardrailConfig).validate_python(guardrail_dict)
    model.guardrail_config = guardrail_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
