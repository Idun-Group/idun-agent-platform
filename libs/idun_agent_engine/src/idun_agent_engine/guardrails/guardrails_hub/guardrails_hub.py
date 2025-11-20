"""Guardrails."""

from guardrails import Guard
from idun_agent_schema.engine.guardrails import Guardrail as GuardrailSchema
from idun_agent_schema.engine.guardrails_type import (
    GuardrailType,
)

from ..base import BaseGuardrail


def load_guard_map():
    """Returns a map of guard type -> guard instance."""
    from guardrails.hub import BanList

    return {
        "BAN_LIST": BanList,
    }


class GuardrailsHubGuard(BaseGuardrail):
    """Class for managing guardrails from `guardrailsai`'s hub."""

    def __init__(self, config: GuardrailSchema, position: str) -> None:
        super().__init__(config)

        self._guard_type = self._guardrail_config.type
        self._guard_config = self._guardrail_config.config

        if self._guard_type == GuardrailType.GUARDRAILS_HUB:
            self._guard_url = self._guardrail_config.config["guard_url"]

        self.reject_message: str = self._guard_config["reject_message"]
        self._install_model()
        self._guard: Guard | None = self.setup_guard()
        self.position: str = position

    def _install_model(self) -> None:
        import subprocess

        from guardrails import install

        try:
            api_key = self._guardrail_config.config["api_key"]
            subprocess.run(
                [
                    "guardrails",
                    "configure",
                    "--token",
                    api_key,
                    "--disable-remote-inferencing",  # TODO: maybe provide this as feat
                    "--disable-metrics",
                ],
                check=True,
            )
            print(f"Installing model: {self._guard_url}..")
            install(self._guard_url, quiet=True, install_local_models=True)
        except Exception as e:
            raise OSError(f"Cannot install model {self._guard_url}: {e}") from e

    def setup_guard(self) -> Guard | None:
        """Installs and configures the guard based on its yaml config."""
        if self._guard_type == GuardrailType.GUARDRAILS_HUB:
            self._install_model()
            map = load_guard_map()
            guard_name = self._guardrail_config.config.get("guard")
            guard = map.get(guard_name)
            if guard is None:
                raise ValueError(
                    f"Guard: {self.guard_type} is not yet supported, or does not exist."
                )

            guard_instance_params = self._guardrail_config.config.get(
                "guard_config", {}
            )
            guard_instance = guard(**guard_instance_params)
            for param, value in self._guardrail_config.config["guard_config"].items():
                setattr(guard, param, value)
            return guard_instance
        elif self._guard_type == GuardrailType.CUSTOM_LLM:
            raise NotImplementedError("Support for CUSTOM_LLM not yet provided.")

    def validate(self, input: str) -> bool:
        """TODO."""
        main_guard = Guard().use(self._guard)
        return main_guard.validate(input)
