#!/usr/bin/env bash
# Boot a standalone server for E2E without dirtying the source tree.
#
# Builds the Next.js UI into a temp dir, points IDUN_UI_DIR at it,
# generates a minimal echo-agent module + config inline, runs migrations
# + seed via `idun-standalone setup`, then execs `idun-standalone serve`
# in the foreground so signal-forwarding (Ctrl-C, Playwright shutdown)
# works normally. The temp dir is cleaned up on exit.
#
# Override the port with $E2E_PORT (default 8001). The repo's existing
# dev workflow uses 8000, so we deliberately default to a different
# port to avoid clashing with a hand-launched local server.
#
# Configuration is fully env-var driven — the standalone CLI's `serve`
# command no longer accepts flags (simplified in the post-rework branch).
set -euo pipefail

# Real-LLM e2e: select provider + model. Defaults preserve the existing
# echo-agent path when these vars aren't set. The spawned standalone
# subprocess reads E2E_PROVIDER / E2E_MODEL via the agent fixtures.
LLM_PROVIDER="${LLM_PROVIDER:-}"
LLM_MODEL="${LLM_MODEL:-}"
if [[ -n "$LLM_PROVIDER" ]]; then
  export E2E_PROVIDER="$LLM_PROVIDER"
  export E2E_MODEL="$LLM_MODEL"
fi

# Force AI Studio (GEMINI_API_KEY / GOOGLE_API_KEY) auth — host
# .env files that export GOOGLE_GENAI_USE_VERTEXAI=TRUE would
# otherwise route ChatGoogleGenerativeAI through Vertex ADC.
export GOOGLE_GENAI_USE_VERTEXAI=false

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${E2E_PORT:-8001}"
TMPDIR_E2E="$(mktemp -d -t idun-e2e-XXXXXX)"
DBFILE="$TMPDIR_E2E/standalone.db"
UIDIR="$TMPDIR_E2E/ui"
AGENT_FILE="$TMPDIR_E2E/echo_agent.py"
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
# Mirror the ``build-standalone-ui`` Make target: rename the build-time
# ``__trace__`` placeholder directory to ``_shell`` so the trace detail
# SPA-rewrite route resolves to the renamed file (instead of the legacy
# fallback) AND ``/admin/traces/__trace__/`` is no longer publicly
# reachable as a static asset. Without this, the trailing-slash e2e
# test would pass against the legacy fallback rather than the renamed
# shell, masking the placeholder-rename regression.
if [[ -d "$ROOT/services/idun_agent_standalone_ui/out/admin/traces/__trace__" ]]; then
  mv "$ROOT/services/idun_agent_standalone_ui/out/admin/traces/__trace__" \
     "$ROOT/services/idun_agent_standalone_ui/out/admin/traces/_shell"
fi
mkdir -p "$UIDIR"
cp -R "$ROOT/services/idun_agent_standalone_ui/out/." "$UIDIR/"

# Agent module: real LLM if LLM_PROVIDER is set, otherwise inline echo.
# Both live in the temp dir so the engine resolves the absolute path via
# importlib.util.spec_from_file_location — no PYTHONPATH games, no
# permanent test fixture in the package.
if [[ -n "$LLM_PROVIDER" ]]; then
  # Reuse the canonical real-LLM fixture used by the pytest e2e matrix.
  # That module reads E2E_PROVIDER / E2E_MODEL at import time (already
  # exported above) and exposes the same `graph` symbol the YAML below
  # references. Without this swap the chat-real-llm spec would pass
  # against echo and the UI gate against real-LLM streaming would be
  # vacuous (CodeRabbit flagged this on PR #580).
  echo "[boot] real-LLM mode (provider=$LLM_PROVIDER model=$LLM_MODEL)" >&2
  cp "$ROOT/tests/e2e/fixtures/agents/agent_lg_chat.py" "$AGENT_FILE"
else
  echo "[boot] echo-agent mode (no LLM_PROVIDER set)" >&2
  cat > "$AGENT_FILE" <<'PY'
"""Minimal LangGraph echo agent for E2E tests.

Uses LangChain message types + `add_messages` reducer so the engine's
AG-UI adapter can stream the response (the chat UI hydrates its
assistant bubble from MESSAGES_SNAPSHOT events).
"""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]


def _echo(state: State) -> State:
    last_user = ""
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage):
            last_user = msg.content if isinstance(msg.content, str) else ""
            break
    return {"messages": [AIMessage(content=f"echo: {last_user}")]}


_builder = StateGraph(State)
_builder.add_node("echo", _echo)
_builder.set_entry_point("echo")
_builder.add_edge("echo", END)
graph = _builder.compile()
PY
fi

# Inline config — points at the temp-dir agent file. The engine's
# LangGraph adapter resolves "/abs/path/to/file.py:varname" via
# importlib.util.spec_from_file_location, so absolute paths Just Work.
cat > "$CONFIG" <<YAML
agent:
  type: LANGGRAPH
  config:
    name: e2e-echo
    graph_definition: $AGENT_FILE:graph
    checkpointer:
      type: memory
YAML

echo "[boot] running idun setup (migrations + seed)" >&2

# `setup` creates the SQLite schema and seeds the agent row from the
# config YAML. Without this, `serve` would boot but every admin call
# would hit "no such table" against an empty DB.
IDUN_PORT="$PORT" \
  IDUN_HOST=127.0.0.1 \
  IDUN_ADMIN_AUTH_MODE=none \
  IDUN_UI_DIR="$UIDIR" \
  IDUN_CONFIG_PATH="$CONFIG" \
  DATABASE_URL="sqlite+aiosqlite:///$DBFILE" \
  uv run --project "$ROOT" idun setup --config "$CONFIG"

echo "[boot] starting idun on 127.0.0.1:$PORT" >&2

# `serve` reads everything from env vars (IDUN_PORT, IDUN_HOST,
# IDUN_ADMIN_AUTH_MODE, IDUN_UI_DIR, IDUN_CONFIG_PATH, DATABASE_URL).
# The CLI accepts no flags — the simplified surface lives in
# libs/idun_agent_standalone/src/idun_agent_standalone/cli.py.
IDUN_PORT="$PORT" \
  IDUN_HOST=127.0.0.1 \
  IDUN_ADMIN_AUTH_MODE=none \
  IDUN_UI_DIR="$UIDIR" \
  IDUN_CONFIG_PATH="$CONFIG" \
  DATABASE_URL="sqlite+aiosqlite:///$DBFILE" \
  uv run --project "$ROOT" idun serve &
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
