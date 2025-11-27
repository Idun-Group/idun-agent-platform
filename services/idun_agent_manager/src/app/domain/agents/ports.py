from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.agents.entities import AgentEntity, AgentRunEntity


class AgentRepositoryPort(ABC):
    """Port (interface) for agent repository."""

    @abstractmethod
    async def create(self, agent: AgentEntity) -> AgentEntity:
        """Create a new agent."""
        pass

    @abstractmethod
    async def get_by_id(self, agent_id: UUID, tenant_id: UUID) -> AgentEntity | None:
        """Get agent by ID and tenant."""
        pass

    @abstractmethod
    async def get_by_name(self, name: str, tenant_id: UUID) -> AgentEntity | None:
        """Get agent by name and tenant."""
        pass

    @abstractmethod
    async def list_by_tenant(
        self, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentEntity]:
        """List agents by tenant with pagination."""
        pass

    @abstractmethod
    async def update(self, agent: AgentEntity) -> AgentEntity:
        """Update an existing agent."""
        pass

    @abstractmethod
    async def delete(self, agent_id: UUID, tenant_id: UUID) -> bool:
        """Delete an agent."""
        pass

    @abstractmethod
    async def count_by_tenant(self, tenant_id: UUID) -> int:
        """Count agents by tenant."""
        pass


class AgentRunRepositoryPort(ABC):
    """Port (interface) for agent run repository."""

    @abstractmethod
    async def create(self, run: AgentRunEntity) -> AgentRunEntity:
        """Create a new agent run."""
        pass

    @abstractmethod
    async def get_by_id(self, run_id: UUID, tenant_id: UUID) -> AgentRunEntity | None:
        """Get run by ID and tenant."""
        pass

    @abstractmethod
    async def list_by_agent(
        self, agent_id: UUID, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentRunEntity]:
        """List runs by agent with pagination."""
        pass

    @abstractmethod
    async def list_by_tenant(
        self, tenant_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[AgentRunEntity]:
        """List runs by tenant with pagination."""
        pass

    @abstractmethod
    async def update(self, run: AgentRunEntity) -> AgentRunEntity:
        """Update an existing run."""
        pass

    @abstractmethod
    async def delete_old_runs(self, older_than_days: int) -> int:
        """Delete runs older than specified days."""
        pass
