"""Tests for RestrictToTopicConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    RestrictToTopicConfig,
    GuardrailConfigId,
)


class TestRestrictToTopicConfig:
    """Test RestrictToTopicConfig guardrail."""

    def test_restrict_to_topic_config_creation(self):
        """Test creating RestrictToTopicConfig."""
        config = RestrictToTopicConfig(topics=["sports", "technology", "science"])

        assert config.config_id == GuardrailConfigId.RESTRICT_TO_TOPIC
        assert config.topics == ["sports", "technology", "science"]

    def test_restrict_to_topic_single_topic(self):
        """Test RestrictToTopicConfig with single topic."""
        config = RestrictToTopicConfig(topics=["technology"])

        assert len(config.topics) == 1
        assert config.topics[0] == "technology"

    def test_restrict_to_topic_multiple_topics(self):
        """Test RestrictToTopicConfig with multiple topics."""
        config = RestrictToTopicConfig(
            topics=["sports", "tech", "science", "health", "finance"]
        )

        assert len(config.topics) == 5
        assert "sports" in config.topics
        assert "finance" in config.topics

    def test_restrict_to_topic_empty_topics(self):
        """Test RestrictToTopicConfig with empty topics list."""
        config = RestrictToTopicConfig(topics=[])

        assert config.topics == []
