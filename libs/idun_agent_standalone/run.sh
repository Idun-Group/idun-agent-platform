#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_DIR="$HOME/Desktop/code/work/idun-agent-template/langgraph-tool"

cd "$AGENT_DIR"
# get_langchain_tools() in the user's agent.py falls back to fetching
# from the Idun Manager API when neither the active MCP registry nor
# IDUN_CONFIG_PATH is set, which blocks indefinitely. Point it at the
# yaml so the fallback resolves cleanly.
export IDUN_CONFIG_PATH="$AGENT_DIR/my_agent.yaml"
uv --project "$REPO" run idun-standalone serve
