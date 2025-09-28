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
from app.domain.deployments.entities import DeploymentMode
from app.infrastructure.http.engine_client import DeploymentError, IdunEngineService

logger = get_logger(__name__)


class AgentService:
    """Application service for agent business logic."""

    def __init__(
        self,
        agent_repository: AgentRepositoryPort,
        run_repository: AgentRunRepositoryPort,
        engine_service: IdunEngineService | None = None,
    ) -> None:
        self.agent_repository = agent_repository
        self.run_repository = run_repository
        self.engine_service = engine_service or IdunEngineService()

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

    async def activate_agent(self, agent_id: UUID, tenant_id: UUID) -> AgentEntity:
        """Activate an agent for deployment."""
        logger.info("Activating agent", agent_id=agent_id, tenant_id=tenant_id)

        agent = await self.get_agent(agent_id, tenant_id)

        if not agent.can_be_deployed():
            raise ValidationError("Agent cannot be deployed in current state")

        try:
            # Step 1: Deploy agent using Idun Engine SDK
            deployment_info = await self.engine_service.deploy_agent(agent)
            logger.info(
                "Agent deployed via Idun Engine",
                agent_id=agent_id,
                container_id=deployment_info.get("container_id"),
            )

            # Step 2: Update agent status in database
            agent.activate()
            agent.updated_at = datetime.now(UTC)

            updated_agent = await self.agent_repository.update(agent)

            logger.info(
                "Agent activated successfully",
                agent_id=agent_id,
                endpoint=deployment_info["endpoint"],
            )
            return updated_agent

        except DeploymentError as e:
            logger.error("Failed to deploy agent", agent_id=agent_id, error=str(e))
            raise ValidationError(f"Agent deployment failed: {e}") from e
        except Exception as e:
            logger.error(
                "Unexpected error during agent activation",
                agent_id=agent_id,
                error=str(e),
            )
            raise ValidationError(f"Agent activation failed: {e}") from e

    async def deploy_agent(
        self,
        agent_id: UUID,
        tenant_id: UUID,
        deployment_mode: DeploymentMode = DeploymentMode.LOCAL,
        deployment_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Deploy an agent using the specified mode and config.

        For now, only LOCAL is implemented which will (placeholder) start a local container
        running the Engine-wrapped agent and return endpoint info.
        """
        logger.info(
            "Deploying agent",
            agent_id=agent_id,
            tenant_id=tenant_id,
            mode=deployment_mode.value,
        )

        agent = await self.get_agent(agent_id, tenant_id)

        if not agent.can_be_deployed():
            raise ValidationError("Agent cannot be deployed in current state")

        try:
            deployment_info = await self.engine_service.deploy_agent(
                agent,
                deployment_mode=deployment_mode,
                deployment_config=deployment_config or {},
            )

            # Update agent status and timestamps
            agent.activate()
            agent.updated_at = datetime.now(UTC)
            updated_agent = await self.agent_repository.update(agent)

            logger.info(
                "Agent deployed",
                agent_id=agent_id,
                endpoint=deployment_info.get("endpoint"),
            )

            # Return combined info
            return {
                **deployment_info,
                "agent": {
                    "id": str(updated_agent.id),
                    "name": updated_agent.name,
                    "status": updated_agent.status.value,
                },
            }
        except DeploymentError as e:
            logger.error("Deployment failed", agent_id=agent_id, error=str(e))
            raise ValidationError(f"Agent deployment failed: {e}") from e
        except Exception as e:
            logger.error(
                "Unexpected error during deployment", agent_id=agent_id, error=str(e)
            )
            raise ValidationError(f"Agent deployment failed: {e}") from e

    async def deactivate_agent(self, agent_id: UUID, tenant_id: UUID) -> AgentEntity:
        """Deactivate an agent."""
        logger.info("Deactivating agent", agent_id=agent_id, tenant_id=tenant_id)

        agent = await self.get_agent(agent_id, tenant_id)

        try:
            # Step 1: Undeploy agent using Idun Engine SDK
            undeployed = await self.engine_service.undeploy_agent(agent_id)
            if not undeployed:
                logger.warning("Failed to undeploy agent container", agent_id=agent_id)

            # Step 2: Update agent status in database
            agent.deactivate()
            agent.updated_at = datetime.utcnow()

            updated_agent = await self.agent_repository.update(agent)

            logger.info("Agent deactivated successfully", agent_id=agent_id)
            return updated_agent

        except Exception as e:
            logger.error(
                "Error during agent deactivation", agent_id=agent_id, error=str(e)
            )
            # Even if there are errors in cleanup, we should still deactivate in DB
            agent.deactivate()
            agent.updated_at = datetime.utcnow()
            updated_agent = await self.agent_repository.update(agent)
            return updated_agent

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

    async def get_agent_health(self, agent_id: UUID, tenant_id: UUID) -> dict[str, Any]:
        """Get health status of a deployed agent.

        Args:
            agent_id: The ID of the agent to check
            tenant_id: The tenant ID for authorization

        Returns:
            Health status information including deployment status
        """
        logger.info("Checking agent health", agent_id=agent_id, tenant_id=tenant_id)

        # Check if agent exists and is owned by tenant
        agent = await self.get_agent(agent_id, tenant_id)

        health_info: dict[str, Any] = {
            "agent_id": str(agent_id),
            "agent_name": agent.name,
            "status": agent.status.value,
            "framework": agent.framework.value,
            "deployment_status": "unknown",
            "last_updated": agent.updated_at.isoformat(),
        }

        # If agent is active, check deployment health
        if agent.status == AgentStatus.ACTIVE:
            try:
                deployment_health = await self.engine_service.get_agent_health(agent_id)
                health_info["deployment_status"] = deployment_health.get(
                    "status", "unknown"
                )
                health_info["uptime"] = deployment_health.get("uptime")
                health_info["cpu_usage"] = deployment_health.get("cpu_usage")
                health_info["memory_usage"] = deployment_health.get("memory_usage")
                health_info["last_activity"] = deployment_health.get("last_activity")

                # Agent is deployed and healthy
                health_info["deployment_status"] = "deployed"

            except Exception as e:
                logger.warning(
                    "Failed to get deployment health", agent_id=agent_id, error=str(e)
                )
                health_info["deployment_status"] = "error"
                health_info["error"] = str(e)

        return health_info

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
