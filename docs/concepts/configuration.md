# Configuration

## Overview

Agent configuration is defined in YAML files that specify behavior, dependencies, and runtime parameters.

## config.yaml Structure

The configuration file defines all aspects of your agent including framework selection, model parameters, and deployment settings.

```yaml
name: my-agent
framework: langgraph
...
```

## Configuration Options

Configuration options include observability, guardrails, port..

## Environment-Specific Configuration

Support for multiple environments with environment-specific overrides and secrets management.

## Validation

Configuration files are validated against the Idun schema to ensure correctness before deployment.
