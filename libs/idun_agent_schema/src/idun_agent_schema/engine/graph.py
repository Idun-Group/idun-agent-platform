"""Framework-agnostic graph IR shared by engine and UI consumers.

Versioned via `format_version`. New variants ship alongside, never as a
breaking change.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from idun_agent_schema.engine.agent_framework import AgentFramework


class AgentKind(str, Enum):
    LLM = "llm"
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    LOOP = "loop"
    CUSTOM = "custom"


class ToolKind(str, Enum):
    NATIVE = "native"
    MCP = "mcp"
    BUILT_IN = "built_in"


class EdgeKind(str, Enum):
    PARENT_CHILD = "parent_child"
    SEQUENTIAL_STEP = "sequential_step"
    PARALLEL_BRANCH = "parallel_branch"
    LOOP_STEP = "loop_step"
    TOOL_ATTACH = "tool_attach"
    GRAPH_EDGE = "graph_edge"


class AgentNode(BaseModel):
    kind: Literal["agent"] = "agent"
    id: str
    name: str
    agent_kind: AgentKind
    is_root: bool = False
    description: str | None = None
    model: str | None = None
    loop_max_iterations: int | None = None


class ToolNode(BaseModel):
    kind: Literal["tool"] = "tool"
    id: str
    name: str
    tool_kind: ToolKind
    description: str | None = None
    mcp_server_name: str | None = None


AgentGraphNode = Annotated[
    AgentNode | ToolNode, Field(discriminator="kind")
]


class AgentGraphEdge(BaseModel):
    source: str
    target: str
    kind: EdgeKind
    order: int | None = None
    condition: str | None = None
    label: str | None = None


class AgentGraphMetadata(BaseModel):
    framework: AgentFramework
    agent_name: str
    root_id: str
    warnings: list[str] = Field(default_factory=list)


class AgentGraph(BaseModel):
    format_version: Literal["1"] = "1"
    metadata: AgentGraphMetadata
    nodes: list[AgentGraphNode]
    edges: list[AgentGraphEdge]
