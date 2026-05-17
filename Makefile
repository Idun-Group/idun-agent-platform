.PHONY: dev test build-schema build-engine

dev:
	uv pip install -e libs/idun_agent_schema
	uv pip install -e libs/idun_agent_engine
	uv pip install -e libs/idun_agent_standalone

test:
	uv run pytest -q

build-schema:
	cd libs/idun_agent_schema && uv build --wheel

build-engine:
	cd libs/idun_agent_engine && uv build --wheel

lint:
	uv run ruff check . --no-cache

format:
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

# Workspace installs using the root environment
sync:
	uv sync --all-groups

sync-engine:
	cd libs/idun_agent_engine && uv sync --active --all-groups

# ─── Standalone UI ──────────────────────────────────────────────────────────────
.PHONY: build-standalone-ui clean-standalone-ui build-standalone-wheel \
	test-standalone e2e-standalone ci-standalone

build-standalone-ui:
	cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile && pnpm build
	# Rename the trace-detail SPA shell from the build-time
	# ``__trace__`` placeholder used by Next.js ``generateStaticParams``
	# to ``_shell``. Without this rename the placeholder directory ships
	# in the wheel's ``static/`` tree and is publicly reachable at
	# ``/admin/traces/__trace__/`` — a presentation finding (the build
	# artefact escapes) and an operator-confusion source. The dynamic
	# SPA-rewrite route in ``app.py`` reads from ``_shell/index.html``.
	if [ -d services/idun_agent_standalone_ui/out/admin/traces/__trace__ ]; then \
		rm -rf services/idun_agent_standalone_ui/out/admin/traces/_shell ; \
		mv services/idun_agent_standalone_ui/out/admin/traces/__trace__ \
			services/idun_agent_standalone_ui/out/admin/traces/_shell ; \
	fi
	rm -rf libs/idun_agent_standalone/src/idun_agent_standalone/static
	cp -R services/idun_agent_standalone_ui/out libs/idun_agent_standalone/src/idun_agent_standalone/static

clean-standalone-ui:
	rm -rf services/idun_agent_standalone_ui/{node_modules,.next,out}
	rm -rf libs/idun_agent_standalone/src/idun_agent_standalone/static
	mkdir -p libs/idun_agent_standalone/src/idun_agent_standalone/static
	touch libs/idun_agent_standalone/src/idun_agent_standalone/static/.gitkeep

build-standalone-wheel:
	cd libs/idun_agent_standalone && uv build --out-dir $(CURDIR)/dist/

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
