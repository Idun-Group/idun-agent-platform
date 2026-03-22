# Framework-Agnostic Agent Interaction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fragmented agent interaction routes with a single AG-UI stream route (`POST /agent/run`) + discovery endpoint (`GET /agent/capabilities`), with auto-discovered input/output schemas from framework-native constructs.

**Architecture:** New `AgentCapabilities` schema models in `idun_agent_schema`. New `discover_capabilities()` and `run()` methods on `BaseAgent`, implemented in LangGraph and ADK adapters by delegating to their AG-UI wrappers. New routes registered in app factory. Old routes shimmed as deprecated. Web UI chat tab evolved to auto-detect chat vs form mode from discovery response.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic 2.11+, AG-UI (`ag-ui-core`, `copilotkit`, `ag-ui-adk`), React 19, TypeScript, `@ag-ui/client`

**Design doc:** `docs/plans/2026-03-08-framework-agnostic-interaction-design.md`

---

## Task 1: Add AgentCapabilities schema models

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/engine/capabilities.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py`

**Step 1: Create the capabilities module**

```python
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
```

**Step 2: Export from `__init__.py`**

Add to `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py`:

```python
from .capabilities import AgentCapabilities, CapabilityFlags, InputDescriptor, OutputDescriptor  # noqa: F401
```

**Step 3: Run lint to verify**

Run: `uv run ruff check libs/idun_agent_schema/ && uv run ruff format libs/idun_agent_schema/`
Expected: PASS

**Step 4: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/engine/capabilities.py \
       libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py
git commit -m "feat(schema): add AgentCapabilities discovery models"
```

---

## Task 2: Remove `input_schema_definition` and `output_schema_definition` from BaseAgentConfig

**Files:**
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/base_agent.py`
- Test: `libs/idun_agent_engine/tests/unit/agent/test_langgraph.py` (existing tests will need updating)

**Step 1: Remove the fields**

In `libs/idun_agent_schema/src/idun_agent_schema/engine/base_agent.py`, remove lines 12-13 (`input_schema_definition` and `output_schema_definition`). The class becomes:

```python
class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. Extend for specific frameworks."""

    name: str
    observability: ObservabilityConfig | None = Field(
        default=None,
        description="(Deprecated) Observability config is deprecated and will be removed in a future release.",
        deprecated=True,
    )
```

**Step 2: Find and update all references**

Search for `input_schema_definition` and `output_schema_definition` across the codebase. Key locations to clean up:

- `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` — remove `_setup_custom_input_schema()` method (lines 309-325), `_custom_input_model` field (line 59), `_input_state_key` field (line 60), `_output_schema` field (line 58), and `custom_input_model` property
- `libs/idun_agent_engine/src/idun_agent_engine/core/config_builder.py` — remove `resolve_input_model()` (lines 720-748)
- `libs/idun_agent_engine/tests/unit/agent/test_langgraph.py` — remove or update `test_input_schema_definition_*` tests
- `libs/idun_agent_engine/tests/` — any other tests referencing these fields
- `libs/idun_agent_schema/CLAUDE.md` — update documentation to reflect removal

**Step 3: Run tests to identify breakages**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/ -v --tb=short 2>&1 | head -80`
Expected: Some tests fail (the `input_schema_definition` tests). Fix them in Step 4.

**Step 4: Remove or update broken tests**

Delete tests that specifically test `input_schema_definition` behavior (e.g., `test_input_schema_definition_valid_field`, `test_input_schema_definition_invalid_field`, `test_resolve_input_model_*`). These behaviors are replaced by auto-discovery in Task 5.

**Step 5: Run tests again**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/ -v --tb=short`
Expected: PASS (remaining tests should still work since `invoke()` with `{"query": ..., "session_id": ...}` still functions)

**Step 6: Run lint**

Run: `uv run ruff check libs/ && uv run ruff format libs/`
Expected: PASS

**Step 7: Commit**

```bash
git add -u libs/
git commit -m "refactor(schema): remove input_schema_definition and output_schema_definition

These fields are replaced by auto-discovery from framework-native constructs
(graph.input_schema for LangGraph, agent.input_schema for ADK)."
```

---

## Task 3: Add `discover_capabilities()` and `run()` to BaseAgent

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py`

**Step 1: Add the new abstract methods**

Add imports and two new methods to `BaseAgent`:

```python
from idun_agent_schema.engine.capabilities import AgentCapabilities
from ag_ui.core import BaseEvent
from ag_ui.core.types import RunAgentInput
```

Add after the `stream()` method:

```python
    @abstractmethod
    def discover_capabilities(self) -> AgentCapabilities:
        """Return the agent's capability descriptor.

        Called once at startup, result is cached. Adapters introspect
        the underlying framework agent to determine input/output schemas
        and supported capabilities.
        """
        pass

    @abstractmethod
    async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent]:
        """Canonical interaction entry point.

        Accepts AG-UI RunAgentInput, yields AG-UI events. Each adapter
        delegates to its framework's AG-UI wrapper (LangGraphAGUIAgent
        or ADKAGUIAgent) and adds structured input validation and
        output extraction on top.
        """
        if False:  # pragma: no cover
            yield  # type: ignore[misc]
```

**Step 2: Run lint**

Run: `uv run ruff check libs/idun_agent_engine/ && uv run ruff format libs/idun_agent_engine/`
Expected: PASS

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/base.py
git commit -m "feat(engine): add discover_capabilities() and run() to BaseAgent"
```

---

## Task 4: Add test fixtures for structured LangGraph agent with input/output schemas

**Files:**
- Modify: `libs/idun_agent_engine/tests/fixtures/agents/mock_graph.py`

**Step 1: Add a graph with explicit input_schema and output_schema**

Add to the end of `mock_graph.py`:

```python
# -----------------------------------------------------------------------------
# Structured Input/Output Graph (for auto-discovery testing)
# -----------------------------------------------------------------------------


class InputState(TypedDict):
    """Typed input for structured agents."""

    user_input: str


class OutputState(TypedDict):
    """Typed output for structured agents."""

    graph_output: str


class FullState(TypedDict):
    """Internal state combining input, output, and intermediate data."""

    user_input: str
    graph_output: str
    intermediate: str


def transform_node(state: FullState) -> dict[str, Any]:
    """Transform user input into output."""
    user_input = state.get("user_input", "")
    intermediate = f"processed: {user_input}"
    return {"intermediate": intermediate}


def output_node(state: FullState) -> dict[str, Any]:
    """Produce the final output."""
    intermediate = state.get("intermediate", "")
    return {"graph_output": f"Result: {intermediate}"}


def create_structured_io_graph() -> StateGraph:
    """Create a graph with explicit input_schema and output_schema.

    This graph uses LangGraph's native input/output schema support:
    - input_schema=InputState (only user_input)
    - output_schema=OutputState (only graph_output)
    """
    builder = StateGraph(
        FullState,
        input=InputState,
        output=OutputState,
    )

    builder.add_node("transform", transform_node)
    builder.add_node("output", output_node)
    builder.set_entry_point("transform")
    builder.add_edge("transform", "output")
    builder.add_edge("output", END)

    return builder


# Instances for test loading
structured_io_graph = create_structured_io_graph()
```

**Step 2: Verify the fixture works**

Run: `python -c "from tests.fixtures.agents.mock_graph import structured_io_graph; g = structured_io_graph.compile(); print(g.invoke({'user_input': 'hello'}))"` from `libs/idun_agent_engine/`
Expected: `{'graph_output': 'Result: processed: hello'}`

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/tests/fixtures/agents/mock_graph.py
git commit -m "test: add structured input/output graph fixture for auto-discovery"
```

---

## Task 5: Implement `discover_capabilities()` for LangGraph adapter

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`
- Create: `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`

**Step 1: Write the failing test**

Create `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`:

```python
"""Tests for agent capability auto-discovery."""

from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_langgraph_chat_agent_discovery():
    """Chat agent with default MessagesState should discover as chat mode."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "chat_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "LANGGRAPH"
    assert capabilities.input.mode == "chat"
    assert capabilities.capabilities.streaming is True
    assert capabilities.capabilities.history is True
    assert capabilities.capabilities.thread_id is True


@pytest.mark.asyncio
async def test_langgraph_structured_agent_discovery():
    """Agent with explicit input_schema/output_schema should discover as structured."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "structured_agent",
                "graph_definition": f"{mock_graph_path}:structured_io_graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "LANGGRAPH"
    assert capabilities.input.mode == "structured"
    assert capabilities.input.schema_ is not None
    assert "user_input" in str(capabilities.input.schema_)
    assert capabilities.output.mode == "structured"
    assert capabilities.output.schema_ is not None
    assert "graph_output" in str(capabilities.output.schema_)
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py -v`
Expected: FAIL — `discover_capabilities()` not implemented on LanggraphAgent

**Step 3: Implement `discover_capabilities()` in LangGraph adapter**

In `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`, add the implementation. Key logic:

```python
def discover_capabilities(self) -> AgentCapabilities:
    """Introspect the compiled graph for input/output schemas."""
    from idun_agent_schema.engine.agent_framework import AgentFramework
    from idun_agent_schema.engine.capabilities import (
        AgentCapabilities,
        CapabilityFlags,
        InputDescriptor,
        OutputDescriptor,
    )

    graph = self._agent_instance
    input_schema = graph.input_schema if hasattr(graph, "input_schema") else None
    output_schema = graph.output_schema if hasattr(graph, "output_schema") else None

    # Detect input mode: chat if schema has a 'messages' field, structured otherwise
    input_mode = "chat"
    input_json_schema = None
    if input_schema is not None:
        schema_fields = {}
        if hasattr(input_schema, "__annotations__"):
            schema_fields = input_schema.__annotations__
        elif hasattr(input_schema, "model_fields"):
            schema_fields = input_schema.model_fields

        has_messages_field = "messages" in schema_fields
        has_only_messages = has_messages_field and len(schema_fields) == 1

        if has_only_messages:
            input_mode = "chat"
        elif not has_messages_field:
            input_mode = "structured"
            input_json_schema = self._schema_to_json_schema(input_schema)
        else:
            # Has messages + other fields — treat as structured
            input_mode = "structured"
            input_json_schema = self._schema_to_json_schema(input_schema)

    # Detect output mode
    output_mode = "text"
    output_json_schema = None
    if output_schema is not None and output_schema != input_schema:
        output_fields = {}
        if hasattr(output_schema, "__annotations__"):
            output_fields = output_schema.__annotations__
        elif hasattr(output_schema, "model_fields"):
            output_fields = output_schema.model_fields

        has_only_messages = "messages" in output_fields and len(output_fields) == 1

        if not has_only_messages:
            output_mode = "structured"
            output_json_schema = self._schema_to_json_schema(output_schema)

    has_checkpointer = self._checkpointer is not None

    return AgentCapabilities(
        version="1",
        framework=AgentFramework.LANGGRAPH,
        capabilities=CapabilityFlags(
            streaming=True,
            history=has_checkpointer,
            thread_id=has_checkpointer,
        ),
        input=InputDescriptor(mode=input_mode, schema_=input_json_schema),
        output=OutputDescriptor(mode=output_mode, schema_=output_json_schema),
    )

@staticmethod
def _schema_to_json_schema(schema_class) -> dict:
    """Convert a Pydantic model or TypedDict to JSON Schema."""
    if hasattr(schema_class, "model_json_schema"):
        return schema_class.model_json_schema()
    # TypedDict — build schema manually from annotations
    properties = {}
    required = []
    annotations = getattr(schema_class, "__annotations__", {})
    for field_name, field_type in annotations.items():
        type_name = getattr(field_type, "__name__", str(field_type))
        json_type = {"str": "string", "int": "integer", "float": "number", "bool": "boolean"}.get(type_name, "string")
        properties[field_name] = {"type": json_type}
        required.append(field_name)
    return {"type": "object", "properties": properties, "required": required}
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py -v`
Expected: PASS

**Step 5: Run full test suite**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/ -v --tb=short`
Expected: PASS

**Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py \
       libs/idun_agent_engine/tests/unit/agent/test_discovery.py
git commit -m "feat(langgraph): implement discover_capabilities() with auto-discovery"
```

---

## Task 6: Implement `discover_capabilities()` for ADK adapter

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`

**Step 1: Write the failing test**

Add to `test_discovery.py`:

```python
@pytest.mark.asyncio
async def test_adk_chat_agent_discovery():
    """ADK agent without input_schema should discover as chat mode."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_agent_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_adk_agent.py"
    )

    config = {
        "agent": {
            "type": "ADK",
            "config": {
                "name": "adk_chat_agent",
                "app_name": "adk_chat",
                "agent": f"{mock_agent_path}:chat_agent",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "ADK"
    assert capabilities.input.mode == "chat"
    assert capabilities.capabilities.streaming is True
```

**Step 2: Create ADK test fixture if needed**

Check if `tests/fixtures/agents/mock_adk_agent.py` exists. If not, create a minimal one:

```python
"""Mock ADK agents for testing."""

from google.adk.agents import LlmAgent

chat_agent = LlmAgent(
    name="test_chat_agent",
    model="gemini-2.0-flash",
    instruction="You are a helpful assistant. Echo back the user's message.",
)
```

**Step 3: Run tests to verify they fail**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py::test_adk_chat_agent_discovery -v`
Expected: FAIL — `discover_capabilities()` not implemented on AdkAgent

**Step 4: Implement `discover_capabilities()` in ADK adapter**

In `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`:

```python
def discover_capabilities(self) -> AgentCapabilities:
    """Introspect the ADK agent for input/output schemas."""
    from idun_agent_schema.engine.agent_framework import AgentFramework
    from idun_agent_schema.engine.capabilities import (
        AgentCapabilities,
        CapabilityFlags,
        InputDescriptor,
        OutputDescriptor,
    )

    agent = self._agent_definition  # The raw ADK agent instance

    # Check for input_schema
    agent_input_schema = getattr(agent, "input_schema", None)
    input_mode = "chat" if agent_input_schema is None else "structured"
    input_json_schema = None
    if agent_input_schema is not None and hasattr(agent_input_schema, "model_json_schema"):
        input_json_schema = agent_input_schema.model_json_schema()

    # Check for output_schema
    agent_output_schema = getattr(agent, "output_schema", None)
    output_mode: str = "text"
    output_json_schema = None
    if agent_output_schema is not None:
        output_mode = "structured"
        if hasattr(agent_output_schema, "model_json_schema"):
            output_json_schema = agent_output_schema.model_json_schema()

    return AgentCapabilities(
        version="1",
        framework=AgentFramework.ADK,
        capabilities=CapabilityFlags(
            streaming=True,
            history=True,
            thread_id=True,
        ),
        input=InputDescriptor(mode=input_mode, schema_=input_json_schema),
        output=OutputDescriptor(mode=output_mode, schema_=output_json_schema),
    )
```

Note: The actual attribute name for the raw ADK agent instance needs to be verified from the adapter code. It may be `self._agent_instance` or accessed via `self.agent_instance` property.

**Step 5: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py \
       libs/idun_agent_engine/tests/unit/agent/test_discovery.py \
       libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py
git commit -m "feat(adk): implement discover_capabilities() with auto-discovery"
```

---

## Task 7: Implement `run()` for LangGraph adapter

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`

**Step 1: Write the failing test**

Add to `test_discovery.py`:

```python
@pytest.mark.asyncio
async def test_langgraph_chat_run():
    """run() with a chat agent should yield AG-UI text message events."""
    from ag_ui.core import EventType
    from ag_ui.core.types import Message, RunAgentInput
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "chat_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    input_data = RunAgentInput(
        thread_id="test-thread",
        run_id="test-run",
        state={},
        messages=[
            Message(id="msg_1", role="user", content="Hello")
        ],
        tools=[],
        context=[],
        forwarded_props={},
    )

    events = []
    async for event in agent.run(input_data):
        events.append(event)

    event_types = [e.type for e in events]
    assert EventType.RUN_STARTED in event_types
    assert EventType.RUN_FINISHED in event_types
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py::test_langgraph_chat_run -v`
Expected: FAIL — `run()` not implemented

**Step 3: Implement `run()` in LangGraph adapter**

The implementation delegates to `LangGraphAGUIAgent.run()`:

```python
async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent]:
    """Canonical AG-UI interaction entry point.

    Delegates to LangGraphAGUIAgent for event generation. For structured
    agents, validates input against the discovered input schema first.
    """
    from ag_ui.core import BaseEvent, EventType
    from ag_ui.core.types import RunAgentInput

    capabilities = self.discover_capabilities()

    # Validate structured input
    if capabilities.input.mode == "structured" and input_data.messages:
        last_msg = input_data.messages[-1]
        content = str(last_msg.content) if last_msg.content else ""
        try:
            import json
            parsed = json.loads(content)
            # Validate against input schema if available
            input_schema = self._agent_instance.input_schema
            if input_schema is not None and hasattr(input_schema, "__annotations__"):
                missing = [
                    k for k in input_schema.__annotations__
                    if k not in parsed
                ]
                if missing:
                    from ag_ui.core import RunErrorEvent
                    yield RunErrorEvent(
                        type=EventType.RUN_ERROR,
                        message=f"Missing required fields: {missing}",
                        code="VALIDATION_ERROR",
                    )
                    return
        except json.JSONDecodeError as e:
            from ag_ui.core import RunErrorEvent
            yield RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=f"Structured input must be valid JSON: {e}",
                code="VALIDATION_ERROR",
            )
            return

    # Delegate to the AG-UI wrapper
    copilotkit_agent = self.copilotkit_agent_instance
    async for event in copilotkit_agent.run(input_data):
        yield event
```

**Step 4: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py::test_langgraph_chat_run -v`
Expected: PASS

**Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py \
       libs/idun_agent_engine/tests/unit/agent/test_discovery.py
git commit -m "feat(langgraph): implement run() delegating to LangGraphAGUIAgent"
```

---

## Task 8: Implement `run()` for ADK adapter

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`

**Step 1: Write the failing test**

Add to `test_discovery.py`:

```python
@pytest.mark.asyncio
async def test_adk_chat_run():
    """run() with an ADK chat agent should yield AG-UI events."""
    from ag_ui.core import EventType
    from ag_ui.core.types import Message, RunAgentInput
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_agent_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_adk_agent.py"
    )

    config = {
        "agent": {
            "type": "ADK",
            "config": {
                "name": "adk_chat_agent",
                "app_name": "adk_chat",
                "agent": f"{mock_agent_path}:chat_agent",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    input_data = RunAgentInput(
        thread_id="test-thread",
        run_id="test-run",
        state={},
        messages=[
            Message(id="msg_1", role="user", content="Hello")
        ],
        tools=[],
        context=[],
        forwarded_props={},
    )

    events = []
    async for event in agent.run(input_data):
        events.append(event)

    event_types = [e.type for e in events]
    assert EventType.RUN_STARTED in event_types
    assert EventType.RUN_FINISHED in event_types
```

**Step 2: Implement `run()` in ADK adapter**

Same pattern — delegate to `ADKAGUIAgent.run()`:

```python
async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent]:
    """Canonical AG-UI interaction entry point.

    Delegates to ADKAGUIAgent for event generation.
    """
    from ag_ui.core import BaseEvent

    copilotkit_agent = self.copilotkit_agent_instance
    async for event in copilotkit_agent.run(input_data):
        yield event
```

**Step 3: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py -v`
Expected: PASS

**Step 4: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py \
       libs/idun_agent_engine/tests/unit/agent/test_discovery.py
git commit -m "feat(adk): implement run() delegating to ADKAGUIAgent"
```

---

## Task 9: Implement Haystack stub (required for BaseAgent contract)

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/haystack.py`

**Step 1: Add stub implementations**

Since Haystack is out of scope for the POC but must satisfy the abstract contract:

```python
def discover_capabilities(self) -> AgentCapabilities:
    """Haystack agents have minimal capabilities."""
    from idun_agent_schema.engine.agent_framework import AgentFramework
    from idun_agent_schema.engine.capabilities import (
        AgentCapabilities,
        CapabilityFlags,
        InputDescriptor,
        OutputDescriptor,
    )

    return AgentCapabilities(
        version="1",
        framework=AgentFramework.HAYSTACK,
        capabilities=CapabilityFlags(streaming=False, history=False, thread_id=False),
        input=InputDescriptor(mode="chat", schema_=None),
        output=OutputDescriptor(mode="text", schema_=None),
    )

async def run(self, input_data) -> AsyncGenerator:
    """Not supported for Haystack."""
    raise NotImplementedError("Haystack does not support the run() interface")
    if False:  # pragma: no cover
        yield
```

**Step 2: Run lint**

Run: `uv run ruff check libs/idun_agent_engine/ && uv run ruff format libs/idun_agent_engine/`
Expected: PASS

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/haystack.py
git commit -m "feat(haystack): add discover_capabilities() and run() stubs"
```

---

## Task 10: Add new routes and shim old routes

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/lifespan.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/dependencies.py`

**Step 1: Add capabilities dependency to `dependencies.py`**

Add a `get_capabilities` dependency function:

```python
async def get_capabilities(request: Request):
    """Return cached agent capabilities from app state."""
    capabilities = getattr(request.app.state, "capabilities", None)
    if capabilities is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent capabilities not yet initialized",
        )
    return capabilities
```

**Step 2: Update lifespan to cache capabilities**

In `lifespan.py`, after agent initialization in `configure_app()`, add:

```python
    # Cache agent capabilities for discovery endpoint
    if hasattr(agent_instance, "discover_capabilities"):
        try:
            app.state.capabilities = agent_instance.discover_capabilities()
            logger.info(
                f"📋 Agent capabilities discovered: "
                f"input={app.state.capabilities.input.mode}, "
                f"output={app.state.capabilities.output.mode}"
            )
        except Exception as e:
            logger.warning(f"⚠️ Failed to discover agent capabilities: {e}")
            app.state.capabilities = None
```

**Step 3: Add new routes to `agent.py`**

Add `GET /capabilities` and `POST /run` to the agent router:

```python
@agent_router.get("/capabilities")
async def capabilities(
    caps: Annotated[AgentCapabilities, Depends(get_capabilities)],
):
    """Return the agent's capability descriptor for UI auto-configuration."""
    return caps


@agent_router.post("/run")
async def run(
    input_data: RunAgentInput,
    request: Request,
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Canonical AG-UI interaction endpoint.

    Accepts RunAgentInput, returns SSE stream of AG-UI events.
    """
    last_msg = input_data.messages[-1] if input_data.messages else None
    last_content = str(last_msg.content)[:120] if last_msg else "<empty>"
    logger.info(f"Run — thread_id={input_data.thread_id}, message={last_content}")

    guardrails = getattr(request.app.state, "guardrails", [])
    if guardrails and input_data.messages:
        _run_guardrails(
            guardrails, message=input_data.messages[-1].content, position="input"
        )

    accept_header = request.headers.get("accept")
    encoder = EventEncoder(accept=accept_header or "")

    async def event_generator():
        try:
            async for event in agent.run(input_data):
                try:
                    yield encoder.encode(event)
                except Exception as encoding_error:
                    logger.error(f"Event encoding error: {encoding_error}", exc_info=True)
                    from ag_ui.core import EventType, RunErrorEvent
                    error_event = RunErrorEvent(
                        type=EventType.RUN_ERROR,
                        message=f"Event encoding failed: {encoding_error}",
                        code="ENCODING_ERROR",
                    )
                    try:
                        yield encoder.encode(error_event)
                    except Exception:
                        yield 'event: error\ndata: {"error": "Event encoding failed"}\n\n'
                    break
        except Exception as agent_error:
            logger.error(f"Agent run error: {agent_error}", exc_info=True)
            from ag_ui.core import EventType, RunErrorEvent
            error_event = RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=f"Agent execution failed: {agent_error}",
                code="FRAMEWORK_ERROR",
            )
            try:
                yield encoder.encode(error_event)
            except Exception:
                yield 'event: error\ndata: {"error": "Agent execution failed"}\n\n'

    return StreamingResponse(
        event_generator(), media_type=encoder.get_content_type()
    )
```

**Step 4: Mark old routes as deprecated**

Add deprecation markers to the existing `stream()`, `copilotkit_stream()` endpoints. Add `# TODO: DEPRECATED — remove when /agent/run migration is complete` comments. Add `deprecated=True` to the route decorators:

```python
@agent_router.post("/stream", deprecated=True)
```

```python
@agent_router.post("/copilotkit/stream", deprecated=True)
```

**Step 5: Update app_factory.py**

Remove the `resolve_input_model` call and dynamic `register_invoke_route`. Replace with a static deprecated shim:

```python
def create_app(...) -> FastAPI:
    validated_config = ConfigBuilder.resolve_config(...)

    # TODO: DEPRECATED — resolve_input_model and register_invoke_route are
    # deprecated. The canonical route is POST /agent/run.
    try:
        input_model = ConfigBuilder.resolve_input_model(validated_config)
    except Exception:
        input_model = ChatRequest  # Fallback for deprecated shim

    app = FastAPI(...)
    # ... middleware ...

    app.state.engine_config = validated_config
    app.include_router(agent_router, prefix="/agent", tags=["Agent"])
    app.include_router(base_router, tags=["Base"])

    # TODO: DEPRECATED — /agent/invoke is deprecated in favor of /agent/run
    register_invoke_route(app, input_model)
    # ... integrations ...
```

Actually, since `resolve_input_model` depends on the removed `input_schema_definition` field, update it to always return `ChatRequest`:

```python
@staticmethod
def resolve_input_model(config: EngineConfig) -> type[ChatRequest]:
    """Resolve input model for the deprecated /agent/invoke route.

    TODO: DEPRECATED — remove when /agent/invoke shim is removed.
    Always returns ChatRequest since input_schema_definition was removed.
    """
    from idun_agent_schema.engine.api import ChatRequest
    return ChatRequest
```

**Step 6: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/ -v --tb=short`
Expected: PASS

**Step 7: Run lint**

Run: `uv run ruff check libs/idun_agent_engine/ && uv run ruff format libs/idun_agent_engine/`
Expected: PASS

**Step 8: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py \
       libs/idun_agent_engine/src/idun_agent_engine/server/dependencies.py \
       libs/idun_agent_engine/src/idun_agent_engine/server/lifespan.py \
       libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py \
       libs/idun_agent_engine/src/idun_agent_engine/core/config_builder.py
git commit -m "feat(engine): add /agent/run and /agent/capabilities routes, deprecate old routes"
```

---

## Task 11: Clean up dead code in LangGraph adapter

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`

**Step 1: Remove dead code from LangGraph adapter**

Remove:
- `_custom_input_model` field initialization (line 59)
- `_input_state_key` field initialization (line 60)
- `_output_schema` field initialization (line 58)
- `_setup_custom_input_schema()` method (lines 309-325)
- `custom_input_model` property (if it exists)
- Any references to these in `initialize()` or `_setup_graph()`

Add `# TODO: DEPRECATED — remove when shim routes are removed` to the `invoke()` and `stream()` methods.

**Step 2: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/ -v --tb=short`
Expected: PASS

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py
git commit -m "refactor(langgraph): remove dead input/output schema definition code"
```

---

## Task 12: Route-level integration tests

**Files:**
- Create: `libs/idun_agent_engine/tests/unit/server/test_routes_run.py`

**Step 1: Write integration tests for the new routes**

```python
"""Tests for /agent/run and /agent/capabilities routes."""

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from idun_agent_engine.core.app_factory import create_app


@pytest.fixture
def chat_app():
    """Create a FastAPI app with a chat LangGraph agent."""
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "chat_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }
    return create_app(config_dict=config)


@pytest.fixture
def structured_app():
    """Create a FastAPI app with a structured LangGraph agent."""
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "structured_agent",
                "graph_definition": f"{mock_graph_path}:structured_io_graph",
            },
        },
    }
    return create_app(config_dict=config)


@pytest.mark.asyncio
async def test_capabilities_chat(chat_app):
    """GET /agent/capabilities returns chat mode for chat agent."""
    async with AsyncClient(
        transport=ASGITransport(app=chat_app), base_url="http://test"
    ) as client:
        response = await client.get("/agent/capabilities")
        assert response.status_code == 200
        data = response.json()
        assert data["input"]["mode"] == "chat"
        assert data["framework"] == "LANGGRAPH"


@pytest.mark.asyncio
async def test_capabilities_structured(structured_app):
    """GET /agent/capabilities returns structured mode for structured agent."""
    async with AsyncClient(
        transport=ASGITransport(app=structured_app), base_url="http://test"
    ) as client:
        response = await client.get("/agent/capabilities")
        assert response.status_code == 200
        data = response.json()
        assert data["input"]["mode"] == "structured"
        assert data["output"]["mode"] == "structured"
        assert "user_input" in json.dumps(data["input"]["schema"])


@pytest.mark.asyncio
async def test_run_chat(chat_app):
    """POST /agent/run with chat message returns SSE stream."""
    async with AsyncClient(
        transport=ASGITransport(app=chat_app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/agent/run",
            json={
                "threadId": "test-thread",
                "runId": "test-run",
                "state": {},
                "messages": [
                    {"id": "msg_1", "role": "user", "content": "Hello"}
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200
        body = response.text
        assert "RUN_STARTED" in body or "run_started" in body.lower()


@pytest.mark.asyncio
async def test_deprecated_invoke_still_works(chat_app):
    """POST /agent/invoke (deprecated) should still work via shim."""
    async with AsyncClient(
        transport=ASGITransport(app=chat_app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/agent/invoke",
            json={"query": "Hello", "session_id": "test-123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "response" in data or "result" in data
```

**Step 2: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/server/test_routes_run.py -v`
Expected: PASS

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/tests/unit/server/test_routes_run.py
git commit -m "test: add integration tests for /agent/run and /agent/capabilities"
```

---

## Task 13: Web UI — add capabilities fetch and types

**Files:**
- Create: `services/idun_agent_web/src/types/capabilities.ts`
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/agui-client.ts`

**Step 1: Create capabilities types**

```typescript
export interface CapabilityFlags {
  streaming: boolean;
  history: boolean;
  threadId: boolean;
}

export interface InputDescriptor {
  mode: "chat" | "structured";
  schema: Record<string, unknown> | null;
}

export interface OutputDescriptor {
  mode: "text" | "structured" | "unknown";
  schema: Record<string, unknown> | null;
}

export interface AgentCapabilities {
  version: string;
  framework: string;
  capabilities: CapabilityFlags;
  input: InputDescriptor;
  output: OutputDescriptor;
}
```

**Step 2: Add capabilities fetch function to `agui-client.ts`**

```typescript
export async function fetchCapabilities(agentUrl: string): Promise<AgentCapabilities | null> {
  try {
    const response = await fetch(`${agentUrl}/agent/capabilities`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
```

**Step 3: Add `runAgent` function to `agui-client.ts`**

```typescript
export function runAgent(
  agentUrl: string,
  input: RunAgentInput,
  onEvent: (event: StreamEvent) => void,
  onError: (error: Error) => void,
  onDone: () => void,
): () => void {
  const agent = new HttpAgent({
    url: `${agentUrl}/agent/run`,
  });

  const observable = agent.run(input);
  const subscription = observable.subscribe({
    next: onEvent,
    error: onError,
    complete: onDone,
  });

  return () => subscription.unsubscribe();
}
```

**Step 4: Commit**

```bash
git add services/idun_agent_web/src/types/capabilities.ts \
       services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/agui-client.ts
git commit -m "feat(web): add capabilities types and runAgent client function"
```

---

## Task 14: Web UI — discovery-driven chat tab with Auto mode

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx`
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/useChat.ts`

**Step 1: Add capabilities state and fetch on mount**

In `component.tsx`, add state for capabilities and fetch on mount:

```typescript
const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
const [viewMode, setViewMode] = useState<'chat' | 'form'>('chat');

useEffect(() => {
  if (agent?.base_url) {
    fetchCapabilities(agent.base_url).then((caps) => {
      if (caps) {
        setCapabilities(caps);
        setViewMode(caps.input.mode === 'structured' ? 'form' : 'chat');
      }
    });
  }
}, [agent?.base_url]);
```

**Step 2: Add capabilities info bar**

Below the tab toolbar, add a small info bar showing what was discovered:

```tsx
{capabilities && (
  <div className="capabilities-info">
    <span>Input: {capabilities.input.mode}</span>
    <span>Output: {capabilities.output.mode}</span>
    <button onClick={() => setViewMode(viewMode === 'chat' ? 'form' : 'chat')}>
      Switch to {viewMode === 'chat' ? 'Form' : 'Chat'}
    </button>
  </div>
)}
```

**Step 3: Add form view for structured mode**

When `viewMode === 'form'`, render a `DynamicForm` (or Monaco JSON editor as fallback) using `capabilities.input.schema`:

```tsx
{viewMode === 'form' && capabilities?.input.schema ? (
  <StructuredInputForm
    schema={capabilities.input.schema}
    onSubmit={(data) => {
      // Serialize as JSON in user message content
      sendMessage(JSON.stringify(data));
    }}
  />
) : (
  // Existing chat composer
)}
```

The `StructuredInputForm` is a small wrapper around `DynamicForm` that:
- Renders the schema as a form
- Has a Submit button
- On submit, serializes the form data as JSON

**Step 4: Update `useChat.ts` to use `/agent/run`**

Modify the `sendMessage` function to use the new `runAgent()` function instead of the old `streamAgent()`. The input format changes from `ChatRequest` to `RunAgentInput`.

**Step 5: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/
git commit -m "feat(web): add Auto mode with capabilities-driven chat/form switching"
```

---

## Task 15: Web UI — structured output viewer

**Files:**
- Create: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/structured-output.tsx`
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx`

**Step 1: Create StructuredOutputViewer component**

```tsx
interface StructuredOutputViewerProps {
  data: unknown;
  collapsed?: boolean;
}

export function StructuredOutputViewer({ data, collapsed = true }: StructuredOutputViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  if (data === null || data === undefined) return null;

  // Arrays of flat objects → table
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    return <TableView data={data} />;
  }

  // Objects → key-value pairs
  if (typeof data === 'object') {
    return <ObjectView data={data as Record<string, unknown>} />;
  }

  // Primitives → plain text
  return <pre>{String(data)}</pre>;
}
```

**Step 2: Handle `Custom("structured_output")` events in useChat**

In `useChat.ts`, add handling for custom events:

```typescript
case 'CUSTOM':
  if (event.name === 'structured_output') {
    // Store structured output data for rendering
    setStructuredOutput(event.value);
  }
  break;
```

**Step 3: Render structured output in message bubble**

When the assistant message has associated structured output, render the `StructuredOutputViewer` below the text content.

**Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/
git commit -m "feat(web): add structured output viewer component"
```

---

## Task 16: Create example agents

**Files:**
- Create: `examples/langgraph-chat/agent.py`
- Create: `examples/langgraph-chat/config.yaml`
- Create: `examples/langgraph-structured/agent.py`
- Create: `examples/langgraph-structured/config.yaml`
- Create: `examples/adk-chat/agent.py`
- Create: `examples/adk-chat/config.yaml`
- Create: `examples/adk-structured/agent.py`
- Create: `examples/adk-structured/config.yaml`
- Create: `examples/README.md`

**Step 1: Create LangGraph chat example**

`examples/langgraph-chat/agent.py`:
```python
"""Simple LangGraph chat agent example."""
from typing import Annotated, Any, TypedDict
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list[dict[str, Any]], add_messages]


def respond(state: State) -> dict:
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    content = last.get("content", "") if isinstance(last, dict) else str(last)
    return {"messages": [{"role": "assistant", "content": f"You said: {content}"}]}


builder = StateGraph(State)
builder.add_node("respond", respond)
builder.set_entry_point("respond")
builder.add_edge("respond", END)
graph = builder
```

`examples/langgraph-chat/config.yaml`:
```yaml
agent:
  type: LANGGRAPH
  config:
    name: "Chat Agent"
    graph_definition: "./agent.py:graph"
```

**Step 2: Create LangGraph structured example**

`examples/langgraph-structured/agent.py`:
```python
"""LangGraph agent with typed input/output schemas."""
from typing import TypedDict
from langgraph.graph import END, StateGraph


class InputState(TypedDict):
    user_input: str

class OutputState(TypedDict):
    graph_output: str

class FullState(TypedDict):
    user_input: str
    graph_output: str

def process(state: FullState) -> dict:
    return {"graph_output": f"Processed: {state['user_input']}"}

builder = StateGraph(FullState, input=InputState, output=OutputState)
builder.add_node("process", process)
builder.set_entry_point("process")
builder.add_edge("process", END)
graph = builder
```

`examples/langgraph-structured/config.yaml`:
```yaml
agent:
  type: LANGGRAPH
  config:
    name: "Structured Agent"
    graph_definition: "./agent.py:graph"
```

**Step 3: Create ADK chat and structured examples** (similar pattern)

**Step 4: Create README.md**

Document each example: what it demonstrates, how to run it (`idun agent serve --source file --path config.yaml`), expected `/agent/capabilities` response, example curl for `/agent/run`.

**Step 5: Commit**

```bash
git add examples/
git commit -m "docs: add example agents for chat and structured interaction patterns"
```

---

## Task 17: Update CLAUDE.md files

**Files:**
- Modify: `libs/idun_agent_schema/CLAUDE.md`
- Modify: `libs/idun_agent_engine/CLAUDE.md`

**Step 1: Update schema CLAUDE.md**

- Remove references to `input_schema_definition` and `output_schema_definition` from BaseAgentConfig table
- Add `AgentCapabilities` to the API payloads section
- Note that `ChatRequest`/`ChatResponse` are deprecated

**Step 2: Update engine CLAUDE.md**

- Add `GET /agent/capabilities` and `POST /agent/run` to the endpoints table
- Mark `/agent/invoke`, `/agent/stream`, `/agent/copilotkit/stream` as deprecated
- Update the agent adapters section to mention `discover_capabilities()` and `run()`
- Remove references to `input_schema_definition` from the config examples

**Step 3: Commit**

```bash
git add libs/idun_agent_schema/CLAUDE.md libs/idun_agent_engine/CLAUDE.md
git commit -m "docs: update CLAUDE.md files to reflect new interaction architecture"
```

---

## Task 18: Final validation

**Step 1: Run full CI checks**

```bash
make lint
make mypy
make test
```

Expected: All PASS

**Step 2: Run the chat app manually (smoke test)**

```bash
cd examples/langgraph-chat && idun agent serve --source file --path config.yaml
```

In another terminal:
```bash
# Test capabilities
curl http://localhost:8000/agent/capabilities | jq

# Test run
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId": "t1",
    "runId": "r1",
    "state": {},
    "messages": [{"id": "m1", "role": "user", "content": "Hello"}],
    "tools": [],
    "context": [],
    "forwardedProps": {}
  }'
```

**Step 3: Run the structured app manually**

```bash
cd examples/langgraph-structured && idun agent serve --source file --path config.yaml
```

Test capabilities and run with structured input.

**Step 4: Verify deprecated routes still work**

```bash
curl -X POST http://localhost:8000/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello", "session_id": "s1"}'
```

Expected: Response with deprecation indicators.

---

## Summary of all commits

1. `feat(schema): add AgentCapabilities discovery models`
2. `refactor(schema): remove input_schema_definition and output_schema_definition`
3. `feat(engine): add discover_capabilities() and run() to BaseAgent`
4. `test: add structured input/output graph fixture for auto-discovery`
5. `feat(langgraph): implement discover_capabilities() with auto-discovery`
6. `feat(adk): implement discover_capabilities() with auto-discovery`
7. `feat(langgraph): implement run() delegating to LangGraphAGUIAgent`
8. `feat(adk): implement run() delegating to ADKAGUIAgent`
9. `feat(haystack): add discover_capabilities() and run() stubs`
10. `feat(engine): add /agent/run and /agent/capabilities routes, deprecate old routes`
11. `refactor(langgraph): remove dead input/output schema definition code`
12. `test: add integration tests for /agent/run and /agent/capabilities`
13. `feat(web): add capabilities types and runAgent client function`
14. `feat(web): add Auto mode with capabilities-driven chat/form switching`
15. `feat(web): add structured output viewer component`
16. `docs: add example agents for chat and structured interaction patterns`
17. `docs: update CLAUDE.md files to reflect new interaction architecture`
