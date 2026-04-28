"""Local conftest for ``tests/integration/api/v1/``.

The reload pipeline uses a module-level ``asyncio.Lock`` that binds to
the first event loop that awaits it. Because pytest-asyncio creates a
fresh event loop per test (function-scoped), a lock left over from
the unit-test run (or from a prior integration test) is bound to a
dead loop and refuses to acquire on the new one with
``RuntimeError: ... is bound to a different event loop``.

The autouse fixture below replaces the module-level lock with a
freshly-constructed one before every test in this directory. In
production there is exactly one event loop for the lifetime of the
process, so the module-level singleton is correct there — this hook
only matters for the test harness.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest
from idun_agent_standalone.services import reload as reload_module


@pytest.fixture(autouse=True)
def _reset_reload_mutex() -> Iterator[None]:
    """Replace ``_reload_mutex`` with a fresh ``asyncio.Lock`` per test."""
    original = reload_module._reload_mutex
    reload_module._reload_mutex = asyncio.Lock()
    try:
        yield
    finally:
        reload_module._reload_mutex = original
