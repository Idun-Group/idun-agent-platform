"""Data Transfer Objects for tenant operations (compat shim)."""

from idun_agent_schema.manager.dto import (  # noqa: F401
    TenantCreateDTO,
    TenantQuotaDTO,
    TenantUpdateDTO,
    TenantUsageDTO,
    TenantUserCreateDTO,
    TenantUserUpdateDTO,
)

__all__ = [
    "TenantCreateDTO",
    "TenantUpdateDTO",
    "TenantUsageDTO",
    "TenantQuotaDTO",
    "TenantUserCreateDTO",
    "TenantUserUpdateDTO",
]
