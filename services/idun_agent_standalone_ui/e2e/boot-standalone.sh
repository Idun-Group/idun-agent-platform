#!/usr/bin/env bash
# Boot a standalone server for E2E without dirtying the source tree.
#
# Builds the Next.js UI into a temp dir, points IDUN_UI_DIR at it,
# generates a minimal echo-agent config inline, and execs the server in
# the foreground so signal-forwarding (Ctrl-C, Playwright shutdown) works
# normally. The temp dir is cleaned up on exit.
#
# Override the port with $E2E_PORT (default 8001). The repo's existing
# dev workflow uses 8000, so we deliberately default to a different
# port to avoid clashing with a hand-launched local server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${E2E_PORT:-8001}"
TMPDIR_E2E="$(mktemp -d -t idun-e2e-XXXXXX)"
DBFILE="$TMPDIR_E2E/standalone.db"
UIDIR="$TMPDIR_E2E/ui"
CONFIG="$TMPDIR_E2E/config.yaml"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_E2E"
}
trap cleanup EXIT INT TERM

# Build the UI into a temp dir. Copying out/ keeps the repo tree clean —
# this is the bug the previous version of this script had (it called
# `make build-standalone-ui` which copies into libs/.../static/).
echo "[boot] building UI -> $UIDIR" >&2
( cd "$ROOT/services/idun_agent_standalone_ui" && pnpm build >/dev/null )
mkdir -p "$UIDIR"
cp -R "$ROOT/services/idun_agent_standalone_ui/out/." "$UIDIR/"

# Inline echo-agent config — points at the bundled echo_graph symbol so
# the new P1.3 MESSAGES_SNAPSHOT hydration assertion can run end-to-end
# without depending on a real LLM key.
cat > "$CONFIG" <<'YAML'
agent:
  type: LANGGRAPH
  config:
    name: e2e-echo
    graph_definition: idun_agent_standalone.testing:echo_graph
    checkpointer:
      type: memory
YAML

echo "[boot] starting idun-standalone on 127.0.0.1:$PORT" >&2

# Boot the server. Use the workspace project so the editable install of
# idun-standalone picks up local source changes. CLI flags are duplicated
# alongside env vars so either resolution path works.
IDUN_PORT="$PORT" \
  IDUN_HOST=127.0.0.1 \
  IDUN_ADMIN_AUTH_MODE=none \
  IDUN_UI_DIR="$UIDIR" \
  IDUN_CONFIG_PATH="$CONFIG" \
  DATABASE_URL="sqlite+aiosqlite:///$DBFILE" \
  uv run --project "$ROOT" idun-standalone serve \
    --port "$PORT" --host 127.0.0.1 --auth-mode none \
    --config "$CONFIG" \
    --database-url "sqlite+aiosqlite:///$DBFILE" &
SERVER_PID=$!

# Block until /health returns 200. Playwright's webServer integration
# also waits for the URL, but failing fast here gives a clearer log when
# the server can't even start.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "[boot] ready on 127.0.0.1:$PORT" >&2
    wait "$SERVER_PID"
    exit $?
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[boot] server exited before becoming healthy" >&2
    exit 1
  fi
  sleep 1
done

echo "[boot] timed out waiting for /health on :$PORT" >&2
exit 1
