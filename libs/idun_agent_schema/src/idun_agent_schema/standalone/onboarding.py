"""Wire schema for the onboarding scanner.

These models are shared by the standalone backend (which produces them)
and the standalone UI (which consumes them through the onboarding API).
The five-state wizard classification is *not* in this schema — it is
derived at the API layer by combining a ``ScanResult`` with the DB
state of the singleton agent row.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ._base import _CamelModel
from .agent import StandaloneAgentRead


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


OnboardingState = Literal[
    "EMPTY",
    "NO_SUPPORTED",
    "ONE_DETECTED",
    "MANY_DETECTED",
    "ALREADY_CONFIGURED",
]


class ScanResponse(_CamelModel):
    """Response for ``POST /admin/api/v1/onboarding/scan``.

    The five-state classification is computed server-side from the
    scan result plus the agent row's existence. ``current_agent`` is
    only populated when ``state == "ALREADY_CONFIGURED"``.
    """

    state: OnboardingState
    scan_result: ScanResult
    current_agent: StandaloneAgentRead | None = None


class CreateFromDetectionBody(_CamelModel):
    """Body for ``POST /admin/api/v1/onboarding/create-from-detection``.

    The triple ``(framework, file_path, variable_name)`` is the lookup
    key for re-validation against a fresh scan inside the handler.
    ``inferred_name`` is intentionally not on the wire — the server
    computes it from the fresh scan, not from the body.
    """

    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str
    variable_name: str


class CreateStarterBody(_CamelModel):
    """Body for ``POST /admin/api/v1/onboarding/create-starter``.

    ``name`` is optional. When omitted the server uses
    ``"Starter Agent"``. Empty string is rejected.
    """

    framework: Literal["LANGGRAPH", "ADK"]
    name: str | None = Field(default=None, min_length=1, max_length=80)
