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
- All resource endpoints are scoped to the authenticated user's active workspace.

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
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.manager import (
    AgentStatus,
    ApiKeyResponse,
    ManagedAgentCreate,
    ManagedAgentPatch,
    ManagedAgentRead,
)
from idun_agent_schema.manager.guardrail_configs import convert_guardrail
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.api.v1.routers.auth import encrypt_payload
from app.infrastructure.db.models.managed_agent import ManagedAgentModel

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__file__)


# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100
API_KEY_PREFIX = "idun-"


async def _get_agent(
    agent_id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedAgentModel:
    """Get agent by ID, optionally scoped to a workspace."""
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
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    return model


def _model_to_schema(model: ManagedAgentModel) -> ManagedAgentRead:
    """Transform database model to response schema."""
    engine_config = EngineConfig(**model.engine_config)

    return ManagedAgentRead(
        id=model.id,  # type: ignore
        base_url=model.base_url,
        name=model.name,
        status=AgentStatus(model.status),
        version=model.version,
        engine_config=engine_config.model_dump(),  # type: ignore
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
    raw_request: Request,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedAgentRead:
    """Create a new managed agent."""
    body = await raw_request.json()

    if "engine_config" in body and "guardrails" in body["engine_config"]:
        body["engine_config"]["guardrails"] = convert_guardrail(
            body["engine_config"]["guardrails"]
        )

    request = ManagedAgentCreate(**body)

    now = datetime.now(UTC)

    engine_config = EngineConfig(**request.engine_config.model_dump())

    model = ManagedAgentModel(
        id=uuid4(),
        base_url=request.base_url,
        name=request.name,
        status=AgentStatus.DRAFT.value,
        version=request.version,
        engine_config=engine_config.model_dump(),
        created_at=now,
        updated_at=now,
        workspace_id=workspace_id,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/key",
    response_model=ApiKeyResponse,
    summary="Generate agent API key",
    description="Generate a unique API key (hash) for an agent to authenticate API requests.",
)
async def generate_key(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
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

    if not model or model.workspace_id != workspace_id:
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

    This endpoint does NOT require a session cookie – it uses Bearer token auth.
    """
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    agent_hash = auth[7:]

    try:
        stmt = select(ManagedAgentModel).where(
            ManagedAgentModel.agent_hash == agent_hash
        )
        result = await session.execute(stmt)
        agent_model = result.scalar_one_or_none()
    except SQLAlchemyError as e:
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
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedAgentRead]:
    """List managed agents with pagination, scoped to workspace."""
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
        select(ManagedAgentModel)
        .where(ManagedAgentModel.workspace_id == workspace_id)
        .limit(limit)
        .offset(offset)
    )

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
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedAgentRead:
    """Get a managed agent by ID."""
    model = await _get_agent(id, session, workspace_id)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed agent",
    description="Permanently delete a managed agent and all its configuration data.",
)
async def delete_agent(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed agent permanently."""
    model = await _get_agent(id, session, workspace_id)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedAgentRead,
    summary="Partially update agent (PATCH)",
    description="Partially update an agent's configuration. Only the name and engine_config field can be updated if provided.",
)
async def patch_agent(
    id: str,
    raw_request: Request,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedAgentRead:
    """Partially update an agent's configuration."""
    model = await _get_agent(id, session, workspace_id)

    body = await raw_request.json()

    if "engine_config" in body and "guardrails" in body["engine_config"]:
        body["engine_config"]["guardrails"] = convert_guardrail(
            body["engine_config"]["guardrails"]
        )

    request = ManagedAgentPatch(**body)

    model.name = request.name
    model.base_url = request.base_url
    engine_config = EngineConfig(**request.engine_config.model_dump())
    model.engine_config = engine_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
