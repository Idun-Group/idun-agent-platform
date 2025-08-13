from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, Union, Literal
from urllib.parse import urlparse
from src.agent.model import BaseAgentConfig

class SqliteCheckpointConfig(BaseModel):
    """Configuration for SQLite checkpointer."""
    type: Literal["sqlite"]
    db_url: str

    @field_validator('db_url')
    @classmethod
    def db_url_must_be_sqlite(cls, v: str) -> str:
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
            return path.lstrip('/')
        return path

# A discriminated union for different checkpointer types.
CheckpointConfig = Union[SqliteCheckpointConfig]


class LangGraphAgentConfig(BaseAgentConfig):
    """
    Configuration model for LangGraph agents.
    This model validates the 'config' block for an agent of type 'langgraph'.
    """
    graph_definition: str
    checkpointer: Optional[CheckpointConfig] = None
    store: Optional[Dict[str, Any]] = None  # Placeholder for store config


