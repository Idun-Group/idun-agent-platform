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
from app.infrastructure.auth.passwords import hash_password


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
                "tenants",
                "workspaces",
                "users",
                "tenant_users",
                "workspace_users",
                "managed_agents",
                "roles",
                "user_roles",
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

        tenants = tables["tenants"]
        workspaces = tables["workspaces"]
        users = tables["users"]
        tenant_users = tables["tenant_users"]
        workspace_users = tables["workspace_users"]
        managed_agents = tables["managed_agents"]
        roles = tables["roles"]
        user_roles = tables["user_roles"]

        # --- Seed tenant ---
        tenant_slug = "acme"
        tenant_id = _stable_uuid5(f"tenant:{tenant_slug}")
        tenant_row = await _get_or_create(
            conn,
            tenants,
            {"slug": tenant_slug},
            {
                "id": tenant_id,
                "name": "Acme Inc",
                "slug": tenant_slug,
                "plan": "free",
                "status": "active",
            },
        )

        # --- Seed workspaces ---
        ws_default_slug = "default"
        ws_dev_slug = "dev"
        ws_default_id = _stable_uuid5(f"workspace:{tenant_row['id']}:{ws_default_slug}")
        ws_dev_id = _stable_uuid5(f"workspace:{tenant_row['id']}:{ws_dev_slug}")

        ws_default = await _get_or_create(
            conn,
            workspaces,
            {"tenant_id": tenant_row["id"], "slug": ws_default_slug},
            {
                "id": ws_default_id,
                "tenant_id": tenant_row["id"],
                "name": "Default",
                "slug": ws_default_slug,
                "status": "active",
            },
        )

        ws_dev = await _get_or_create(
            conn,
            workspaces,
            {"tenant_id": tenant_row["id"], "slug": ws_dev_slug},
            {
                "id": ws_dev_id,
                "tenant_id": tenant_row["id"],
                "name": "Development",
                "slug": ws_dev_slug,
                "status": "active",
            },
        )

        # --- Seed user ---
        admin_email = "admin@acme.test"
        user_id = _stable_uuid5(f"user:{admin_email}")
        user_row = await _get_or_create(
            conn,
            users,
            {"email": admin_email},
            {
                "id": user_id,
                "email": admin_email,
                "name": "Acme Admin",
                "avatar_url": None,
                "password_hash": None,
            },
        )

        # --- Seed memberships (tenant_users, workspace_users) ---
        await _get_or_create(
            conn,
            tenant_users,
            {"tenant_id": tenant_row["id"], "user_id": user_row["id"]},
            {
                "id": _stable_uuid5(f"tenant_user:{tenant_row['id']}:{user_row['id']}"),
                "tenant_id": tenant_row["id"],
                "user_id": user_row["id"],
                # deprecated: role column kept nullable; use user_roles instead
            },
        )

        for ws in (ws_default, ws_dev):
            await _get_or_create(
                conn,
                workspace_users,
                {"workspace_id": ws["id"], "user_id": user_row["id"]},
                {"id": _stable_uuid5(f"workspace_user:{ws['id']}:{user_row['id']}"), "workspace_id": ws["id"], "user_id": user_row["id"]},
            )

        # --- Seed roles and grant admin to the seeded user ---
        admin_role = await _get_or_create(
            conn,
            roles,
            {"name": "admin"},
            {
                "id": _stable_uuid5("role:admin"),
                "name": "admin",
                "description": "Administrator",
            },
        )
        user_role = await _get_or_create(
            conn,
            roles,
            {"name": "user"},
            {
                "id": _stable_uuid5("role:user"),
                "name": "user",
                "description": "Standard user",
            },
        )

        await _get_or_create(
            conn,
            user_roles,
            {"user_id": user_row["id"], "role_id": admin_role["id"]},
            {
                "id": _stable_uuid5(f"user_role:{user_row['id']}:{admin_role['id']}"),
                "user_id": user_row["id"],
                "role_id": admin_role["id"],
            },
        )

        # --- Seed explicit basic admin account with password ---
        basic_admin_email = "admin@email.fr"
        basic_admin_id = _stable_uuid5(f"user:{basic_admin_email}")
        basic_admin = await _get_or_create(
            conn,
            users,
            {"email": basic_admin_email},
            {
                "id": basic_admin_id,
                "email": basic_admin_email,
                "name": "Basic Admin",
                "avatar_url": None,
                "password_hash": hash_password("admin"),
            },
        )
        # Ensure password_hash is set if user pre-existed
        if not basic_admin.get("password_hash"):
            await conn.execute(
                users.update()
                .where(users.c.id == basic_admin["id"])
                .values(password_hash=hash_password("admin"))
            )
            # reload
            basic_admin = (
                (
                    await conn.execute(
                        select(users).where(users.c.id == basic_admin["id"])
                    )
                )
                .mappings()
                .first()
            )
        # memberships
        await _get_or_create(
            conn,
            tenant_users,
            {"tenant_id": tenant_row["id"], "user_id": basic_admin["id"]},
            {
                "id": _stable_uuid5(f"tenant_user:{tenant_row['id']}:{basic_admin['id']}"),
                "tenant_id": tenant_row["id"],
                "user_id": basic_admin["id"],
                # deprecated: role column kept nullable; use user_roles instead
            },
        )
        for ws in (ws_default, ws_dev):
            await _get_or_create(
                conn,
                workspace_users,
                {"workspace_id": ws["id"], "user_id": basic_admin["id"]},
                {"id": _stable_uuid5(f"workspace_user:{ws['id']}:{basic_admin['id']}"), "workspace_id": ws["id"], "user_id": basic_admin["id"]},
            )
        # grant admin role
        await _get_or_create(
            conn,
            user_roles,
            {"user_id": basic_admin["id"], "role_id": admin_role["id"]},
            {
                "id": _stable_uuid5(f"user_role:{basic_admin['id']}:{admin_role['id']}"),
                "user_id": basic_admin["id"],
                "role_id": admin_role["id"],
            },
        )

        # --- Seed a sample managed_agent in default workspace ---
        agent_name = "Acme Support Agent"
        agent_id = _stable_uuid5(
            f"agent:{tenant_row['id']}:{ws_default['id']}:{agent_name}"
        )
        await _get_or_create(
            conn,
            managed_agents,
            {"id": agent_id},
            {
                "id": agent_id,
                "name": agent_name,
                "description": "Example agent for getting started.",
                "framework": "langgraph",
                "status": "draft",
                "config": {
                    "agent": {"type": "langgraph", "graph": {"nodes": [], "edges": []}},
                },
                "engine_config": {
                    "runtime": "langgraph",
                    "graph": {"nodes": [], "edges": []},
                },
                "run_config": {
                    "max_steps": 20,
                    "temperature": 0.2,
                },
                "tenant_id": tenant_row["id"],
                "workspace_id": ws_default["id"],
            },
        )

        # Commit is implicit via engine.begin() transaction
        print(
            "✅ Seed completed: tenant 'acme', workspaces ['default','dev'], user 'admin@acme.test' (admin), roles ['admin','user'], managed_agent 'Acme Support Agent'."
        )


if __name__ == "__main__":
    asyncio.run(seed())
