"""Runtime configuration for idun-agent-standalone.

All values are env-driven (Pydantic ``BaseSettings``). Sensible defaults make
``idun-standalone serve`` work on a developer laptop without configuration;
production deploys override via environment variables.

Auth mode defaults to ``password`` inside a container (when
``IDUN_IN_CONTAINER=1`` is set in our published Dockerfile) and ``none``
elsewhere — so a fresh laptop install works out of the box but a Docker
deployment requires an explicit hash + secret.
"""

from __future__ import annotations

import os
import secrets
from enum import Enum
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthMode(str, Enum):
    NONE = "none"
    PASSWORD = "password"
    OIDC = "oidc"  # reserved for MVP-2


def _default_auth_mode() -> AuthMode:
    return (
        AuthMode.PASSWORD
        if os.environ.get("IDUN_IN_CONTAINER") == "1"
        else AuthMode.NONE
    )


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
    ui_dir: Path | None = Field(default=None, alias="IDUN_UI_DIR")

    auth_mode: AuthMode = Field(
        default_factory=_default_auth_mode, alias="IDUN_ADMIN_AUTH_MODE"
    )
    admin_password_hash: str | None = Field(
        default=None, alias="IDUN_ADMIN_PASSWORD_HASH"
    )
    session_secret: str | None = Field(default=None, alias="IDUN_SESSION_SECRET")
    session_ttl_seconds: int = Field(default=86400, alias="IDUN_SESSION_TTL_SECONDS")

    traces_retention_days: int = Field(default=30, alias="IDUN_TRACES_RETENTION_DAYS")

    def resolved_session_secret(self) -> str:
        if self.session_secret:
            return self.session_secret
        if self.auth_mode == AuthMode.NONE:
            return secrets.token_urlsafe(48)
        raise ValueError(
            "IDUN_SESSION_SECRET is required when IDUN_ADMIN_AUTH_MODE=password"
        )

    def validate_for_runtime(self) -> None:
        """Fail fast on missing/unsupported auth configuration.

        Spec §8.1 defers OIDC to MVP-2; the enum value is reserved so
        the API doesn't move when MVP-2 lands, but selecting it today
        produces a confusing 401 wall (no IdP wiring exists). Raising
        here turns it into a clear startup error.
        """
        if self.auth_mode == AuthMode.OIDC:
            raise ValueError(
                "IDUN_ADMIN_AUTH_MODE=oidc is reserved for MVP-2 and not "
                "implemented yet. Set it to 'none' (laptop dev) or "
                "'password' (containerized deploy)."
            )
        if self.auth_mode == AuthMode.PASSWORD:
            if not self.admin_password_hash:
                raise ValueError(
                    "IDUN_ADMIN_PASSWORD_HASH is required when "
                    "IDUN_ADMIN_AUTH_MODE=password. Generate one with: "
                    "idun-standalone hash-password"
                )
            if not self.session_secret:
                raise ValueError(
                    "IDUN_SESSION_SECRET is required when "
                    "IDUN_ADMIN_AUTH_MODE=password"
                )
