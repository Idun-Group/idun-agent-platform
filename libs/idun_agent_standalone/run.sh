#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_DIR="$HOME/Desktop/code/work/idun-agent-template/langgraph-tool"

cd "$AGENT_DIR"
IDUN_CONFIG_PATH="$AGENT_DIR/my_agent.yaml" uv --project "$REPO" run idun-standalone serve
