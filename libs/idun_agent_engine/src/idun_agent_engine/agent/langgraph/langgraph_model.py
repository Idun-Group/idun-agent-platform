"""Configuration models for LangGraph agents."""

from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator

from idun_agent_engine.agent.model import BaseAgentConfig


class SqliteCheckpointConfig(BaseModel):
    """Configuration for SQLite checkpointer."""

    type: Literal["sqlite"]
    db_url: str

    @field_validator("db_url")
    @classmethod
    def db_url_must_be_sqlite(cls, v: str) -> str:
        """Validate that db_url uses sqlite scheme."""
        if not v.startswith("sqlite:///"):
            raise ValueError("SQLite DB URL must start with 'sqlite:///'")
        return v

    @property
    def db_path(self) -> str:
        """Extracts the database file path from the db_url."""
        # For 'sqlite:///relative/path/to.db', path is '/relative/path/to.db'
        # For 'sqlite:////absolute/path/to.db', path is '/absolute/path/to.db'
        path = urlparse(self.db_url).path
        # If the original URL has 3 slashes, it's a relative path, so we strip the leading '/'
        if self.db_url.startswith("sqlite:///"):
            return path.lstrip("/")
        return path


# A single checkpointer type for now (kept as alias for future extension).
CheckpointConfig = SqliteCheckpointConfig


class LangGraphAgentConfig(BaseAgentConfig):
    """Configuration model for LangGraph agents.

    This model validates the 'config' block for an agent of type 'langgraph'.
    """

    graph_definition: str
    checkpointer: CheckpointConfig | None = None
    store: dict[str, Any] | None = None  # Placeholder for store config
