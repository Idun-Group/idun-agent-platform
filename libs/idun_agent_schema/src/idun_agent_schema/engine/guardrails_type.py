from enum import StrEnum


class GuardrailType(StrEnum):
    """Enum for different guardrails."""

    CUSTOM_LLM = "custom_llm"
    GUARDRAILS_HUB = "guardrails_hub"
