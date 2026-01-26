"""Tests for ToxicLanguageConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    ToxicLanguageConfig,
    GuardrailConfigId,
)


class TestToxicLanguageConfig:
    """Test ToxicLanguageConfig guardrail."""

    def test_toxic_language_config_creation(self):
        """Test creating ToxicLanguageConfig."""
        config = ToxicLanguageConfig(threshold=0.75)

        assert config.config_id == GuardrailConfigId.TOXIC_LANGUAGE
        assert config.threshold == 0.75

    def test_toxic_language_threshold_min(self):
        """Test ToxicLanguageConfig with minimum threshold."""
        config = ToxicLanguageConfig(threshold=0.0)

        assert config.threshold == 0.0

    def test_toxic_language_threshold_max(self):
        """Test ToxicLanguageConfig with maximum threshold."""
        config = ToxicLanguageConfig(threshold=1.0)

        assert config.threshold == 1.0

    def test_toxic_language_threshold_mid(self):
        """Test ToxicLanguageConfig with mid-range threshold."""
        config = ToxicLanguageConfig(threshold=0.6)

        assert config.threshold == 0.6
