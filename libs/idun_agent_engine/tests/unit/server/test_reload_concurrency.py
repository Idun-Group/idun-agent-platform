"""Reload concurrency + atomic-swap regression tests (findings #1, #2, integrations).

These reproduce the current reload path's defects (server/routers/base.py
``reload_config`` -> ``cleanup_agent`` then ``configure_app``, with no lock and
teardown-before-build):

* concurrent reloads run ``configure_app`` at the same time (no serialization) -> #1
* a reload leaves ``app.state.agent`` pointing at a closed agent mid-swap -> #2
* concurrent reloads mutate the shared integration route table with no
  serialization, so integration routes can double / leak.

All three are EXPECTED TO FAIL until reload is serialized (a lock) and
restructured to build-the-new-agent-before-tearing-down-the-old.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from idun_agent_schema.engine.integrations import IntegrationConfig, IntegrationProvider

from idun_agent_engine.integrations import base as integrations_base
from idun_agent_engine.integrations.base import BaseIntegration, setup_integrations
from idun_agent_engine.server.lifespan import counted_run_stream, ensure_reload_state
from idun_agent_engine.server.routers import base as base_router

pytestmark = pytest.mark.asyncio


def _req(app: FastAPI):
    # reload_config only ever touches request.app.
    return SimpleNamespace(app=app)


def _reload_body():
    # path-mode reload so the (mocked) ConfigBuilder.load_from_file supplies config
    # and reload_config never reaches the manager-fetch branch.
    return base_router.ReloadRequest(path="fake-config.yaml")


async def _noop_async(*_a, **_k):
    return None


class _FakeAgent:
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


# --- #1: concurrent reloads must serialize -------------------------------------


async def test_concurrent_reloads_serialize_configure(monkeypatch):
    app = FastAPI()
    app.state.agent = _FakeAgent()
    monkeypatch.setattr(
        base_router.ConfigBuilder, "load_from_file", lambda _p: object()
    )
    monkeypatch.setattr(base_router, "cleanup_agent", _noop_async)

    state = {"now": 0, "max": 0}
    release = asyncio.Event()

    async def gated_configure(_app, _cfg):
        state["now"] += 1
        state["max"] = max(state["max"], state["now"])
        await release.wait()
        state["now"] -= 1

    monkeypatch.setattr(base_router, "configure_app", gated_configure)

    t1 = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    t2 = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    await asyncio.sleep(0.1)
    observed_max = state["max"]
    release.set()
    await asyncio.gather(t1, t2)

    assert observed_max == 1, (
        f"two reloads ran configure_app concurrently (max overlap={observed_max}); "
        "reload must hold a lock so teardown/build never interleave"
    )


# --- #2: reload must never expose a closed/None agent --------------------------


async def test_reload_never_exposes_a_closed_agent(monkeypatch):
    app = FastAPI()
    old = _FakeAgent()
    app.state.agent = old
    monkeypatch.setattr(
        base_router.ConfigBuilder, "load_from_file", lambda _p: object()
    )
    monkeypatch.setattr("idun_agent_engine.server.lifespan.shutdown_otel", lambda: None)
    # Real cleanup_agent runs (it closes `old`). Gate configure so we can observe
    # app.state.agent in the window after teardown and before the new agent lands.
    entered = asyncio.Event()
    release = asyncio.Event()

    async def gated_configure(a, _cfg):
        entered.set()
        await release.wait()
        a.state.agent = _FakeAgent()

    monkeypatch.setattr(base_router, "configure_app", gated_configure)

    task = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    await entered.wait()
    # A request resolving the agent right now (get_agent reads app.state.agent):
    current = app.state.agent
    exposed_closed = current is None or getattr(current, "closed", False)
    release.set()
    await task

    assert not exposed_closed, (
        "during reload, app.state.agent was None/closed -- an in-flight request "
        "would crash ('NoneType' object is not a mapping); reload must build the "
        "new agent before tearing down the old"
    )


# --- integrations under concurrent reload --------------------------------------


class _FakeIntegration(BaseIntegration):
    def __init__(self) -> None:
        self.shutdown_called = False

    async def setup(self, app: FastAPI, agent) -> None:
        router = APIRouter()

        @router.post("/webhook")
        async def webhook() -> dict:
            return {"ok": True}

        app.include_router(router, prefix="/integrations/fake")

    async def shutdown(self) -> None:
        self.shutdown_called = True


def _integration_cfg() -> IntegrationConfig:
    return IntegrationConfig(
        provider=IntegrationProvider.WHATSAPP,
        enabled=True,
        config={"access_token": "t", "phone_number_id": "1", "verify_token": "v"},
    )


async def test_concurrent_reloads_keep_integration_routes_consistent(monkeypatch):
    app = FastAPI()
    app.state.agent = _FakeAgent()
    monkeypatch.setattr(
        base_router.ConfigBuilder, "load_from_file", lambda _p: object()
    )
    monkeypatch.setattr("idun_agent_engine.server.lifespan.shutdown_otel", lambda: None)
    monkeypatch.setattr(
        integrations_base, "_create_integration", lambda _cfg: _FakeIntegration()
    )
    # Seed one integration so the reload's cleanup has a route to remove.
    await setup_integrations(app, [_integration_cfg()], app.state.agent)

    # Mirror configure_app's integration step; count overlap of the
    # route-mutating section across the two concurrent reloads.
    state = {"now": 0, "max": 0}
    release = asyncio.Event()

    async def integ_configure(a, _cfg):
        state["now"] += 1
        state["max"] = max(state["max"], state["now"])
        await release.wait()
        await setup_integrations(a, [_integration_cfg()], a.state.agent)
        state["now"] -= 1

    monkeypatch.setattr(base_router, "configure_app", integ_configure)

    t1 = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    t2 = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    await asyncio.sleep(0.1)
    observed_max = state["max"]
    release.set()
    await asyncio.gather(t1, t2)

    webhook_routes = [
        r
        for r in app.router.routes
        if getattr(r, "path", "") == "/integrations/fake/webhook"
    ]
    assert observed_max == 1, (
        f"integration rebuild ran concurrently (max overlap={observed_max}); "
        "the shared route table was mutated by two reloads at once"
    )
    assert len(webhook_routes) == 1, (
        f"expected exactly one integration webhook route, found "
        f"{len(webhook_routes)} -- concurrent reloads corrupted the route table"
    )


# --- graceful drain: old agent closes only after in-flight runs finish --------


async def test_reload_drains_inflight_before_closing_old_agent(monkeypatch):
    app = FastAPI()
    old = _FakeAgent()
    app.state.agent = old
    monkeypatch.setattr(
        base_router.ConfigBuilder, "load_from_file", lambda _p: object()
    )
    monkeypatch.setattr("idun_agent_engine.server.lifespan.shutdown_otel", lambda: None)

    new = _FakeAgent()

    async def swap_configure(a, _cfg):
        a.state.agent = new

    monkeypatch.setattr(base_router, "configure_app", swap_configure)

    # One run is mid-stream on the old agent when the reload lands.
    ensure_reload_state(app)
    app.state.inflight_runs = 1

    task = asyncio.create_task(base_router.reload_config(_req(app), _reload_body()))
    await asyncio.sleep(0.1)
    # New agent already serves new requests, but the old one stays open while a
    # run is still using it.
    assert app.state.agent is new
    assert old.closed is False, "old agent closed while a run was still in-flight"

    # The run finishes -> drain unblocks -> reload closes the old agent.
    app.state.inflight_runs = 0
    await task
    assert old.closed is True, "old agent never closed after its runs drained"


# --- counted_run_stream brackets a stream with the in-flight counter ----------


async def test_counted_run_stream_tracks_inflight():
    app = FastAPI()
    seen = []

    async def source():
        seen.append(app.state.inflight_runs)
        yield "a"
        yield "b"

    out = [chunk async for chunk in counted_run_stream(app, source())]

    assert out == ["a", "b"]
    assert seen == [1], "stream did not register as in-flight while running"
    assert app.state.inflight_runs == 0, "counter not released after the stream ended"


async def test_counted_run_stream_decrements_on_error():
    app = FastAPI()

    async def boom():
        yield "a"
        raise RuntimeError("client gone")

    with pytest.raises(RuntimeError):
        async for _ in counted_run_stream(app, boom()):
            pass

    assert app.state.inflight_runs == 0, "counter leaked when the stream errored"
