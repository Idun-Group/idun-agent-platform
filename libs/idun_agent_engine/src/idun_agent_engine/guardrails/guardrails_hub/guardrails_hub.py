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

    elif name.value == "nsfw":
        from guardrails.hub import NSFWText

        return NSFWText

    elif name.value == "competitor_check":
        from guardrails.hub import CompetitorCheck

        return CompetitorCheck

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

    def _install_model(self) -> None:
        import subprocess

        from guardrails import install

        try:
            api_key = self._guardrail_config.api_key

            print("Configuring guardrails with token...")
            result = subprocess.run(
                [
                    "guardrails",
                    "configure",
                    "--token",
                    api_key,
                    "--disable-remote-inferencing",
                    "--disable-metrics",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            print(f"Configure output: {result.stdout}")
            if result.stderr:
                print(f"Configure stderr: {result.stderr}")
            print(f"Installing model: {self._guard_url}..")
            install(self._guard_url, quiet=False, install_local_models=True)
            print(f"Successfully installed: {self._guard_url}")
        except subprocess.CalledProcessError as e:
            raise OSError(
                f"Cannot configure guardrails: stdout={e.stdout}, stderr={e.stderr}"
            ) from e
        except Exception as e:
            raise e

    def setup_guard(self) -> Guard | None:
        """Installs and configures the guard based on its yaml config."""
        self._install_model()
        guard_name = self.guard_id
        guard = get_guard_instance(guard_name)
        if guard is None:
            raise ValueError(
                f"Guard: {self.guard_id} is not yet supported, or does not exist."
            )

        guard_instance_params = self._guardrail_config.guard_params.model_dump()
        guard_instance = guard(**guard_instance_params)
        for param, value in guard_instance_params.items():
            setattr(guard_instance, param, value)
        import pdb

        pdb.set_trace()
        return guard_instance

    def validate(self, input: str) -> bool:
        """TODO."""
        main_guard = Guard().use(self._guard)
        try:
            main_guard.validate(input)
            return True
        except Exception:
            return False
