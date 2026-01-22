"""Tests for the configuration builder API."""

from pathlib import Path

import pytest

from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
def test_with_langgraph_agent_builds_engine_config(tmp_path: Path) -> None:
    """EngineConfig is built with expected values for a LangGraph agent."""
    builder = (
        ConfigBuilder()
        .with_api_port(9000)
        .with_langgraph_agent(
            name="UT Agent",
            graph_definition=str(tmp_path / "agent.py:graph"),
            sqlite_checkpointer=str(tmp_path / "agent.db"),
            observability={
                "provider": "langfuse",
                "enabled": False,
                "options": {},
            },
        )
    )
    engine_config = builder.build()
    assert engine_config.server.api.port == 9000
    assert engine_config.agent.type == "LANGGRAPH"
    assert engine_config.agent.config.name == "UT Agent"
