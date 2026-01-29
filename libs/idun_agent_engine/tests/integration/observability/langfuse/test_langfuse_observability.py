import time
import os
import uuid
import asyncio
import pytest
from pathlib import Path


agent_hash = uuid.uuid4()


@pytest.fixture
def skip_if_no_langfuse_credentials():
    if not os.getenv("LANGFUSE_PUBLIC_KEY") or not os.getenv("LANGFUSE_SECRET_KEY"):
        pytest.skip("Langfuse credentials not set")


@pytest.fixture
def langfuse_client(skip_if_no_langfuse_credentials):
    from langfuse import get_client

    client = get_client()
    yield client
    client.flush()


@pytest.fixture
def langgraph_config_with_langfuse():
    mock_graph_path = (
        Path(__file__).parent.parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_graph.py"
    )

    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test LangGraph Agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
        "observability": [
            {
                "enabled": True,
                "provider": "LANGFUSE",
                "config": {
                    "host": "https://cloud.langfuse.com",
                    "public_key": os.environ.get("LANGFUSE_PUBLIC_KEY"),
                    "secret_key": os.environ.get("LANGFUSE_SECRET_KEY"),
                    "run_name": f"test_langgraph_run_{agent_hash}",
                },
            }
        ],
    }


@pytest.fixture
def adk_config_with_langfuse():
    mock_agent_path = (
        Path(__file__).parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )

    return {
        "agent": {
            "type": "ADK",
            "config": {
                "app_name": "Test ADK Agent",
                "agent": f"{mock_agent_path}:mock_adk_agent_instance",
            },
        },
        "observability": [
            {
                "enabled": True,
                "provider": "LANGFUSE",
                "config": {},
            }
        ],
    }


@pytest.fixture
def haystack_config_with_langfuse():
    mock_pipeline_path = (
        Path(__file__).parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_haystack_pipeline.py"
    )

    return {
        "agent": {
            "type": "HAYSTACK",
            "config": {
                "name": "Test Haystack Agent",
                "component_type": "pipeline",
                "component_definition": f"{mock_pipeline_path}:mock_haystack_pipeline",
            },
        },
        "observability": [
            {
                "enabled": True,
                "provider": "LANGFUSE",
                "config": {},
            }
        ],
    }


@pytest.mark.integration
@pytest.mark.requires_langfuse
@pytest.mark.asyncio
async def test_langgraph_agent_sends_trace_to_langfuse(
    langgraph_config_with_langfuse, langfuse_client
):
    from idun_agent_engine.core.config_builder import ConfigBuilder

    message = f"Test message for LangGraph {agent_hash}"

    engine_config = ConfigBuilder.from_dict(langgraph_config_with_langfuse).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    _ = await agent.invoke({"query": message, "session_id": "session123"})

    await asyncio.sleep(
        35
    )  # langfuse-docs: New data is typically available for querying within 15-30 seconds of ingestion

    langfuse_client.flush()

    trace = langfuse_client.api.trace.list(
        limit=1, name=engine_config.observability[0].config.run_name
    )
    assert trace is not None
    assert message == trace.data[0].input["messages"][0][1]
