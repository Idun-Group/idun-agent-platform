import os
from typing import Literal, Union

from pydantic import BaseModel, Field

from idun_agent_schema.engine.guardrails_v2 import GuardrailConfigId


class SimpleBanListConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.BAN_LIST] = GuardrailConfigId.BAN_LIST
    banned_words: list[str] = Field(
        description="A list of strings (words or phrases) to block"
    )


class SimplePIIConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.DETECT_PII] = GuardrailConfigId.DETECT_PII
    pii_entities: list[str] = Field(description="List of PII entity types to detect")


class SimpleNSFWTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for NSFW content"
    )


class SimpleToxicLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = GuardrailConfigId.TOXIC_LANGUAGE
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for toxic language"
    )


class SimpleGibberishTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = GuardrailConfigId.GIBBERISH_TEXT
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for gibberish detection"
    )


class SimpleBiasCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    threshold: float = Field(
        ge=0.0, le=1.0, description="Sensitivity level for bias detection"
    )


class SimpleCompetitionCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = GuardrailConfigId.COMPETITION_CHECK
    competitors: list[str] = Field(
        description="Names of competitor companies or products"
    )


class SimpleCorrectLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = GuardrailConfigId.CORRECT_LANGUAGE
    expected_languages: list[str] = Field(
        description="Valid ISO language codes (e.g., en, fr, es)"
    )


class SimpleRestrictToTopicConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = GuardrailConfigId.RESTRICT_TO_TOPIC
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


def convert_guardrail(guardrails_data: dict) -> dict:
    if not guardrails_data:
        return guardrails_data

    api_key = os.getenv("GUARDRAILS_API_KEY")
    if not api_key:
        raise ValueError(
            "GUARDRAILS_API_KEY environment variable must be set to use guardrails"
        )

    converted = {"input": [], "output": []}

    for position in ["input", "output"]:
        if position not in guardrails_data:
            continue

        for guardrail in guardrails_data[position]:
            config_id = guardrail.get("config_id")

            if (
                config_id == "ban_list"
                and "banned_words" in guardrail
                and "api_key" not in guardrail
            ):
                banned_words = []
                for word in guardrail["banned_words"]:
                    if "," in word:
                        banned_words.extend([w.strip() for w in word.split(",")])
                    else:
                        banned_words.append(word.strip())

                converted[position].append({
                    "config_id": "ban_list",
                    "api_key": api_key,
                    "reject_message": "ban!!",
                    "guard_url": "hub://guardrails/ban_list",
                    "guard_params": {"banned_words": banned_words},
                })

            elif (
                config_id == "detect_pii"
                and "pii_entities" in guardrail
                and "api_key" not in guardrail
            ):
                pii_entity_map = {
                    "Email": "EMAIL_ADDRESS",
                    "Phone Number": "PHONE_NUMBER",
                    "Credit Card": "CREDIT_CARD",
                    "SSN": "SSN",
                    "Location": "LOCATION",
                }
                mapped_entities = [
                    pii_entity_map.get(entity, entity)
                    for entity in guardrail["pii_entities"]
                ]
                converted[position].append({
                    "config_id": "detect_pii",
                    "api_key": api_key,
                    "reject_message": "PII detected",
                    "guard_url": "hub://guardrails/detect_pii",
                    "guard_params": {
                        "pii_entities": mapped_entities,
                        "on_fail": "exception",
                    },
                })

            elif config_id == "nsfw_text" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "nsfw_text",
                    "api_key": api_key,
                    "reject_message": "NSFW content detected",
                    "guard_url": "hub://guardrails/nsfw_text",
                    "threshold": guardrail["threshold"],
                })

            elif config_id == "toxic_language" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "toxic_language",
                    "api_key": api_key,
                    "reject_message": "Toxic language detected",
                    "guard_url": "hub://guardrails/toxic_language",
                    "threshold": guardrail["threshold"],
                })

            elif config_id == "gibberish_text" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "gibberish_text",
                    "api_key": api_key,
                    "reject_message": "Gibberish text detected",
                    "guard_url": "hub://guardrails/gibberish_text",
                    "threshold": guardrail["threshold"],
                })

            elif config_id == "bias_check" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "bias_check",
                    "api_key": api_key,
                    "reject_message": "Bias detected",
                    "guard_url": "hub://guardrails/bias_check",
                    "threshold": guardrail["threshold"],
                })

            elif config_id == "competition_check" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "competition_check",
                    "api_key": api_key,
                    "reject_message": "Competitor mentioned",
                    "guard_url": "hub://guardrails/competitor_check",
                    "competitors": guardrail["competitors"],
                })

            elif config_id == "correct_language" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "correct_language",
                    "api_key": api_key,
                    "reject_message": "Incorrect language detected",
                    "guard_url": "hub://scb-10x/correct_language",
                    "expected_languages": guardrail["expected_languages"],
                })

            elif config_id == "restrict_to_topic" and "api_key" not in guardrail:
                converted[position].append({
                    "config_id": "restrict_to_topic",
                    "api_key": api_key,
                    "reject_message": "Off-topic content detected",
                    "guard_url": "hub://guardrails/restrict_to_topic",
                    "topics": guardrail["topics"],
                })

            else:
                converted[position].append(guardrail)

    return converted
