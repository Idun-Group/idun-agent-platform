"""Tests that user.id propagates from current_user_id ContextVar onto
emitted OTel spans via the using_user wrapper in event_generator.

Reference: tasks/trace-feature-08-05-2026/15-user-session-propagation.md.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openinference.instrumentation import TracerProvider as OITracerProvider
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

pytestmark = pytest.mark.unit


@pytest.fixture
def in_memory_tracer():
    """Install an InMemorySpanExporter on an OpenInference TracerProvider.

    `using_user` only writes to the OTel context — an `OITracer` is what
    projects those context attributes onto emitted spans. Vanilla
    `opentelemetry.sdk.trace.TracerProvider` would not read user.id from
    context, so the fixture must hand out an OI tracer for the contract
    + router tests to capture user.id on the FakeLLM span.
    """
    exporter = InMemorySpanExporter()
    provider = OITracerProvider(resource=Resource.create({"service.name": "test"}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    # OTel doesn't allow overriding once set; tests in this file use the
    # provider handle directly (provider.get_tracer(...)) so the global
    # override warning is harmless — our exporter still receives spans.
    trace.set_tracer_provider(provider)
    yield exporter, provider
    provider.shutdown()


def _emit_dummy_run_span(tracer):
    """Emit a single span the way LangChainInstrumentor would — gives us
    a span the using_user context manager has had a chance to stamp."""
    with tracer.start_as_current_span("ChatOpenAI.invoke") as span:
        span.set_attribute("openinference.span.kind", "LLM")


def test_using_user_stamps_user_id_attribute(in_memory_tracer):
    """Direct contract test: using_user(<id>) wraps a span and adds
    user.id as an attribute. This pins the propagation primitive that
    event_generator relies on without booting a full FastAPI app."""
    from openinference.instrumentation import using_user

    exporter, provider = in_memory_tracer
    tracer = provider.get_tracer(__name__)
    with using_user("alice"):
        _emit_dummy_run_span(tracer)
    provider.force_flush()

    spans = exporter.get_finished_spans()
    assert spans, "no spans were captured"
    user_attrs = [s.attributes.get("user.id") for s in spans]
    assert "alice" in user_attrs


def _build_test_app(fake_agent, resolve_user_returns):
    """Mount the real `/agent` router on a minimal app and override the
    Depends-based auth + agent dependencies so the route runs without
    SSO and without a real ConfigBuilder boot.

    `monkeypatch` is reserved for module-attribute patching (used for
    `_resolve_user_id`, which is a regular function call inside the
    route body — not a Depends, so attribute monkey-patching works).
    Depends() callables (`get_verified_user`, `get_agent`) MUST go
    through `app.dependency_overrides` because FastAPI captures them
    at route-decoration time.
    """
    from idun_agent_engine.server.auth import get_verified_user
    from idun_agent_engine.server.dependencies import get_agent
    from idun_agent_engine.server.routers.agent import agent_router

    app = FastAPI()
    app.include_router(agent_router, prefix="/agent")
    app.state.agent = fake_agent
    app.state.guardrails = []
    app.state.failed_guardrails = []
    app.state.failed_mcp_servers = []
    app.state.sso_validator = None
    app.state.capabilities = None
    app.state.integration_routes = []
    app.state.integrations = []
    app.state.engine_config = None

    app.dependency_overrides[get_verified_user] = lambda: None
    app.dependency_overrides[get_agent] = lambda: fake_agent
    return app


def test_event_generator_wraps_agent_run_with_using_user(
    monkeypatch, in_memory_tracer
):
    """End-to-end: hit /agent/run with a fake agent that emits a span
    during run(); assert the captured span carries user.id matching the
    resolved user. Uses the engine's actual router path so the wrap site
    cannot regress silently."""
    from idun_agent_engine.server.routers import agent as agent_module

    exporter, provider = in_memory_tracer
    tracer = provider.get_tracer(__name__)

    class _FakeAgent:
        run_event_observers = AsyncMock()

        async def run(self, _input) -> AsyncIterator[object]:
            # Emit a span the way an instrumented LLM call would — this
            # is what using_user must wrap.
            with tracer.start_as_current_span("FakeLLM.invoke") as span:
                span.set_attribute("openinference.span.kind", "LLM")
            # An empty stream is fine for the wrap test.
            if False:
                yield None  # pragma: no cover

    fake_agent = _FakeAgent()
    app = _build_test_app(fake_agent, resolve_user_returns="alice")

    # `_resolve_user_id` is a plain function called inside the route
    # body — patch the module attribute so it returns "alice".
    monkeypatch.setattr(agent_module, "_resolve_user_id", lambda _user: "alice")

    with TestClient(app) as client:
        # AG-UI RunAgentInput shape — minimal valid payload. The agent
        # run yields nothing so the SSE stream closes immediately, which
        # is fine: the using_user wrap fires the moment the generator
        # enters its body.
        response = client.post(
            "/agent/run",
            json={
                "thread_id": "t-1",
                "run_id": "r-1",
                "messages": [],
                "tools": [],
                "context": [],
                "state": {},
                "forwarded_props": {},
            },
            headers={"accept": "text/event-stream"},
        )
        # Drain the stream so event_generator runs to completion.
        _ = response.read()

    provider.force_flush()
    user_attrs = [s.attributes.get("user.id") for s in exporter.get_finished_spans()]
    assert "alice" in user_attrs


def test_event_generator_default_user_does_not_crash(monkeypatch, in_memory_tracer):
    """The ContextVar default is the literal "standalone" — confirm the
    wrap accepts it without error and stamps the default."""
    from idun_agent_engine.server.routers import agent as agent_module

    exporter, provider = in_memory_tracer
    tracer = provider.get_tracer(__name__)

    class _FakeAgent:
        run_event_observers = AsyncMock()

        async def run(self, _input) -> AsyncIterator[object]:
            with tracer.start_as_current_span("FakeLLM.invoke") as span:
                span.set_attribute("openinference.span.kind", "LLM")
            if False:
                yield None  # pragma: no cover

    fake_agent = _FakeAgent()
    app = _build_test_app(fake_agent, resolve_user_returns=None)

    # No SSO user; _resolve_user_id returns None so the route falls
    # back to current_user_id.get() which has the "standalone" default.
    monkeypatch.setattr(agent_module, "_resolve_user_id", lambda _user: None)

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "thread_id": "t-1",
                "run_id": "r-1",
                "messages": [],
                "tools": [],
                "context": [],
                "state": {},
                "forwarded_props": {},
            },
            headers={"accept": "text/event-stream"},
        )
        _ = response.read()

    provider.force_flush()
    user_attrs = [s.attributes.get("user.id") for s in exporter.get_finished_spans()]
    # Default ContextVar value is "standalone".
    assert "standalone" in user_attrs
