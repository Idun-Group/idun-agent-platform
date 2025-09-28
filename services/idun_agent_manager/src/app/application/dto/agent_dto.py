"""Data Transfer Objects for agent operations (compat shim)."""

from idun_agent_schema.manager.dto import (  # noqa: F401
    AgentCreateDTO,
    AgentDeploymentDTO,
    AgentHealthDTO,
    AgentMetricsDTO,
    AgentRunCreateDTO,
    AgentUpdateDTO,
)

__all__ = [
    "AgentCreateDTO",
    "AgentUpdateDTO",
    "AgentDeploymentDTO",
    "AgentHealthDTO",
    "AgentRunCreateDTO",
    "AgentMetricsDTO",
]
