"""Onboarding service: state classification + EngineConfig assembly.

This module is the orchestration layer between the ``/onboarding/*``
HTTP endpoints, the scanner (read-only), and the scaffolder
(side-effecting). It owns:

  - The 5-state classification rule.
  - Building an ``EngineConfig`` dict from a ``DetectedAgent``.
  - Building an ``EngineConfig`` dict for a starter scaffold.

The two materialize coroutines (DB insert + reload pipeline) land in
Task 6 alongside the corresponding HTTP integration tests.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from idun_agent_schema.standalone import (
    DetectedAgent,
    OnboardingState,
    ScanResult,
)

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    """Return a slug suitable for ``agent.config.name``.

    The engine's ADK validator derives ``app_name`` from ``name`` by
    lower-casing and replacing non-alphanumerics with ``_``, so we run
    the same transformation up-front to keep the value stable across
    re-validations and avoid surprising round-trip differences.
    Falls back to ``"agent"`` when the input slugifies to empty.
    """
    slug = _SLUG_RE.sub("_", name.lower()).strip("_")
    return slug or "agent"


def classify_state(
    scan_result: ScanResult,
    *,
    agent_row_exists: bool,
) -> OnboardingState:
    """Compute the wizard's 5-state classification."""
    if agent_row_exists:
        return "ALREADY_CONFIGURED"
    if not scan_result.has_python_files:
        return "EMPTY"
    if not scan_result.detected:
        return "NO_SUPPORTED"
    if len(scan_result.detected) == 1:
        return "ONE_DETECTED"
    return "MANY_DETECTED"


def engine_config_dict_from_detection(detection: DetectedAgent) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict from a detected agent."""
    name_slug = _slugify(detection.inferred_name)
    if detection.framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": f"{detection.file_path}:{detection.variable_name}",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }


def engine_config_dict_for_starter(
    *,
    framework: Literal["LANGGRAPH", "ADK"],
    name: str,
) -> dict[str, Any]:
    """Build the ``base_engine_config`` dict for a starter scaffold."""
    name_slug = _slugify(name)
    if framework == "LANGGRAPH":
        agent_block: dict[str, Any] = {
            "type": "LANGGRAPH",
            "config": {
                "name": name_slug,
                "graph_definition": "agent.py:graph",
            },
        }
    else:
        agent_block = {
            "type": "ADK",
            "config": {
                "name": name_slug,
                "agent": "agent.py:agent",
            },
        }
    return {
        "server": {"api": {"port": 8000}},
        "agent": agent_block,
    }
