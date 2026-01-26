"""Tests for DetectPIIConfig guardrail."""

import pytest
from unittest.mock import MagicMock, patch

from idun_agent_schema.engine.guardrails_v2 import DetectPIIConfig, GuardrailConfigId

from idun_agent_engine.guardrails.guardrails_hub.guardrails_hub import (
    GuardrailsHubGuard,
)


class TestDetectPIIConfig:
    """Test DetectPIIConfig guardrail."""

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_init_with_pii_config(self, mock_setup_guard):
        """Test initializing GuardrailsHubGuard with DetectPIIConfig."""
        mock_setup_guard.return_value = MagicMock()

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII detected",
            guard_url="hub://guardrails/detect_pii",
            guard_params={
                "pii_entities": ["EMAIL_ADDRESS", "PHONE_NUMBER"],
                "on_fail": "exception",
            },
        )

        guard = GuardrailsHubGuard(config, position="output")

        assert guard.guard_id == GuardrailConfigId.DETECT_PII
        assert guard._guard_url == "hub://guardrails/detect_pii"
        assert guard.reject_message == "PII detected"
        assert guard.position == "output"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_pii_stores_pii_entities(self, mock_setup_guard):
        """Test that pii_entities are properly stored."""
        mock_setup_guard.return_value = MagicMock()

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII",
            guard_url="hub://guardrails/detect_pii",
            guard_params={
                "pii_entities": ["EMAIL_ADDRESS", "SSN", "CREDIT_CARD"],
                "on_fail": "exception",
            },
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard._guardrail_config.guard_params.pii_entities == [
            "EMAIL_ADDRESS",
            "SSN",
            "CREDIT_CARD",
        ]

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_pii_stores_on_fail(self, mock_setup_guard):
        """Test that on_fail parameter is stored."""
        mock_setup_guard.return_value = MagicMock()

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII",
            guard_url="hub://guardrails/detect_pii",
            guard_params={"pii_entities": ["EMAIL_ADDRESS"], "on_fail": "exception"},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard._guardrail_config.guard_params.on_fail == "exception"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_pii_single_entity(self, mock_setup_guard):
        """Test DetectPIIConfig with single PII entity."""
        mock_setup_guard.return_value = MagicMock()

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII",
            guard_url="hub://guardrails/detect_pii",
            guard_params={"pii_entities": ["EMAIL_ADDRESS"], "on_fail": "exception"},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert len(guard._guardrail_config.guard_params.pii_entities) == 1
        assert guard._guardrail_config.guard_params.pii_entities[0] == "EMAIL_ADDRESS"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_pii_custom_reject_message(self, mock_setup_guard):
        """Test DetectPIIConfig with custom reject message."""
        mock_setup_guard.return_value = MagicMock()

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="Personal information not allowed",
            guard_url="hub://guardrails/detect_pii",
            guard_params={"pii_entities": ["EMAIL_ADDRESS"], "on_fail": "exception"},
        )

        guard = GuardrailsHubGuard(config, position="output")

        assert guard.reject_message == "Personal information not allowed"
