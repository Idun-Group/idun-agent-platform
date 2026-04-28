"""Wire schema for the onboarding scanner.

These models are shared by the standalone backend (which produces them)
and the standalone UI (which consumes them through the onboarding API).
The five-state wizard classification is *not* in this schema — it is
derived at the API layer by combining a ``ScanResult`` with the DB
state of the singleton agent row.
"""

from __future__ import annotations

from typing import Literal

from ._base import _CamelModel


class DetectedAgent(_CamelModel):
    """One agent the scanner found in the target folder."""

    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str
    variable_name: str
    inferred_name: str
    confidence: Literal["HIGH", "MEDIUM"]
    source: Literal["config", "source", "langgraph_json"]


class ScanResult(_CamelModel):
    """Aggregate result of a single ``scan_folder`` call."""

    root: str
    detected: list[DetectedAgent]
    has_python_files: bool
    has_idun_config: bool
    scan_duration_ms: int
