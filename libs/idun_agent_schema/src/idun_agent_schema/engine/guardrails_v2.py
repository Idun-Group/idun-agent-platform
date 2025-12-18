"""Guardrails V2 configuration schema."""

import os
from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, model_validator


class GuardrailConfigId(str, Enum):
    """Enumeration of available guardrail configurations."""

    MODEL_ARMOR = "model_armor"
    CUSTOM_LLM = "custom_llm"
    BAN_LIST = "ban_list"
    BIAS_CHECK = "bias_check"
    COMPETITION_CHECK = "competition_check"
    CORRECT_LANGUAGE = "correct_language"
    DETECT_PII = "detect_pii"
    GIBBERISH_TEXT = "gibberish_text"
    NSFW_TEXT = "nsfw_text"
    DETECT_JAILBREAK = "detect_jailbreak"
    PROMPT_INJECTION = "prompt_injection"
    RAG_HALLUCINATION = "rag_hallucination"
    RESTRICT_TO_TOPIC = "restrict_to_topic"
    TOXIC_LANGUAGE = "toxic_language"
    CODE_SCANNER = "code_scanner"


class ModelArmorConfig(BaseModel):
    """Model Armor configuration."""

    config_id: Literal[GuardrailConfigId.MODEL_ARMOR] = GuardrailConfigId.MODEL_ARMOR
    name: str = Field(description="Name of the armor config")
    project_id: str = Field(description="ID of the project the model belongs to")
    location: str = Field(description="Location of the model")
    template_id: str = Field(description="ID of the template")


class CustomLLMModel(str, Enum):
    """Supported models for Custom LLM guardrail."""

    GEMINI_2_5_FLASH_LITE = "Gemini 2.5 flash lite"
    GEMINI_2_5_FLASH = "Gemini 2.5 flash"
    GEMINI_2_5_PRO = "Gemini 2.5 pro"
    GEMINI_3_PRO = "Gemini 3 pro"
    OPENAI_GPT_5_1 = "OpenAi GPT-5.1"
    OPENAI_GPT_5_MINI = "OpenAi GPT-5 mini"
    OPENAI_GPT_5_NANO = "OpenAi GPT-5 nano"


class CustomLLMConfig(BaseModel):
    """Custom LLM configuration."""

    config_id: Literal[GuardrailConfigId.CUSTOM_LLM] = GuardrailConfigId.CUSTOM_LLM
    name: str = Field(description="Name of the custom LLM config")
    model: CustomLLMModel = Field(
        description="Specific underlying Large Language Model"
    )
    prompt: str = Field(description="System instruction prompt")


class GuardrailConfig(BaseModel):
    pass


class BanListConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.BAN_LIST] = GuardrailConfigId.BAN_LIST
    api_key: str | None = None
    reject_message: str = "ban!!"
    guard_url: str = "hub://guardrails/ban_list"
    guard_params: dict[str, Any] = Field(default_factory=lambda: {"max_l_dist": 0})

    @model_validator(mode="after")
    def set_default_max_l_dist(self):
        if "max_l_dist" not in self.guard_params:
            self.guard_params["max_l_dist"] = 0
        return self


class BiasCheckConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    api_key: str | None = None
    reject_message: str = "Bias detected"
    guard_url: str = "hub://guardrails/bias_check"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class CompetitionCheckConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = (
        GuardrailConfigId.COMPETITION_CHECK
    )
    api_key: str | None = None
    reject_message: str = "Competitor mentioned"
    guard_url: str = "hub://guardrails/competitor_check"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class CorrectLanguageConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = (
        GuardrailConfigId.CORRECT_LANGUAGE
    )
    api_key: str | None = None
    reject_message: str = "Invalid language"
    guard_url: str = "hub://scb-10x/correct_language"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class DetectPIIConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.DETECT_PII] = GuardrailConfigId.DETECT_PII
    api_key: str | None = None
    reject_message: str = "PII detected"
    guard_url: str = "hub://guardrails/detect_pii"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class GibberishTextConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = (
        GuardrailConfigId.GIBBERISH_TEXT
    )
    api_key: str | None = None
    reject_message: str = "Gibberish text detected"
    guard_url: str = "hub://guardrails/gibberish_text"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class NSFWTextConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    api_key: str | None = None
    reject_message: str = "NSFW content detected"
    guard_url: str = "hub://guardrails/nsfw_text"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class DetectJailbreakConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.DETECT_JAILBREAK] = (
        GuardrailConfigId.DETECT_JAILBREAK
    )
    api_key: str | None = None
    reject_message: str = "Jailbreak attempt detected"
    guard_url: str = "hub://guardrails/detect_jailbreak"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class PromptInjectionConfig(BaseModel):
    """Prompt Injection configuration."""

    config_id: Literal[GuardrailConfigId.PROMPT_INJECTION] = (
        GuardrailConfigId.PROMPT_INJECTION
    )
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for prompt injection"
    )


class RagHallucinationConfig(BaseModel):
    """RAG Hallucination configuration."""

    config_id: Literal[GuardrailConfigId.RAG_HALLUCINATION] = (
        GuardrailConfigId.RAG_HALLUCINATION
    )
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for hallucination detection"
    )


class RestrictToTopicConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = (
        GuardrailConfigId.RESTRICT_TO_TOPIC
    )
    api_key: str | None = None
    reject_message: str = "Off-topic content"
    guard_url: str = "hub://tryolabs/restricttotopic"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class ToxicLanguageConfig(GuardrailConfig):
    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = (
        GuardrailConfigId.TOXIC_LANGUAGE
    )
    api_key: str | None = None
    reject_message: str = "Toxic language detected"
    guard_url: str = "hub://guardrails/toxic_language"
    guard_params: dict[str, Any] = Field(default_factory=dict)


class CodeScannerConfig(BaseModel):
    """Code Scanner configuration."""

    config_id: Literal[GuardrailConfigId.CODE_SCANNER] = GuardrailConfigId.CODE_SCANNER
    allowed_languages: list[str] = Field(
        description="List of allowed programming languages"
    )


GuardrailConfig = Union[
    BanListConfig,
    DetectPIIConfig,
    BiasCheckConfig,
    CompetitionCheckConfig,
    CorrectLanguageConfig,
    GibberishTextConfig,
    NSFWTextConfig,
    DetectJailbreakConfig,
    RestrictToTopicConfig,
    ToxicLanguageConfig,
]


class GuardrailsV2(BaseModel):
    """Guardrails V2 configuration."""

    input: list[GuardrailConfig] = Field(
        default_factory=list, description="List of input guardrails"
    )
    output: list[GuardrailConfig] = Field(
        default_factory=list, description="List of output guardrails"
    )

    def hydrate_api_keys(self) -> "GuardrailsV2":
        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            raise ValueError("GUARDRAILS_API_KEY environment variable not set")

        for guard in self.input + self.output:
            if hasattr(guard, "api_key") and guard.api_key is None:
                guard.api_key = api_key

        return self
