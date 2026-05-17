"""Reload-twice OTel smoke: cleanup_agent must drain the old provider.

Regression for the latent bug where the second reload with GCP_TRACE
configured would log "Overriding of current TracerProvider is not
allowed" and silently drop the new processor.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from idun_agent_schema.engine.observability_v2 import (
    GCPTraceConfig,
    ObservabilityConfig,
    ObservabilityProvider,
)
from opentelemetry import trace

from idun_agent_engine.observability import otel_lifecycle
from idun_agent_engine.server.lifespan import cleanup_agent


@pytest.fixture(autouse=True)
def _reset_otel():
    otel_lifecycle.shutdown_otel()
    yield
    otel_lifecycle.shutdown_otel()


def _make_app() -> FastAPI:
    app = FastAPI()
    app.state.agent = None
    app.state.integrations = []
    app.state.integration_routes = []
    return app


@pytest.mark.asyncio
async def test_reload_does_not_log_overriding_warning(caplog):
    config = ObservabilityConfig(
        provider=ObservabilityProvider.GCP_TRACE,
        config=GCPTraceConfig(),
    )

    # First boot: install OTel.
    otel_lifecycle.init_otel(config)
    first_provider = otel_lifecycle.get_tracer_provider()
    assert first_provider is not None

    # Reload: cleanup_agent must drain — then a second init re-installs.
    app = _make_app()
    with caplog.at_level(logging.WARNING):
        await cleanup_agent(app)
        otel_lifecycle.init_otel(config)

    # OpenTelemetry's "Overriding of current TracerProvider is not
    # allowed" warning is emitted at WARNING from the opentelemetry
    # logger when set_tracer_provider is called twice. The fix means
    # we never call set_tracer_provider on a non-drained state.
    assert not any(
        "Overriding of current TracerProvider" in rec.message
        for rec in caplog.records
    ), "cleanup_agent did not drain the old provider"

    # Bonus: the new provider is the freshly installed one, and the
    # global accessor agrees.
    second_provider = otel_lifecycle.get_tracer_provider()
    assert second_provider is not None
    assert second_provider is trace.get_tracer_provider()


@pytest.mark.asyncio
async def test_cleanup_agent_drains_attached_processors():
    config = ObservabilityConfig(
        provider=ObservabilityProvider.GCP_TRACE,
        config=GCPTraceConfig(),
    )
    otel_lifecycle.init_otel(config)

    fake_processor = MagicMock()
    otel_lifecycle.attach_span_processor(fake_processor)
    assert len(otel_lifecycle._attached_processors) == 1

    app = _make_app()
    await cleanup_agent(app)

    fake_processor.shutdown.assert_called_once()
    # Bound check: helper state is fully drained — no leak across reload.
    assert otel_lifecycle._attached_processors == []
    assert otel_lifecycle._installed_instrumentors == []
    assert otel_lifecycle.get_tracer_provider() is None
