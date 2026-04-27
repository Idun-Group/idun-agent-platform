"""Tests for the config_hash service."""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.services.config_hash import compute_config_hash


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


def test_compute_config_hash_returns_64_char_hex() -> None:
    digest = compute_config_hash(_sample_engine_config())
    assert len(digest) == 64
    int(digest, 16)  # raises if not valid hex


def test_compute_config_hash_deterministic() -> None:
    """Two equal configs must produce identical hashes."""
    a = compute_config_hash(_sample_engine_config())
    b = compute_config_hash(_sample_engine_config())
    assert a == b


def test_compute_config_hash_canonicalizes_key_order() -> None:
    """Configs that differ only in dict key insertion order produce the same hash."""
    config_a = EngineConfig.model_validate(
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
    config_b = EngineConfig.model_validate(
        {
            "agent": {
                "config": {
                    "graph_definition": "agent.py:graph",
                    "name": "ada",
                },
                "type": "LANGGRAPH",
            }
        }
    )
    assert compute_config_hash(config_a) == compute_config_hash(config_b)


def test_compute_config_hash_distinct_configs_distinct_hashes() -> None:
    config_a = _sample_engine_config()
    config_b = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "different",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )
    assert compute_config_hash(config_a) != compute_config_hash(config_b)


def test_compute_config_hash_with_empty_optional_fields() -> None:
    """Optional fields like description/version don't break hashing."""
    config = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        }
    )
    digest = compute_config_hash(config)
    assert len(digest) == 64
