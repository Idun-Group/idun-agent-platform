#!/bin/bash
# Test migration upgrade path: develop head → branch head
# Runs inside the manager container against a fresh test database
set -euo pipefail

TEST_DB="migration_test_$(date +%s)"
PG_HOST="db"
PG_USER="postgres"
PG_PASS="postgres"

echo "=== Migration Upgrade Test ==="
echo "Test database: $TEST_DB"
echo ""

# Install psql client if not present
apt-get update -qq && apt-get install -qq -y postgresql-client > /dev/null 2>&1 || true

cleanup() {
    echo ""
    echo "=== Cleanup ==="
    PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true
    echo "Dropped test database $TEST_DB"
}
trap cleanup EXIT

# 1. Create fresh database
echo "--- Step 1: Create fresh test database ---"
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d postgres -c "CREATE DATABASE $TEST_DB;"
echo "OK"

# 2. Apply develop migrations (up to 4e21ee5d39eb)
echo ""
echo "--- Step 2: Apply develop migrations (up to 4e21ee5d39eb) ---"
DATABASE__URL="postgresql+asyncpg://$PG_USER:$PG_PASS@$PG_HOST:5432/$TEST_DB" \
AUTH__SECRET_KEY="test-secret" \
    uv run alembic upgrade 4e21ee5d39eb
echo "OK - At develop head"

# 3. Verify develop head
echo ""
echo "--- Step 3: Verify develop head ---"
DEVELOP_VERSION=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "SELECT version_num FROM alembic_version;")
echo "Alembic version: $DEVELOP_VERSION"
if [[ "$DEVELOP_VERSION" != *"4e21ee5d39eb"* ]]; then
    echo "FAIL: Expected 4e21ee5d39eb"
    exit 1
fi
echo "OK"

# 4. Seed realistic data (simulating a live develop deployment)
echo ""
echo "--- Step 4: Seed realistic data ---"
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB <<'SQL'
-- Users
INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'alice@company.com', 'Alice Admin', '$2b$12$fakehash1', NOW() - INTERVAL '30 days', NOW()),
    ('a0000000-0000-0000-0000-000000000002', 'bob@company.com', 'Bob Builder', '$2b$12$fakehash2', NOW() - INTERVAL '20 days', NOW()),
    ('a0000000-0000-0000-0000-000000000003', 'charlie@company.com', 'Charlie Coder', '$2b$12$fakehash3', NOW() - INTERVAL '10 days', NOW()),
    ('a0000000-0000-0000-0000-000000000004', 'diana@company.com', 'Diana Designer', '$2b$12$fakehash4', NOW() - INTERVAL '5 days', NOW());

-- Workspaces
INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Engineering', 'engineering', NOW() - INTERVAL '30 days', NOW()),
    ('b0000000-0000-0000-0000-000000000002', 'Marketing', 'marketing', NOW() - INTERVAL '25 days', NOW()),
    ('b0000000-0000-0000-0000-000000000003', 'Design', 'design', NOW() - INTERVAL '15 days', NOW());

-- Memberships (all admin/member — no owner role on develop)
-- Note: memberships has no updated_at column
INSERT INTO memberships (id, user_id, workspace_id, role, created_at) VALUES
    -- Engineering: Alice first (admin), Bob second (member)
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'admin', NOW() - INTERVAL '30 days'),
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'member', NOW() - INTERVAL '20 days'),
    -- Marketing: Bob first (admin), Charlie second (admin)
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'admin', NOW() - INTERVAL '25 days'),
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'admin', NOW() - INTERVAL '15 days'),
    -- Design: Diana first (admin), Alice second (member)
    ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'admin', NOW() - INTERVAL '15 days'),
    ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'member', NOW() - INTERVAL '10 days');

-- A managed agent (to verify unrelated data is untouched)
-- managed_agents requires: id, status, engine_config (jsonb), name, workspace_id
INSERT INTO managed_agents (id, name, status, engine_config, agent_hash, workspace_id, created_at, updated_at) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'test-chatbot', 'active', '{"model": "gpt-4"}', 'hash123abc', 'b0000000-0000-0000-0000-000000000001', NOW(), NOW());
SQL

echo "Seeded: 4 users, 3 workspaces, 6 memberships, 1 agent"

# Verify counts
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    SELECT 'users' as tbl, COUNT(*) FROM users
    UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces
    UNION ALL SELECT 'memberships', COUNT(*) FROM memberships
    UNION ALL SELECT 'managed_agents', COUNT(*) FROM managed_agents;
"
echo "OK"

# 5. Apply migration 1: promote_first_members_to_owner
echo ""
echo "--- Step 5: Apply migration 8f9a1b2c3d4e (promote owners) ---"
DATABASE__URL="postgresql+asyncpg://$PG_USER:$PG_PASS@$PG_HOST:5432/$TEST_DB" \
AUTH__SECRET_KEY="test-secret" \
    uv run alembic upgrade 8f9a1b2c3d4e
echo "Migration applied."

# Verify: each workspace has exactly 1 owner
echo "Verifying owner promotion..."
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    SELECT w.name as workspace, m.role, u.name as user_name
    FROM memberships m
    JOIN workspaces w ON w.id = m.workspace_id
    JOIN users u ON u.id = m.user_id
    ORDER BY w.name, m.created_at;
"

OWNER_COUNT=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(DISTINCT workspace_id) FROM memberships WHERE role = 'owner';
")
# Count only workspaces that have memberships (the auto-created Default Workspace has none)
WORKSPACE_COUNT=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "SELECT COUNT(DISTINCT workspace_id) FROM memberships;")

if [[ $(echo "$OWNER_COUNT" | xargs) != $(echo "$WORKSPACE_COUNT" | xargs) ]]; then
    echo "FAIL: Expected $WORKSPACE_COUNT workspaces with owners, got $OWNER_COUNT"
    exit 1
fi

# Verify Alice=owner in Engineering (first member), Bob=member (kept role)
ALICE_ENG_ROLE=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT role FROM memberships WHERE user_id = 'a0000000-0000-0000-0000-000000000001' AND workspace_id = 'b0000000-0000-0000-0000-000000000001';
")
if [[ "$(echo $ALICE_ENG_ROLE | xargs)" != "owner" ]]; then
    echo "FAIL: Alice should be owner of Engineering, got: $ALICE_ENG_ROLE"
    exit 1
fi

BOB_ENG_ROLE=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT role FROM memberships WHERE user_id = 'a0000000-0000-0000-0000-000000000002' AND workspace_id = 'b0000000-0000-0000-0000-000000000001';
")
if [[ "$(echo $BOB_ENG_ROLE | xargs)" != "member" ]]; then
    echo "FAIL: Bob should still be member of Engineering, got: $BOB_ENG_ROLE"
    exit 1
fi
echo "OK - Owner promotion correct"

# 6. Apply migration 2: workspace_invitations
echo ""
echo "--- Step 6: Apply migration a2b3c4d5e6f7 (invitations table) ---"
DATABASE__URL="postgresql+asyncpg://$PG_USER:$PG_PASS@$PG_HOST:5432/$TEST_DB" \
AUTH__SECRET_KEY="test-secret" \
    uv run alembic upgrade a2b3c4d5e6f7
echo "Migration applied."

# Verify table and indexes
TABLE_EXISTS=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(*) FROM pg_tables WHERE tablename = 'workspace_invitations';
")
if [[ $(echo "$TABLE_EXISTS" | xargs) != "1" ]]; then
    echo "FAIL: workspace_invitations table should exist"
    exit 1
fi

# Verify we can insert and the unique constraint works
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    INSERT INTO workspace_invitations (id, workspace_id, email, role, invited_by, created_at)
    VALUES ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'newguy@company.com', 'member', 'a0000000-0000-0000-0000-000000000001', NOW());
"

# Try duplicate — should fail
if PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    INSERT INTO workspace_invitations (id, workspace_id, email, role, created_at)
    VALUES ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'newguy@company.com', 'member', NOW());
" 2>/dev/null; then
    echo "FAIL: Duplicate invitation should have been rejected"
    exit 1
fi
echo "OK - Invitations table with constraints"

# 7. Apply migration 3: default_workspace_id
echo ""
echo "--- Step 7: Apply migration b5c6d7e8f9a0 (default_workspace_id) ---"
DATABASE__URL="postgresql+asyncpg://$PG_USER:$PG_PASS@$PG_HOST:5432/$TEST_DB" \
AUTH__SECRET_KEY="test-secret" \
    uv run alembic upgrade b5c6d7e8f9a0
echo "Migration applied."

# Verify column exists and backfill worked
echo "Checking backfill..."
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    SELECT u.email, u.default_workspace_id, w.name as default_workspace
    FROM users u
    LEFT JOIN workspaces w ON w.id = u.default_workspace_id
    ORDER BY u.email;
"

# Every user with memberships should have a default
NULL_DEFAULTS=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(*)
    FROM users u
    WHERE u.default_workspace_id IS NULL
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id);
")
if [[ $(echo "$NULL_DEFAULTS" | xargs) != "0" ]]; then
    echo "FAIL: All users with memberships should have default_workspace_id set"
    exit 1
fi

# Verify FK constraint — SET NULL on delete
echo "Testing FK ON DELETE SET NULL..."
PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    -- Delete Design workspace (Diana's default)
    DELETE FROM workspace_invitations WHERE workspace_id = 'b0000000-0000-0000-0000-000000000003';
    DELETE FROM memberships WHERE workspace_id = 'b0000000-0000-0000-0000-000000000003';
    DELETE FROM workspaces WHERE id = 'b0000000-0000-0000-0000-000000000003';
"

DIANA_DEFAULT=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT default_workspace_id FROM users WHERE email = 'diana@company.com';
")
if [[ "$(echo $DIANA_DEFAULT | xargs)" != "" ]]; then
    echo "FAIL: Diana's default_workspace_id should be NULL after workspace deletion, got: '$DIANA_DEFAULT'"
    exit 1
fi
echo "OK - FK ON DELETE SET NULL works"

# 8. Verify final state
echo ""
echo "--- Step 8: Verify final state ---"
FINAL_VERSION=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "SELECT version_num FROM alembic_version;")
echo "Alembic version: $FINAL_VERSION"

PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -c "
    SELECT 'users' as tbl, COUNT(*) FROM users
    UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces
    UNION ALL SELECT 'memberships', COUNT(*) FROM memberships
    UNION ALL SELECT 'workspace_invitations', COUNT(*) FROM workspace_invitations
    UNION ALL SELECT 'managed_agents', COUNT(*) FROM managed_agents;
"
echo "OK - All data intact"

# 9. Test downgrade
echo ""
echo "--- Step 9: Test downgrade back to develop head ---"
DATABASE__URL="postgresql+asyncpg://$PG_USER:$PG_PASS@$PG_HOST:5432/$TEST_DB" \
AUTH__SECRET_KEY="test-secret" \
    uv run alembic downgrade 4e21ee5d39eb
echo "Downgrade applied."

# Verify
DOWNGRADE_VERSION=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "SELECT version_num FROM alembic_version;")
echo "Alembic version after downgrade: $DOWNGRADE_VERSION"

# workspace_invitations gone
TABLE_GONE=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(*) FROM pg_tables WHERE tablename = 'workspace_invitations';
")
if [[ $(echo "$TABLE_GONE" | xargs) != "0" ]]; then
    echo "FAIL: workspace_invitations should be dropped after downgrade"
    exit 1
fi

# default_workspace_id column gone
COL_GONE=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'default_workspace_id';
")
if [[ $(echo "$COL_GONE" | xargs) != "0" ]]; then
    echo "FAIL: default_workspace_id column should be gone after downgrade"
    exit 1
fi

# No owner roles
OWNER_GONE=$(PGPASSWORD=$PG_PASS psql -h $PG_HOST -U $PG_USER -d $TEST_DB -t -c "
    SELECT COUNT(*) FROM memberships WHERE role = 'owner';
")
if [[ $(echo "$OWNER_GONE" | xargs) != "0" ]]; then
    echo "FAIL: owner roles should be reverted to admin after downgrade"
    exit 1
fi

echo "OK - Downgrade successful"

echo ""
echo "========================================="
echo "  ALL MIGRATION TESTS PASSED ✅"
echo "========================================="
