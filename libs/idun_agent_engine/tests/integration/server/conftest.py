"""Fixtures for integration tests targeting the engine's server routes."""

from __future__ import annotations

import pytest


@pytest.fixture
def echo_agent_config():
    """Provide an echo-agent config used to drive `/agent/run` integration tests.

    The echo-agent fixture is owned by the `idun_agent_standalone` package
    (see Task 1.5 of the Standalone Agent MVP plan). Until that package
    exists, tests that depend on this fixture are skipped rather than
    erroring at collection time.
    """
    pytest.importorskip(
        "idun_agent_standalone.testing",
        reason=(
            "echo agent fixture provided by idun_agent_standalone (Task 1.5)"
        ),
    )
    from idun_agent_standalone.testing import echo_agent_config as _echo_config

    return _echo_config()
