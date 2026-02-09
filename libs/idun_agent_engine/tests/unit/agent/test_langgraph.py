from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_langgraph_agent_from_yaml():
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_langgraph_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    test_message = "test message"
    response = await agent.invoke({"query": test_message, "session_id": "test123"})

    assert agent is not None
    assert agent.name == "test_langgraph_agent"
    assert agent.agent_type == "LangGraph"
    assert response is not None
    assert test_message in str(response)


# -----------------------------------------------------------------------------
# input_schema_definition tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_input_schema_definition_valid_field():
    """Test that input_schema_definition correctly resolves a state field."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "structured_input_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
                "input_schema_definition": "request",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert agent.custom_input_model is not None
    assert agent.custom_input_model.__name__ == "TaskRequest"


@pytest.mark.asyncio
async def test_input_schema_definition_invalid_field():
    """Test that input_schema_definition raises error for non-existent field."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "structured_input_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
                "input_schema_definition": "nonexistent_field",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()

    with pytest.raises(ValueError, match="Field 'nonexistent_field' not found"):
        await ConfigBuilder.initialize_agent_from_config(engine_config)


@pytest.mark.asyncio
async def test_invoke_with_pydantic_model_without_schema_definition():
    """Test that invoking with Pydantic model without input_schema_definition falls back to dict validation."""
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from tests.fixtures.agents.mock_graph import TaskRequest

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "no_schema_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
                # No input_schema_definition
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    task = TaskRequest(task_name="Test Task", priority=2)

    # Without input_schema_definition, falls through to dict validation
    with pytest.raises(ValueError, match="'query' and 'session_id'"):
        await agent.invoke(task)


@pytest.mark.asyncio
async def test_invoke_with_pydantic_model_success():
    """Test successful invocation with Pydantic model when input_schema_definition is set."""
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from tests.fixtures.agents.mock_graph import TaskRequest

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "structured_input_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
                "input_schema_definition": "request",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    task = TaskRequest(
        task_name="Build feature",
        description="Implement the new feature",
        priority=3,
        tags=["backend", "urgent"],
    )

    result = await agent.invoke(task)

    assert result is not None
    assert "result" in result
    assert "Build feature" in result["result"]
    assert "priority: 3" in result["result"]
    assert "backend" in result["result"]
