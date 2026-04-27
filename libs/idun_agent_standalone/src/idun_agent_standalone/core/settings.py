"""Standalone runtime settings (env-driven)."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthMode(StrEnum):
    NONE = "none"
    PASSWORD = "password"


class StandaloneSettings(BaseSettings):
    """Env-driven settings for the standalone process."""

    model_config = SettingsConfigDict(
        env_file=None,
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    config_path: Path = Field(default=Path("./config.yaml"), alias="IDUN_CONFIG_PATH")
    host: str = Field(default="0.0.0.0", alias="IDUN_HOST")
    port: int = Field(default=8000, alias="IDUN_PORT")
    database_url: str = Field(
        default="sqlite+aiosqlite:///./idun_standalone.db",
        alias="DATABASE_URL",
    )
    auth_mode: AuthMode = Field(default=AuthMode.NONE, alias="IDUN_ADMIN_AUTH_MODE")
