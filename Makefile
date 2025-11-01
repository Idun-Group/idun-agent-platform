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


install-dev:
	uv pip install -e libs/idun_agent_schema
	uv pip install -e libs/idun_agent_engine
	uv pip install -e services/idun_agent_manager
