"""Utils module."""

from guardrails import Guard
from guardrails.hub import BanList, CorrectLanguage, ProfanityFree
from idun_agent_schema.engine.guardrails_type import GuardrailHubGuardType

map: dict[str, Guard] = {
    GuardrailHubGuardType.CorrectLanguage: CorrectLanguage,
    GuardrailHubGuardType.BanList: BanList,
    GuardrailHubGuardType.ProfanityFree: ProfanityFree,
}


def resolve_class(guard_type: str) -> Guard | None:
    """Maps the guard type to its class."""
    guard = map.get(guard_type, "")
    if guard is None:
        raise ValueError(
            f"Guard: {guard_type} is not yet supported, or does not exist."
        )
    return guard
