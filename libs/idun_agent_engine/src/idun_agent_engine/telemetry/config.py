"""Telemetry configuration utilities."""

from __future__ import annotations

import os

IDUN_TELEMETRY_ENABLED_ENV = "IDUN_TELEMETRY_ENABLED"


def telemetry_enabled(environ: dict[str, str] | None = None) -> bool:
    """Return whether telemetry is enabled.

    Telemetry is ON by default. Users can disable it by setting the environment
    variable `IDUN_TELEMETRY_ENABLED` to a falsy value (e.g. "false", "0", "no").
    """

    env = os.environ if environ is None else environ
    raw = env.get(IDUN_TELEMETRY_ENABLED_ENV)
    if raw is None:
        return True

    value = raw.strip().lower()
    if value in {"0", "false", "no", "off", "disable", "disabled"}:
        return False
    if value in {"1", "true", "yes", "on", "enable", "enabled"}:
        return True

    # Unknown values default to enabled (opt-out).
    return True
