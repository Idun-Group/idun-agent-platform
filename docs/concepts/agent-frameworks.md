# Agent Frameworks

## Overview

Idun Agent Platform supports multiple agent frameworks through a unified abstraction layer.

## Framework Management

Each framework is managed through dedicated adapters that translate between the framework's native API and Idun's standard interface.

## Supported Frameworks

The platform currently supports several popular agent frameworks with more being added regularly.

### Haystack

Integration with Haystack provides support for retrieval-augmented generation and document processing pipelines.

### LangGraph

LangGraph integration enables stateful agent workflows with complex graph-based execution patterns.

### Additional Frameworks

Support for additional frameworks can be added through the plugin system.

## Framework Selection

Modify the config.yaml file with the appropriate framework based on your use case, existing infrastructure, features...

## Next Steps

- [Basic Configuration Guide →](../guides/01-basic-configuration.md) - Set up your first agent
- [CLI Setup Guide →](../guides/03-cli-setup.md) - Learn CLI commands for running agents
- [Configuration Reference →](../reference/configuration.md) - Detailed configuration options for each framework
