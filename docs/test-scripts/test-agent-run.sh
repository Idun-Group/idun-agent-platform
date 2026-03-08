#!/usr/bin/env bash
# Manual smoke test for /agent/run across all 4 agent types.
# Requires agents running on: 8811 (LG chat), 8825 (LG structured), 8800 (ADK chat), 8830 (ADK structured)
set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0

check() {
  local label="$1" response="$2" pattern="$3"
  if echo "$response" | grep -qi "$pattern"; then
    echo -e "  ${GREEN}PASS${NC} $label"
    pass=$((pass + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label (expected '$pattern')"
    fail=$((fail + 1))
  fi
}

echo -e "${YELLOW}=== LangGraph Chat (8811) ===${NC}"
LG_CHAT=$(curl -s -X POST http://localhost:8811/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "hello, tell me 1+1"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$LG_CHAT" "RUN_STARTED"
check "TEXT_MESSAGE" "$LG_CHAT" "TEXT_MESSAGE"
check "RUN_FINISHED" "$LG_CHAT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== LangGraph Structured (8825) ===${NC}"
LG_STRUCT=$(curl -s -X POST http://localhost:8825/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {
      "request_id": "req-123",
      "objective": "Write a launch announcement",
      "context": {"product_name": "Idun Analytics"},
      "constraints": ["Keep it under 150 words"],
      "priority": "high"
    },
    "messages": [],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$LG_STRUCT" "RUN_STARTED"
check "STATE_SNAPSHOT" "$LG_STRUCT" "STATE_SNAPSHOT"
check "RUN_FINISHED" "$LG_STRUCT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== ADK Chat (8800) ===${NC}"
ADK_CHAT=$(curl -s -X POST http://localhost:8800/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "hello you"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$ADK_CHAT" "RUN_STARTED"
check "TEXT_MESSAGE" "$ADK_CHAT" "TEXT_MESSAGE"
check "RUN_FINISHED" "$ADK_CHAT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== ADK Structured (8830) ===${NC}"
ADK_STRUCT=$(curl -s -X POST http://localhost:8830/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "{\"request_id\":\"req-001\",\"objective\":\"Customer cannot log in\",\"category\":\"support\",\"priority\":\"high\"}"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$ADK_STRUCT" "RUN_STARTED"
check "RUN_FINISHED" "$ADK_STRUCT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== Capabilities Endpoints ===${NC}"
for port in 8811 8825 8800 8830; do
  CAPS=$(curl -s http://localhost:$port/agent/capabilities)
  if echo "$CAPS" | grep -q "framework"; then
    echo -e "  ${GREEN}PASS${NC} :$port /agent/capabilities"
    pass=$((pass + 1))
  else
    echo -e "  ${RED}FAIL${NC} :$port /agent/capabilities"
    fail=$((fail + 1))
  fi
done

echo ""
echo -e "────────────────────────"
echo -e "Results: ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}"
[ "$fail" -eq 0 ] && exit 0 || exit 1
