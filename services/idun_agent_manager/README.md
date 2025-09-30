# Idun Agent Manager Backend

A modern, state-of-the-art FastAPI backend for managing AI agents with PostgreSQL, SQLAlchemy 2.0, and comprehensive observability.

## Architecture

This application follows **hexagonal architecture** (ports and adapters) principles with a clear separation of concerns:

```
app/
├── api/v1/                 # FastAPI routers and HTTP interface
│   ├── routers/           # Endpoint handlers (fine-grained)
│   ├── schemas/           # Pydantic models for I/O
│   └── deps.py           # Dependency injection
├── domain/                # Pure business logic (no frameworks)
│   ├── agents/           # Agent entities and business rules
│   ├── tenants/          # Tenant entities and business rules
│   └── ...              # Other domains
├── application/           # Use cases and orchestration
│   ├── services/         # Application services
│   └── dto/             # Internal data transfer objects
├── infrastructure/       # External adapters
│   ├── db/              # Database layer (SQLAlchemy)
│   ├── http/            # HTTP clients (external APIs)
│   ├── cache/           # Caching layer (Redis)
│   └── auth/            # Authentication adapters
└── core/                # Shared utilities
    ├── settings.py      # Pydantic Settings v2
    ├── logging.py       # Structured logging
    └── errors.py        # RFC 9457 Problem+JSON
```

## Features

### 🏗️ **Modern Architecture**
- **Hexagonal Architecture** for clean separation of concerns
- **Domain-Driven Design** with rich domain entities
- **Dependency Injection** with FastAPI's DI system
- **Repository Pattern** with ports and adapters

### 🚀 **Technology Stack**
- **FastAPI** with async/await support
- **SQLAlchemy 2.0** with async sessions
- **PostgreSQL** with JSON support
- **Pydantic v2** for validation and settings
- **Alembic** for database migrations

### 🤖 **Agent Management**
- **Idun Engine SDK** integration for agent deployment
- **Traefik Gateway** dynamic route management
- **Container orchestration** for agent lifecycle
- **Multi-framework support** (LangGraph, CrewAI, AutoGen, Custom)
- **Real-time health monitoring** of deployed agents

### 📊 **Observability**
- **OpenTelemetry** tracing and metrics
- **Structured logging** with correlation IDs
- **Health checks** for readiness and liveness
- **Request ID tracking** throughout the stack
- **Agent deployment monitoring**

### 🔒 **Security & Standards**
- **OAuth2/OIDC** authentication support
- **Multi-tenant** architecture with tenant isolation
- **RFC 9457 Problem+JSON** error responses
- **Rate limiting** and request validation

### ⚡ **Performance**
- **Async I/O** throughout the stack
- **Connection pooling** for database
- **ORJSON** for fast JSON serialization
- **Redis** for caching and sessions
- **Load balancing** through Traefik Gateway

## Quick Start

### Prerequisites

- Docker 24.0+
- Docker Compose v2.0+
- Make (optional, but recommended)
- 8GB+ RAM recommended for full development environment

### Installation

1. **Clone and setup**:
```bash
cd services/idun_agent_manager
cp env.example .env
# Edit .env with your configuration (optional - defaults work for development)
```

2. **One-command setup** (recommended):
```bash
make quickstart
```

Or **step-by-step setup**:

3. **Build containers**:
```bash
make build
```

4. **Start services**:
```bash
make up
```

5. **Setup database**:
```bash
make migrate
```

6. **Start development server**:
```bash
make serve
```

### 🎉 **You're Ready!**

All services are now running in containers with:
- **Hot reload** - Code changes automatically restart the server
- **Database migrations** - Automatically applied
- **All dependencies** - Installed and cached in containers
- **Development tools** - Available via container shells

The services will be available at:
- **API Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/healthz
- **Traefik Dashboard**: http://localhost:8080

### 🛠️ **Development Workflow**

```bash
# Access container shell for development
make shell

# Watch logs
make logs-app

# Run tests
make test

# Format code
make format

# Reset everything
make dev-reset
```

## Configuration

The application uses **Pydantic Settings v2** with environment variable support:

### Environment Variables

```bash
# Core settings
ENVIRONMENT=development
DEBUG=true

# Database
DATABASE__URL=postgresql+asyncpg://user:pass@localhost/db
DATABASE__POOL_SIZE=10

# Authentication
AUTH__SECRET_KEY=your-secret-key-here
AUTH__OAUTH_CLIENT_ID=your-oauth-client-id

# Observability
OTEL__SERVICE_NAME=idun-agent-manager
OTEL__EXPORTER_ENDPOINT=http://jaeger:14268/api/traces
```

Nested configuration uses double underscores (`__`) as separators.

## API Endpoints

### Agents
- `POST /api/v1/agents/` - Create agent
- `GET /api/v1/agents/` - List agents (paginated)
- `GET /api/v1/agents/{id}` - Get agent details
- `PUT /api/v1/agents/{id}` - Update agent
- `DELETE /api/v1/agents/{id}` - Delete agent
- `POST /api/v1/agents/{id}/activate` - Activate agent (deploy + register route)
- `POST /api/v1/agents/{id}/deactivate` - Deactivate agent (undeploy + remove route)
- `POST /api/v1/agents/{id}/run` - Execute agent
- `GET /api/v1/agents/{id}/health` - Get agent health status

### Agent Runs
- `GET /api/v1/agents/{id}/runs` - List agent runs
- `GET /api/v1/agents/{id}/runs/{run_id}` - Get run details

### Health Checks
- `GET /healthz` - Health check
- `GET /readyz` - Readiness check
- `GET /version` - Version info

## Database Migrations

Using **Alembic** for database schema management:

```bash
# Using Make commands (recommended)
make migrate-auto msg="Add new feature"    # Generate automatic migration
make migrate                              # Apply all pending migrations
make migrate-down                         # Rollback last migration
make migrate-history                      # View migration history

# Using uv directly
uv run alembic revision --autogenerate -m "Add new feature"
uv run alembic upgrade head
uv run alembic downgrade -1
```

## Development

### Available Make Commands

Run `make help` to see all available commands. Here are the most commonly used ones:

#### **Environment Setup**
```bash
make setup          # Build and setup development environment (containerized)
make quickstart     # Complete setup: build, start services, run migrations, serve
make build          # Build Docker images
make rebuild        # Rebuild Docker images without cache
```

#### **Container Services**
```bash
make up             # Start all services (PostgreSQL, Redis, Traefik)
make down           # Stop all services
make restart        # Restart all services
make ps             # Show running containers
make stats          # Show live container resource statistics
```

#### **Development Server**
```bash
make serve          # Start development server (containerized with hot reload)
make serve-logs     # Start development server and follow logs
make stop-serve     # Stop development server
make restart-serve  # Restart development server
make logs-app       # Show application logs only
```

#### **Container Access**
```bash
make shell          # Open shell in CLI container (for running commands)
make shell-dev      # Open shell in development container
```

#### **Database Management**
```bash
make migrate        # Run database migrations (upgrade to head)
make migrate-auto   # Generate automatic migration (provide msg="description")
make migrate-manual # Create manual migration (provide msg="description")
make migrate-down   # Rollback last migration
make migrate-history # Show migration history
make clean-db       # Reset database (WARNING: deletes all data)
```

#### **Code Quality**
```bash
make lint           # Run linting with ruff
make lint-fix       # Run linting with auto-fix
make format         # Format code with black and ruff
make format-check   # Check if code is formatted correctly
make type-check     # Run type checking with mypy
make precommit      # Run all pre-commit hooks
make ci             # Run full CI pipeline (lint + type-check + test)
```

#### **Testing**
```bash
make test           # Run all tests
make test-cov       # Run tests with coverage report
make test-unit      # Run unit tests only
make test-integration # Run integration tests only
```

#### **Cleanup**
```bash
make clean          # Clean temporary files and caches
make clean-db       # Reset database (destroys all data)
```

#### **Development Workflows**
```bash
make dev-full       # Full development cycle: build, up, migrate, serve
make dev-reset      # Complete reset: down, clean, rebuild, up
```

### Examples

```bash
# Set up a new development environment
make quickstart

# Access container for development work
make shell

# Generate a new migration after model changes
make migrate-auto msg="add user permissions"

# Run code quality checks before committing
make ci

# Debug with logs
make logs-app

# Reset everything and start fresh
make dev-reset

# Check container status
make ps
make stats
```

## Production Deployment

### Docker

Build and run with Docker:

```bash
# Using Make commands (recommended for development)
make build             # Build Docker images
make up                # Start all services (PostgreSQL, Redis, Traefik, API)
make down              # Stop all services
make logs              # View service logs

# Production Docker commands
docker build -t idun-agent-manager .
docker run -p 8000:8000 \
  -e DATABASE__URL=postgresql+asyncpg://... \
  -e AUTH__SECRET_KEY=... \
  idun-agent-manager

# Or use production docker-compose (create separate docker-compose.prod.yml)
docker-compose -f docker-compose.prod.yml up -d
```

### Using Gunicorn

For production, use Gunicorn with Uvicorn workers:

```bash
# Using Make command (recommended)
make serve-prod        # Start production server with Gunicorn

# Manual command
uv run gunicorn app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Environment-specific Settings

```bash
# Production
ENVIRONMENT=production
WORKERS=4
DATABASE__POOL_SIZE=20
OTEL__LOG_FORMAT=json

# Staging
ENVIRONMENT=staging
DEBUG=false
DATABASE__ECHO=false
```

## Monitoring & Observability

### OpenTelemetry

The application is instrumented with OpenTelemetry for:
- **Traces**: Request flow and performance
- **Metrics**: Application and business metrics
- **Logs**: Structured logging with correlation

Configure exporters via environment variables:

```bash
OTEL__EXPORTER_ENDPOINT=http://jaeger:14268/api/traces
OTEL__EXPORTER_HEADERS=authorization=Bearer token
```

### Logging

Structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "message": "Agent created",
  "request_id": "uuid4-here",
  "user_id": "user123",
  "tenant_id": "tenant456",
  "trace_id": "trace123",
  "agent_id": "agent789"
}
```

### Health Checks

- `/healthz` - Basic health check
- `/readyz` - Readiness with database connectivity
- `/metrics` - Prometheus metrics (when enabled)

## Testing

```bash
# Using Make commands (containerized - recommended)
make test              # Run all tests inside container
make test-cov          # Run tests with coverage report (HTML + terminal)
make test-unit         # Run unit tests only
make test-integration  # Run integration tests only

# Manual container testing
make shell
uv run pytest
uv run pytest --cov=app --cov-report=html
```

## Development Tips

### 🐳 **Containerized Development Benefits**

- **Consistent Environment**: Everyone runs the same exact environment
- **No Local Dependencies**: No need to install Python, PostgreSQL, Redis locally
- **Easy Reset**: `make dev-reset` gives you a fresh environment
- **Hot Reload**: Code changes automatically restart the server
- **Persistent Data**: Database and Poetry cache persist across container restarts

### 🛠️ **Common Development Tasks**

```bash
# Start developing (first time)
make quickstart

# Daily development workflow
make serve              # Start dev server
make shell              # Access container shell
make test               # Run tests
make format             # Format code
make lint               # Check code quality

# When things go wrong
make logs-app           # Check application logs
make dev-reset          # Nuclear option: reset everything
make shell              # Debug inside container

# Code changes
make migrate-auto msg="description"  # Create migration
make format             # Format your code
make test               # Test your changes
make ci                 # Run full quality checks
```

### 📁 **Container Development Workflow**

1. **Code Outside**: Edit files with your favorite IDE on the host
2. **Run Inside**: All commands run inside containers via `make`
3. **Debug Inside**: Use `make shell` to access container environment
4. **Persist Data**: Volumes keep your database and Poetry cache

### 🔧 **Debugging Tips**

```bash
# Check what's running
make ps

# Resource usage
make stats

# Logs from all services
make logs

# Just app logs
make logs-app

# Container shell access
make shell              # CLI container (for commands)
make shell-dev         # Dev container (running the app)

# Reset specific services
make restart            # Restart all
make restart-serve     # Just restart app
```

## Contributing

1. Follow the established architecture patterns
2. Write tests for new features
3. Use conventional commits
4. Update documentation
5. Ensure all checks pass

## License

MIT License - see LICENSE file for details.
