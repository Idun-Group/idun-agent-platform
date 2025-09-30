"""Prune orphan FKs/indexes related to removed tables.

Safe to run multiple times. Drops only if present.
"""

from sqlalchemy import text

from app.infrastructure.db.session import get_sync_engine


DROP_STATEMENTS = [
    # Indexes on removed tables
    "DROP INDEX IF EXISTS ix_deployments_agent_id",
    "DROP INDEX IF EXISTS ix_deployments_managed_engine_id",
    "DROP INDEX IF EXISTS ix_deployments_tenant_id",
    "DROP INDEX IF EXISTS ix_deployments_workspace_id",
    "DROP INDEX IF EXISTS ix_deployment_config_managed_engine_id",
    "DROP INDEX IF EXISTS ix_deployment_config_tenant_id",
    "DROP INDEX IF EXISTS ix_deployment_config_workspace_id",
    "DROP INDEX IF EXISTS ix_retriever_config_managed_engine_id",
    "DROP INDEX IF EXISTS ix_retriever_config_tenant_id",
    "DROP INDEX IF EXISTS ix_retriever_config_workspace_id",
    "DROP INDEX IF EXISTS ix_artifacts_deployment_id",
    "DROP INDEX IF EXISTS ix_artifacts_tenant_id",
    "DROP INDEX IF EXISTS ix_artifacts_workspace_id",
    # Constraints on remaining tables that could have referenced removed tables (defensive)
    "ALTER TABLE IF EXISTS agent_config DROP CONSTRAINT IF EXISTS fk_agent_config_deployment",
    "ALTER TABLE IF EXISTS agent_config DROP CONSTRAINT IF EXISTS fk_agent_config_deployments",
    "ALTER TABLE IF EXISTS managed_agent DROP CONSTRAINT IF EXISTS fk_managed_agent_deployments",
    "ALTER TABLE IF EXISTS managed_agent DROP CONSTRAINT IF EXISTS fk_managed_agent_deployment_config",
    "ALTER TABLE IF EXISTS gateway_routes DROP CONSTRAINT IF EXISTS fk_gateway_routes_deployments",
]


def main() -> None:
    engine = get_sync_engine()
    with engine.begin() as conn:
        for stmt in DROP_STATEMENTS:
            conn.execute(text(stmt))


if __name__ == "__main__":
    main()


