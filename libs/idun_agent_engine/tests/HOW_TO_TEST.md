# All tests (31 total)
uv run pytest

# Unit tests only (22 tests, fast)
uv run pytest -m unit

# Integration tests only (9 tests)
uv run pytest -m integration

# Skip slow tests
uv run pytest -m "not slow"

# With coverage
uv run pytest --cov=idun_agent_engine --cov-report=term-missing
