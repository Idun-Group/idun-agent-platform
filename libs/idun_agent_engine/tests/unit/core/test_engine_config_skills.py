"""Tests for EngineConfig with skills field."""

import pytest
from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from idun_agent_engine.core.engine_config import AgentConfig, EngineConfig


@pytest.mark.unit
class TestEngineConfigWithSkills:
    """Test that EngineConfig correctly handles the optional skills field."""

    def test_engine_config_without_skills(self):
        """Skills default to None when not specified."""
        config = EngineConfig(
            agent=AgentConfig(
                type="LANGGRAPH",
                config=LangGraphAgentConfig(
                    name="TestAgent", graph_definition="test.py:graph"
                ),
            )
        )
        assert config.skills is None

    def test_engine_config_with_skills(self):
        """Skills are parsed when provided in config."""
        config_dict = {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "TestAgent",
                    "graph_definition": "test.py:graph",
                },
            },
            "skills": [
                {
                    "name": "test-skill",
                    "description": "A test skill",
                    "instructions": "Do things.",
                },
                {
                    "name": "another-skill",
                    "description": "Another skill",
                    "version": "2.0.0",
                    "instructions": "Do other things.",
                    "resources": {
                        "references": {"guide.md": "# Guide"},
                    },
                },
            ],
        }

        config = EngineConfig.model_validate(config_dict)

        assert config.skills is not None
        assert len(config.skills) == 2
        assert config.skills[0].name == "test-skill"
        assert config.skills[1].version == "2.0.0"
        assert "guide.md" in config.skills[1].resources.references

    def test_engine_config_skills_serialization(self):
        """Skills survive round-trip serialization."""
        config_dict = {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "TestAgent",
                    "graph_definition": "test.py:graph",
                },
            },
            "skills": [
                {
                    "name": "my-skill",
                    "description": "Skill desc",
                    "instructions": "Instructions here.",
                },
            ],
        }

        config = EngineConfig.model_validate(config_dict)
        dumped = config.model_dump()

        assert dumped["skills"] is not None
        assert len(dumped["skills"]) == 1
        assert dumped["skills"][0]["name"] == "my-skill"
