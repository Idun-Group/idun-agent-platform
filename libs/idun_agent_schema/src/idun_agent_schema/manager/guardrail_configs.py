from typing import Literal, Union

from pydantic import BaseModel, Field

from idun_agent_schema.engine.guardrails_v2 import GuardrailConfigId


class SimpleBanListConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.BAN_LIST] = GuardrailConfigId.BAN_LIST
    api_key: str = ""
    reject_message: str = ""
    banned_words: list[str] = Field(
        description="A list of strings (words or phrases) to block"
    )


class SimplePIIConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.DETECT_PII] = GuardrailConfigId.DETECT_PII
    api_key: str = ""
    reject_message: str = ""
    pii_entities: list[str] = Field(description="List of PII entity types to detect")


class SimpleNSFWTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    api_key: str = ""
    reject_message: str = ""
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for NSFW content"
    )


class SimpleToxicLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = GuardrailConfigId.TOXIC_LANGUAGE
    api_key: str = ""
    reject_message: str = ""
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for toxic language"
    )


class SimpleGibberishTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = GuardrailConfigId.GIBBERISH_TEXT
    api_key: str = ""
    reject_message: str = ""
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for gibberish detection"
    )


class SimpleBiasCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    api_key: str = ""
    reject_message: str = ""
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for bias detection"
    )


class SimpleCompetitionCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = GuardrailConfigId.COMPETITION_CHECK
    api_key: str = ""
    reject_message: str = ""
    competitors: list[str] = Field(
        description="Names of competitor companies or products"
    )


class SimpleCorrectLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = GuardrailConfigId.CORRECT_LANGUAGE
    api_key: str = ""
    reject_message: str = ""
    expected_languages: list[str] = Field(
        description="Valid ISO language codes (e.g., en, fr, es)"
    )


class SimpleRestrictToTopicConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = GuardrailConfigId.RESTRICT_TO_TOPIC
    api_key: str = ""
    reject_message: str = ""
    topics: list[str] = Field(description="List of allowed topics")


ManagerGuardrailConfig = Union[
    SimpleBanListConfig,
    SimplePIIConfig,
    SimpleNSFWTextConfig,
    SimpleToxicLanguageConfig,
    SimpleGibberishTextConfig,
    SimpleBiasCheckConfig,
    SimpleCompetitionCheckConfig,
    SimpleCorrectLanguageConfig,
    SimpleRestrictToTopicConfig,
]
