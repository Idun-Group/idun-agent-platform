"""Application settings schemas using Pydantic Settings v2."""

from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings for the Manager service."""

    url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:55432/idun_agents"
    )
    echo: bool = Field(default=False)
    pool_size: int = Field(default=10)
    max_overflow: int = Field(default=20)
    pool_pre_ping: bool = Field(default=True)

    model_config = SettingsConfigDict(env_prefix="DATABASE_", env_file=".env")


class RedisSettings(BaseSettings):
    """Redis cache settings."""

    url: str = Field(default="redis://localhost:6379/0")
    max_connections: int = Field(default=20)

    model_config = SettingsConfigDict(env_prefix="REDIS_", env_file=".env")


class AuthSettings(BaseSettings):
    """Authentication and OIDC-related configuration."""

    provider_type: Literal["okta", "auth0", "entra", "google"] = Field(default="auth0")
    issuer: str = Field(default="")
    client_id: str = Field(default="")
    client_secret: str = Field(default="")
    audience: str | None = Field(default=None)
    redirect_uri: str | None = Field(default=None)
    scopes: list[str] = Field(default_factory=lambda: ["openid", "profile", "email"])

    allowed_algs: list[str] = Field(default_factory=lambda: ["RS256", "RS512", "ES256"])
    jwks_cache_ttl: int = Field(default=300)
    clock_skew_seconds: int = Field(default=60)
    expected_audiences: list[str] = Field(default_factory=list)

    claim_user_id_path: list[str] | None = Field(default=None)
    claim_email_path: list[str] | None = Field(default=None)
    claim_roles_paths: list[list[str]] | None = Field(default=None)
    claim_groups_paths: list[list[str]] | None = Field(default=None)
    claim_workspace_ids_paths: list[list[str]] | None = Field(default=None)

    @field_validator("claim_user_id_path", "claim_email_path", mode="before")
    @classmethod
    def _string_to_list(cls, v):
        if isinstance(v, str) and v.strip().startswith("#"):
            return None
        return v

    @field_validator(
        "claim_roles_paths",
        "claim_groups_paths",
        "claim_workspace_ids_paths",
        mode="before",
    )
    @classmethod
    def _string_to_list_of_lists(cls, v):
        if isinstance(v, str) and v.strip().startswith("#"):
            return None
        return v

    model_config = SettingsConfigDict(
        env_prefix="AUTH_", env_file=".env", extra="ignore"
    )

    @field_validator("issuer")
    @classmethod
    def validate_issuer(cls, v: str) -> str:
        """Validate that issuer is either empty or a URL."""
        if not v:
            return v
        if not v.startswith("http"):
            raise ValueError("issuer must be a URL")
        return v


class ObservabilitySettings(BaseSettings):
    """OpenTelemetry and logging settings."""

    otel_service_name: str = Field(default="idun-agent-manager")
    otel_exporter_endpoint: str | None = Field(default=None)
    otel_exporter_headers: str | None = Field(default=None)
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")

    model_config = SettingsConfigDict(env_prefix="OTEL_", env_file=".env")


class CelerySettings(BaseSettings):
    """Celery broker/result backend settings."""

    broker_url: str = Field(default="redis://localhost:6379/1")
    result_backend: str = Field(default="redis://localhost:6379/2")
    task_serializer: str = Field(default="json")
    result_serializer: str = Field(default="json")
    accept_content: list[str] = Field(default=["json"])
    timezone: str = Field(default="UTC")

    model_config = SettingsConfigDict(env_prefix="CELERY_", env_file=".env")


class APISettings(BaseSettings):
    """API metadata, CORS, and rate limiting settings."""

    title: str = Field(default="Idun Agent Manager API")
    description: str = Field(default="Modern FastAPI backend for managing AI agents")
    version: str = Field(default="0.1.0")
    docs_url: str = Field(default="/docs")
    redoc_url: str = Field(default="/redoc")
    openapi_url: str = Field(default="/openapi.json")
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"]
    )
    cors_methods: list[str] = Field(default=["*"])
    cors_headers: list[str] = Field(default=["*"])
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_requests: int = Field(default=100)
    rate_limit_window: int = Field(default=60)

    model_config = SettingsConfigDict(
        env_prefix="API_", env_file=".env", extra="ignore"
    )


class Settings(BaseSettings):
    """Top-level application settings composed of sub-settings."""

    environment: str = Field(default="development")
    debug: bool = Field(default=False)
    testing: bool = Field(default=False)
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    workers: int = Field(default=1)
    reload: bool = Field(default=False)
    is_development: bool = Field(default=True)

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
