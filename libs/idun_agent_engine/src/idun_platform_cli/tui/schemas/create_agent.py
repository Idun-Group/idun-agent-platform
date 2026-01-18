from __future__ import annotations

from typing import Any

from pydantic import BaseModel, field_validator

"""
server:
  api:
    port: 8010

agent:
  type: "LANGGRAPH"
  config:
    name: "Guardrails"
    graph_definition: "example_agent.py:app"

"""


# we need to map the graph_definition, pipeline_definition, agent_definition fields based on framework
AGENT_SOURCE_KEY_MAPPING: dict[str, str] = dict(
    {
        "HAYSTACK": "pipeline_definition",
        "LANGGRAPH": "graph_definition",
        "ADK": "agent",
    }
)


class TUIAgentConfig(BaseModel):
    name: str
    framework: str
    port: int
    graph_definition: str

    @field_validator("*", mode="after")
    def validate_not_null(cls, value: str | Any | None) -> str:
        if value is None or value == "":
            raise ValueError("Cannot have empty fields!")
        return value

    def to_engine_config(self) -> dict[str, Any]:
        agent_config = {
            "name": self.name,
            AGENT_SOURCE_KEY_MAPPING[self.framework]: self.graph_definition,
        }

        if self.framework == "ADK":
            agent_config["app_name"] = self.name.replace("-", "_").replace(" ", "_")
            agent_config["session_service"] = {"type": "in_memory"}
            agent_config["memory_service"] = {"type": "in_memory"}

        return {
            "server": {"api": {"port": self.port}},
            "agent": {
                "type": self.framework,
                "config": agent_config,
            },
        }
