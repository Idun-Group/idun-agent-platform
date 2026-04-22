"""Tests for agent capability auto-discovery."""

import logging
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


@pytest.mark.asyncio
async def test_langgraph_pydantic_input_discovery():
    """State with a Pydantic model field (no messages) should discover as structured input."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "pydantic_input_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "LANGGRAPH"
    assert capabilities.input.mode == "structured"
    assert capabilities.input.schema_ is not None

    # The schema should contain the Pydantic model's fields (TaskRequest)
    # nested within the StructuredInputState TypedDict.
    input_schema = capabilities.input.schema_
    # Resolve $ref/$defs wrapper if present
    if "$ref" in input_schema and "$defs" in input_schema:
        ref_name = input_schema["$ref"].split("/")[-1]
        resolved = input_schema["$defs"][ref_name]
    else:
        resolved = input_schema
    assert resolved["type"] == "object"
    assert "request" in resolved["properties"]


@pytest.mark.asyncio
async def test_langgraph_structured_discovery_json_schema_shape():
    """Verify the JSON Schema has proper structure for TypedDict schemas."""
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

    input_schema = capabilities.input.schema_
    assert input_schema is not None
    # LangGraph wraps input in a $ref/$defs structure; resolve to the
    # referenced definition to check properties.
    if "$ref" in input_schema and "$defs" in input_schema:
        ref_name = input_schema["$ref"].split("/")[-1]
        resolved = input_schema["$defs"][ref_name]
    else:
        resolved = input_schema
    assert resolved["type"] == "object"
    assert "user_input" in resolved["properties"]

    output_schema = capabilities.output.schema_
    assert output_schema is not None
    assert output_schema["type"] == "object"
    assert "graph_output" in output_schema["properties"]


@pytest.mark.asyncio
async def test_discover_capabilities_falls_back_when_schema_introspection_raises(
    caplog,
):
    """Schema introspection failures must not crash discovery.

    Reproduces the LangChain 1.2 / LangGraph 1.x / Pydantic 2
    ``PydanticForbiddenQualifier`` condition that breaks DeepAgents on
    Idun (LangChain's ``PlanningState.todos`` uses ``NotRequired``, which
    LangGraph forwards to ``pydantic.create_model`` without unwrapping).

    Contract: any exception while accessing ``graph.input_schema`` or
    ``graph.output_schema`` must degrade to chat/text mode, emit a
    warning, and cache the fallback so subsequent calls are O(1).
    """
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "boom_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    # Replace the compiled graph with one whose schema @properties raise,
    # mimicking LangGraph's pregel create_model failure on a state schema
    # that includes TypedDict-only qualifiers (e.g. PlanningState).
    class _BoomGraph:
        @property
        def input_schema(self):
            raise RuntimeError("boom: NotRequired not allowed here")

        @property
        def output_schema(self):
            raise RuntimeError("boom: NotRequired not allowed here")

    agent._agent_instance = _BoomGraph()
    agent._cached_capabilities = None

    with caplog.at_level(logging.WARNING, logger="idun_agent_engine"):
        capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "LANGGRAPH"
    assert capabilities.input.mode == "chat"
    assert capabilities.input.schema_ is None
    assert capabilities.output.mode == "text"
    assert capabilities.output.schema_ is None

    assert any(
        "Graph schema introspection failed" in rec.message for rec in caplog.records
    ), "expected a warning log describing the introspection failure"

    # Second call must hit the cache — the raising @property must not be
    # accessed again, proving the fallback was cached on the first call.
    class _ExplodeIfTouched:
        @property
        def input_schema(self):
            raise AssertionError("cache was not used — input_schema re-accessed")

        @property
        def output_schema(self):
            raise AssertionError("cache was not used — output_schema re-accessed")

    agent._agent_instance = _ExplodeIfTouched()

    cached = agent.discover_capabilities()
    assert cached is capabilities
