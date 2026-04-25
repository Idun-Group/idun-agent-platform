"""Unit tests for the reload orchestrator.

The orchestrator drives the engine's app-level lifecycle hooks
(``cleanup_agent``/``configure_app``); we substitute fakes through DI so the
tests don't need to import or run the real engine.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from idun_agent_standalone.reload import orchestrate_reload


def _make_app() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace())


@pytest.mark.asyncio
async def test_success_path():
    """Happy path: cleanup runs, configure applies the new config."""
    app = _make_app()
    cleanup_called: list[object] = []
    configure_calls: list[tuple[object, object]] = []

    async def cleanup(a):
        cleanup_called.append(a)

    async def configure(a, cfg):
        configure_calls.append((a, cfg))

    out = await orchestrate_reload(
        app=app,
        new_config="NEW",
        previous_config="OLD",
        structural_change=False,
        cleanup=cleanup,
        configure=configure,
    )

    assert out.kind == "reloaded"
    assert cleanup_called == [app]
    assert configure_calls == [(app, "NEW")]


@pytest.mark.asyncio
async def test_structural_change_skips_swap():
    """Structural changes are persisted only — no cleanup/configure."""
    app = _make_app()
    cleanup_called = False
    configured = False

    async def cleanup(_a):
        nonlocal cleanup_called
        cleanup_called = True

    async def configure(_a, _cfg):
        nonlocal configured
        configured = True

    out = await orchestrate_reload(
        app=app,
        new_config="NEW",
        previous_config="OLD",
        structural_change=True,
        cleanup=cleanup,
        configure=configure,
    )

    assert out.kind == "restart_required"
    assert cleanup_called is False
    assert configured is False


@pytest.mark.asyncio
async def test_failure_recovers_to_previous():
    """On init failure with the new config, fall back to the previous one."""
    app = _make_app()
    configured_with: list[object] = []

    async def cleanup(_a):
        return None

    async def configure(_a, cfg):
        configured_with.append(cfg)
        if cfg == "NEW":
            raise RuntimeError("init boom")

    out = await orchestrate_reload(
        app=app,
        new_config="NEW",
        previous_config="OLD",
        structural_change=False,
        cleanup=cleanup,
        configure=configure,
    )

    assert out.kind == "init_failed"
    assert out.recovered is True
    # First attempt with NEW failed, then OLD was applied during recovery.
    assert configured_with == ["NEW", "OLD"]


@pytest.mark.asyncio
async def test_failure_recovery_also_fails():
    """Both new and previous configs fail — operator gets a clear ``recovered=False``."""
    app = _make_app()

    async def cleanup(_a):
        return None

    async def configure(_a, _cfg):
        raise RuntimeError("both boom")

    out = await orchestrate_reload(
        app=app,
        new_config="N",
        previous_config="O",
        structural_change=False,
        cleanup=cleanup,
        configure=configure,
    )

    assert out.kind == "init_failed"
    assert out.recovered is False


@pytest.mark.asyncio
async def test_cleanup_failure_does_not_block_init():
    """A flaky teardown should not stop the swap."""
    app = _make_app()
    configured_with: list[object] = []

    async def cleanup(_a):
        raise RuntimeError("cleanup boom")

    async def configure(_a, cfg):
        configured_with.append(cfg)

    out = await orchestrate_reload(
        app=app,
        new_config="NEW",
        previous_config="OLD",
        structural_change=False,
        cleanup=cleanup,
        configure=configure,
    )

    assert out.kind == "reloaded"
    assert configured_with == ["NEW"]
