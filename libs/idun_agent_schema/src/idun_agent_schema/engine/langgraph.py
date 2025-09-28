"""Configuration models for LangGraph agents (engine)."""

from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator

from .agent import BaseAgentConfig


class SqliteCheckpointConfig(BaseModel):
    """Configuration for SQLite checkpointer."""

    type: Literal["sqlite"]
    db_url: str

    @field_validator("db_url")
    @classmethod
    def db_url_must_be_sqlite(cls, v: str) -> str:
        """Ensure the provided database URL uses the sqlite scheme.

        Raises:
            ValueError: If the URL does not start with 'sqlite:///'.

        """
        if not v.startswith("sqlite:///"):
            raise ValueError("SQLite DB URL must start with 'sqlite:///'")
        return v

    @property
    def db_path(self) -> str:
        """Return filesystem path component derived from the sqlite URL."""
        path = urlparse(self.db_url).path
        if self.db_url.startswith("sqlite:///"):
            return path.lstrip("/")
        return path


CheckpointConfig = SqliteCheckpointConfig


class LangGraphAgentConfig(BaseAgentConfig):
    """Configuration model for LangGraph agents."""

    graph_definition: str
    checkpointer: CheckpointConfig | None = None
    store: dict[str, Any] | None = None
