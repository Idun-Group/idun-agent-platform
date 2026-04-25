#!/usr/bin/env bash
# Boot a standalone server for E2E. Caller is responsible for stopping
# the process; we exec uvicorn so signal-forwarding works.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
cat >"$TMP/config.yaml" <<'EOF'
agent:
  type: LANGGRAPH
  config:
    name: E2E Echo
    graph_definition: idun_agent_standalone.testing:echo_graph
    checkpointer:
      type: memory
EOF

# Build the UI once so / serves the SPA. The Make target lives at the repo root
# and copies services/idun_agent_standalone_ui/out into the standalone wheel.
( cd "$ROOT" && make build-standalone-ui >/dev/null )

export DATABASE_URL="sqlite+aiosqlite:///$TMP/idun.db"
export IDUN_CONFIG_PATH="$TMP/config.yaml"
export IDUN_PORT="${IDUN_PORT:-8000}"
export IDUN_HOST="0.0.0.0"
export IDUN_ADMIN_AUTH_MODE="none"

# Use the editable install from the workspace.
cd "$ROOT"
exec uv run idun-standalone serve
