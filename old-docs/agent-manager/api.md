# Agent Manager API

## Overview

The Agent Manager API provides programmatic access to all manager functionality.

## Authentication

All API requests must include authentication credentials in the request headers.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://manager.idun.local/api/agents
```

## Endpoints

### Agent Management

Create, read, update, and delete agent configurations through REST endpoints.

### Deployment Operations

Deploy agents, check deployment status, and manage rollbacks.

### Monitoring

Retrieve agent metrics, logs, and execution history.

## SDK Support

Official SDKs are available for Python, JavaScript, and Go.

## Webhooks

Configure webhooks to receive notifications about agent events and state changes.
