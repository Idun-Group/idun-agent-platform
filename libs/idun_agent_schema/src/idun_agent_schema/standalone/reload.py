"""Reload result returned alongside every standalone admin mutation."""

from __future__ import annotations

from enum import StrEnum

from ._base import _CamelModel


class StandaloneReloadStatus(StrEnum):
    """Outcome of a reload triggered by an admin mutation."""

    RELOADED = "reloaded"
    RESTART_REQUIRED = "restart_required"
    RELOAD_FAILED = "reload_failed"
    NOT_ATTEMPTED = "not_attempted"


class StandaloneReloadResult(_CamelModel):
    """Reload outcome attached to every admin mutation response.

    ``reloaded`` means DB committed and runtime now uses the new config.
    ``restart_required`` means DB committed and process restart is needed.
    ``reload_failed`` means DB rolled back and runtime is unchanged.
    ``not_attempted`` means the request was a dry-run — validation ran but
    the DB was not committed and the engine was not reloaded.
    """

    status: StandaloneReloadStatus
    message: str
    error: str | None = None
