"""Guardrails."""

import logging
import os

from guardrails import Guard
from idun_agent_schema.engine.guardrails import Guardrail as GuardrailSchema
from idun_agent_schema.engine.guardrails_v2 import GuardrailConfigId

from ..base import BaseGuardrail

PII_ENTITY_MAP = {
    "Email": "EMAIL_ADDRESS",
    "Phone Number": "PHONE_NUMBER",
    "Credit Card": "CREDIT_CARD",
    "SSN": "SSN",
    "Location": "LOCATION",
}

logger = logging.getLogger(__name__)


def get_guard_instance(name: GuardrailConfigId) -> Guard:
    """Returns a map of guard type -> guard instance."""
    if name == GuardrailConfigId.BAN_LIST:
        from guardrails.hub import BanList

        return BanList

    elif name == GuardrailConfigId.DETECT_PII:
        from guardrails.hub import DetectPII

        return DetectPII

    elif name == GuardrailConfigId.NSFW_TEXT:
        from guardrails.hub import NSFWText

        return NSFWText

    elif name == GuardrailConfigId.COMPETITION_CHECK:
        from guardrails.hub import CompetitorCheck

        return CompetitorCheck

    elif name == GuardrailConfigId.BIAS_CHECK:
        from guardrails.hub import BiasCheck

        return BiasCheck

    elif name == GuardrailConfigId.CORRECT_LANGUAGE:
        from guardrails.hub import ValidLanguage

        return ValidLanguage

    elif name == GuardrailConfigId.GIBBERISH_TEXT:
        from guardrails.hub import GibberishText

        return GibberishText

    elif name == GuardrailConfigId.TOXIC_LANGUAGE:
        from guardrails.hub import ToxicLanguage

        return ToxicLanguage

    elif name == GuardrailConfigId.RESTRICT_TO_TOPIC:
        from guardrails.hub import RestrictToTopic

        return RestrictToTopic

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
            api_key = (
                self._guardrail_config.api_key
                or os.getenv("GUARDRAILS_API_KEY", "")
            )
            if not api_key:
                raise ValueError(
                    f"Guardrail '{self.guard_id}' requires an api_key. "
                    "Set it in the guardrail config or via GUARDRAILS_API_KEY env var."
                )

            logger.info("Configuring guardrails...")
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
            logger.debug(f"Configure output: {result.stdout}")
            if result.stderr:
                logger.debug(f"Configure stderr: {result.stderr}")
            logger.info(f"Installing model: {self._guard_url}...")
            install(self._guard_url, quiet=False, install_local_models=True)
            logger.info(f"✅ Successfully installed: {self._guard_url}")
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

        config_dict = self._guardrail_config.model_dump()
        # Fields handled separately — not passed to the guard constructor
        exclude_fields = {"config_id", "api_key", "reject_message", "guard_url", "on_fail"}
        guard_instance_params = {
            k: v for k, v in config_dict.items() if k not in exclude_fields
        }

        # Extract on_fail for Guard.use() — defaults to "exception"
        on_fail = config_dict.get("on_fail", "exception")

        if (
            guard_name == GuardrailConfigId.DETECT_PII
            and "pii_entities" in guard_instance_params
        ):
            guard_instance_params["pii_entities"] = [
                PII_ENTITY_MAP.get(e, e)
                for e in guard_instance_params["pii_entities"]
            ]

        try:
            guard_instance = guard(on_fail=on_fail, **guard_instance_params)
            return guard_instance
        except SystemError:
            # sentencepiece mutex lock error when loading models in quick succession
            import time

            time.sleep(0.5)
            guard_instance = guard(on_fail=on_fail, **guard_instance_params)
            return guard_instance

    def validate(self, input: str) -> bool:
        """Validate input against this guardrail. Returns True if content is allowed."""
        from guardrails.errors import ValidationError as GuardrailsValidationError

        main_guard = Guard().use(self._guard)
        try:
            result = main_guard.validate(input)
            return bool(result.validation_passed)
        except GuardrailsValidationError:
            return False
        except Exception:
            logger.exception(
                "Guardrail '%s' raised an unexpected error during validation; "
                "allowing request to proceed.",
                self.guard_id,
            )
            return True
