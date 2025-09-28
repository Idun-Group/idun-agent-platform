"""Compatibility shim: re-export Agent API schemas from idun-agent-schema."""

from idun_agent_schema.manager.api import (  # noqa: F401
    AgentCreateRequest,
    AgentResponse,
    AgentRunRequest,
    AgentRunResponse,
    AgentRunSummaryResponse,
    AgentStatsResponse,
    AgentSummaryResponse,
    AgentUpdateRequest,
    PaginatedAgentsResponse,
    PaginatedResponse,
    PaginatedRunsResponse,
)
from idun_agent_schema.manager.domain import (  # noqa: F401
    AgentFramework,
    AgentStatus,
)

__all__ = [
    "AgentCreateRequest",
    "AgentUpdateRequest",
    "AgentRunRequest",
    "AgentResponse",
    "AgentSummaryResponse",
    "AgentRunResponse",
    "AgentRunSummaryResponse",
    "PaginatedResponse",
    "PaginatedAgentsResponse",
    "PaginatedRunsResponse",
    "AgentStatsResponse",
    "AgentFramework",
    "AgentStatus",
]
