# CLI Reference

## Overview

Complete command-line interface reference for the Idun CLI tool.

## Installation

Install the CLI tool using pip or download pre-built binaries.

```bash
pip install idun-cli
```

## Global Options

Options that apply to all CLI commands.

```bash
idun --help
idun --version
```

## Commands

### idun run

Execute an agent from configuration.

```bash
idun run <agent-name>
```

### idun config

Manage agent configurations.

```bash
idun config get <agent-name>
idun config set <agent-name> <config-file>
```

### idun deploy

Deploy agents to production environments.

```bash
idun deploy <agent-name>
```

### idun logs

View agent execution logs.

```bash
idun logs <agent-name>
```

## Environment Variables

CLI behavior can be customized using environment variables.
