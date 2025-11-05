# REST API Reference

## Overview

HTTP REST API documentation with OpenAPI specifications and endpoint details.

## Base URL

```
https://api.idun.platform/v1
```

## Authentication

API requests require authentication using API keys or OAuth tokens.

## Endpoints

### Agents

#### GET /agents

List all agents with pagination and filtering options.

#### POST /agents

Create a new agent with the provided configuration.

#### GET /agents/{id}

Retrieve details for a specific agent by ID.

#### PUT /agents/{id}

Update an existing agent configuration.

#### DELETE /agents/{id}

Delete an agent and its associated resources.

### Executions

Execute agents and retrieve execution results.

## OpenAPI Specification

The complete OpenAPI specification is available for import into API tools and client generation.

## Rate Limits

API rate limits and usage quotas are enforced per authentication key.
