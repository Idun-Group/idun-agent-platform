"""Tests for BiasCheckConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import BiasCheckConfig, GuardrailConfigId


class TestBiasCheckConfig:
    """Test BiasCheckConfig guardrail."""

    def test_bias_check_config_creation(self):
        """Test creating BiasCheckConfig."""
        config = BiasCheckConfig(threshold=0.5)

        assert config.config_id == GuardrailConfigId.BIAS_CHECK
        assert config.threshold == 0.5

    def test_bias_check_threshold_min(self):
        """Test BiasCheckConfig with minimum threshold."""
        config = BiasCheckConfig(threshold=0.0)

        assert config.threshold == 0.0

    def test_bias_check_threshold_max(self):
        """Test BiasCheckConfig with maximum threshold."""
        config = BiasCheckConfig(threshold=1.0)

        assert config.threshold == 1.0

    def test_bias_check_threshold_mid(self):
        """Test BiasCheckConfig with mid-range threshold."""
        config = BiasCheckConfig(threshold=0.75)

        assert config.threshold == 0.75
