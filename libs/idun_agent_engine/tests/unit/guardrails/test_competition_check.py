"""Tests for CompetitionCheckConfig guardrail."""

import pytest

from idun_agent_schema.engine.guardrails_v2 import (
    CompetitionCheckConfig,
    GuardrailConfigId,
)


class TestCompetitionCheckConfig:
    """Test CompetitionCheckConfig guardrail."""

    def test_competition_check_config_creation(self):
        """Test creating CompetitionCheckConfig."""
        config = CompetitionCheckConfig(competitors=["Company A", "Product B"])

        assert config.config_id == GuardrailConfigId.COMPETITION_CHECK
        assert config.competitors == ["Company A", "Product B"]

    def test_competition_check_single_competitor(self):
        """Test CompetitionCheckConfig with single competitor."""
        config = CompetitionCheckConfig(competitors=["CompetitorX"])

        assert len(config.competitors) == 1
        assert config.competitors[0] == "CompetitorX"

    def test_competition_check_multiple_competitors(self):
        """Test CompetitionCheckConfig with multiple competitors."""
        config = CompetitionCheckConfig(
            competitors=["Comp1", "Comp2", "Comp3", "Comp4"]
        )

        assert len(config.competitors) == 4
        assert "Comp1" in config.competitors
        assert "Comp4" in config.competitors

    def test_competition_check_empty_competitors(self):
        """Test CompetitionCheckConfig with empty competitors list."""
        config = CompetitionCheckConfig(competitors=[])

        assert config.competitors == []
