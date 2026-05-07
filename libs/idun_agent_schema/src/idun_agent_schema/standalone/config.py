"""Standalone materialized config admin contract.

``GET /admin/api/v1/config/materialized`` returns the assembled
``EngineConfig`` plus the JCS sha256 hash that aligns with
``StandaloneRuntimeStatus.config.hash``. The YAML export at
``GET /admin/api/v1/config/export`` is content-negotiated as
``text/yaml`` and does not need a Pydantic model — the body is the
``EngineConfig`` dumped to YAML directly.
"""

from __future__ import annotations

from idun_agent_schema.engine.engine import EngineConfig

from ._base import _CamelModel


class StandaloneMaterializedConfig(_CamelModel):
    """Body of GET /admin/api/v1/config/materialized."""

    config: EngineConfig
    hash: str
