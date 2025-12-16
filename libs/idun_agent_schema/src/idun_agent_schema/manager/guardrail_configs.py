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


class SimpleBiasCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.BIAS_CHECK] = GuardrailConfigId.BIAS_CHECK
    threshold: float = Field(ge=0.0, le=1.0)


class SimpleCompetitionCheckConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.COMPETITION_CHECK] = (
        GuardrailConfigId.COMPETITION_CHECK
    )
    competitors: list[str]


class SimpleCorrectLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.CORRECT_LANGUAGE] = (
        GuardrailConfigId.CORRECT_LANGUAGE
    )
    expected_languages: list[str]


class SimpleGibberishTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.GIBBERISH_TEXT] = (
        GuardrailConfigId.GIBBERISH_TEXT
    )
    threshold: float = Field(ge=0.0, le=1.0)


class SimpleNSFWTextConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.NSFW_TEXT] = GuardrailConfigId.NSFW_TEXT
    threshold: float = Field(ge=0.0, le=1.0)


class SimpleDetectJailbreakConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.DETECT_JAILBREAK] = (
        GuardrailConfigId.DETECT_JAILBREAK
    )
    threshold: float = Field(ge=0.0, le=1.0)


class SimpleRestrictToTopicConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.RESTRICT_TO_TOPIC] = (
        GuardrailConfigId.RESTRICT_TO_TOPIC
    )
    topics: list[str]


class SimpleToxicLanguageConfig(BaseModel):
    config_id: Literal[GuardrailConfigId.TOXIC_LANGUAGE] = (
        GuardrailConfigId.TOXIC_LANGUAGE
    )
    threshold: float = Field(ge=0.0, le=1.0)


ManagerGuardrailConfig = Union[
    SimpleBanListConfig,
    SimplePIIConfig,
    SimpleBiasCheckConfig,
    SimpleCompetitionCheckConfig,
    SimpleCorrectLanguageConfig,
    SimpleGibberishTextConfig,
    SimpleNSFWTextConfig,
    SimpleDetectJailbreakConfig,
    SimpleRestrictToTopicConfig,
    SimpleToxicLanguageConfig,
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
            if (
                guardrail.get("config_id") == "ban_list"
                and "banned_words" in guardrail
                and "api_key" not in guardrail
            ):
                banned_words = []
                for word in guardrail["banned_words"]:
                    if "," in word:
                        banned_words.extend([w.strip() for w in word.split(",")])
                    else:
                        banned_words.append(word.strip())

                migrated_guardrail = {
                    "config_id": "ban_list",
                    "api_key": api_key,
                    "reject_message": "ban!!",
                    "guard_url": "hub://guardrails/ban_list",
                    "guard_params": {"banned_words": banned_words},
                }
                converted[position].append(migrated_guardrail)

            elif (
                guardrail.get("config_id") == "detect_pii"
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

                migrated_guardrail = {
                    "config_id": "detect_pii",
                    "api_key": api_key,
                    "reject_message": "PII detected",
                    "guard_url": "hub://guardrails/detect_pii",
                    "guard_params": {
                        "pii_entities": mapped_entities,
                        "on_fail": "exception",
                    },
                }
                converted[position].append(migrated_guardrail)

            elif "api_key" not in guardrail:
                config_id = guardrail.get("config_id")

                guard_url_map = {
                    "bias_check": "hub://guardrails/bias_check",
                    "competition_check": "hub://guardrails/competitor_check",
                    "correct_language": "hub://scb-10x/correct_language",
                    "gibberish_text": "hub://guardrails/gibberish_text",
                    "nsfw_text": "hub://guardrails/nsfw_text",
                    "detect_jailbreak": "hub://guardrails/detect_jailbreak",
                    "restrict_to_topic": "hub://tryolabs/restricttotopic",
                    "toxic_language": "hub://guardrails/toxic_language",
                }

                reject_message_map = {
                    "bias_check": "Bias detected",
                    "competition_check": "Competitor mentioned",
                    "correct_language": "Invalid language",
                    "gibberish_text": "Gibberish text detected",
                    "nsfw_text": "NSFW content detected",
                    "detect_jailbreak": "Jailbreak attempt detected",
                    "restrict_to_topic": "Off-topic content",
                    "toxic_language": "Toxic language detected",
                }

                if config_id in guard_url_map:
                    guard_params = {
                        k: v for k, v in guardrail.items() if k != "config_id"
                    }

                    migrated_guardrail = {
                        "config_id": config_id,
                        "api_key": api_key,
                        "reject_message": reject_message_map[config_id],
                        "guard_url": guard_url_map[config_id],
                        "guard_params": guard_params,
                    }
                    converted[position].append(migrated_guardrail)
                else:
                    converted[position].append(guardrail)

            else:
                converted[position].append(guardrail)

    return converted
