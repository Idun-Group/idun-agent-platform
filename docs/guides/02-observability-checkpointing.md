# Guide 2: Observability and Checkpointing

## Overview

This guide demonstrates how to configure observability features and enable checkpointing for agent execution.

## Manual Setup

### Observability Configuration

Add observability settings to your config.yaml for comprehensive monitoring and logging.

```yaml
observability:
  enabled: true
  # Observability settings
```

### Checkpointing Setup

Enable checkpointing to save agent state and enable recovery from failures.

```yaml
checkpointing:
  enabled: true
  # Checkpoint configuration
```

## Integration

Connect observability tools and configure checkpoint storage backends.

## Testing

Verify observability data collection and test checkpoint recovery mechanisms.

## Best Practices

Recommendations for optimal observability and checkpointing configuration in production.
