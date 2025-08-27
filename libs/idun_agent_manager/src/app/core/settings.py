"""Application settings using Pydantic Settings v2."""

from functools import lru_cache
from typing import Any, Dict, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings."""

    url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:55432/idun_agents",
        description="Database URL with async driver",
    )
    echo: bool = Field(default=False, description="Echo SQL queries")
    pool_size: int = Field(default=10, description="Connection pool size")
    max_overflow: int = Field(default=20, description="Max overflow connections")
    pool_pre_ping: bool = Field(default=True, description="Validate connections")

    model_config = SettingsConfigDict(env_prefix="DATABASE_", env_file=".env")


class RedisSettings(BaseSettings):
    """Redis cache configuration."""

    url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )
    max_connections: int = Field(default=20, description="Max Redis connections")

    model_config = SettingsConfigDict(env_prefix="REDIS_", env_file=".env")


class AuthSettings(BaseSettings):
    """Authentication and security settings."""

    secret_key: str = Field(
        ...,
        description="Secret key for JWT tokens",
        min_length=32,
    )
    algorithm: str = Field(default="HS256", description="JWT algorithm")
    access_token_expire_minutes: int = Field(
        default=30, description="Access token expiration"
    )
    refresh_token_expire_days: int = Field(
        default=7, description="Refresh token expiration"
    )

    # OAuth2/OIDC settings
    oauth_client_id: Optional[str] = Field(default=None)
    oauth_client_secret: Optional[str] = Field(default=None)
    oauth_server_url: Optional[str] = Field(default=None)
    oauth_redirect_uri: Optional[str] = Field(default=None)

    model_config = SettingsConfigDict(env_prefix="AUTH_", env_file=".env")

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validate secret key length."""
        if len(v) < 32:
            raise ValueError("Secret key must be at least 32 characters long")
        return v


class ObservabilitySettings(BaseSettings):
    """Observability and monitoring settings."""

    # OpenTelemetry
    otel_service_name: str = Field(default="idun-agent-manager")
    otel_exporter_endpoint: Optional[str] = Field(default=None)
    otel_exporter_headers: Optional[str] = Field(default=None)

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(default="json", description="Log format (json/text)")

    model_config = SettingsConfigDict(env_prefix="OTEL_", env_file=".env")


class CelerySettings(BaseSettings):
    """Celery task queue configuration."""

    broker_url: str = Field(
        default="redis://localhost:6379/1",
        description="Celery broker URL",
    )
    result_backend: str = Field(
        default="redis://localhost:6379/2",
        description="Celery result backend URL",
    )
    task_serializer: str = Field(default="json")
    result_serializer: str = Field(default="json")
    accept_content: List[str] = Field(default=["json"])
    timezone: str = Field(default="UTC")

    model_config = SettingsConfigDict(env_prefix="CELERY_", env_file=".env")


class APISettings(BaseSettings):
    """API-specific settings."""

    title: str = Field(default="Idun Agent Manager API")
    description: str = Field(
        default="Modern FastAPI backend for managing AI agents"
    )
    version: str = Field(default="0.1.0")
    docs_url: str = Field(default="/docs")
    redoc_url: str = Field(default="/redoc")
    openapi_url: str = Field(default="/openapi.json")

    # CORS
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"],
        description="Allowed CORS origins",
    )
    cors_methods: List[str] = Field(default=["*"])
    cors_headers: List[str] = Field(default=["*"])

    # Rate limiting
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_requests: int = Field(default=100)
    rate_limit_window: int = Field(default=60)

    model_config = SettingsConfigDict(env_prefix="API_", env_file=".env")


class Settings(BaseSettings):
    """Main application settings."""

    # Environment
    environment: str = Field(default="development", description="Environment name")
    debug: bool = Field(default=False, description="Debug mode")
    testing: bool = Field(default=False, description="Testing mode")

    # Server
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, description="Server port")
    workers: int = Field(default=1, description="Number of worker processes")
    reload: bool = Field(default=False, description="Auto-reload on changes")

    # Nested settings
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    celery: CelerySettings = Field(default_factory=CelerySettings)
    api: APISettings = Field(default_factory=APISettings)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment.lower() == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.environment.lower() == "production"

    @property
    def is_testing(self) -> bool:
        """Check if running in testing mode."""
        return self.testing or self.environment.lower() == "testing"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience function for dependency injection
def get_settings_dependency() -> Settings:
    """Dependency function for FastAPI."""
    return get_settings()