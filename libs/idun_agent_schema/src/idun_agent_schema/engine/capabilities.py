"""Agent capability discovery models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .agent_framework import AgentFramework


class CapabilityFlags(BaseModel):
    """Runtime capability flags for an agent."""

    model_config = ConfigDict(populate_by_name=True)

    streaming: bool = True
    history: bool = False
    thread_id: bool = False


class InputDescriptor(BaseModel):
    """Describes the agent's expected input format."""

    model_config = ConfigDict(populate_by_name=True)

    mode: Literal["chat", "structured"]
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")


class OutputDescriptor(BaseModel):
    """Describes the agent's output format."""

    model_config = ConfigDict(populate_by_name=True)

    mode: Literal["text", "structured", "unknown"]
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")


class AgentCapabilities(BaseModel):
    """Framework-agnostic capability descriptor returned by GET /agent/capabilities."""

    model_config = ConfigDict(populate_by_name=True)

    version: str = "1"
    framework: AgentFramework
    capabilities: CapabilityFlags
    input: InputDescriptor
    output: OutputDescriptor
