# Development Setup

## Quick Start

Start the development environment with hot reload:

```bash
docker compose -f compose.dev.yaml up --build
```

This will:
- Start PostgreSQL on port `55432` (host) / `5432` (container)
- Start Idun Agent Manager on port `8000`
- Mount local code for hot reload (both manager and schema)

## What's Mounted

The dev setup mounts:
- `services/idun_agent_manager/src` → `/app/src` (manager code)
- `services/idun_agent_manager/alembic` → `/app/alembic` (migrations)
- `libs/idun_agent_schema` → `/schema` (schema package)

## Hot Reload

Changes to either the **manager** or **schema** code will trigger automatic reload:
- Edit `services/idun_agent_manager/src/**/*.py` → manager reloads
- Edit `libs/idun_agent_schema/src/**/*.py` → manager reloads (schema is editable)

## Access

- **Manager API**: http://localhost:8000
- **Manager Docs**: http://localhost:8000/docs
- **PostgreSQL**: `postgresql://postgres:postgres@localhost:55432/idun_agents`

## Logs

View logs:
```bash
docker compose -f compose.dev.yaml logs -f manager
```

## Stop

```bash
docker compose -f compose.dev.yaml down
```

Keep data:
```bash
docker compose -f compose.dev.yaml down  # keeps volumes
```

Remove data:
```bash
docker compose -f compose.dev.yaml down -v  # removes volumes
```

## Troubleshooting

### Schema not updating
If schema changes aren't reflected, rebuild:
```bash
docker compose -f compose.dev.yaml up --build
```

### Database connection issues
Check the database is healthy:
```bash
docker compose -f compose.dev.yaml ps
```

### Reset everything
```bash
docker compose -f compose.dev.yaml down -v
docker compose -f compose.dev.yaml up --build
```

## Generating Agent Manager API types for the frontend

When you change any Pydantic schema in `libs/idun_agent_schema`, regenerate the
OpenAPI payload and TypeScript models used by the web app:

```bash
# From repo root
uv run python scripts/export_manager_openapi.py
uv run python scripts/generate_manager_types.py
```

The first command writes `services/idun_agent_web/schema/manager-openapi.json`
directly from the local FastAPI app. The second command shells into the web app
and runs `openapi-typescript` to refresh
`services/idun_agent_web/src/generated/agent-manager.ts`. Commit both outputs so
other environments (including Docker images) stay in sync.
