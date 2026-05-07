"""Reload result returned alongside every standalone admin mutation."""

from __future__ import annotations

from enum import StrEnum

from ._base import _CamelModel


class StandaloneReloadStatus(StrEnum):
    """Outcome of a reload triggered by an admin mutation."""

    RELOADED = "reloaded"
    RESTART_REQUIRED = "restart_required"
    RELOAD_FAILED = "reload_failed"


class StandaloneReloadResult(_CamelModel):
    """Reload outcome attached to every admin mutation response.

    ``reloaded`` means DB committed and runtime now uses the new config.
    ``restart_required`` means DB committed and process restart is needed.
    ``reload_failed`` means DB rolled back and runtime is unchanged.
    """

    status: StandaloneReloadStatus
    message: str
    error: str | None = None
