"""Tests for SkillConfig schema validation."""

import pytest
from idun_agent_schema.engine.skills import SkillConfig, SkillResourcesConfig


@pytest.mark.unit
class TestSkillConfig:
    """Test SkillConfig validation and defaults."""

    def test_minimal_skill_config(self):
        """A skill requires name, description, and instructions."""
        skill = SkillConfig(
            name="test-skill",
            description="A test skill",
            instructions="Do the thing.",
        )
        assert skill.name == "test-skill"
        assert skill.description == "A test skill"
        assert skill.version == "1.0.0"
        assert skill.instructions == "Do the thing."
        assert skill.resources.references == {}
        assert skill.resources.assets == {}

    def test_full_skill_config(self):
        """A skill can include version and resources."""
        skill = SkillConfig(
            name="customer-support",
            description="Handle support tickets",
            version="2.1.0",
            instructions="Step 1: Greet. Step 2: Help.",
            resources=SkillResourcesConfig(
                references={"policy.md": "# Policy\nBe nice."},
                assets={"template.txt": "Dear customer,"},
            ),
        )
        assert skill.version == "2.1.0"
        assert "policy.md" in skill.resources.references
        assert "template.txt" in skill.resources.assets

    def test_skill_name_validation_lowercase_hyphens(self):
        """Names must be lowercase with hyphens per agentskills.io spec."""
        skill = SkillConfig(
            name="my-cool-skill-2",
            description="Test",
            instructions="Test",
        )
        assert skill.name == "my-cool-skill-2"

    def test_skill_name_rejects_uppercase(self):
        """Names with uppercase letters are rejected."""
        with pytest.raises(ValueError, match="must start with a lowercase"):
            SkillConfig(
                name="MySkill", description="Test", instructions="Test"
            )

    def test_skill_name_rejects_spaces(self):
        """Names with spaces are rejected."""
        with pytest.raises(ValueError, match="must start with a lowercase"):
            SkillConfig(
                name="my skill", description="Test", instructions="Test"
            )

    def test_skill_name_rejects_leading_digit(self):
        """Names starting with a digit are rejected."""
        with pytest.raises(ValueError, match="must start with a lowercase"):
            SkillConfig(
                name="2fast", description="Test", instructions="Test"
            )

    def test_skill_name_rejects_empty(self):
        """Empty names are rejected."""
        with pytest.raises(ValueError):
            SkillConfig(name="", description="Test", instructions="Test")

    def test_skill_config_from_dict(self):
        """SkillConfig can be created from YAML-like dict."""
        data = {
            "name": "meeting-processor",
            "description": "Process meeting notes",
            "instructions": "Extract action items.",
            "resources": {
                "references": {"guide.md": "# Guide"},
            },
        }
        skill = SkillConfig.model_validate(data)
        assert skill.name == "meeting-processor"
        assert "guide.md" in skill.resources.references

    def test_skill_config_serialization(self):
        """SkillConfig can be serialized back to dict."""
        skill = SkillConfig(
            name="test-skill",
            description="A test skill",
            instructions="Do something.",
        )
        dumped = skill.model_dump()
        assert dumped["name"] == "test-skill"
        assert dumped["version"] == "1.0.0"


@pytest.mark.unit
class TestSkillResourcesConfig:
    """Test SkillResourcesConfig defaults and behavior."""

    def test_empty_resources(self):
        """Resources default to empty dicts."""
        resources = SkillResourcesConfig()
        assert resources.references == {}
        assert resources.assets == {}
        assert resources.scripts == {}

    def test_resources_from_dict(self):
        """Resources can be created from a dict."""
        data = {
            "references": {"a.md": "content a"},
            "assets": {"b.txt": "content b"},
        }
        resources = SkillResourcesConfig.model_validate(data)
        assert resources.references["a.md"] == "content a"
        assert resources.assets["b.txt"] == "content b"
        assert resources.scripts == {}
