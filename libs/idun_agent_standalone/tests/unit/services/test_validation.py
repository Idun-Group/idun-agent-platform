"""Tests for the validation service (round 2)."""

from __future__ import annotations

import pytest
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.services.validation import (
    RoundTwoValidationFailed,
    validate_assembled_config,
)


def _valid_langgraph_config() -> EngineConfig:
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


def test_valid_config_passes() -> None:
    config = _valid_langgraph_config()
    validate_assembled_config(config)  # must not raise


def test_round_two_validation_failed_wraps_validation_error() -> None:
    """Manually construct an invalid EngineConfig dump and pass through.

    We can't easily construct an invalid EngineConfig instance directly
    (Pydantic rejects it on construction), so we round-trip through
    model_dump and manually corrupt the dump before re-validating.
    """
    config = _valid_langgraph_config()
    dumped = config.model_dump()
    # Corrupt: set agent.config to an invalid shape for LANGGRAPH
    dumped["agent"]["config"] = {"name": "ada"}  # missing graph_definition

    # validate_assembled_config takes an EngineConfig, but the test
    # exercises the round-2 contract: any structural mismatch in the
    # dumped form fails. We use a fake object with model_dump returning
    # the corrupt dict; the resulting RoundTwoValidationFailed carries
    # field_errors.
    class _FakeConfig:
        def model_dump(self) -> dict:
            return dumped

    with pytest.raises(RoundTwoValidationFailed) as exc_info:
        validate_assembled_config(_FakeConfig())  # type: ignore[arg-type]
    assert len(exc_info.value.field_errors) >= 1


def test_field_errors_carry_structured_codes() -> None:
    """RoundTwoValidationFailed.field_errors contains structured entries."""
    config = _valid_langgraph_config()
    dumped = config.model_dump()
    dumped["agent"]["config"] = {"name": "ada"}

    class _FakeConfig:
        def model_dump(self) -> dict:
            return dumped

    with pytest.raises(RoundTwoValidationFailed) as exc_info:
        validate_assembled_config(_FakeConfig())  # type: ignore[arg-type]
    fe = exc_info.value.field_errors[0]
    assert fe.field
    assert fe.message
