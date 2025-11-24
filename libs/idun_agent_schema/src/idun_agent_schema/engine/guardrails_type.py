from enum import StrEnum


class GuardrailType(StrEnum):
    """Enum for different guardrails."""

    CUSTOM_LLM = "CUSTOM_LLM"
    GUARDRAILS_HUB = "GUARDRAILS_HUB"


class GuardrailHubGuardType(StrEnum):
    """Enum for different types of guards."""

    BanList = "BAN_LIST"
    CorrectLanguage = "CORRECT_LANGUAGE"
    ProfanityFree = "PROFANITY_FREE"
