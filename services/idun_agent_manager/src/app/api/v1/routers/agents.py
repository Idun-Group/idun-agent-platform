"""Agent API endpoints - Core CRUD operations."""

from typing import Any, Dict, List, Optional, Union, Annotated
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
from pydantic.config import ConfigDict
from typing import Literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.infrastructure.db.models.agent_config import AgentConfigModel

router = APIRouter()

# Simple in-memory storage
agents_db: List[Dict] = []

# Fields that are allowed to be used for sorting in list queries (id is excluded)
SORTABLE_AGENT_FIELDS = {
    "name",
    "description",
    "framework",
    "status",
    "created_at",
    "updated_at",
}


# Enums for better validation
class AgentFramework(str, Enum):
    """Supported agent frameworks."""
    LANGGRAPH = "langgraph"
    LANGCHAIN = "langchain"
    AUTOGEN = "autogen"
    CREWAI = "crewai"
    CUSTOM = "custom"


class AgentStatus(str, Enum):
    """Agent lifecycle status."""
    DRAFT = "draft"
    READY = "ready"
    DEPLOYED = "deployed"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


# Helper to normalize framework values to enum (defaults to CUSTOM)
def map_framework(value: str) -> AgentFramework:
    try:
        return AgentFramework(value.lower())
    except Exception:
        return AgentFramework.CUSTOM


# Improved Pydantic models
class LangGraphConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    graph_definition: str


class CrewAIConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    crew_definition: str


class CustomConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    entrypoint: str


class LangGraphAgentSection(BaseModel):
    type: Literal["langgraph"]
    config: LangGraphConfig


class CrewAIAgentSection(BaseModel):
    type: Literal["crewai"]
    config: CrewAIConfig


class CustomAgentSection(BaseModel):
    type: Literal["custom"]
    config: CustomConfig


AgentSection = Annotated[
    Union[LangGraphAgentSection, CrewAIAgentSection, CustomAgentSection],
    Field(discriminator="type"),
]


class AgentPayload(BaseModel):
    agent: AgentSection


class AgentCreate(BaseModel):
    """Schema for creating a new agent.

    Framework is inferred from config (e.g., config.agent.type = "langgraph").
    """
    name: str = Field(..., min_length=1, max_length=100, description="Agent name")
    description: Optional[str] = Field(None, max_length=500, description="Agent description")
    # Framework-specific configuration payload (discriminated by agent.type)
    config: AgentPayload = Field(..., description="Framework-specific agent configuration")
    
    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty or whitespace only')
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "name": "My AI Assistant",
                "description": "A helpful AI assistant for customer support",
                "config": {
                    "agent": {
                        "type": "langgraph",
                        "config": {
                            "name": "My AI Assistant",
                            "graph_definition": "./examples/01_basic_config_file/example_agent.py:app"
                        }
                    }
                }
            }
        }


class AgentUpdate(BaseModel):
    """Schema for updating an existing agent."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Agent name")
    description: Optional[str] = Field(None, max_length=500, description="Agent description")
    framework: Optional[AgentFramework] = Field(None, description="Agent framework")
    
    @validator('name')
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty or whitespace only')
        return v.strip() if v else v

    class Config:
        schema_extra = {
            "example": {
                "name": "Updated Agent Name",
                "description": "Updated description",
                "framework": "langchain"
            }
        }


class Agent(BaseModel):
    """Complete agent model for responses."""
    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., description="Agent name")
    description: Optional[str] = Field(None, description="Agent description")
    framework: AgentFramework = Field(..., description="Agent framework")
    status: AgentStatus = Field(AgentStatus.DRAFT, description="Agent status")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "My AI Assistant",
                "description": "A helpful AI assistant",
                "framework": "langgraph",
                "status": "draft",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }


class AgentReplace(BaseModel):
    """Full replacement schema for PUT of an agent.

    Represents the complete updatable representation of an agent.
    Server-managed fields like id, status, and timestamps are excluded.
    """
    name: str = Field(..., min_length=1, max_length=100, description="Agent name")
    description: Optional[str] = Field(None, max_length=500, description="Agent description")
    config: AgentPayload = Field(..., description="Framework-specific agent configuration")

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty or whitespace only')
        return v.strip()


class AgentPatch(BaseModel):
    """Partial update schema for PATCH of an agent.

    Only provided fields will be updated. If config is provided, the
    framework will be inferred from config.agent.type.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Agent name")
    description: Optional[str] = Field(None, max_length=500, description="Agent description")
    config: Optional[AgentPayload] = Field(None, description="Framework-specific agent configuration")

    @validator('name')
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty or whitespace only')
        return v.strip() if v else v


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
) -> Agent:
    """Create a new agent backed by PostgreSQL (table: agent_config).

    - Accepts framework and raw config JSON
    - Persists a row in agent_config
    - Returns the created agent in the public API shape
    """
    # Infer framework from config
    framework_value: Optional[str] = request.config.agent.type if request.config and request.config.agent else None
    if not framework_value or not isinstance(framework_value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing framework type in config.agent.type",
        )

    framework_enum = map_framework(framework_value)

    # Create row
    new_id = uuid4()
    model = AgentConfigModel(
        id=new_id,
        name=request.name,
        description=request.description,
        framework=framework_enum.value,
        status=AgentStatus.DRAFT.value,
        config=request.config.model_dump(),
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
    "/",
    response_model=List[Agent],
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
) -> List[Agent]:
    """List agents from PostgreSQL with limit/offset pagination."""
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Limit must be between 1 and 1000")
    if offset < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0")

    # Validate sorting parameters
    if sort_by not in SORTABLE_AGENT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort_by '{sort_by}'. Allowed: {sorted(SORTABLE_AGENT_FIELDS)}",
        )

    from sqlalchemy import select, asc, desc

    # Build deterministic ordering: primary sort + stable tiebreaker by id ASC
    sort_column = getattr(AgentConfigModel, sort_by)
    primary_order = asc(sort_column) if order == "asc" else desc(sort_column)
    stable_tiebreaker = asc(AgentConfigModel.id)

    stmt = (
        select(AgentConfigModel)
        .order_by(primary_order, stable_tiebreaker)
        .limit(limit)
        .offset(offset)
    )
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
) -> Agent:
    """Get agent by ID from PostgreSQL with proper error handling."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format")

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
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
        "Framework is inferred from config.agent.type."
    ),
)
async def update_agent(
    agent_id: str,
    request: AgentReplace,
    session: AsyncSession = Depends(get_session),
) -> Agent:
    """Full replacement of an existing agent in PostgreSQL (PUT semantics)."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format")

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )

    # Infer framework from config
    framework_value: Optional[str] = request.config.agent.type if request.config and request.config.agent else None
    if not framework_value or not isinstance(framework_value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing framework type in config.agent.type",
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
) -> None:
    """Delete an agent_config row by UUID."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format")

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
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
        "If config is provided, framework is inferred from config.agent.type."
    ),
)
async def patch_agent(
    agent_id: str,
    request: AgentPatch,
    session: AsyncSession = Depends(get_session),
) -> Agent:
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid agent id format")

    model = await session.get(AgentConfigModel, agent_uuid)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id '{agent_id}' not found",
        )

    if request.name is not None:
        model.name = request.name
    if request.description is not None:
        model.description = request.description
    if request.config is not None:
        framework_value: Optional[str] = request.config.agent.type if request.config and request.config.agent else None
        if not framework_value or not isinstance(framework_value, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing framework type in config.agent.type",
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