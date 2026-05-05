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
