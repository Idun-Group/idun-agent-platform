import asyncio
import os
import time
import uuid
from pathlib import Path

import pytest

agent_hash = uuid.uuid4()


@pytest.fixture
def skip_if_no_langfuse_credentials():
    if not os.getenv("LANGFUSE_PUBLIC_KEY") or not os.getenv("LANGFUSE_SECRET_KEY"):
        pytest.skip("Langfuse credentials not set")


@pytest.fixture
def langfuse_client(skip_if_no_langfuse_credentials):
    from langfuse import get_client

    client = get_client()
    return client


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
        Path(__file__).parent.parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )

    return {
        "agent": {
            "type": "ADK",
            "config": {
                "name": "test_adk_agent",
                "app_name": "test_adk_agent",
                "agent": f"{mock_agent_path}:mock_adk_agent_instance",
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
                    "run_name": f"test_adk_run_{agent_hash}",
                },
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

    trace = langfuse_client.api.trace.list(
        limit=1, name=engine_config.observability[0].config.run_name
    )
    assert trace is not None
    assert message == trace.data[0].input["messages"][0][1]


@pytest.mark.integration
@pytest.mark.requires_langfuse
@pytest.mark.asyncio
async def test_adk_agent_sends_trace_to_langfuse(
    adk_config_with_langfuse, langfuse_client
):
    from ag_ui.core import RunAgentInput, UserMessage

    from idun_agent_engine.core.config_builder import ConfigBuilder

    message = f"Test message for ADK {agent_hash}"

    engine_config = ConfigBuilder.from_dict(adk_config_with_langfuse).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    copilotkit_agent = agent.copilotkit_agent_instance

    input_data = RunAgentInput(
        threadId="thread-009",
        runId="run-001",
        state={},
        messages=[UserMessage(id="msg-002", role="user", content=message)],
        tools=[],
        context=[],
        forwardedProps={},
    )

    from datetime import datetime, timezone

    start_time = datetime.now(timezone.utc)

    async for event in copilotkit_agent.run(
        input_data
    ):  # consume async gen to produce otel traces
        pass

    end_time = datetime.now(timezone.utc)

    await asyncio.sleep(35)

    trace = langfuse_client.api.trace.list(
        limit=10, from_timestamp=start_time, to_timestamp=end_time
    )
    assert message in str(trace.data[0].input)
