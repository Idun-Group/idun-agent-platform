from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from idun_agent_standalone.services import engine_reload as engine_reload_module
from idun_agent_standalone.services.engine_reload import (
    build_engine_reload_callable,
)
from idun_agent_standalone.services.reload import ReloadInitFailed


async def test_cleanup_error_is_swallowed(monkeypatch):
    app = FastAPI()
    cleanup = AsyncMock(side_effect=RuntimeError("cleanup boom"))
    configure = AsyncMock()
    monkeypatch.setattr(engine_reload_module, "cleanup_agent", cleanup)
    monkeypatch.setattr(engine_reload_module, "configure_app", configure)

    reload_callable = build_engine_reload_callable(app)
    await reload_callable(object())  # type: ignore[arg-type]

    cleanup.assert_awaited_once()
    configure.assert_awaited_once()


async def test_configure_error_wraps_in_reload_init_failed(monkeypatch):
    app = FastAPI()
    cleanup = AsyncMock()
    configure = AsyncMock(side_effect=RuntimeError("configure boom"))
    monkeypatch.setattr(engine_reload_module, "cleanup_agent", cleanup)
    monkeypatch.setattr(engine_reload_module, "configure_app", configure)

    reload_callable = build_engine_reload_callable(app)
    with pytest.raises(ReloadInitFailed) as exc_info:
        await reload_callable(object())  # type: ignore[arg-type]

    assert "configure boom" in str(exc_info.value)
    assert isinstance(exc_info.value.__cause__, RuntimeError)


async def test_new_guardrail_install_failure_raises_reload_init_failed(monkeypatch):
    """A new failed guardrail in the assembled config rolls the reload back.

    Mirrors the case the e2e ``test_reload_pipeline_adds_input_guardrail``
    scenario hits: admin POSTs a new BAN_LIST guard, the engine logs an
    install failure (401 / missing dep) but ``configure_app`` returns
    normally. Without this surface, the reload pipeline records
    ``status: APPLIED`` while the guardrail is silently inactive.
    With it, the new failure is detected and the reload pipeline
    rolls back the DB write.
    """
    from idun_agent_engine.server.lifespan import FailedGuardrail

    app = FastAPI()
    # Pre-existing failures should NOT trigger rollback — they were
    # already failing before this reload, so re-raising on every reload
    # would wedge admin out of every unrelated change.
    app.state.failed_guardrails = [
        FailedGuardrail(config_id="OLD_GUARD", position="input", error="prior")
    ]

    async def _configure(_app, _cfg):
        # Simulate a NEW guardrail failure landing on this reload.
        _app.state.failed_guardrails = [
            FailedGuardrail(config_id="OLD_GUARD", position="input", error="prior"),
            FailedGuardrail(config_id="BAN_LIST", position="input", error="hub 401"),
        ]

    monkeypatch.setattr(engine_reload_module, "cleanup_agent", AsyncMock())
    monkeypatch.setattr(engine_reload_module, "configure_app", _configure)

    reload_callable = build_engine_reload_callable(app)
    with pytest.raises(ReloadInitFailed) as exc_info:
        await reload_callable(object())  # type: ignore[arg-type]

    assert "BAN_LIST" in str(exc_info.value)
    assert "hub 401" in str(exc_info.value)
    # Pre-existing OLD_GUARD failure must NOT be in the error message —
    # only the regression that the admin's mutation introduced.
    assert "OLD_GUARD" not in str(exc_info.value)


async def test_pre_existing_guardrail_failures_do_not_raise(monkeypatch):
    """Re-raising on every reload would make admin unable to fix anything.

    If a guard was already failing before this reload, we keep the
    failure visible (it's still in ``app.state.failed_guardrails``) but
    don't raise. The admin can still mutate any other resource.
    """
    from idun_agent_engine.server.lifespan import FailedGuardrail

    app = FastAPI()
    app.state.failed_guardrails = [
        FailedGuardrail(config_id="BAN_LIST", position="input", error="prior")
    ]

    async def _configure(_app, _cfg):
        # Same failure persists across the reload — no NEW regression.
        _app.state.failed_guardrails = [
            FailedGuardrail(config_id="BAN_LIST", position="input", error="prior")
        ]

    monkeypatch.setattr(engine_reload_module, "cleanup_agent", AsyncMock())
    monkeypatch.setattr(engine_reload_module, "configure_app", _configure)

    reload_callable = build_engine_reload_callable(app)
    # Should NOT raise.
    await reload_callable(object())  # type: ignore[arg-type]


async def test_cleared_guardrail_failure_does_not_raise(monkeypatch):
    """When a previously failing guard now installs cleanly, no raise.

    Edge case: prior reload had a failed guard; this reload's config
    fixes it (e.g. operator added the missing api_key). The set of
    new failures is empty — definitely no regression.
    """
    from idun_agent_engine.server.lifespan import FailedGuardrail

    app = FastAPI()
    app.state.failed_guardrails = [
        FailedGuardrail(config_id="BAN_LIST", position="input", error="prior")
    ]

    async def _configure(_app, _cfg):
        _app.state.failed_guardrails = []

    monkeypatch.setattr(engine_reload_module, "cleanup_agent", AsyncMock())
    monkeypatch.setattr(engine_reload_module, "configure_app", _configure)

    reload_callable = build_engine_reload_callable(app)
    # Should NOT raise — failures only went down.
    await reload_callable(object())  # type: ignore[arg-type]
