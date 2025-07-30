from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import uuid

class FrameworkType(str, Enum):
    LANGGRAPH = "langgraph"
    AUTOGEN = "AUTOGEN"
    ADK = "adk"
    SMOL = "smol"

class ToolType(str, Enum):
    FUNCTION = "FUNCTION"
    API = "API"

class ToolDefinition(BaseModel):
    """
    Represents the definition of a tool that an agent can use.
    """
    name: str = Field(..., description="The name of the tool.")
    description: str = Field(..., description="A description of what the tool does.")
    schema_: Optional[Dict[str, Any]] = Field(default_factory=dict, alias="schema", description="The schema of the tool's input/output, often a JSON schema.")
    type: ToolType = Field(..., description="The type of the tool.")

class Agent(BaseModel):
    """
    Represents an agent configuration.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique identifier for the agent.")
    name: str = Field(..., description="The name of the agent.")
    description: Optional[str] = Field(default=None, description="A description of the agent.")
    framework_type: FrameworkType = Field(..., description="The agent framework type.")
    config: Dict[str, Any] = Field(default_factory=dict, description="Framework-specific configuration for the agent.")
    llm_config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="LLM configuration for the agent.")
    tools: List[ToolDefinition] = Field(default_factory=list, description="A list of tools available to the agent.")

    class Config:
        use_enum_values = True # Ensures enum values are used in serialization
        populate_by_name = True # Allows using alias in schema

# Example Usage (for testing or direct use):
if __name__ == "__main__":
    tool_schema_example = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"}
        },
        "required": ["query"]
    }

    sample_tool = ToolDefinition(
        name="search_tool",
        description="A tool to search the web.",
        schema=tool_schema_example,
        type=ToolType.API
    )

    sample_agent = Agent(
        name="MyResearchAgent",
        description="An agent that can research topics.",
        framework_type=FrameworkType.LANGGRAPH,
        config={"graph_definition": "some_graph_path_or_spec"},
        llm_config={"model_name": "gpt-4", "temperature": 0.7},
        tools=[sample_tool]
    )

    print(sample_agent.model_dump_json(indent=2))
    print(sample_tool.model_dump_json(indent=2)) 