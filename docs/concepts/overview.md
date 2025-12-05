# Overview

## Introduction

Idun Agent Platform is a comprehensive framework designed to simplify the development and deployment of AI agents across multiple frameworks. The platform solves the fragmentation problem in the AI agent ecosystem where each framework (LangGraph, Haystack, ADK) has its own deployment patterns, observability solutions, and operational requirements.

By providing a unified abstraction layer, Idun enables developers to work with different agent frameworks through a consistent interface, making it easy to build, deploy, and manage production-ready AI agents without framework lock-in.

## Platform Goals

### Simplify Development

Work with one interface across multiple agent frameworks. Write your agent in LangGraph, Haystack, or ADK, and deploy it using the same configuration format, API structure, and tooling. No need to learn framework-specific deployment patterns.

### Production Safety

Built-in observability and guardrails ensure your agents are production-ready from day one. Track LLM costs and performance with Langfuse or Phoenix, block harmful content with guardrails, and monitor everything through a unified interface.

### Flexible Deployment

Start locally for development with SQLite checkpointing, then scale to production with PostgreSQL and multiple engine instances—all using the same configuration. Future support for Idun Cloud will provide managed hosting with zero infrastructure management.

### Framework Interoperability

Switch between agent frameworks without rewriting your infrastructure. The unified configuration and API layer means changing from LangGraph to ADK only requires updating your agent code and configuration—not your deployment pipeline, monitoring, or management tools.

## Core Concepts

### Unified Abstraction Layer

The platform provides a single API across all supported frameworks (LangGraph, Haystack, ADK). Whether you're using stateful graphs, document pipelines, or cloud-native agents, you interact with them through the same REST endpoints (`/agent/invoke`, `/agent/stream`) and manage them with the same CLI commands and web dashboard.

This abstraction is achieved through framework-specific adapters that translate between the platform's unified interface and each framework's native API, ensuring consistency without sacrificing framework-specific capabilities.

### Configuration-Driven Setup

All agent configuration is declarative, defined in YAML files. Specify your agent type, framework settings, observability providers, guardrails, and MCP servers in one file. The engine handles initialization, setup, and lifecycle management automatically.

Environment variable substitution (`${VAR_NAME}`) keeps secrets out of version control while maintaining reproducible configurations across development, staging, and production environments.

### Built-in Safety and Observability

Observability and guardrails are first-class features, not afterthoughts. Configure multiple observability providers simultaneously (Langfuse for cost tracking, Phoenix for debugging, GCP for production monitoring) and layer guardrails for defense in depth (ban lists, PII detection, NSFW filtering)—all through the same YAML configuration.

## The Three Main Components

### Idun Agent Engine

**Role:** Runtime execution layer that loads and runs your AI agents.

**Responsibilities:**
- Load and initialize agents from LangGraph, Haystack, or ADK code
- Execute agent requests via unified REST API (invoke/stream modes)
- Manage framework adapters for translation to native APIs
- Attach observability handlers for tracing and monitoring
- Validate inputs and outputs via guardrails
- Provide FastAPI-based REST API with streaming support

**Key Features:**
- **Multi-Framework Support**: Run any supported framework through one interface
- **Checkpointing**: Persist conversation state across requests (LangGraph, ADK)
- **Event Streaming**: Real-time execution events for responsive UIs
- **MCP Server Integration**: Extend agent capabilities with Model Context Protocol servers

**Deployment:** Install with `pip install idun-agent-engine`, then run `idun agent serve --source=file --path=./config.yaml`

### Idun Agent Manager

**Role:** Control plane for agent lifecycle management and centralized configuration.

**Responsibilities:**
- Agent CRUD operations (create, read, update, delete via REST API)
- Configuration storage in PostgreSQL database
- API key generation and authentication
- Multi-tenant agent hosting
- Deployment coordination across engine instances

**Key Features:**
- **REST API**: Complete HTTP API for programmatic agent management
- **Web Dashboard**: Visual interface for creating and monitoring agents
- **CLI Interface**: Command-line tools for scripting and automation
- **Multi-Tenant Support**: Host multiple agents with isolated configurations and API keys

**Deployment:** The Manager service is optional—you can run agents directly with the Engine for simpler deployments, or use the Manager for centralized control of multiple agents.

### Idun Agent Schema

**Role:** Shared data models and validation schemas used by both Engine and Manager.

**Responsibilities:**
- Configuration schemas (EngineConfig, AgentConfig, ObservabilityConfig, etc.)
- API request/response models for Engine and Manager endpoints
- Type definitions for Python type checking
- Validation rules enforced via Pydantic

**Key Features:**
- **Pydantic Validation**: Runtime validation ensures configs are correct before execution
- **Type Safety**: Full type hints for IDE support and static analysis
- **JSON Serialization**: Seamless conversion between Python objects and JSON
- **OpenAPI Generation**: Automatic API documentation from schemas

## Key Workflows

### Agent Creation Workflow

1. **Define Agent Code**: Write your agent in LangGraph, Haystack, or ADK
2. **Create Configuration**: Define agent type, framework settings, observability, and guardrails in `config.yaml`
3. **Register with Manager** (Optional): POST to Manager API to store configuration centrally
4. **Deploy Engine**: Run Engine with config file or API key
5. **Agent Serves Requests**: Engine provides REST API at `/agent/invoke` and `/agent/stream`

### Configuration Pipeline

1. **Write YAML Config**: Define all agent settings in declarative format
2. **Environment Variable Substitution**: `${VAR_NAME}` replaced with actual values at runtime
3. **Schema Validation**: Pydantic validates configuration against schemas
4. **Configuration Loading**: Engine resolves config from file, dict, or Manager API
5. **Agent Initialization**: Framework-specific components initialized (checkpointers, handlers, etc.)

### Runtime Execution Flow

1. **Client Sends Request**: HTTP POST to `/agent/invoke` or `/agent/stream`
2. **Authentication**: API key validation if using Manager
3. **Input Guardrail Validation**: Check request against configured input guardrails
4. **Agent Invocation**: Route to appropriate framework adapter and execute
5. **Output Guardrail Validation**: Check response against configured output guardrails
6. **Response with Observability**: Return result with trace IDs for monitoring

## Supported Frameworks

**LangGraph** - Stateful multi-actor workflows with cycles, branching, and persistence. Ideal for complex conversational agents requiring graph-based execution patterns.

**Haystack** - Document search and retrieval-augmented generation (RAG) pipelines. Perfect for question-answering systems that need to search knowledge bases.

**ADK (Agent Development Kit)** - Google Cloud-native agents with built-in session management and memory services. Best for enterprise deployments on Google Cloud Platform.

## Built-in Features

**Observability Providers:**
- Langfuse (LLM cost tracking and performance metrics)
- Phoenix (OpenTelemetry-based ML observability)
- GCP Logging (Cloud Logging integration)
- GCP Trace (distributed tracing with sampling)
- LangSmith (LangChain ecosystem monitoring)

**Guardrails Validators:**
- Ban List (block specific keywords/phrases)
- PII Detection (detect email, phone, SSN, etc.)
- NSFW Filter (inappropriate content detection)

**MCP Servers:**
- Filesystem access
- Web search (Brave, Google)
- Database connections
- Git repositories
- Custom integrations

**Checkpointing:**
- SQLite (local development, file-based)
- PostgreSQL (production, multi-process)
- In-Memory (stateless testing)

**Deployment Options:**
- Local CLI (`idun agent serve`)
- Self-hosted infrastructure (coming soon)
- Idun Cloud managed platform (planned)

## Getting Started Paths

### For Developers (Engine-First Approach)

Quick path for running a single agent locally:

1. Install the engine: `pip install idun-agent-engine`
2. Write your agent code in LangGraph, Haystack, or ADK
3. Create a `config.yaml` file with agent configuration
4. Run the agent: `idun agent serve --source=file --path=./config.yaml`
5. Your agent is now available at `http://localhost:8000`

### For Operations (Manager-First Approach)

Centralized management of multiple agents:

1. Deploy the Manager service (PostgreSQL + REST API)
2. Create agents via Manager API or web dashboard
3. Generate API keys for each agent
4. Deploy Engine instances configured to fetch from Manager
5. Engines serve agent requests using Manager-provided configs

### For Framework Migration

Switching between frameworks without infrastructure changes:

1. Choose your target framework (LangGraph, Haystack, or ADK)
2. Adapt your agent code to the new framework's API
3. Update `config.yaml` to change the agent type
4. Redeploy with the same infrastructure—observability, guardrails, and deployment remain unchanged

## Next Steps

- [Quick Start →](../quickstart.md) - Build your first agent in minutes
- [Basic Configuration →](../guides/01-basic-configuration.md) - Learn configuration fundamentals
- [CLI Setup →](../guides/03-cli-setup.md) - Master the CLI
