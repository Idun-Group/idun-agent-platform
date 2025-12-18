"""Guardrails."""

from guardrails import Guard
from idun_agent_schema.engine.guardrails import Guardrail as GuardrailSchema
from idun_agent_schema.engine.guardrails_v2 import GuardrailConfigId

from ..base import BaseGuardrail


def get_guard_instance(name: GuardrailConfigId) -> Guard:
    """Returns a map of guard type -> guard instance."""
    if name.value == "ban_list":
        from guardrails.hub import BanList

        return BanList

    elif name.value == "detect_pii":
        from guardrails.hub import DetectPII

        return DetectPII

    elif name.value == "nsfw_text":
        from guardrails.hub import NSFWText

        return NSFWText

    elif name.value == "competition_check":
        from guardrails.hub import CompetitorCheck

        return CompetitorCheck

    elif name.value == "bias_check":
        from guardrails.hub import BiasCheck

        return BiasCheck

    elif name.value == "gibberish_text":
        from guardrails.hub import GibberishText

        return GibberishText

    elif name.value == "detect_jailbreak":
        from guardrails.hub import DetectJailbreak

        return DetectJailbreak

    elif name.value == "correct_language":
        from guardrails.hub import CorrectLanguage

        return CorrectLanguage

    elif name.value == "restrict_to_topic":
        from guardrails.hub import RestrictToTopic

        return RestrictToTopic

    elif name.value == "toxic_language":
        from guardrails.hub import ToxicLanguage

        return ToxicLanguage

    else:
        raise ValueError(f"Guard {name} not found.")


class GuardrailsHubGuard(BaseGuardrail):
    """Class for managing guardrails from `guardrailsai`'s hub."""

    def __init__(self, config: GuardrailSchema, position: str) -> None:
        super().__init__(config)

        self.guard_id = self._guardrail_config.config_id
        self._guard_url = self._guardrail_config.guard_url
        self.reject_message: str = self._guardrail_config.reject_message
        self._guard: Guard | None = self.setup_guard()
        self.position: str = position

    def setup_guard(self) -> Guard | None:
        """Configures the guard based on its yaml config."""
        guard_name = self.guard_id
        guard = get_guard_instance(guard_name)
        if guard is None:
            raise ValueError(
                f"Guard: {self.guard_id} is not yet supported, or does not exist."
            )

        guard_instance_params = self._guardrail_config.guard_params
        guard_instance = guard(**guard_instance_params)
        for param, value in guard_instance_params.items():
            setattr(guard_instance, param, value)
        return guard_instance

    def validate(self, input: str) -> bool:
        main_guard = Guard().use(self._guard, on_fail="exception")
        try:
            main_guard.validate(input)
            return True
        except Exception:
            return False
