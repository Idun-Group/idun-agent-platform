"""Application service for agent orchestration and business logic."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.domain.agents.entities import (
    AgentEntity,
    AgentFramework,
    AgentRunEntity,
    AgentStatus,
)
from app.domain.agents.ports import AgentRepositoryPort, AgentRunRepositoryPort
 

logger = get_logger(__name__)


class AgentService:
    """Application service for agent business logic."""

    def __init__(
        self,
        agent_repository: AgentRepositoryPort,
        run_repository: AgentRunRepositoryPort,
    ) -> None:
        self.agent_repository = agent_repository
        self.run_repository = run_repository

    async def create_agent(
        self,
        name: str,
        framework: AgentFramework,
        tenant_id: UUID,
        description: str | None = None,
        config: dict[str, Any] | None = None,
        environment_variables: dict[str, str] | None = None,
        tags: list[str] | None = None,
    ) -> AgentEntity:
        """Create a new agent."""
        logger.info(
            "Creating agent", name=name, framework=framework, tenant_id=tenant_id
        )

        # Check if agent with same name exists
        existing = await self.agent_repository.get_by_name(name, tenant_id)
        if existing:
            raise ConflictError(f"Agent with name '{name}' already exists")

        # Validate configuration
        if config:
            self._validate_agent_config(framework, config)

        now = datetime.now(UTC)
        agent = AgentEntity(
            id=uuid4(),
            name=name,
            description=description,
            framework=framework,
            status=AgentStatus.DRAFT,
            config=config or {},
            environment_variables=environment_variables or {},
            tags=tags or [],
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
            success_rate=None,
            avg_response_time_ms=None,
        )

        created_agent = await self.agent_repository.create(agent)

        logger.info("Agent created", agent_id=created_agent.id, name=name)
        return created_agent

    async def get_agent(self, agent_id: UUID, tenant_id: UUID) -> AgentEntity:
        """Get agent by ID."""
        agent = await self.agent_repository.get_by_id(agent_id, tenant_id)
        if not agent:
            raise NotFoundError("Agent", str(agent_id))

        return agent

    async def list_agents(
        self, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentEntity]:
        """List agents for tenant."""
        return await self.agent_repository.list_by_tenant(tenant_id, limit, offset)

    async def update_agent(
        self,
        agent_id: UUID,
        tenant_id: UUID,
        name: str | None = None,
        description: str | None = None,
        config: dict[str, Any] | None = None,
        environment_variables: dict[str, str] | None = None,
        tags: list[str] | None = None,
    ) -> AgentEntity:
        """Update an existing agent."""
        logger.info("Updating agent", agent_id=agent_id, tenant_id=tenant_id)

        agent = await self.get_agent(agent_id, tenant_id)

        # Check name uniqueness if changing name
        if name and name != agent.name:
            existing = await self.agent_repository.get_by_name(name, tenant_id)
            if existing:
                raise ConflictError(f"Agent with name '{name}' already exists")

        # Update fields
        if name:
            agent.name = name
        if description is not None:
            agent.description = description
        if config is not None:
            self._validate_agent_config(agent.framework, config)
            agent.config = config
        if environment_variables is not None:
            agent.environment_variables = environment_variables
        if tags is not None:
            agent.tags = tags

        agent.updated_at = datetime.utcnow()

        updated_agent = await self.agent_repository.update(agent)

        logger.info("Agent updated", agent_id=agent_id)
        return updated_agent

    async def delete_agent(self, agent_id: UUID, tenant_id: UUID) -> bool:
        """Delete an agent."""
        logger.info("Deleting agent", agent_id=agent_id, tenant_id=tenant_id)

        # Check if agent exists
        await self.get_agent(agent_id, tenant_id)

        # Delete the agent (cascade will handle runs)
        deleted = await self.agent_repository.delete(agent_id, tenant_id)

        if deleted:
            logger.info("Agent deleted", agent_id=agent_id)

        return deleted

    # Deployment/activation is managed outside the agent manager now.

    # Deployment is not handled here anymore; no deploy API from service.

    # Deactivation/undeploy is not handled here anymore.

    async def run_agent(
        self,
        agent_id: UUID,
        tenant_id: UUID,
        input_data: dict[str, Any],
        trace_id: str | None = None,
    ) -> AgentRunEntity:
        """Execute an agent run."""
        logger.info("Starting agent run", agent_id=agent_id, tenant_id=tenant_id)

        agent = await self.get_agent(agent_id, tenant_id)

        if agent.status != AgentStatus.ACTIVE:
            raise ValidationError("Agent must be active to run")

        # Create run entity
        now = datetime.now(UTC)
        run = AgentRunEntity(
            id=uuid4(),
            agent_id=agent_id,
            tenant_id=tenant_id,
            input_data=input_data,
            status="running",
            started_at=now,
            trace_id=trace_id,
        )

        # Save run
        created_run = await self.run_repository.create(run)

        # TODO: Here you would integrate with the actual agent execution
        # For now, we'll just simulate
        logger.info("Agent run created", run_id=created_run.id, agent_id=agent_id)

        return created_run

    async def complete_run(
        self,
        run_id: UUID,
        tenant_id: UUID,
        output_data: dict[str, Any],
        response_time_ms: float,
        tokens_used: int | None = None,
        cost_usd: float | None = None,
    ) -> AgentRunEntity:
        """Complete an agent run."""
        logger.info("Completing agent run", run_id=run_id, tenant_id=tenant_id)

        run = await self.run_repository.get_by_id(run_id, tenant_id)
        if not run:
            raise NotFoundError("Agent run", str(run_id))

        # Complete the run
        run.complete(output_data, response_time_ms)
        run.tokens_used = tokens_used
        run.cost_usd = cost_usd

        # Update run
        updated_run = await self.run_repository.update(run)

        # Update agent metrics
        agent = await self.get_agent(run.agent_id, tenant_id)
        agent.update_metrics(True, response_time_ms)
        agent.updated_at = datetime.now(UTC)
        await self.agent_repository.update(agent)

        logger.info("Agent run completed", run_id=run_id)
        return updated_run

    async def fail_run(
        self,
        run_id: UUID,
        tenant_id: UUID,
        error_message: str,
    ) -> AgentRunEntity:
        """Mark an agent run as failed."""
        logger.info("Failing agent run", run_id=run_id, tenant_id=tenant_id)

        run = await self.run_repository.get_by_id(run_id, tenant_id)
        if not run:
            raise NotFoundError("Agent run", str(run_id))

        # Fail the run
        run.fail(error_message)

        # Update run
        updated_run = await self.run_repository.update(run)

        # Update agent metrics (failed run)
        agent = await self.get_agent(run.agent_id, tenant_id)
        response_time = (
            (datetime.utcnow() - run.started_at).total_seconds() * 1000
            if run.started_at
            else 0.0
        )
        agent.update_metrics(False, response_time)
        agent.updated_at = datetime.now(UTC)
        await self.agent_repository.update(agent)

        logger.info("Agent run failed", run_id=run_id)
        return updated_run

    async def get_run(self, run_id: UUID, tenant_id: UUID) -> AgentRunEntity:
        """Get agent run by ID."""
        run = await self.run_repository.get_by_id(run_id, tenant_id)
        if not run:
            raise NotFoundError("Agent run", str(run_id))

        return run

    async def list_runs_by_agent(
        self,
        agent_id: UUID,
        tenant_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AgentRunEntity]:
        """List runs for a specific agent."""
        return await self.run_repository.list_by_agent(
            agent_id, tenant_id, limit, offset
        )

    async def list_runs_by_tenant(
        self,
        tenant_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AgentRunEntity]:
        """List all runs for a tenant."""
        return await self.run_repository.list_by_tenant(tenant_id, limit, offset)

    # Health of deployed agents is not tracked here anymore.

    def _validate_agent_config(
        self, framework: AgentFramework, config: dict[str, Any]
    ) -> None:
        """Validate agent configuration based on framework."""
        if not config:
            raise ValidationError("Agent configuration cannot be empty")

        # Framework-specific validation
        if framework == AgentFramework.LANGGRAPH:
            if "graph_definition" not in config:
                raise ValidationError(
                    "LangGraph agents require 'graph_definition' in config"
                )
        elif framework == AgentFramework.CREWAI:
            if "crew_config" not in config:
                raise ValidationError("CrewAI agents require 'crew_config' in config")
        # Add more framework validations as needed
