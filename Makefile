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

# ─── Standalone UI ──────────────────────────────────────────────────────────────
.PHONY: build-standalone-ui clean-standalone-ui build-standalone-wheel build-standalone-all \
	test-standalone e2e-standalone ci-standalone

build-standalone-ui:
	cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile && pnpm build
	rm -rf libs/idun_agent_standalone/src/idun_agent_standalone/static
	cp -R services/idun_agent_standalone_ui/out libs/idun_agent_standalone/src/idun_agent_standalone/static

clean-standalone-ui:
	rm -rf services/idun_agent_standalone_ui/{node_modules,.next,out}
	rm -rf libs/idun_agent_standalone/src/idun_agent_standalone/static
	mkdir -p libs/idun_agent_standalone/src/idun_agent_standalone/static
	touch libs/idun_agent_standalone/src/idun_agent_standalone/static/.gitkeep

build-standalone-wheel:
	cd libs/idun_agent_standalone && uv build --out-dir $(CURDIR)/dist/

build-standalone-all: build-standalone-ui build-standalone-wheel

test-standalone:
	uv run pytest libs/idun_agent_standalone/tests -q

e2e-standalone:
	cd services/idun_agent_standalone_ui && pnpm test:e2e

# Aggregate gate matching the standalone CI workflow: lint+mypy on the
# Python side, the standalone unit/integration suite, plus the engine
# test slices the standalone touches (server reload, observers).
ci-standalone:
	uv run ruff check libs/idun_agent_standalone --no-cache
	uv run pytest libs/idun_agent_standalone/tests -q
	uv run pytest libs/idun_agent_engine/tests/integration/server libs/idun_agent_engine/tests/unit/agent/test_observers.py -q
