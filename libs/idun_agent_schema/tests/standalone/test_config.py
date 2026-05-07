"""Tests for idun_agent_schema.standalone.config."""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import StandaloneMaterializedConfig


def _sample_engine_config() -> EngineConfig:
    return EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )


def test_materialized_config_round_trip() -> None:
    materialized = StandaloneMaterializedConfig(
        config=_sample_engine_config(),
        hash="abc123def456",
    )
    dumped = materialized.model_dump(by_alias=True, mode="json")
    assert dumped["hash"] == "abc123def456"
    assert "config" in dumped
    reparsed = StandaloneMaterializedConfig.model_validate(dumped)
    assert reparsed.hash == materialized.hash
    assert reparsed.config.agent.config.name == "ada"


def test_materialized_config_camel_case_outbound() -> None:
    materialized = StandaloneMaterializedConfig(
        config=_sample_engine_config(),
        hash="abc",
    )
    dumped = materialized.model_dump(by_alias=True, mode="json")
    # Top-level fields don't have snake_case forms; this asserts the dump
    # doesn't accidentally introduce extra keys.
    assert set(dumped.keys()) == {"config", "hash"}
