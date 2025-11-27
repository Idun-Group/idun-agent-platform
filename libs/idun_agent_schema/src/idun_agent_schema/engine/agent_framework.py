"""Agent framework enumeration (engine)."""

from enum import Enum


class AgentFramework(str, Enum):
    """Supported agent frameworks for engine."""

    LANGGRAPH = "LANGGRAPH"
    ADK = "ADK"
    CREWAI = "CREWAI"
    HAYSTACK = "HAYSTACK"
    CUSTOM = "CUSTOM"
    CORRECTION_AGENT = "CORRECTION_AGENT"
    TRANSLATION_AGENT = "TRANSLATION_AGENT"
    CORRECTION_AGENT = "CORRECTION_AGENT"
    DEEP_RESEARCH_AGENT = "DEEP_RESEARCH_AGENT"
