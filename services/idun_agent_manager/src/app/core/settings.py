"""Application settings using Pydantic Settings v2 (compat shim)."""

from functools import lru_cache

from src.app.infrastructure.db.models.settings import Settings


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def get_settings_dependency() -> Settings:
    """Dependency function for FastAPI."""
    return get_settings()
