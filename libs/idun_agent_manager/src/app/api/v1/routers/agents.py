"""Agent API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.v1.deps import (
    get_agent_service,
    get_current_tenant_id,
    get_pagination_params,
)
from app.api.v1.schemas.agents import (
    AgentCreateRequest,
    AgentResponse,
    AgentRunRequest,
    AgentRunResponse,
    AgentSummaryResponse,
    AgentUpdateRequest,
    PaginatedAgentsResponse,
    PaginatedRunsResponse,
)
from app.application.services.agent_service import AgentService

router = APIRouter()


@router.post(
    "/",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create agent",
    description="Create a new agent for the current tenant",
)
async def create_agent(
    request: AgentCreateRequest,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentResponse:
    """Create a new agent."""
    agent = await agent_service.create_agent(
        name=request.name,
        framework=request.framework,
        tenant_id=tenant_id,
        description=request.description,
        config=request.config,
        environment_variables=request.environment_variables,
        tags=request.tags,
    )
    
    return AgentResponse.model_validate(agent)


@router.get(
    "/",
    response_model=PaginatedAgentsResponse,
    summary="List agents",
    description="List agents for the current tenant with pagination",
)
async def list_agents(
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination_params)],
) -> PaginatedAgentsResponse:
    """List agents for tenant."""
    limit, offset = pagination
    
    agents = await agent_service.list_agents(tenant_id, limit, offset)
    total = await agent_service.agent_repository.count_by_tenant(tenant_id)
    
    return PaginatedAgentsResponse(
        items=[AgentSummaryResponse.model_validate(agent) for agent in agents],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(agents) < total,
    )


@router.get(
    "/{agent_id}",
    response_model=AgentResponse,
    summary="Get agent",
    description="Get a specific agent by ID",
)
async def get_agent(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentResponse:
    """Get agent by ID."""
    agent = await agent_service.get_agent(agent_id, tenant_id)
    return AgentResponse.model_validate(agent)


@router.put(
    "/{agent_id}",
    response_model=AgentResponse,
    summary="Update agent",
    description="Update an existing agent",
)
async def update_agent(
    agent_id: UUID,
    request: AgentUpdateRequest,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentResponse:
    """Update an existing agent."""
    agent = await agent_service.update_agent(
        agent_id=agent_id,
        tenant_id=tenant_id,
        name=request.name,
        description=request.description,
        config=request.config,
        environment_variables=request.environment_variables,
        tags=request.tags,
    )
    
    return AgentResponse.model_validate(agent)


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete agent",
    description="Delete an agent and all its runs",
)
async def delete_agent(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> None:
    """Delete an agent."""
    await agent_service.delete_agent(agent_id, tenant_id)


@router.post(
    "/{agent_id}/activate",
    response_model=AgentResponse,
    summary="Activate agent",
    description="Activate an agent for deployment",
)
async def activate_agent(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentResponse:
    """Activate an agent."""
    agent = await agent_service.activate_agent(agent_id, tenant_id)
    return AgentResponse.model_validate(agent)


@router.post(
    "/{agent_id}/deactivate",
    response_model=AgentResponse,
    summary="Deactivate agent",
    description="Deactivate an active agent",
)
async def deactivate_agent(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentResponse:
    """Deactivate an agent."""
    agent = await agent_service.deactivate_agent(agent_id, tenant_id)
    return AgentResponse.model_validate(agent)


@router.post(
    "/{agent_id}/run",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run agent",
    description="Execute an agent with input data",
)
async def run_agent(
    agent_id: UUID,
    request: AgentRunRequest,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentRunResponse:
    """Run an agent."""
    run = await agent_service.run_agent(
        agent_id=agent_id,
        tenant_id=tenant_id,
        input_data=request.input_data,
        trace_id=request.trace_id,
    )
    
    return AgentRunResponse.model_validate(run)


@router.get(
    "/{agent_id}/runs",
    response_model=PaginatedRunsResponse,
    summary="List agent runs",
    description="List runs for a specific agent",
)
async def list_agent_runs(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination_params)],
) -> PaginatedRunsResponse:
    """List runs for an agent."""
    limit, offset = pagination
    
    runs = await agent_service.list_runs_by_agent(agent_id, tenant_id, limit, offset)
    
    return PaginatedRunsResponse(
        items=[AgentRunResponse.model_validate(run) for run in runs],
        total=len(runs),  # TODO: Implement proper count
        limit=limit,
        offset=offset,
        has_more=len(runs) == limit,
    )


@router.get(
    "/{agent_id}/runs/{run_id}",
    response_model=AgentRunResponse,
    summary="Get agent run",
    description="Get a specific agent run by ID",
)
async def get_agent_run(
    agent_id: UUID,
    run_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentRunResponse:
    """Get an agent run."""
    run = await agent_service.get_run(run_id, tenant_id)
    return AgentRunResponse.model_validate(run)


@router.get(
    "/{agent_id}/health",
    summary="Get agent health",
    description="Get health status of a deployed agent",
)
async def get_agent_health(
    agent_id: UUID,
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> dict:
    """Get agent health status."""
    health_info = await agent_service.get_agent_health(agent_id, tenant_id)
    return health_info 