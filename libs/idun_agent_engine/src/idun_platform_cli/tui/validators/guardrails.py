"""Guardrails validation logic."""

from idun_agent_schema.engine.guardrails_v2 import (
    BanListConfig,
    BiasCheckConfig,
    CompetitionCheckConfig,
    DetectPIIConfig,
    GuardrailConfigId,
    ToxicLanguageConfig,
)


def validate_guardrail(guardrail_id: str, config: dict) -> tuple[any, str]:
    try:
        match guardrail_id:
            case "bias_check":
                threshold = float(config.get("threshold", 0.5))
                validated = BiasCheckConfig(
                    config_id=GuardrailConfigId.BIAS_CHECK,
                    api_key=config.get("api_key", ""),
                    reject_message=config.get("reject_message", "Bias detected"),
                    threshold=threshold
                )
                return validated, "ok"

            case "toxic_language":
                threshold = float(config.get("threshold", 0.5))
                validated = ToxicLanguageConfig(
                    config_id=GuardrailConfigId.TOXIC_LANGUAGE,
                    api_key=config.get("api_key", ""),
                    reject_message=config.get("reject_message", "Toxic language detected"),
                    threshold=threshold
                )
                return validated, "ok"

            case "competition_check":
                competitors = config.get("competitors", [])
                if isinstance(competitors, str):
                    competitors = [
                        c.strip() for c in competitors.split(",") if c.strip()
                    ]
                validated = CompetitionCheckConfig(
                    config_id=GuardrailConfigId.COMPETITION_CHECK,
                    api_key=config.get("api_key", ""),
                    reject_message=config.get("reject_message", "Competitor mentioned"),
                    competitors=competitors,
                )
                return validated, "ok"

            case "ban_list":
                banned_words = config.get("banned_words", [])
                if isinstance(banned_words, str):
                    banned_words = [
                        w.strip() for w in banned_words.split(",") if w.strip()
                    ]

                validated = BanListConfig(
                    config_id=GuardrailConfigId.BAN_LIST,
                    api_key=config.get("api_key", ""),
                    reject_message=config.get("reject_message", ""),
                    guard_params={"banned_words": banned_words},
                )
                return validated, "ok"

            case "detect_pii":
                pii_entities = config.get("pii_entities", [])
                if isinstance(pii_entities, str):
                    pii_entities = [
                        e.strip() for e in pii_entities.split(",") if e.strip()
                    ]

                validated = DetectPIIConfig(
                    config_id=GuardrailConfigId.DETECT_PII,
                    api_key=config.get("api_key", ""),
                    reject_message=config.get("reject_message", ""),
                    guard_params={"pii_entities": pii_entities, "on_fail": "exception"},
                )
                return validated, "ok"

            case _:
                return None, f"Unknown guardrail type: {guardrail_id}"

    except Exception as e:
        error_msg = str(e)
        if len(error_msg) > 100:
            error_msg = error_msg[:100] + "..."
        error_msg = error_msg.replace("<", "").replace(">", "")
        return None, f"Validation error for {guardrail_id}: {error_msg}"
