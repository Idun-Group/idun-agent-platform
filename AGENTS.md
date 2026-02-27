# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL | 5432 | Data store for Manager (run via `docker compose -f docker-compose.dev.yml up -d db`) |
| Manager (FastAPI) | 8000 | Backend API — auto-runs Alembic migrations on startup |
| Web UI (Vite/React) | 3000 | Admin dashboard — proxies `/api` to Manager |
| CopilotKit Runtime | 8001 | Optional — bridges CopilotKit clients to agents |

### Starting the dev stack

1. Start Docker daemon: `sudo dockerd &>/dev/null &` (wait ~3 seconds, then `sudo chmod 666 /var/run/docker.sock`)
2. Start PostgreSQL: `docker compose -f docker-compose.dev.yml up -d db` — wait for healthy status
3. Start Manager locally:
   ```
   DATABASE__URL="postgresql+asyncpg://postgres:postgres@localhost:5432/idun_agents" \
   AUTH__SECRET_KEY='$2b$12$6p5XpY.kO8qA4C9uG.k7u.' \
   AUTH__SESSION_SECRET='$2b$12$6p5XpY.kO8qA4C9uG.k7u.' \
   DEBUG=true ENVIRONMENT=development \
   uv run --project services/idun_agent_manager uvicorn app.main:app --reload --port 8000
   ```
4. Start Web UI: `cd services/idun_agent_web && npm run dev -- --host 0.0.0.0 --port 3000`

### Running tests and lints

See `CLAUDE.md` and `Makefile` for standard commands. Key notes:

- **Python lint**: `make lint` (Ruff) — runs cleanly.
- **Frontend lint**: `npm run lint` in `services/idun_agent_web` — has pre-existing ESLint warnings/errors in the codebase; these are not regressions.
- **Engine unit tests**: Run from the engine directory: `cd libs/idun_agent_engine && uv run pytest tests/unit/ -q -x`. The engine has its own venv and `pyproject.toml` with separate markers.
- **Avoid guardrail tests** (`tests/unit/server/routers/agent/guardrails/`) in CI — they download large ML models and can hang for minutes.
- **Root-level `make test`** collects tests from both engine and manager, but marker/conftest mismatches cause collection errors. Prefer running per-project.

### Gotchas

- The `copilot_runtime` npm install requires `--legacy-peer-deps` due to `@ag-ui/langgraph` peer dependency conflicts.
- The Manager uses `--project services/idun_agent_manager` with `uv run` so it uses the manager's own venv, not the root workspace venv.
- The `.env` file is `.gitignore`'d. You must create it from `.env.example` with valid `DATABASE__URL`, `AUTH__SECRET_KEY`, and `AUTH__SESSION_SECRET` values for local runs.
- The Manager auto-runs Alembic migrations on startup — no separate migration step needed.
