# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=idun_agent_engine --cov-report=term-missing

# Run only unit tests (once you mark them)
uv run pytest -m unit

# Run excluding slow tests
uv run pytest -m "not slow"