"""Application settings using Pydantic Settings v2 (compat shim)."""

from functools import lru_cache

from idun_agent_schema.manager.settings import (  # noqa: F401
    APISettings,
    AuthSettings,
    CelerySettings,
    DatabaseSettings,
    ObservabilitySettings,
    RedisSettings,
    Settings,
)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def get_settings_dependency() -> Settings:
    """Dependency function for FastAPI."""
    return get_settings()
