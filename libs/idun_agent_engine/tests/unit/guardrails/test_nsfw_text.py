"""Tests for NSFWTextConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import NSFWTextConfig, GuardrailConfigId


class TestNSFWTextConfig:
    """Test NSFWTextConfig guardrail."""

    def test_nsfw_text_config_creation(self):
        """Test creating NSFWTextConfig."""
        config = NSFWTextConfig(threshold=0.8)

        assert config.config_id == GuardrailConfigId.NSFW_TEXT
        assert config.threshold == 0.8

    def test_nsfw_text_threshold_min(self):
        """Test NSFWTextConfig with minimum threshold."""
        config = NSFWTextConfig(threshold=0.0)

        assert config.threshold == 0.0

    def test_nsfw_text_threshold_max(self):
        """Test NSFWTextConfig with maximum threshold."""
        config = NSFWTextConfig(threshold=1.0)

        assert config.threshold == 1.0

    def test_nsfw_text_threshold_high(self):
        """Test NSFWTextConfig with high threshold."""
        config = NSFWTextConfig(threshold=0.9)

        assert config.threshold == 0.9
