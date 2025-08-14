import sqlite3
import json
from typing import List, Optional
from idun_agent_manager.models.agent_models import Agent

DATABASE_URL = "agents.db"


def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_db():
    """Creates the agents table if it doesn't already exist."""
    conn = get_db_connection()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                framework_type TEXT NOT NULL,
                config TEXT,
                llm_config TEXT,
                tools TEXT
            )
        """
        )
    conn.close()


def _row_to_agent(row: sqlite3.Row) -> Agent:
    """Converts a database row into an Agent Pydantic model."""
    return Agent(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        framework_type=row["framework_type"],
        config=json.loads(row["config"]) if row["config"] else {},
        llm_config=json.loads(row["llm_config"]) if row["llm_config"] else {},
        tools=json.loads(row["tools"]) if row["tools"] else [],
    )


def create_agent_in_db(agent: Agent) -> Agent:
    """Stores a new agent in the SQLite database."""
    conn = get_db_connection()
    with conn:
        try:
            conn.execute(
                """
                INSERT INTO agents (id, name, description, framework_type, config, llm_config, tools)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent.id,
                    agent.name,
                    agent.description,
                    agent.framework_type,
                    json.dumps(agent.config),
                    json.dumps(agent.llm_config),
                    json.dumps([t.model_dump() for t in agent.tools]),
                ),
            )
        except sqlite3.IntegrityError:
            raise ValueError(f"Agent with ID {agent.id} already exists.")
    conn.close()
    return agent


def get_agent_from_db(agent_id: str) -> Optional[Agent]:
    """Retrieves a single agent from the database by its ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    conn.close()
    return _row_to_agent(row) if row else None


def list_agents_from_db() -> List[Agent]:
    """Lists all agents stored in the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM agents").fetchall()
    conn.close()
    return [_row_to_agent(row) for row in rows]


def delete_agent_from_db(agent_id: str) -> bool:
    """Deletes an agent from the database by its ID. Returns True if successful."""
    conn = get_db_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        deleted = cursor.rowcount > 0
    conn.close()
    return deleted
