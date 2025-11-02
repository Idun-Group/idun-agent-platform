.PHONY: dev dev-manager test build-schema build-engine

dev:
	uv pip install -e libs/idun_agent_schema
	uv pip install -e libs/idun_agent_engine
	uv pip install -e services/idun_agent_manager

dev-manager:
	uv run --project services/idun_agent_manager uvicorn app.main:app --reload --port 8000

test:
	uv run pytest -q

build-schema:
	cd libs/idun_agent_schema && uv build --wheel

build-engine:
	cd libs/idun_agent_engine && uv build --wheel

lint:
	uv run ruff check . --no-cache

format:
	uv run black .
	uv run ruff format . --no-cache

mypy:
	uv run mypy libs/idun_agent_engine/src

pytest:
	uv run pytest

precommit:
	uv run pre-commit run --all-files

ci:
	make lint
	make mypy
	make pytest

docs-install:
	uv sync --group dev

docs-serve:
	uv run mkdocs serve -a localhost:8001

docs-build:
	uv run mkdocs build --clean

docs-deploy:
	uv run mkdocs gh-deploy --force

# Workspace installs using the root environment
sync:
	uv sync --all-groups

sync-manager:
	cd services/idun_agent_manager && uv sync --active --all-groups

sync-engine:
	cd libs/idun_agent_engine && uv sync --active --all-groups
