"""Managed Agent API (MVP).

This router exposes a minimal set of endpoints to create, read, list, update,
delete, and fetch configuration for managed agents. Each managed agent stores a
complete `EngineConfig`.

MVP assumptions and behavior:
- API keys are generated per agent via `/key` and stored on the agent record as
  `agent_hash`. The API key includes a static prefix and must be sent as a
  Bearer token to access `/config`.
- Database access uses SQLAlchemy async sessions. Errors are surfaced as simple
  HTTP problem responses with relevant status codes.

Endpoints:
    POST   /          - Create a new managed agent
    GET    /          - List agents (pagination)
    GET    /{id}      - Get a specific agent by ID
    PATCH  /{id}      - Partially update an agent's engine configuration
    DELETE /{id}      - Delete an agent
    GET    /key       - Generate an API key for agent authentication
    GET    /config    - Retrieve agent config using API key (Bearer token)
"""

import logging
import os
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.manager import (
    AgentStatus,
    ApiKeyResponse,
    ManagedAgentCreate,
    ManagedAgentPatch,
    ManagedAgentRead,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import allow_user, get_session
from app.api.v1.routers.auth import encrypt_payload
from app.infrastructure.db.models.managed_agent import ManagedAgentModel

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__file__)


# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100
API_KEY_PREFIX = "idun-"


def _translate_guardrails_config(engine_config_dict: dict) -> dict:
    if "guardrails" in engine_config_dict and engine_config_dict["guardrails"]:
        guardrails = engine_config_dict["guardrails"]

        if "input" in guardrails and guardrails["input"]:
            guardrails["input"] = [
                _enrich_old_guardrail_config(g) for g in guardrails["input"]
            ]
        if "output" in guardrails and guardrails["output"]:
            guardrails["output"] = [
                _enrich_old_guardrail_config(g) for g in guardrails["output"]
            ]
    return engine_config_dict


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


async def _get_agent(agent_id: str, session: AsyncSession) -> ManagedAgentModel:
    """Get agent by ID."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent id format",
        ) from err

    model = await session.get(ManagedAgentModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    return model


def _model_to_schema(model: ManagedAgentModel) -> ManagedAgentRead:
    """Transform database model to response schema.

    Args:
        model: Database model instance

    Returns:
        ManagedAgentRead: Pydantic response model
    """

    engine_config_dict = _translate_guardrails_config(model.engine_config.copy())
    engine_config = EngineConfig(**engine_config_dict)

    return ManagedAgentRead(
        id=model.id,
        base_url=model.base_url,
        name=model.name,
        status=AgentStatus(model.status),
        version=model.version,
        engine_config=engine_config.model_dump(),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedAgentCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed agent",
    description="Create a new managed agent with an EngineConfig. The agent is created in DRAFT status.",
)
async def create_agent(
    request: ManagedAgentCreate,
    #    client_key: str,
    #   _: None = Depends(allow_user),
    session: AsyncSession = Depends(get_session),
) -> ManagedAgentRead:
    """Create a new managed agent.

    Args:
        request: Complete `EngineConfig` containing server and agent configuration
        session: Database session (injected)

    Returns:
        ManagedAgentCreate: The created agent with all metadata

    Raises:
        HTTPException 400: Invalid agent id format
    """

    # Set timestamps
    now = datetime.now(UTC)

    # Validate engine config

    engine_config_dict = _translate_guardrails_config(
        request.engine_config.model_dump()
    )
    engine_config = EngineConfig(**engine_config_dict)

    # Create database model instance (status persisted as string)
    model = ManagedAgentModel(
        id=uuid4(),
        base_url=request.base_url,
        name=request.name,
        status=AgentStatus.DRAFT.value,
        version=request.version,
        engine_config=engine_config.model_dump(),  # Store as dict (JSONB)
        created_at=now,
        updated_at=now,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    # Return Pydantic model for response
    return _model_to_schema(model)


@router.get(
    "/key",
    response_model=ApiKeyResponse,
    summary="Generate agent API key",
    description="Generate a unique API key (hash) for an agent to authenticate API requests.",
)
async def generate_key(
    #    client_key: str,
    agent_id: str,
    #   _: None = Depends(allow_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format"
        ) from err

    try:
        model = await session.get(ManagedAgentModel, uuid)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error occured. Please try again later",
        ) from e

    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id: {agent_id} not found",
        )

    agent_data = f"{model.id}:{model.name}"
    try:
        new_agent_hash = encrypt_payload(agent_data).hex()
        model.agent_hash = new_agent_hash
        await session.flush()
        return {"api_key": new_agent_hash}

    except Exception as e:
        logger.error(f"Error setting the agent hash: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error occured. please try again later",
        ) from e


@router.get(
    "/config",
    summary="Get agent config by API key",
    description="Retrieve agent configuration using API key authentication (Bearer token).",
    response_model=ManagedAgentRead,
)
async def config(
    session: AsyncSession = Depends(get_session), auth: str = Header(...)
) -> ManagedAgentRead:
    """Get agent configuration using API key authentication.

    Expects the full API key (including prefix) as the Bearer token. If the key
    matches an agent's ``agent_hash``, the agent configuration is returned.

    Args:
        session: Database session (injected)
        auth: Authorization header containing Bearer token

    Returns:
        ManagedAgentModel: The agent database model (SQLAlchemy model)

    Raises:
        HTTPException 401: Invalid authorization header format
        HTTPException 404: Invalid or expired API key
        HTTPException 500: Database error
    """
    # Validate Bearer token format
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    # Extract API key from Bearer token
    agent_hash = auth[7:]

    # Query agent by API key
    try:
        stmt = select(ManagedAgentModel).where(
            ManagedAgentModel.agent_hash == agent_hash
        )
        result = await session.execute(stmt)
        agent_model = result.scalar_one_or_none()
    except SQLAlchemyError as e:
        # Loggers can be added later via app.core.logging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred",
        ) from e

    if not agent_model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid API Key"
        )

    return _model_to_schema(agent_model)


@router.get(
    "/",
    response_model=list[ManagedAgentRead],
    summary="List managed agents",
    description="List all managed agents with pagination.",
)
async def list_agents(
    #    client_key: str,
    #   _: None = Depends(allow_user),
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> list[ManagedAgentRead]:
    """List managed agents with pagination.

    Args:
        limit: Maximum number of agents to return (1-1000, default: 100)
        offset: Number of agents to skip (default: 0)
        session: Database session (injected)

    Returns:
        list[ManagedAgentCreate]: List of managed agents

    Raises:
        HTTPException 400: Invalid limit, offset format
    """
    # Validate pagination parameters
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    # Build query
    stmt = select(ManagedAgentModel)

    # Apply pagination
    stmt = stmt.limit(limit).offset(offset)

    # Execute query and transform results
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedAgentRead,
    summary="Get managed agent by ID",
    description="Retrieve a specific managed agent by its UUID with complete configuration details.",
)
async def get_agent(
    #    client_key: str,
    id: str,
    #   _: None = Depends(allow_user),
    session: AsyncSession = Depends(get_session),
) -> ManagedAgentRead:
    """Get a managed agent by ID.

    Args:
        id: Agent UUID
        session: Database session (injected)

    Returns:
        ManagedAgentCreate: The requested agent with full configuration

    Raises:
        HTTPException 400: Invalid agent ID format
        HTTPException 404: Agent not found
    """
    model = await _get_agent(id, session)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed agent",
    description="Permanently delete a managed agent and all its configuration data.",
)
async def delete_agent(
    #    client_key: str,
    id: str,
    #   _: None = Depends(allow_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a managed agent permanently.

    This operation cannot be undone. The agent and its configuration will be
    permanently removed from the database.

    Args:
        id: Agent UUID
        session: Database session (injected)

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 400: Invalid agent ID format
        HTTPException 404: Agent not found
    """
    model = await _get_agent(id, session)

    # Delete agent from database
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedAgentRead,
    summary="Partially update agent (PATCH)",
    description="Partially update an agent's configuration. Only the name andengine_config field can be updated if provided.",
)
async def patch_agent(
    id: str,
    request_body: dict,
    session: AsyncSession = Depends(get_session),
) -> ManagedAgentRead:
    """Partially update an agent's configuration."""
    model = await _get_agent(id, session)

    model.name = request_body.get("name")
    model.base_url = request_body.get("base_url")

    engine_config_dict = _translate_guardrails_config(
        request_body.get("engine_config", {})
    )
    import pdb

    pdb.set_trace()
    engine_config = EngineConfig(**engine_config_dict)

    model.engine_config = engine_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
