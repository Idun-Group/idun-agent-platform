"""Standalone runtime settings (env-driven)."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MIN_SESSION_SECRET_LEN = 32
_BIND_ALL_HOSTS = frozenset({"0.0.0.0", "::"})


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
    host: str = Field(default="127.0.0.1", alias="IDUN_HOST")
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

    # Trace pipeline knobs. ENV-001: these used to be read directly via
    # ``os.getenv`` from ``infrastructure/traces/`` modules, which made
    # the configuration surface invisible in this single source of
    # truth. Rolled into ``StandaloneSettings`` so misconfigured deploys
    # surface as a Pydantic validation error instead of silent defaults.
    trace_retention_days: int = Field(
        default=14,
        ge=1,
        le=365,
        alias="IDUN_TRACE_RETENTION_DAYS",
    )
    traces_input_value_max_bytes: int = Field(
        default=65536,
        ge=1024,
        alias="IDUN_TRACES_INPUT_VALUE_MAX_BYTES",
    )
    prices_refresh_enabled: bool = Field(
        default=False,
        alias="IDUN_PRICES_REFRESH",
    )
    allow_open_admin: bool = Field(
        default=False,
        alias="IDUN_ALLOW_OPEN_ADMIN",
    )

    @field_validator("admin_password_hash", "session_secret", mode="before")
    @classmethod
    def _strip_secret(cls, v: str) -> str:
        return v.rstrip("\n\r")

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

    @model_validator(mode="after")
    def _validate_open_admin_combo(self) -> Self:
        """Refuse bind-all + no auth unless explicitly opted in."""
        if (
            self.host in _BIND_ALL_HOSTS
            and self.auth_mode == AuthMode.NONE
            and not self.allow_open_admin
        ):
            raise SettingsValidationError(
                f"Refusing to bind IDUN_HOST={self.host} with "
                "IDUN_ADMIN_AUTH_MODE=none. Set "
                "IDUN_ADMIN_AUTH_MODE=password or IDUN_ALLOW_OPEN_ADMIN=1."
            )
        return self
