"""
Test that branch migrations apply cleanly on top of develop's schema + data.

Spins up a temporary PostgreSQL container, applies develop's migrations
(up to 4e21ee5d39eb), seeds realistic data, then applies the 3 new
branch migrations and validates the result.

Usage:
    uv run pytest services/idun_agent_manager/tests/test_migration_upgrade.py -v -s

Requires:
    - Docker running locally
    - Port 15432 available (used for the ephemeral Postgres)
"""

import subprocess
import time
from uuid import uuid4

import psycopg
import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CONTAINER_NAME = "idun-migration-test"
PG_PORT = 15432
PG_USER = "postgres"
PG_PASS = "postgres"
PG_DB = "migration_test"
DSN = f"postgresql+psycopg://{PG_USER}:{PG_PASS}@localhost:{PG_PORT}/{PG_DB}"
RAW_DSN = f"postgresql://{PG_USER}:{PG_PASS}@localhost:{PG_PORT}/{PG_DB}"

DEVELOP_HEAD = "4e21ee5d39eb"  # develop's current head revision
BRANCH_HEAD = "b5c6d7e8f9a0"  # our branch's head revision

MANAGER_DIR = "services/idun_agent_manager"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def pg_container():
    """Start a fresh Postgres 16 container for migration testing."""
    # Clean up any leftover container
    subprocess.run(
        ["docker", "rm", "-f", CONTAINER_NAME],
        capture_output=True,
    )

    # Start container
    subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            CONTAINER_NAME,
            "-e",
            f"POSTGRES_USER={PG_USER}",
            "-e",
            f"POSTGRES_PASSWORD={PG_PASS}",
            "-e",
            f"POSTGRES_DB={PG_DB}",
            "-p",
            f"{PG_PORT}:5432",
            "postgres:16",
        ],
        check=True,
    )

    # Wait for Postgres to be ready
    for _ in range(30):
        try:
            with psycopg.connect(RAW_DSN) as conn:
                conn.execute("SELECT 1")
            break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError("PostgreSQL did not become ready in 30s")

    yield

    # Cleanup
    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)


def _run_alembic(target: str, env_override: dict | None = None):
    """Run alembic upgrade to a specific revision."""
    env = {
        "DATABASE__URL": DSN.replace("+psycopg", "+asyncpg"),
        "AUTH__SECRET_KEY": "test-secret-key",
    }
    if env_override:
        env.update(env_override)

    import os

    full_env = {**os.environ, **env}

    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", target],
        cwd=MANAGER_DIR,
        capture_output=True,
        text=True,
        env=full_env,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Alembic upgrade to {target} failed:\n"
            f"STDOUT: {result.stdout}\n"
            f"STDERR: {result.stderr}"
        )
    return result


def _sql(query: str, params: tuple = ()):
    """Execute a SQL query against the test database."""
    with psycopg.connect(RAW_DSN) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(query, params)
            try:
                return cur.fetchall()
            except psycopg.ProgrammingError:
                return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestMigrationUpgrade:
    """Test that branch migrations apply on top of develop's schema + seeded data."""

    def test_01_apply_develop_migrations(self, pg_container):
        """Apply all migrations up to develop's head."""
        _run_alembic(DEVELOP_HEAD)

        # Verify alembic_version table shows develop head
        rows = _sql("SELECT version_num FROM alembic_version")
        assert rows is not None
        assert len(rows) == 1
        assert rows[0][0] == DEVELOP_HEAD

    def test_02_seed_realistic_data(self, pg_container):
        """Seed the database with realistic data that a develop deployment would have."""
        # Create users
        user1_id = str(uuid4())
        user2_id = str(uuid4())
        user3_id = str(uuid4())

        for uid, email, name in [
            (user1_id, "alice@company.com", "Alice"),
            (user2_id, "bob@company.com", "Bob"),
            (user3_id, "charlie@company.com", "Charlie"),
        ]:
            _sql(
                """
                INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                """,
                (uid, email, name, "$2b$12$fakehashvalue"),
            )

        # Create workspaces
        ws1_id = str(uuid4())
        ws2_id = str(uuid4())

        _sql(
            "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (%s, %s, %s, NOW(), NOW())",
            (ws1_id, "Engineering", "engineering"),
        )
        _sql(
            "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (%s, %s, %s, NOW(), NOW())",
            (ws2_id, "Marketing", "marketing"),
        )

        # Create memberships (all as "admin" — develop doesn't have "owner" yet)
        for uid, wid, role in [
            (user1_id, ws1_id, "admin"),   # Alice is admin of Engineering
            (user2_id, ws1_id, "member"),   # Bob is member of Engineering
            (user1_id, ws2_id, "admin"),    # Alice is admin of Marketing too
            (user3_id, ws2_id, "admin"),    # Charlie is admin of Marketing
        ]:
            _sql(
                """
                INSERT INTO memberships (id, user_id, workspace_id, role, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW() - INTERVAL '1 day' * random(), NOW())
                """,
                (str(uuid4()), uid, wid, role),
            )

        # Create a managed agent (to verify unrelated tables aren't broken)
        _sql(
            """
            INSERT INTO managed_agents (id, name, status, config_hash, created_at, updated_at)
            VALUES (%s, %s, 'active', %s, NOW(), NOW())
            """,
            (str(uuid4()), "test-agent", "abc123"),
        )

        # Verify seed data
        user_count = _sql("SELECT COUNT(*) FROM users")[0][0]
        ws_count = _sql("SELECT COUNT(*) FROM workspaces")[0][0]
        membership_count = _sql("SELECT COUNT(*) FROM memberships")[0][0]

        assert user_count == 3
        assert ws_count == 2
        assert membership_count == 4

    def test_03_apply_migration_promote_owners(self, pg_container):
        """Migration 1: Promote first members to owner."""
        _run_alembic("8f9a1b2c3d4e")

        # Verify: each workspace should have exactly 1 owner
        owners = _sql(
            "SELECT workspace_id, COUNT(*) FROM memberships WHERE role = 'owner' GROUP BY workspace_id"
        )
        assert len(owners) == 2  # 2 workspaces
        for _, count in owners:
            assert count == 1

        # Verify: non-first members kept their original role
        non_owners = _sql("SELECT role FROM memberships WHERE role != 'owner'")
        for (role,) in non_owners:
            assert role in ("admin", "member")

    def test_04_apply_migration_invitations(self, pg_container):
        """Migration 2: Add workspace_invitations table."""
        _run_alembic("a2b3c4d5e6f7")

        # Verify table exists
        tables = _sql(
            "SELECT tablename FROM pg_tables WHERE tablename = 'workspace_invitations'"
        )
        assert len(tables) == 1

        # Verify indexes exist
        indexes = _sql(
            """
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'workspace_invitations'
            ORDER BY indexname
            """
        )
        index_names = [row[0] for row in indexes]
        assert "ix_workspace_invitations_email" in index_names
        assert "ix_workspace_invitations_workspace_id" in index_names

        # Verify we can insert an invitation
        ws_id = _sql("SELECT id FROM workspaces LIMIT 1")[0][0]
        user_id = _sql("SELECT id FROM users LIMIT 1")[0][0]
        _sql(
            """
            INSERT INTO workspace_invitations (id, workspace_id, email, role, invited_by, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (str(uuid4()), str(ws_id), "newuser@company.com", "member", str(user_id)),
        )

        # Verify unique constraint (same email + workspace)
        with pytest.raises(psycopg.errors.UniqueViolation):
            _sql(
                """
                INSERT INTO workspace_invitations (id, workspace_id, email, role, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                """,
                (str(uuid4()), str(ws_id), "newuser@company.com", "member"),
            )

    def test_05_apply_migration_default_workspace_id(self, pg_container):
        """Migration 3: Add default_workspace_id to users + backfill."""
        _run_alembic("b5c6d7e8f9a0")

        # Verify column exists
        cols = _sql(
            """
            SELECT column_name, is_nullable, data_type
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'default_workspace_id'
            """
        )
        assert len(cols) == 1
        assert cols[0][1] == "YES"  # nullable
        assert cols[0][2] == "uuid"

        # Verify index exists
        indexes = _sql(
            "SELECT indexname FROM pg_indexes WHERE indexname = 'ix_users_default_workspace_id'"
        )
        assert len(indexes) == 1

        # Verify backfill: all users with memberships should have default_workspace_id set
        users_with_memberships = _sql(
            """
            SELECT u.email, u.default_workspace_id
            FROM users u
            WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
            """
        )
        for email, default_ws_id in users_with_memberships:
            assert default_ws_id is not None, f"User {email} should have default_workspace_id set"

        # Verify FK constraint works (set to invalid UUID should fail)
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            _sql(
                "UPDATE users SET default_workspace_id = %s WHERE email = %s",
                (str(uuid4()), "alice@company.com"),
            )

    def test_06_verify_final_state(self, pg_container):
        """Verify the final schema is correct and all data is intact."""
        # Verify alembic version is at branch head
        rows = _sql("SELECT version_num FROM alembic_version")
        assert rows[0][0] == BRANCH_HEAD

        # Verify no data was lost
        assert _sql("SELECT COUNT(*) FROM users")[0][0] == 3
        assert _sql("SELECT COUNT(*) FROM workspaces")[0][0] == 2
        assert _sql("SELECT COUNT(*) FROM memberships")[0][0] == 4
        assert _sql("SELECT COUNT(*) FROM managed_agents")[0][0] == 1

        # Verify FK on default_workspace_id: ON DELETE SET NULL
        # Get a workspace that is someone's default
        result = _sql(
            """
            SELECT u.id, u.default_workspace_id
            FROM users u
            WHERE u.default_workspace_id IS NOT NULL
            LIMIT 1
            """
        )
        if result:
            user_id, ws_id = result[0]

            # Delete that workspace — should SET NULL on user, CASCADE on memberships
            _sql("DELETE FROM workspace_invitations WHERE workspace_id = %s", (str(ws_id),))
            _sql("DELETE FROM memberships WHERE workspace_id = %s", (str(ws_id),))
            _sql("DELETE FROM workspaces WHERE id = %s", (str(ws_id),))

            # User's default_workspace_id should now be NULL
            updated = _sql(
                "SELECT default_workspace_id FROM users WHERE id = %s", (str(user_id),)
            )
            assert updated[0][0] is None, "ON DELETE SET NULL should have cleared default_workspace_id"

    def test_07_downgrade_works(self, pg_container):
        """Verify downgrade back to develop head works cleanly."""
        import os

        env = {
            **os.environ,
            "DATABASE__URL": DSN.replace("+psycopg", "+asyncpg"),
            "AUTH__SECRET_KEY": "test-secret-key",
        }

        result = subprocess.run(
            ["uv", "run", "alembic", "downgrade", DEVELOP_HEAD],
            cwd=MANAGER_DIR,
            capture_output=True,
            text=True,
            env=env,
        )
        assert result.returncode == 0, f"Downgrade failed:\n{result.stderr}"

        # Verify we're back at develop head
        rows = _sql("SELECT version_num FROM alembic_version")
        assert rows[0][0] == DEVELOP_HEAD

        # Verify workspace_invitations table is gone
        tables = _sql(
            "SELECT tablename FROM pg_tables WHERE tablename = 'workspace_invitations'"
        )
        assert len(tables) == 0

        # Verify default_workspace_id column is gone
        cols = _sql(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'default_workspace_id'
            """
        )
        assert len(cols) == 0

        # Verify all owner roles reverted to admin
        owners = _sql("SELECT COUNT(*) FROM memberships WHERE role = 'owner'")
        assert owners[0][0] == 0

        # Data should still be intact (minus the workspace we deleted in test_06)
        assert _sql("SELECT COUNT(*) FROM users")[0][0] == 3
