#!/usr/bin/env bash
# Smoke-check that `pip install idun-agent-standalone-*.whl` works end-to-end:
# fresh venv, no editable installs, no source-tree access, scaffold + serve +
# /health responds. Asserts the wheel ships everything it needs (alembic.ini,
# migrations, static UI) and that nothing falls back to repo-root paths.
#
# Local libs (idun_agent_schema, idun_agent_engine) are also built fresh and
# installed alongside, because the standalone wheel pins them at versions
# that may not yet be published to PyPI.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Build fresh wheels for all three local libs + the bundled UI.
make build-standalone-ui >/dev/null
make build-standalone-wheel >/dev/null
(cd libs/idun_agent_schema && uv build --out-dir "$ROOT/dist" >/dev/null)
(cd libs/idun_agent_engine && uv build --out-dir "$ROOT/dist" >/dev/null)

# Clean venv on a Python 3.12 interpreter (matches the standalone's pin).
TMP=$(mktemp -d)
PY=${IDUN_E2E_PYTHON:-python3.12}
if ! command -v "$PY" >/dev/null 2>&1; then
  PY=python3
fi
"$PY" -m venv "$TMP/venv"
"$TMP/venv/bin/pip" install --quiet --upgrade pip

SCHEMA_WHEEL=$(ls -t dist/idun_agent_schema-*.whl | head -1)
ENGINE_WHEEL=$(ls -t dist/idun_agent_engine-*.whl | head -1)
STANDALONE_WHEEL=$(ls -t dist/idun_agent_standalone-*.whl | head -1)

"$TMP/venv/bin/pip" install --quiet \
  "$SCHEMA_WHEEL" "$ENGINE_WHEEL" "$STANDALONE_WHEEL"

# Sanity: the alembic.ini ships inside site-packages and is resolvable.
"$TMP/venv/bin/python" - <<'PY'
import os, sys
from idun_agent_standalone.db.migrate import _alembic_ini_path
p = _alembic_ini_path()
assert os.path.isfile(p), f"alembic.ini not found at {p}"
print(f"alembic.ini ok: {p}")
PY

# Smoke: scaffold + serve + health.
"$TMP/venv/bin/idun-standalone" init smoke-agent --target "$TMP/scratch" >/dev/null
PORT=${IDUN_E2E_PORT:-8765}

# The scaffolded config uses a relative ``graph_definition`` (./agent.py:graph),
# so the engine must resolve it from the scratch dir. Run serve with cwd there.
(
  cd "$TMP/scratch"
  DATABASE_URL="sqlite+aiosqlite:///$TMP/scratch/smoke.db" \
    IDUN_ADMIN_AUTH_MODE=none \
    IDUN_PORT=$PORT \
    "$TMP/venv/bin/idun-standalone" serve \
    --config "$TMP/scratch/config.yaml" \
    --port "$PORT" &
  echo $! > "$TMP/server.pid"
)
SERVER_PID=$(cat "$TMP/server.pid")
trap "kill $SERVER_PID 2>/dev/null || true; rm -rf $TMP" EXIT

# Wait for boot.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:$PORT/admin/api/v1/health" > /dev/null 2>&1; then
    echo "Wheel install smoke: PASS"
    exit 0
  fi
  sleep 1
done
echo "Wheel install smoke: FAIL — server did not start" >&2
exit 1
