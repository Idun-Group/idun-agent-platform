#!/usr/bin/env bash
# check-wheel-metadata.sh — assert the engine wheel ships a valid
# bundling contract: idun CLI wired to standalone, standalone
# co-bundled, and idun-agent-schema declared as a runtime dep.
#
# Background: see idun-dev/tasks/before-release-11-05-2026/09-testpypi-metadata/FIX.md
# (L9-NEW2). PyPI's JSON API renders entry_points / requires_dist
# unreliably; the wheel itself is the canonical source. This guard
# locks the contract at build time so a future refactor cannot break
# the bundling silently.
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

WHEEL="${1:?usage: $0 <wheel-path>}"
if [[ ! -f "$WHEEL" ]]; then
  fail "wheel not found: $WHEEL"
fi

ERRLOG="$(mktemp)"
trap 'rm -f "$ERRLOG"' EXIT

# unzip exit codes we tolerate as "archive readable, content just empty":
#   11 = "no matching files were found" (pattern didn't match)
# Anything else from unzip means the archive itself is unreadable/corrupt.

# 1. entry_points.txt wires the idun CLI to standalone
rc=0
EP="$(unzip -p "$WHEEL" '*.dist-info/entry_points.txt' 2>"$ERRLOG")" || rc=$?
if [[ $rc -ne 0 && $rc -ne 11 ]]; then
  echo "unzip stderr:" >&2
  cat "$ERRLOG" >&2
  fail "cannot read entry_points.txt from $WHEEL (unzip exited $rc)"
fi
if ! grep -qE '^idun[[:space:]]*=[[:space:]]*idun_agent_standalone\.cli:main$' <<<"$EP"; then
  echo "got:" >&2
  echo "$EP" >&2
  fail "entry_points.txt missing 'idun = idun_agent_standalone.cli:main'"
fi

# 2. idun_agent_standalone is co-bundled in the wheel
rc=0
LISTING="$(unzip -l "$WHEEL" 2>"$ERRLOG")" || rc=$?
if [[ $rc -ne 0 ]]; then
  echo "unzip stderr:" >&2
  cat "$ERRLOG" >&2
  fail "cannot list contents of $WHEEL (unzip exited $rc)"
fi
if ! grep -q 'idun_agent_standalone/__init__\.py' <<<"$LISTING"; then
  fail "idun_agent_standalone/__init__.py not co-bundled in wheel"
fi

# 3. METADATA declares idun-agent-schema as a runtime dep
rc=0
METADATA="$(unzip -p "$WHEEL" '*.dist-info/METADATA' 2>"$ERRLOG")" || rc=$?
if [[ $rc -ne 0 && $rc -ne 11 ]]; then
  echo "unzip stderr:" >&2
  cat "$ERRLOG" >&2
  fail "cannot read METADATA from $WHEEL (unzip exited $rc)"
fi
if ! grep -qE '^Requires-Dist:[[:space:]]*idun-agent-schema' <<<"$METADATA"; then
  fail "METADATA missing 'Requires-Dist: idun-agent-schema'"
fi

echo "wheel metadata OK: $WHEEL"
