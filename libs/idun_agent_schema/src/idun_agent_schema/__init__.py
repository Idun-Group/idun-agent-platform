"""Idun Agent Schema - Centralized Pydantic schemas.

Public namespaces:
- idun_agent_schema.engine: Engine-related schemas
- idun_agent_schema.manager: Manager-related schemas
- idun_agent_schema.shared: Shared cross-cutting schemas
"""

# Re-export key types for convenience
from .shared.observability import ObservabilityConfig  # noqa: F401
