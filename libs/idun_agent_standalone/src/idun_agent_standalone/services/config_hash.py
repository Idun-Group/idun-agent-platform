"""Deterministic hash of the materialized EngineConfig.

Used to detect structural changes between reloads (compared against
StandaloneRuntimeStateRow.last_applied_config_hash) and to surface
the active config identity in /admin/api/v1/runtime/status.

Implementation: sha256 over the RFC 8785 / JCS canonical JSON
encoding of the EngineConfig's model_dump(mode="json"). JCS
guarantees canonical key order so semantically-equal configs
produce identical hashes.
"""

from __future__ import annotations

from hashlib import sha256

import rfc8785
from idun_agent_schema.engine.engine import EngineConfig


def compute_config_hash(engine_config: EngineConfig) -> str:
    """Return a 64-character hex sha256 of the JCS-canonical JSON of the config."""
    payload = engine_config.model_dump(mode="json")
    canonical = rfc8785.dumps(payload)
    return sha256(canonical).hexdigest()
