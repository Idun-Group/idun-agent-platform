"""Migrate embedded engine_config resources to relational references.

For each managed_agent, extracts embedded resource configs from the
engine_config JSONB and matches them to existing managed resource records.
If no match is found, auto-creates a managed resource. Then creates
FK/junction associations.

Revision ID: d3e4f5a6b7c8
Revises: c1d2e3f4a5b6
Create Date: 2026-03-07 00:02:00.000000+00:00

"""

import json
import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3e4f5a6b7c8"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def upgrade() -> None:
    conn = op.get_bind()

    agents = conn.execute(
        sa.text(
            "SELECT id, name, workspace_id, engine_config FROM managed_agents"
        )
    ).fetchall()

    for agent_id, agent_name, workspace_id, ec in agents:
        if not ec or not isinstance(ec, dict):
            continue

        # --- Memory / Checkpointer ---
        agent_section = ec.get("agent", {})
        agent_config = agent_section.get("config", {})
        framework = agent_section.get("type", "")

        checkpointer = None
        if framework in ("ADK",):
            checkpointer = agent_config.get("session_service") or agent_config.get(
                "sessionService"
            )
        else:
            checkpointer = agent_config.get("checkpointer")

        if checkpointer and checkpointer.get("type") not in ("memory", None):
            # Try to match existing managed memory
            mem_match = conn.execute(
                sa.text(
                    """SELECT id FROM managed_memories
                    WHERE workspace_id = :ws
                    AND memory_config @> CAST(:config AS jsonb)
                    LIMIT 1"""
                ),
                {
                    "ws": workspace_id,
                    "config": json.dumps(checkpointer),
                },
            ).scalar()

            if not mem_match:
                mem_match = str(uuid.uuid4())
                conn.execute(
                    sa.text(
                        """INSERT INTO managed_memories
                        (id, name, agent_framework, memory_config, workspace_id, created_at, updated_at)
                        VALUES (:id, :name, :fw, CAST(:config AS jsonb), :ws, :now, :now)"""
                    ),
                    {
                        "id": mem_match,
                        "name": f"auto-{checkpointer.get('type', 'memory')}-{agent_name}",
                        "fw": framework or "LANGGRAPH",
                        "config": json.dumps(checkpointer),
                        "ws": workspace_id,
                        "now": _now(),
                    },
                )

            conn.execute(
                sa.text(
                    "UPDATE managed_agents SET memory_id = :mid WHERE id = :aid"
                ),
                {"mid": str(mem_match), "aid": str(agent_id)},
            )

        # --- SSO ---
        sso = ec.get("sso")
        if sso and isinstance(sso, dict) and sso.get("issuer"):
            sso_match = conn.execute(
                sa.text(
                    """SELECT id FROM managed_ssos
                    WHERE workspace_id = :ws
                    AND sso_config->>'issuer' = :issuer
                    AND sso_config->>'client_id' = :cid
                    LIMIT 1"""
                ),
                {
                    "ws": workspace_id,
                    "issuer": sso.get("issuer", ""),
                    "cid": sso.get("client_id", sso.get("clientId", "")),
                },
            ).scalar()

            if not sso_match:
                sso_match = str(uuid.uuid4())
                conn.execute(
                    sa.text(
                        """INSERT INTO managed_ssos
                        (id, name, sso_config, workspace_id, created_at, updated_at)
                        VALUES (:id, :name, CAST(:config AS jsonb), :ws, :now, :now)"""
                    ),
                    {
                        "id": sso_match,
                        "name": f"auto-sso-{agent_name}",
                        "config": json.dumps(sso),
                        "ws": workspace_id,
                        "now": _now(),
                    },
                )

            conn.execute(
                sa.text(
                    "UPDATE managed_agents SET sso_id = :sid WHERE id = :aid"
                ),
                {"sid": str(sso_match), "aid": str(agent_id)},
            )

        # --- Guardrails ---
        guardrails = ec.get("guardrails", {})
        if isinstance(guardrails, dict):
            for position in ("input", "output"):
                guards = guardrails.get(position, [])
                if not isinstance(guards, list):
                    continue
                for sort_order, guard in enumerate(guards):
                    if not isinstance(guard, dict):
                        continue
                    config_id = guard.get("config_id", "")

                    guard_match = conn.execute(
                        sa.text(
                            """SELECT id FROM managed_guardrails
                            WHERE workspace_id = :ws
                            AND guardrail_config->>'config_id' = :cid
                            LIMIT 1"""
                        ),
                        {"ws": workspace_id, "cid": config_id},
                    ).scalar()

                    if not guard_match:
                        guard_match = str(uuid.uuid4())
                        conn.execute(
                            sa.text(
                                """INSERT INTO managed_guardrails
                                (id, name, guardrail_config, workspace_id, created_at, updated_at)
                                VALUES (:id, :name, CAST(:config AS jsonb), :ws, :now, :now)"""
                            ),
                            {
                                "id": guard_match,
                                "name": f"auto-{config_id}-{agent_name}",
                                "config": json.dumps(guard),
                                "ws": workspace_id,
                                "now": _now(),
                            },
                        )

                    # Avoid duplicate junction rows
                    existing = conn.execute(
                        sa.text(
                            """SELECT 1 FROM agent_guardrails
                            WHERE agent_id = :aid AND guardrail_id = :gid AND position = :pos"""
                        ),
                        {
                            "aid": str(agent_id),
                            "gid": str(guard_match),
                            "pos": position,
                        },
                    ).scalar()

                    if not existing:
                        conn.execute(
                            sa.text(
                                """INSERT INTO agent_guardrails
                                (id, agent_id, guardrail_id, position, sort_order, created_at)
                                VALUES (:id, :aid, :gid, :pos, :so, :now)"""
                            ),
                            {
                                "id": str(uuid.uuid4()),
                                "aid": str(agent_id),
                                "gid": str(guard_match),
                                "pos": position,
                                "so": sort_order,
                                "now": _now(),
                            },
                        )

        # --- MCP Servers ---
        mcp_servers = ec.get("mcp_servers") or ec.get("mcpServers") or []
        if isinstance(mcp_servers, list):
            for mcp in mcp_servers:
                if not isinstance(mcp, dict):
                    continue
                mcp_name = mcp.get("name", "")

                mcp_match = conn.execute(
                    sa.text(
                        """SELECT id FROM managed_mcp_servers
                        WHERE workspace_id = :ws AND name = :name
                        LIMIT 1"""
                    ),
                    {"ws": workspace_id, "name": mcp_name},
                ).scalar()

                if not mcp_match:
                    mcp_match = str(uuid.uuid4())
                    conn.execute(
                        sa.text(
                            """INSERT INTO managed_mcp_servers
                            (id, name, mcp_server_config, workspace_id, created_at, updated_at)
                            VALUES (:id, :name, CAST(:config AS jsonb), :ws, :now, :now)"""
                        ),
                        {
                            "id": mcp_match,
                            "name": mcp_name or f"auto-mcp-{agent_name}",
                            "config": json.dumps(mcp),
                            "ws": workspace_id,
                            "now": _now(),
                        },
                    )

                existing = conn.execute(
                    sa.text(
                        """SELECT 1 FROM agent_mcp_servers
                        WHERE agent_id = :aid AND mcp_server_id = :mid"""
                    ),
                    {"aid": str(agent_id), "mid": str(mcp_match)},
                ).scalar()

                if not existing:
                    conn.execute(
                        sa.text(
                            """INSERT INTO agent_mcp_servers
                            (id, agent_id, mcp_server_id, created_at)
                            VALUES (:id, :aid, :mid, :now)"""
                        ),
                        {
                            "id": str(uuid.uuid4()),
                            "aid": str(agent_id),
                            "mid": str(mcp_match),
                            "now": _now(),
                        },
                    )

        # --- Observability ---
        observability = ec.get("observability") or []
        if isinstance(observability, list):
            for obs in observability:
                if not isinstance(obs, dict):
                    continue
                provider = obs.get("provider", "")

                obs_match = conn.execute(
                    sa.text(
                        """SELECT id FROM managed_observabilities
                        WHERE workspace_id = :ws
                        AND observability_config->>'provider' = :prov
                        LIMIT 1"""
                    ),
                    {"ws": workspace_id, "prov": provider},
                ).scalar()

                if not obs_match:
                    obs_match = str(uuid.uuid4())
                    conn.execute(
                        sa.text(
                            """INSERT INTO managed_observabilities
                            (id, name, observability_config, workspace_id, created_at, updated_at)
                            VALUES (:id, :name, CAST(:config AS jsonb), :ws, :now, :now)"""
                        ),
                        {
                            "id": obs_match,
                            "name": f"auto-{provider}-{agent_name}",
                            "config": json.dumps(obs),
                            "ws": workspace_id,
                            "now": _now(),
                        },
                    )

                existing = conn.execute(
                    sa.text(
                        """SELECT 1 FROM agent_observabilities
                        WHERE agent_id = :aid AND observability_id = :oid"""
                    ),
                    {"aid": str(agent_id), "oid": str(obs_match)},
                ).scalar()

                if not existing:
                    conn.execute(
                        sa.text(
                            """INSERT INTO agent_observabilities
                            (id, agent_id, observability_id, created_at)
                            VALUES (:id, :aid, :oid, :now)"""
                        ),
                        {
                            "id": str(uuid.uuid4()),
                            "aid": str(agent_id),
                            "oid": str(obs_match),
                            "now": _now(),
                        },
                    )

        # --- Integrations ---
        integrations = ec.get("integrations") or []
        if isinstance(integrations, list):
            for integ in integrations:
                if not isinstance(integ, dict):
                    continue
                provider = integ.get("provider", "")

                int_match = conn.execute(
                    sa.text(
                        """SELECT id FROM managed_integrations
                        WHERE workspace_id = :ws
                        AND integration_config->>'provider' = :prov
                        LIMIT 1"""
                    ),
                    {"ws": workspace_id, "prov": provider},
                ).scalar()

                if not int_match:
                    int_match = str(uuid.uuid4())
                    conn.execute(
                        sa.text(
                            """INSERT INTO managed_integrations
                            (id, name, integration_config, workspace_id, created_at, updated_at)
                            VALUES (:id, :name, CAST(:config AS jsonb), :ws, :now, :now)"""
                        ),
                        {
                            "id": int_match,
                            "name": f"auto-{provider}-{agent_name}",
                            "config": json.dumps(integ),
                            "ws": workspace_id,
                            "now": _now(),
                        },
                    )

                existing = conn.execute(
                    sa.text(
                        """SELECT 1 FROM agent_integrations
                        WHERE agent_id = :aid AND integration_id = :iid"""
                    ),
                    {"aid": str(agent_id), "iid": str(int_match)},
                ).scalar()

                if not existing:
                    conn.execute(
                        sa.text(
                            """INSERT INTO agent_integrations
                            (id, agent_id, integration_id, created_at)
                            VALUES (:id, :aid, :iid, :now)"""
                        ),
                        {
                            "id": str(uuid.uuid4()),
                            "aid": str(agent_id),
                            "iid": str(int_match),
                            "now": _now(),
                        },
                    )


def downgrade() -> None:
    # Remove all junction rows and FK references
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM agent_guardrails"))
    conn.execute(sa.text("DELETE FROM agent_mcp_servers"))
    conn.execute(sa.text("DELETE FROM agent_observabilities"))
    conn.execute(sa.text("DELETE FROM agent_integrations"))
    conn.execute(
        sa.text("UPDATE managed_agents SET memory_id = NULL, sso_id = NULL")
    )
