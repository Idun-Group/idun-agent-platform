"""Verify the echo-agent test helper produces a config the engine accepts."""

from __future__ import annotations

from idun_agent_schema.engine import EngineConfig
from idun_agent_standalone.testing import echo_agent_config, echo_graph


def test_echo_agent_config_validates_as_engine_config():
    cfg = echo_agent_config()
    parsed = EngineConfig.model_validate(cfg)
    assert parsed.agent.config.name == "test-echo"
    assert parsed.agent.config.graph_definition.endswith(":echo_graph")


def test_echo_graph_is_compilable_state_graph():
    assert echo_graph is not None
    compiled = echo_graph.compile()
    assert compiled is not None
