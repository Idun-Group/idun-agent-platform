#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="$(dirname "$0")/../docker-compose.dev.yml"
SERVICE="agent-manager-dev"

echo "Applying Alembic migrations to head..."
docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" uv run alembic upgrade head
echo "✅ Migration complete"
