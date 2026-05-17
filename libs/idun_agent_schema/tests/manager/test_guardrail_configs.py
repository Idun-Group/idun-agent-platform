"""Tests for ``idun_agent_schema.manager.guardrail_configs``.

Pins the round-trip contract used by the standalone seeder and the
``services/engine_config._layer_guardrails`` assembly path:

    engine → to_manager_shape → manager → convert_guardrail → engine

is lossless modulo two engine-only fields (``api_key`` re-injected from
the ``GUARDRAILS_API_KEY`` env var, ``guard_url`` hardcoded inside
``convert_guardrail``).
"""

from __future__ import annotations

import os

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    BanListConfig,
    DetectPIIConfig,
    GuardrailsV2,
    ToxicLanguageConfig,
)
from idun_agent_schema.manager.guardrail_configs import (
    convert_guardrail,
    to_manager_shape,
)


@pytest.fixture(autouse=True)
def _set_guardrails_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """``convert_guardrail`` raises if GUARDRAILS_API_KEY is unset."""
    monkeypatch.setenv("GUARDRAILS_API_KEY", "test-key")


def _round_trip(engine_guard: object, position: str = "input") -> object:
    """engine → to_manager_shape → manager dict → convert_guardrail → engine."""
    manager_dict = to_manager_shape(engine_guard)
    converted = convert_guardrail({position: [manager_dict]})
    return GuardrailsV2.model_validate(converted)


def test_to_manager_shape_strips_engine_only_fields() -> None:
    """``api_key`` and ``guard_url`` are stripped on the way down to manager shape."""
    engine_guard = BanListConfig(
        api_key="secret",
        guard_url="hub://guardrails/ban_list",
        banned_words=["alpha", "beta"],
    )
    manager_dict = to_manager_shape(engine_guard)

    assert "api_key" not in manager_dict
    assert "guard_url" not in manager_dict
    # Manager-shape fields preserved.
    assert manager_dict["config_id"] == "ban_list"
    assert manager_dict["banned_words"] == ["alpha", "beta"]


def test_round_trip_ban_list() -> None:
    """BAN_LIST round-trips: banned_words preserved, api_key re-injected."""
    original = BanListConfig(
        api_key="secret",
        banned_words=["alpha", "beta"],
        reject_message="ban!!",
    )

    rebuilt = _round_trip(original, position="input")

    assert isinstance(rebuilt, GuardrailsV2)
    assert len(rebuilt.input) == 1
    assert len(rebuilt.output) == 0
    rebuilt_guard = rebuilt.input[0]
    assert isinstance(rebuilt_guard, BanListConfig)
    assert rebuilt_guard.banned_words == original.banned_words
    assert rebuilt_guard.reject_message == original.reject_message
    # api_key is re-injected from env (the fixture). guard_url is the hardcoded default.
    assert rebuilt_guard.api_key == os.environ["GUARDRAILS_API_KEY"]
    assert rebuilt_guard.guard_url == "hub://guardrails/ban_list"


def test_round_trip_detect_pii() -> None:
    """DETECT_PII round-trips: pii_entities preserved, on_fail injected by convert."""
    original = DetectPIIConfig(
        api_key="secret",
        pii_entities=["EMAIL_ADDRESS", "PHONE_NUMBER"],
    )

    rebuilt = _round_trip(original, position="output")

    assert len(rebuilt.output) == 1
    rebuilt_guard = rebuilt.output[0]
    assert isinstance(rebuilt_guard, DetectPIIConfig)
    assert rebuilt_guard.pii_entities == original.pii_entities
    # convert_guardrail unconditionally sets on_fail="exception" inside
    # guard_params; the engine model validator flattens it back.
    assert rebuilt_guard.on_fail == "exception"


def test_round_trip_toxic_language_threshold_preserved() -> None:
    """Threshold-style guards (TOXIC_LANGUAGE) round-trip the float verbatim."""
    original = ToxicLanguageConfig(
        api_key="secret",
        threshold=0.42,
        reject_message="No.",
    )

    rebuilt = _round_trip(original, position="input")

    assert len(rebuilt.input) == 1
    rebuilt_guard = rebuilt.input[0]
    assert isinstance(rebuilt_guard, ToxicLanguageConfig)
    assert rebuilt_guard.threshold == pytest.approx(0.42)
    assert rebuilt_guard.reject_message == "No."


def test_to_manager_shape_accepts_dict_input() -> None:
    """The helper accepts an already-dumped dict, not just Pydantic models.

    The seeder iterates typed configs; downstream callers in tests and
    future tools may pass a dict directly. Both forms must work.
    """
    engine_dict = {
        "config_id": "ban_list",
        "api_key": "secret",
        "guard_url": "hub://guardrails/ban_list",
        "banned_words": ["x"],
        "reject_message": "ban!!",
    }
    manager_dict = to_manager_shape(engine_dict)
    assert manager_dict == {
        "config_id": "ban_list",
        "banned_words": ["x"],
        "reject_message": "ban!!",
    }
