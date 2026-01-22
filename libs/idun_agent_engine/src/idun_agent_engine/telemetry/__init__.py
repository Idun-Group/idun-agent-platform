"""Telemetry package for Idun Agent Engine."""

from __future__ import annotations

from .telemetry import IdunTelemetry, sanitize_telemetry_config

_telemetry_singleton: IdunTelemetry | None = None


def get_telemetry() -> IdunTelemetry:
    """Return the process-wide telemetry singleton."""

    global _telemetry_singleton
    if _telemetry_singleton is None:
        _telemetry_singleton = IdunTelemetry()
    return _telemetry_singleton


__all__ = ["IdunTelemetry", "get_telemetry", "sanitize_telemetry_config"]
