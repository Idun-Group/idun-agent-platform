"""Skill configuration models following the Agent Skills specification.

Skills are self-contained units of cognitive expertise that agents can load
on demand. They follow the open Agent Skills specification (agentskills.io)
and support progressive disclosure:

- L1 (Metadata): name + description — injected into the system prompt as a catalog
- L2 (Instructions): full markdown instructions — loaded when the skill is activated
- L3 (Resources): references, assets, scripts — loaded on demand

See: https://agentskills.io/specification
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class SkillResourcesConfig(BaseModel):
    """Optional resources attached to a skill (L3 content).

    Mirrors the Agent Skills spec directory structure:
    - references/: Additional markdown guidance files
    - assets/: Templates, data files, images
    - scripts/: Executable scripts (not currently executed by the engine)
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    references: dict[str, str] = Field(
        default_factory=dict,
        description="Map of filename to markdown content for reference documents",
    )
    assets: dict[str, str] = Field(
        default_factory=dict,
        description="Map of filename to content for asset files",
    )
    scripts: dict[str, str] = Field(
        default_factory=dict,
        description="Map of filename to content for script files (not executed)",
    )


class SkillConfig(BaseModel):
    """Engine-level skill configuration following the Agent Skills spec.

    Each skill represents a self-contained domain of expertise that an agent
    can load on demand. Skills are the cognitive complement to MCP tools:
    MCP gives agents hands (actions), Skills give agents brains (expertise).
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    name: str = Field(
        ...,
        description="Skill identifier (lowercase with hyphens, e.g. 'customer-support')",
        min_length=1,
        max_length=64,
    )
    description: str = Field(
        ...,
        description="Short description for skill discovery (L1 metadata)",
        min_length=1,
        max_length=1024,
    )
    version: str = Field(
        default="1.0.0",
        description="Semantic version of the skill",
    )
    instructions: str = Field(
        ...,
        description="Full skill instructions in markdown (L2 content)",
    )
    resources: SkillResourcesConfig = Field(
        default_factory=SkillResourcesConfig,
        description="Optional resources: references, assets, scripts (L3 content)",
    )

    @field_validator("name")
    @classmethod
    def validate_skill_name(cls, v: str) -> str:
        """Enforce Agent Skills spec naming: lowercase letters, digits, hyphens."""
        if not re.match(r"^[a-z][a-z0-9-]*$", v):
            raise ValueError(
                f"Skill name '{v}' must start with a lowercase letter and contain "
                "only lowercase letters, digits, and hyphens (per agentskills.io spec)"
            )
        return v
