"""Agent API endpoints - Core CRUD operations."""

from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from idun_agent_schema.engine.config import AgentFramework
from idun_agent_schema.manager.api import (
    Agent,
    AgentCreate,
    AgentPatch,
    AgentReplace,
)
from idun_agent_schema.manager.domain import AgentStatus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Principal,
    get_principal,
    get_session,
)
from app.infrastructure.db.models.agent_config import AgentConfigModel
from src.app.api.v1.routers.auth import encrypt_payload

router = APIRouter()


# Fields that are allowed to be used for sorting in list queries (id is excluded)
SORTABLE_AGENT_FIELDS = {
    "name",
    "description",
    "framework",
    "status",
    "created_at",
    "updated_at",
}


# Helper to normalize framework values to enum (defaults to CUSTOM)
def map_framework(value: str) -> AgentFramework:
    try:
        return AgentFramework(value.lower())
    except Exception:
        return AgentFramework.CUSTOM


@router.post(
    "/",
    response_model=Agent,
    status_code=status.HTTP_201_CREATED,
    summary="Create agent",
    description="Create a new agent with proper validation and framework support",
)
async def create_agent(
    request: AgentCreate,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
    workspace_id: str | None = None,
) -> Agent:
    """Create a new agent backed by PostgreSQL (table: agent_config).

    - Accepts framework and raw config JSON
    - Persists a row in agent_config
    - Returns the created agent in the public API shape
    """
    # Infer framework from config
    framework_value: str | None = request.config.type if request.config else None
    if not framework_value or not isinstance(framework_value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing framework type in config.type",
        )

    framework_enum = map_framework(framework_value)

    # Create row
    new_id = uuid4()
    ws_uuid = None
    if workspace_id:
        try:
            ws_uuid = UUID(workspace_id)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid workspace_id format",
            ) from err
        # Enforce workspace access if principal has specific workspace scope
        if principal.workspace_ids and ws_uuid not in set(principal.workspace_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspace"
            )

    model = AgentConfigModel(
        id=new_id,
        name=request.name,
        description=request.description,
        framework=framework_enum.value,
        status=AgentStatus.DRAFT.value,
        config=request.config.model_dump(),
        tenant_id=principal.tenant_id,
        workspace_id=ws_uuid,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return Agent(
        id=str(model.id),
        name=model.name,
        description=model.description,
        framework=map_framework(model.framework),
        status=AgentStatus(model.status),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.get(
    "/key",
    summary="Generate Agent API Key",
)
async def generate_key(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
):
    try:
        uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status=status.HTTP_400_BAD_REQUEST, detail="Invalid agent format"
        ) from err

    model = await session.get(AgentConfigModel, uuid)
    if not model:
        raise HTTPException(
            status=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id: {agent_id} not found",
        )

    if model.tenant_id != principal.tenant_id:
        raise HTTPException(status=status.HTTP_403_FORBIDDEN, detail="Forbidden agent")

    agent_data = f"{model.id}:{model.name}:{model.tenant_id}"
    new_agent_hash = encrypt_payload(agent_data).hex()
    model.agent_hash = new_agent_hash
    await session.flush()
    return {"api_key": new_agent_hash}


@router.get("/config", summary="Get the config of an agent")
async def config(session: AsyncSession = Depends(get_session), auth: str = Header(...)):
    # sends the hash from the auth headers to verify
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    agent_hash = auth[7:]
    try:
        stmt = select(AgentConfigModel).where(AgentConfigModel.agent_hash == agent_hash)
        result = await session.execute(stmt)
        agent_model = result.scalar_one_or_none()
        if not agent_model:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invalid API Key"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error retrieving info from db: {e}",
        ) from e

    return agent_model


@router.get(
    "/",
    response_model=list[Agent],
    summary="List agents",
    description=(
        "List all agents with pagination and deterministic sorting. "
        "Use 'sort_by' (one of: name, description, framework, status, created_at, updated_at) "
        "and 'order' (asc|desc). Defaults: sort_by=created_at, order=asc."
    ),
)
async def list_agents(
    limit: int = 100,
    offset: int = 0,
    sort_by: str = "created_at",
    order: Literal["asc", "desc"] = "asc",
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
    workspace_ids: list[str] | None = Depends(lambda: None),
) -> list[Agent]:
    """List agents from PostgreSQL with limit/offset pagination."""
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 1000",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    # Validate sorting parameters
    if sort_by not in SORTABLE_AGENT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort_by '{sort_by}'. Allowed: {sorted(SORTABLE_AGENT_FIELDS)}",
        )

    from sqlalchemy import asc, desc, select

    # Build deterministic ordering: primary sort + stable tiebreaker by id ASC
    sort_column = getattr(AgentConfigModel, sort_by)
    primary_order = asc(sort_column) if order == "asc" else desc(sort_column)
    stable_tiebreaker = asc(AgentConfigModel.id)

    # Workspace scoping
    ws_filter: list[UUID] = []
    if workspace_ids:
        parsed: list[UUID] = []
        for ws in workspace_ids:
            try:
                parsed.append(UUID(ws))
            except ValueError as err:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid workspace_ids format",
                ) from err
        if principal.workspace_ids:
            allowed = set(principal.workspace_ids)
            ws_filter = [ws for ws in parsed if ws in allowed]
            if parsed and not ws_filter:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspaces"
                )
        else:
            ws_filter = parsed

    stmt = select(AgentConfigModel).where(
        AgentConfigModel.tenant_id == principal.tenant_id
    )
    if ws_filter:
        stmt = stmt.where(AgentConfigModel.workspace_id.in_(ws_filter))
    stmt = stmt.order_by(primary_order, stable_tiebreaker).limit(limit).offset(offset)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        Agent(
            id=str(r.id),
            name=r.name,
            description=r.description,
            framework=map_framework(r.framework),
            status=AgentStatus(r.status),
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.get(
    "/{agent_id}",
    response_model=Agent,
    summary="Get agent",
    description="Get a specific agent by ID with detailed information",
)
async def get_agent(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
) -> Agent:
    """Get agent by ID from PostgreSQL with proper error handling."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format"
        ) from err

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    if model.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if (
        model.workspace_id
        and principal.workspace_ids
        and model.workspace_id not in set(principal.workspace_ids)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspace"
        )

    return Agent(
        id=str(model.id),
        name=model.name,
        description=model.description,
        framework=map_framework(model.framework),
        status=AgentStatus(model.status),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.put(
    "/{agent_id}",
    response_model=Agent,
    summary="Replace agent (PUT)",
    description=(
        "Replace an agent's mutable fields with the provided representation. "
        "Framework is inferred from config.type."
    ),
)
async def update_agent(
    agent_id: str,
    request: AgentReplace,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
) -> Agent:
    """Full replacement of an existing agent in PostgreSQL (PUT semantics)."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format"
        ) from err

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    if model.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if (
        model.workspace_id
        and principal.workspace_ids
        and model.workspace_id not in set(principal.workspace_ids)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspace"
        )

    # Infer framework from config
    framework_value: str | None = request.config.type if request.config else None
    if not framework_value or not isinstance(framework_value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing framework type in config.type",
        )
    framework_enum = map_framework(framework_value)

    # Apply full replacement for mutable fields
    model.name = request.name
    model.description = request.description
    model.framework = framework_enum.value
    model.config = request.config.model_dump()

    await session.flush()
    await session.refresh(model)

    return Agent(
        id=str(model.id),
        name=model.name,
        description=model.description,
        framework=map_framework(model.framework),
        status=AgentStatus(model.status),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete agent",
    description="Delete an agent permanently",
)
async def delete_agent(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
) -> None:
    """Delete an agent_config row by UUID."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format"
        ) from err

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    if model.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if (
        model.workspace_id
        and principal.workspace_ids
        and model.workspace_id not in set(principal.workspace_ids)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspace"
        )

    await session.delete(model)
    await session.flush()
    return


@router.patch(
    "/{agent_id}",
    response_model=Agent,
    summary="Partially update agent (PATCH)",
    description=(
        "Partially update an agent. Only provided fields are modified. "
        "If config is provided, framework is inferred from config.type."
    ),
)
async def patch_agent(
    agent_id: str,
    request: AgentPatch,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
) -> Agent:
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format"
        ) from err

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )
    if model.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if (
        model.workspace_id
        and principal.workspace_ids
        and model.workspace_id not in set(principal.workspace_ids)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden workspace"
        )

    if request.name is not None:
        model.name = request.name
    if request.description is not None:
        model.description = request.description
    if request.config is not None:
        framework_value: str | None = request.config.type if request.config else None
        if not framework_value or not isinstance(framework_value, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing framework type in config.type",
            )
        model.framework = map_framework(framework_value).value
        model.config = request.config.model_dump()

    await session.flush()
    await session.refresh(model)

    return Agent(
        id=str(model.id),
        name=model.name,
        description=model.description,
        framework=map_framework(model.framework),
        status=AgentStatus(model.status),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )
