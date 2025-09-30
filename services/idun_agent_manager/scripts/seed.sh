#!/bin/sh
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.dev.yml"

# Ensure CLI is up
docker compose -f "$COMPOSE_FILE" up -d agent-manager-cli

echo "🌱 Seeding database..."
docker compose -f "$COMPOSE_FILE" exec -T agent-manager-cli uv run python -m app.infrastructure.db.seed
echo "✅ Seed complete"
