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


ManagerGuardrailConfig = Union[SimpleBanListConfig, SimplePIIConfig]


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

            else:
                converted[position].append(guardrail)

    return converted
