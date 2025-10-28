"""Application settings schemas using Pydantic Settings v2."""

from typing import Literal

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )
