"""Guardrails V2 configuration schema."""

from enum import Enum
from typing import Annotated, Literal, Union

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
    model: CustomLLMModel = Field(
        description="Specific underlying Large Language Model"
    )
    prompt: str = Field(description="System instruction prompt")


class GuardrailConfig(BaseModel):
    pass


class BanListConfig(GuardrailConfig):
    """Ban List configuration."""

    """
    - type: GUARDRAILS_HUB
        config_id: BAN_LIST
        guard_url: "hub://guardrails/ban_list"
        api_key:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnaXRodWJ8MTQzNDYzMzEiLCJhcGlLZXlJZCI6IjNhMWMyYmY2LTMwNzYtNDY1OC1hMjRhLTA5MjZjNWI2ZDM4NyIsInNjb3BlIjoicmVhZDpwYWNrYWdlcyIsInBlcm1pc3Npb25zIjpbXSwiaWF0IjoxNzY0NTg5MzIyLCJleHAiOjE3NzIzNjUzMjJ9.4KUsAXEQ8mGN_iVz46HGXIUQeBbZQLEAzOOfIL_ZYQA
        reject_message: "ban!!"
        banned_words:
            - hello
            - bye
    """

    class BanListParams(BaseModel):
        banned_words: list[str] = Field(
            description="A list of strings (words or phrases) to block"
        )

    config_id: Literal[GuardrailConfigId.BAN_LIST] = GuardrailConfigId.BAN_LIST
    api_key: str
    reject_message: str = "ban!!"
    guard_url: str = "hub://guardrails/ban_list"
    guard_params: BanListParams = Field()


class BiasCheckConfig(GuardrailConfig):
    """Bias Check configuration."""

    class BiasCheckParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    api_key: str
    reject_message: str = "Bias detected"
    guard_url: str = "hub://guardrails/bias_check"
    guard_params: BiasCheckParams = Field()


class CompetitionCheckConfig(GuardrailConfig):
    """Competition Check configuration."""

    class CompetitionCheckParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = (
        GuardrailConfigId.COMPETITION_CHECK
    )
    api_key: str
    reject_message: str = "Competitor mentioned"
    guard_url: str = "hub://guardrails/competitor_check"
    guard_params: CompetitionCheckParams = Field()


class CorrectLanguageConfig(GuardrailConfig):
    """Correct Language configuration."""

    class CorrectLanguageParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = (
        GuardrailConfigId.CORRECT_LANGUAGE
    )
    api_key: str
    reject_message: str = "Invalid language"
    guard_url: str = "hub://scb-10x/correct_language"
    guard_params: CorrectLanguageParams = Field()


class DetectPIIConfig(GuardrailConfig):
    class PIIParams(BaseModel):
        pii_entities: list[str] = Field(
            description="List of PII entity types to detect"
        )
        on_fail: str = Field(default="exception")

    config_id: Literal[GuardrailConfigId.DETECT_PII] = GuardrailConfigId.DETECT_PII
    api_key: str
    reject_message: str = "PII detected"
    guard_url: str = "hub://guardrails/detect_pii"
    guard_params: PIIParams = Field()


class GibberishTextConfig(GuardrailConfig):
    """Gibberish Text configuration."""

    class GibberishTextParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = (
        GuardrailConfigId.GIBBERISH_TEXT
    )
    api_key: str
    reject_message: str = "Gibberish text detected"
    guard_url: str = "hub://guardrails/gibberish_text"
    guard_params: GibberishTextParams = Field()


class NSFWTextConfig(GuardrailConfig):
    """NSFW Text configuration."""

    class NSFWTextParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    api_key: str
    reject_message: str = "NSFW content detected"
    guard_url: str = "hub://guardrails/nsfw_text"
    guard_params: NSFWTextParams = Field()


class DetectJailbreakConfig(GuardrailConfig):
    """Detect Jailbreak configuration."""

    class DetectJailbreakParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.DETECT_JAILBREAK] = (
        GuardrailConfigId.DETECT_JAILBREAK
    )
    api_key: str
    reject_message: str = "Jailbreak attempt detected"
    guard_url: str = "hub://guardrails/detect_jailbreak"
    guard_params: DetectJailbreakParams = Field()


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
    """Restrict To Topic configuration."""

    class RestrictToTopicParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = (
        GuardrailConfigId.RESTRICT_TO_TOPIC
    )
    api_key: str
    reject_message: str = "Off-topic content"
    guard_url: str = "hub://tryolabs/restricttotopic"
    guard_params: RestrictToTopicParams = Field()


class ToxicLanguageConfig(GuardrailConfig):
    """Toxic Language configuration."""

    class ToxicLanguageParams(BaseModel):
        model_config = {"extra": "allow"}

    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = (
        GuardrailConfigId.TOXIC_LANGUAGE
    )
    api_key: str
    reject_message: str = "Toxic language detected"
    guard_url: str = "hub://guardrails/toxic_language"
    guard_params: ToxicLanguageParams = Field()


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
