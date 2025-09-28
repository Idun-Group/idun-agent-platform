"""Repository implementations for agents (adapters)."""

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.agents.entities import AgentEntity, AgentRunEntity
from app.domain.agents.ports import AgentRepositoryPort, AgentRunRepositoryPort
from app.infrastructure.db.models.agents import AgentModel, AgentRunModel


class SqlAlchemyAgentRepository(AgentRepositoryPort):
    """SQLAlchemy implementation of agent repository."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, agent: AgentEntity) -> AgentEntity:
        """Create a new agent."""
        model = AgentModel(
            id=agent.id,
            name=agent.name,
            description=agent.description,
            framework=agent.framework.value,
            status=agent.status.value,
            config=agent.config,
            environment_variables=agent.environment_variables,
            version=agent.version,
            tags=agent.tags,
            tenant_id=agent.tenant_id,
            created_at=agent.created_at,
            updated_at=agent.updated_at,
            deployed_at=agent.deployed_at,
            total_runs=agent.total_runs,
            success_rate=agent.success_rate,
            avg_response_time_ms=agent.avg_response_time_ms,
        )

        self.session.add(model)
        await self.session.flush()

        return self._model_to_entity(model)

    async def get_by_id(self, agent_id: UUID, tenant_id: UUID) -> AgentEntity | None:
        """Get agent by ID and tenant."""
        stmt = select(AgentModel).where(
            AgentModel.id == agent_id, AgentModel.tenant_id == tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        return self._model_to_entity(model) if model else None

    async def get_by_name(self, name: str, tenant_id: UUID) -> AgentEntity | None:
        """Get agent by name and tenant."""
        stmt = select(AgentModel).where(
            AgentModel.name == name, AgentModel.tenant_id == tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        return self._model_to_entity(model) if model else None

    async def list_by_tenant(
        self, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentEntity]:
        """List agents by tenant with pagination."""
        stmt = (
            select(AgentModel)
            .where(AgentModel.tenant_id == tenant_id)
            .order_by(desc(AgentModel.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        return [self._model_to_entity(model) for model in models]

    async def update(self, agent: AgentEntity) -> AgentEntity:
        """Update an existing agent."""
        stmt = select(AgentModel).where(
            AgentModel.id == agent.id, AgentModel.tenant_id == agent.tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one()

        # Update fields
        model.name = agent.name
        model.description = agent.description
        model.framework = agent.framework.value
        model.status = agent.status.value
        model.config = agent.config
        model.environment_variables = agent.environment_variables
        model.version = agent.version
        model.tags = agent.tags
        model.updated_at = agent.updated_at
        model.deployed_at = agent.deployed_at
        model.total_runs = agent.total_runs
        model.success_rate = agent.success_rate
        model.avg_response_time_ms = agent.avg_response_time_ms

        await self.session.flush()

        return self._model_to_entity(model)

    async def delete(self, agent_id: UUID, tenant_id: UUID) -> bool:
        """Delete an agent."""
        stmt = select(AgentModel).where(
            AgentModel.id == agent_id, AgentModel.tenant_id == tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        if model:
            await self.session.delete(model)
            await self.session.flush()
            return True

        return False

    async def count_by_tenant(self, tenant_id: UUID) -> int:
        """Count agents by tenant."""
        stmt = select(func.count(AgentModel.id)).where(
            AgentModel.tenant_id == tenant_id
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    def _model_to_entity(self, model: AgentModel) -> AgentEntity:
        """Convert SQLAlchemy model to domain entity."""
        from app.domain.agents.entities import AgentFramework, AgentStatus

        return AgentEntity(
            id=model.id,
            name=model.name,
            description=model.description,
            framework=AgentFramework(model.framework),
            status=AgentStatus(model.status),
            config=model.config,
            environment_variables=model.environment_variables,
            version=model.version,
            tags=model.tags,
            tenant_id=model.tenant_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deployed_at=model.deployed_at,
            total_runs=model.total_runs,
            success_rate=model.success_rate,
            avg_response_time_ms=model.avg_response_time_ms,
        )


class SqlAlchemyAgentRunRepository(AgentRunRepositoryPort):
    """SQLAlchemy implementation of agent run repository."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, run: AgentRunEntity) -> AgentRunEntity:
        """Create a new agent run."""
        model = AgentRunModel(
            id=run.id,
            agent_id=run.agent_id,
            tenant_id=run.tenant_id,
            input_data=run.input_data,
            output_data=run.output_data,
            status=run.status,
            started_at=run.started_at,
            completed_at=run.completed_at,
            error_message=run.error_message,
            response_time_ms=run.response_time_ms,
            tokens_used=run.tokens_used,
            cost_usd=run.cost_usd,
            trace_id=run.trace_id,
            span_id=run.span_id,
        )

        self.session.add(model)
        await self.session.flush()

        return self._model_to_entity(model)

    async def get_by_id(self, run_id: UUID, tenant_id: UUID) -> AgentRunEntity | None:
        """Get run by ID and tenant."""
        stmt = select(AgentRunModel).where(
            AgentRunModel.id == run_id, AgentRunModel.tenant_id == tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        return self._model_to_entity(model) if model else None

    async def list_by_agent(
        self, agent_id: UUID, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentRunEntity]:
        """List runs by agent with pagination."""
        stmt = (
            select(AgentRunModel)
            .where(
                AgentRunModel.agent_id == agent_id, AgentRunModel.tenant_id == tenant_id
            )
            .order_by(desc(AgentRunModel.started_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        return [self._model_to_entity(model) for model in models]

    async def list_by_tenant(
        self, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentRunEntity]:
        """List runs by tenant with pagination."""
        stmt = (
            select(AgentRunModel)
            .where(AgentRunModel.tenant_id == tenant_id)
            .order_by(desc(AgentRunModel.started_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        return [self._model_to_entity(model) for model in models]

    async def update(self, run: AgentRunEntity) -> AgentRunEntity:
        """Update an existing run."""
        stmt = select(AgentRunModel).where(
            AgentRunModel.id == run.id, AgentRunModel.tenant_id == run.tenant_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one()

        # Update fields
        model.output_data = run.output_data
        model.status = run.status
        model.completed_at = run.completed_at
        model.error_message = run.error_message
        model.response_time_ms = run.response_time_ms
        model.tokens_used = run.tokens_used
        model.cost_usd = run.cost_usd

        await self.session.flush()

        return self._model_to_entity(model)

    async def delete_old_runs(self, older_than_days: int) -> int:
        """Delete runs older than specified days."""
        cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)

        stmt = select(AgentRunModel).where(AgentRunModel.started_at < cutoff_date)
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        count = len(models)
        for model in models:
            await self.session.delete(model)

        await self.session.flush()

        return count

    def _model_to_entity(self, model: AgentRunModel) -> AgentRunEntity:
        """Convert SQLAlchemy model to domain entity."""
        return AgentRunEntity(
            id=model.id,
            agent_id=model.agent_id,
            tenant_id=model.tenant_id,
            input_data=model.input_data,
            output_data=model.output_data,
            status=model.status,
            started_at=model.started_at,
            completed_at=model.completed_at,
            error_message=model.error_message,
            response_time_ms=model.response_time_ms,
            tokens_used=model.tokens_used,
            cost_usd=model.cost_usd,
            trace_id=model.trace_id,
            span_id=model.span_id,
        )
