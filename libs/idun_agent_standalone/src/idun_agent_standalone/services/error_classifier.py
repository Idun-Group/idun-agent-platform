"""Classify round-3 reload failures into structured admin errors.

The reload pipeline catches ``ReloadInitFailed`` and currently emits a
flat ``code=reload_failed`` envelope. This classifier converts the
underlying exception into a bounded taxonomy with field paths and
extras (``details.envVar``, ``details.upstream``) so the UI can
highlight the wrong field instead of toasting a generic message.
"""

from __future__ import annotations

import re
from enum import StrEnum

from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)


class ReloadFailureCode(StrEnum):
    IMPORT_ERROR = "import_error"
    CONNECTION_ERROR = "connection_error"
    ENV_UNSET = "env_unset"
    COMPILE_ERROR = "compile_error"
    INIT_FAILED_UNKNOWN = "init_failed_unknown"


_ENV_VAR_PATTERN = re.compile(r"[A-Z][A-Z0-9_]+")


def classify_reload_error(
    exc: BaseException,
    engine_config: object,
) -> StandaloneAdminError:
    """Translate a round-3 exception into a structured admin error.

    The classifier consults the assembled engine_config to map errors
    to specific resource fields when the exception is unambiguous
    (postgres ConnectionError → memory.config.dbUrl, etc.).
    """
    message = f"{type(exc).__name__}: {exc}"

    # ImportError → almost always the graph definition
    if isinstance(exc, ImportError):
        return StandaloneAdminError(
            code=StandaloneErrorCode.RELOAD_FAILED,
            message=message,
            field_errors=[
                StandaloneFieldError(
                    field="agent.config.graphDefinition",
                    message=str(exc),
                    code=ReloadFailureCode.IMPORT_ERROR.value,
                ),
            ],
        )

    # KeyError that looks like an env var (uppercase, underscores, all-caps)
    if isinstance(exc, KeyError) and exc.args:
        key = str(exc.args[0]).strip("'\"")
        if _ENV_VAR_PATTERN.fullmatch(key):
            return StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message=f"Missing environment variable: {key}",
                details={"envVar": key},
            )

    # ConnectionError / OperationalError — try to pin to memory or observability
    name = type(exc).__name__
    if name in {"ConnectionError", "OperationalError", "OSError"}:
        text = str(exc).lower()
        memory = getattr(engine_config, "memory", None)
        memory_url = (
            getattr(getattr(memory, "config", None), "db_url", None)
            if memory is not None
            else None
        )
        if memory_url and any(
            tok in text
            for tok in ("postgres", "psycopg", str(memory_url).split("@")[-1].lower())
        ):
            return StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message=message,
                field_errors=[
                    StandaloneFieldError(
                        field="memory.config.dbUrl",
                        message=str(exc),
                        code=ReloadFailureCode.CONNECTION_ERROR.value,
                    ),
                ],
                details={"upstream": str(memory_url)},
            )
        observability = getattr(engine_config, "observability", []) or []
        for entry in observability:
            host = getattr(getattr(entry, "config", None), "host", None)
            if host and str(host).lower() in text:
                return StandaloneAdminError(
                    code=StandaloneErrorCode.RELOAD_FAILED,
                    message=message,
                    field_errors=[
                        StandaloneFieldError(
                            field="observability.config.host",
                            message=str(exc),
                            code=ReloadFailureCode.CONNECTION_ERROR.value,
                        ),
                    ],
                    details={"upstream": str(host)},
                )

    return StandaloneAdminError(
        code=StandaloneErrorCode.RELOAD_FAILED,
        message=message,
    )
