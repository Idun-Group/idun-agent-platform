"""Idempotent database seeding utilities.

Run with:
  uv run python -m app.infrastructure.db.seed
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy import MetaData, Table, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.infrastructure.db.session import get_async_engine


def _stable_uuid5(name: str) -> uuid.UUID:
    """Generate a stable UUID5 for seed entities."""
    return uuid.uuid5(uuid.NAMESPACE_URL, f"idun-agent-manager:{name}")


async def _reflect_tables(conn: AsyncConnection) -> dict[str, Table]:
    """Reflect required tables into SQLAlchemy Table objects."""
    metadata = MetaData()

    def _reflect(sync_conn):
        metadata.reflect(
            bind=sync_conn,
            only=[
                "managed_agents",
                "managed_observabilities",
                "managed_mcp_servers",
                "managed_guardrails",
            ],
        )

    await conn.run_sync(_reflect)
    return {name: metadata.tables[name] for name in metadata.tables}


async def _get_or_create(
    conn: AsyncConnection,
    table: Table,
    lookup_where: Mapping[str, Any],
    create_values: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Fetch a row by lookup; if missing, insert and return it."""
    row = (
        (
            await conn.execute(
                select(table).where(*[table.c[k] == v for k, v in lookup_where.items()])
            )
        )
        .mappings()
        .first()
    )
    if row:
        return row

    stmt = insert(table).values(**create_values).returning(*table.c)
    row = (await conn.execute(stmt)).mappings().first()
    return row


async def seed() -> None:
    engine = get_async_engine()
    async with engine.begin() as conn:
        tables = await _reflect_tables(conn)

        managed_agents = tables["managed_agents"]
        managed_observabilities = tables["managed_observabilities"]
        managed_mcp_servers = tables["managed_mcp_servers"]
        managed_guardrails = tables["managed_guardrails"]

        # --- Seed a sample managed_agent ---
        agent_name = "Example Support Agent"
        agent_id = _stable_uuid5(f"agent:{agent_name}")
        await _get_or_create(
            conn,
            managed_agents,
            {"id": agent_id},
            {
                "id": agent_id,
                "name": agent_name,
                "status": "draft",
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "Example Support Agent",
                            "graph_definition": "example_agent.py:app",
                            "observability": {"enabled": False},
                        },
                    },
                },
                "agent_hash": "example_hash_123",
                "version": "1.0.0",
            },
        )

        # --- Seed observability config ---
        observability_name = "Default Langfuse Observability"
        observability_id = _stable_uuid5(f"observability:{observability_name}")
        await _get_or_create(
            conn,
            managed_observabilities,
            {"id": observability_id},
            {
                "id": observability_id,
                "name": observability_name,
                "observability_config": {
                    "provider": "LANGFUSE",
                    "enabled": True,
                    "config": {
                        "host": "https://cloud.langfuse.com",
                        "public_key": "pk_lf_example_key",
                        "secret_key": "sk_lf_example_secret",
                        "run_name": "example-agent",
                    },
                },
            },
        )

        # --- Seed MCP server config ---
        mcp_server_name = "File System MCP Server"
        mcp_server_id = _stable_uuid5(f"mcp_server:{mcp_server_name}")
        await _get_or_create(
            conn,
            managed_mcp_servers,
            {"id": mcp_server_id},
            {
                "id": mcp_server_id,
                "name": mcp_server_name,
                "mcp_server_config": {
                    "name": "filesystem",
                    "transport": "stdio",
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                },
            },
        )

        # --- Seed guardrails config ---
        guardrail_name = "Basic Content Guardrails"
        guardrail_id = _stable_uuid5(f"guardrail:{guardrail_name}")
        await _get_or_create(
            conn,
            managed_guardrails,
            {"id": guardrail_id},
            {
                "id": guardrail_id,
                "name": guardrail_name,
                "guardrail_config": {
                    "input": [
                        {"config_id": "ban_list", "banned_words": ["spam", "scam"]}
                    ],
                    "output": [{"config_id": "toxic_language", "threshold": 0.8}],
                },
            },
        )

        # Commit is implicit via engine.begin() transaction
        print(
            "✅ Seed completed: managed_agent 'Example Support Agent', observability 'Default Langfuse Observability', mcp_server 'File System MCP Server', guardrail 'Basic Content Guardrails'."
        )


if __name__ == "__main__":
    asyncio.run(seed())
