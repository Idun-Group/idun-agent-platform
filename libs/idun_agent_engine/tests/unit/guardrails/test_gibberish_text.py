"""Tests for GibberishTextConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    GibberishTextConfig,
    GuardrailConfigId,
)


class TestGibberishTextConfig:
    """Test GibberishTextConfig guardrail."""

    def test_gibberish_text_config_creation(self):
        """Test creating GibberishTextConfig."""
        config = GibberishTextConfig(threshold=0.7)

        assert config.config_id == GuardrailConfigId.GIBBERISH_TEXT
        assert config.threshold == 0.7

    def test_gibberish_text_threshold_min(self):
        """Test GibberishTextConfig with minimum threshold."""
        config = GibberishTextConfig(threshold=0.0)

        assert config.threshold == 0.0

    def test_gibberish_text_threshold_max(self):
        """Test GibberishTextConfig with maximum threshold."""
        config = GibberishTextConfig(threshold=1.0)

        assert config.threshold == 1.0

    def test_gibberish_text_threshold_mid(self):
        """Test GibberishTextConfig with mid-range threshold."""
        config = GibberishTextConfig(threshold=0.5)

        assert config.threshold == 0.5
