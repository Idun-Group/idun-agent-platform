"""Application settings schemas using Pydantic Settings v2."""

import json
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings for the Manager service."""

    url: str = Field(
        default="",
    )
    echo: bool = Field(default=False)
    pool_size: int = Field(default=10)
    max_overflow: int = Field(default=20)
    pool_pre_ping: bool = Field(default=True)

    model_config = SettingsConfigDict(env_prefix="DATABASE__", env_file=".env")


class AuthSettings(BaseSettings):
    """OIDC / session authentication settings."""

    provider_type: str = Field(default="google")
    issuer: str = Field(default="https://accounts.google.com")
    client_id: str = Field(default="")
    client_secret: str = Field(default="")
    redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/auth/callback"
    )
    scopes: list[str] = Field(
        default=["openid", "profile", "email"]
    )
    frontend_url: str = Field(default="http://localhost:5173")
    session_secret: str = Field(
        default="change-me-to-a-random-secret-at-least-32-chars!"
    )
    session_ttl_seconds: int = Field(default=86400)

    @field_validator("scopes", mode="before")
    @classmethod
    def _parse_scopes(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            return [s.strip() for s in v.split(",") if s.strip()]
        return v  # type: ignore[return-value]

    model_config = SettingsConfigDict(
        env_prefix="AUTH__", env_file=".env", extra="ignore"
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
    cors_origins: str = Field(default="")

    @property
    def cors_allow_origins(self) -> list[str]:
        if self.cors_origins:
            return [o.strip() for o in self.cors_origins.split(",")]
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://0.0.0.0:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://0.0.0.0:4173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://0.0.0.0:3000",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://0.0.0.0:8080",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://0.0.0.0:8000",
        ]

    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )
