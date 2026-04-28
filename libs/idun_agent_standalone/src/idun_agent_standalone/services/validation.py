"""Round 2 validation: re-validate the assembled EngineConfig.

Phase 1's assemble_engine_config returns a typed EngineConfig instance,
but cross-resource invalid combinations (e.g. LANGGRAPH framework with
ADK SessionServiceConfig memory) are only caught when the assembled
config is re-validated. This module is the round 2 of the 3-round
pipeline; round 1 is FastAPI's body validation, round 3 is the engine
reload.
"""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import StandaloneFieldError
from pydantic import ValidationError

from idun_agent_standalone.api.v1.errors import (
    field_errors_from_validation_error,
)


class RoundTwoValidationFailed(Exception):  # noqa: N818
    """Raised when the assembled EngineConfig fails Pydantic validation.

    Translates the wrapped ``ValidationError`` into structured
    ``field_errors`` for the admin envelope. The original
    ``ValidationError`` is preserved as the ``__cause__`` chain via
    ``raise ... from exc`` at the call site, but is NOT retained as
    an attribute on the instance.
    """

    field_errors: list[StandaloneFieldError]

    def __init__(self, validation_error: ValidationError) -> None:
        self.field_errors = field_errors_from_validation_error(validation_error)
        super().__init__("Assembled EngineConfig failed validation.")


def validate_assembled_config(engine_config: EngineConfig) -> None:
    """Run Pydantic validation on the assembled EngineConfig.

    Raises ``RoundTwoValidationFailed`` on failure.
    """
    try:
        EngineConfig.model_validate(engine_config.model_dump())
    except ValidationError as exc:
        raise RoundTwoValidationFailed(exc) from exc
