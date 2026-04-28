"""Standalone runtime settings (env-driven)."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MIN_SESSION_SECRET_LEN = 32


class AuthMode(StrEnum):
    NONE = "none"
    PASSWORD = "password"


class SettingsValidationError(ValueError):
    """Raised at startup when password mode is requested but misconfigured."""


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
    session_secret: str = Field(default="", alias="IDUN_SESSION_SECRET")
    admin_password_hash: str = Field(default="", alias="IDUN_ADMIN_PASSWORD_HASH")
    session_ttl_hours: int = Field(
        default=24, ge=1, le=720, alias="IDUN_SESSION_TTL_HOURS"
    )
    ui_dir: Path | None = Field(default=None, alias="IDUN_UI_DIR")

    @model_validator(mode="after")
    def _validate_password_mode(self) -> Self:
        """Fail fast at startup when password mode is mis-configured.

        - ``IDUN_SESSION_SECRET`` must be at least 32 characters; the
          cookie signature relies on its entropy.
        - ``IDUN_ADMIN_PASSWORD_HASH`` is the first-boot seed for the
          admin row. It is required when no admin row exists; a startup
          probe in ``app.py`` decides at boot whether to enforce it.
          Here we only enforce the secret length so misconfigured
          deploys cannot silently fall back to an empty signing key.
        """
        if (
            self.auth_mode == AuthMode.PASSWORD
            and len(self.session_secret) < _MIN_SESSION_SECRET_LEN
        ):
            raise SettingsValidationError(
                "IDUN_ADMIN_AUTH_MODE=password requires "
                f"IDUN_SESSION_SECRET to be at least {_MIN_SESSION_SECRET_LEN} "
                "characters."
            )
        return self
