"""Compatibility shim: re-export Tenant domain entities from schema library."""

from idun_agent_schema.manager.domain import (  # noqa: F401
    TenantEntity,
    TenantPlan,
    TenantStatus,
    TenantUserEntity,
)

__all__ = [
    "TenantEntity",
    "TenantPlan",
    "TenantStatus",
    "TenantUserEntity",
]
