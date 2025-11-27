"""Compatibility shim: re-export Agent domain entities from schema library."""

from idun_agent_schema.manager.domain import (  # noqa: F401
    AgentEntity,
    AgentFramework,
    AgentRunEntity,
    AgentStatus,
)

__all__ = [
    "AgentEntity",
    "AgentFramework",
    "AgentRunEntity",
    "AgentStatus",
]