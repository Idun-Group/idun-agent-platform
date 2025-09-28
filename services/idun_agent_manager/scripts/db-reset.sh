#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="$(dirname "$0")/../docker-compose.dev.yml"
SERVICE="agent-manager-dev"

echo "Resetting database (downgrade base → upgrade head)..."
docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" sh -lc 'uv run alembic downgrade base && uv run alembic upgrade head'
echo "✅ Database reset complete"
