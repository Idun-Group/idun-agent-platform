# Agent Manager Quickstart

## Prerequisites

Ensure Docker and Docker Compose are installed on your system.

## Installation

Start the Agent Manager using the provided Docker Compose configuration.

```bash
docker-compose up -d agent-manager
```

## First Login

Access the web UI at `http://localhost:8080` and complete the initial setup.

## Create Your First Agent

Use the UI or CLI to create and deploy your first agent configuration.

```bash
idun manager create-agent --name my-agent --config config.yaml
```

## Verify Installation

Check that the agent is running and responding to requests.

```bash
idun manager status my-agent
```

## Next Steps

Explore the full capabilities of the manager in the detailed guides section.
