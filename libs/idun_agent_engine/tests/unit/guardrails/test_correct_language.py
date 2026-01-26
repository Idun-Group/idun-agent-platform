"""Tests for CorrectLanguageConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    CorrectLanguageConfig,
    GuardrailConfigId,
)


class TestCorrectLanguageConfig:
    """Test CorrectLanguageConfig guardrail."""

    def test_correct_language_config_creation(self):
        """Test creating CorrectLanguageConfig."""
        config = CorrectLanguageConfig(expected_languages=["en", "fr", "es"])

        assert config.config_id == GuardrailConfigId.CORRECT_LANGUAGE
        assert config.expected_languages == ["en", "fr", "es"]

    def test_correct_language_single_language(self):
        """Test CorrectLanguageConfig with single language."""
        config = CorrectLanguageConfig(expected_languages=["en"])

        assert len(config.expected_languages) == 1
        assert config.expected_languages[0] == "en"

    def test_correct_language_multiple_languages(self):
        """Test CorrectLanguageConfig with multiple languages."""
        config = CorrectLanguageConfig(
            expected_languages=["en", "fr", "es", "de", "it"]
        )

        assert len(config.expected_languages) == 5
        assert "en" in config.expected_languages
        assert "it" in config.expected_languages

    def test_correct_language_empty_list(self):
        """Test CorrectLanguageConfig with empty languages list."""
        config = CorrectLanguageConfig(expected_languages=[])

        assert config.expected_languages == []
