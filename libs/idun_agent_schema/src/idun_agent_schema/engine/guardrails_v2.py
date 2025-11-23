"""Guardrails V2 configuration schema."""

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field


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
    model: CustomLLMModel = Field(description="Specific underlying Large Language Model")
    prompt: str = Field(description="System instruction prompt")


class BanListConfig(BaseModel):
    """Ban List configuration."""

    config_id: Literal[GuardrailConfigId.BAN_LIST] = GuardrailConfigId.BAN_LIST
    banned_words: list[str] = Field(
        description="A list of strings (words or phrases) to block"
    )


class BiasCheckConfig(BaseModel):
    """Bias Check configuration."""

    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for bias detection"
    )


class CompetitionCheckConfig(BaseModel):
    """Competition Check configuration."""

    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = (
        GuardrailConfigId.COMPETITION_CHECK
    )
    competitors: list[str] = Field(
        description="Names of competitor companies or products"
    )


class CorrectLanguageConfig(BaseModel):
    """Correct Language configuration."""

    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = (
        GuardrailConfigId.CORRECT_LANGUAGE
    )
    expected_languages: list[str] = Field(
        description="Valid ISO language codes (e.g., en, fr, es)"
    )


class PIIEntity(str, Enum):
    """Personally Identifiable Information entities."""

    EMAIL = "Email"
    PHONE_NUMBER = "Phone Number"
    CREDIT_CARD = "Credit Card"
    SSN = "SSN"
    LOCATION = "Location"


class DetectPIIConfig(BaseModel):
    """Detect PII configuration."""

    config_id: Literal[GuardrailConfigId.DETECT_PII] = GuardrailConfigId.DETECT_PII
    pii_entities: list[PIIEntity] = Field(
        description="List of PII entities to detect"
    )


class GibberishTextConfig(BaseModel):
    """Gibberish Text configuration."""

    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = (
        GuardrailConfigId.GIBBERISH_TEXT
    )
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for gibberish detection"
    )


class NSFWTextConfig(BaseModel):
    """NSFW Text configuration."""

    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for NSFW content"
    )


class DetectJailbreakConfig(BaseModel):
    """Detect Jailbreak configuration."""

    config_id: Literal[GuardrailConfigId.DETECT_JAILBREAK] = (
        GuardrailConfigId.DETECT_JAILBREAK
    )
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for jailbreak detection"
    )


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


class RestrictToTopicConfig(BaseModel):
    """Restrict To Topic configuration."""

    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = (
        GuardrailConfigId.RESTRICT_TO_TOPIC
    )
    topics: list[str] = Field(description="List of allowed topics")


class ToxicLanguageConfig(BaseModel):
    """Toxic Language configuration."""

    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = (
        GuardrailConfigId.TOXIC_LANGUAGE
    )
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for toxic language"
    )


class CodeScannerConfig(BaseModel):
    """Code Scanner configuration."""

    config_id: Literal[GuardrailConfigId.CODE_SCANNER] = (
        GuardrailConfigId.CODE_SCANNER
    )
    allowed_languages: list[str] = Field(
        description="List of allowed programming languages"
    )


GuardrailConfig = (
    ModelArmorConfig
    | CustomLLMConfig
    | BanListConfig
    | BiasCheckConfig
    | CompetitionCheckConfig
    | CorrectLanguageConfig
    | DetectPIIConfig
    | GibberishTextConfig
    | NSFWTextConfig
    | DetectJailbreakConfig
    | PromptInjectionConfig
    | RagHallucinationConfig
    | RestrictToTopicConfig
    | ToxicLanguageConfig
    | CodeScannerConfig
)


class GuardrailsV2(BaseModel):
    """Guardrails V2 configuration."""

    input: list[GuardrailConfig] = Field(
        default_factory=list, description="List of input guardrails"
    )
    output: list[GuardrailConfig] = Field(
        default_factory=list, description="List of output guardrails"
    )
