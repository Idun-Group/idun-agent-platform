from enum import StrEnum


class GuardrailType(StrEnum):
    """Enum for different guardrails."""

    CustomLLM = "custom_llm"
    GuardrailsHub = "guardrails_hub"
