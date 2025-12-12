# CLI Setup

This guide explains how to run the Idun Agent Engine from the command line in either standalone or managed mode.

**Time to complete:** ~10 minutes.

## Prerequisites

- Python 3.12+
- `pip install idun-agent-engine`

## Standalone mode (local YAML)

```bash
idun agent serve --source file --path ./config.yaml
```

## Managed mode (fetch config from Manager)

Set these environment variables:

```bash
export IDUN_MANAGER_HOST="http://localhost:8080"
export IDUN_AGENT_API_KEY="YOUR_AGENT_API_KEY"
```

Then run:

```bash
idun agent serve --source manager
```

## Next steps

- [Getting started](../getting-started/quickstart.md)
- [Configuration reference](../mcp/configuration.md)
