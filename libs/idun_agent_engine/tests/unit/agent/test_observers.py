import pytest

from idun_agent_engine.agent.observers import RunContext, RunEventObserverRegistry


class FakeEvent:
    def __init__(self, type: str):
        self.type = type


@pytest.mark.asyncio
async def test_registry_dispatches_events_to_observers():
    registry = RunEventObserverRegistry()
    received: list[tuple[str, str]] = []

    async def obs(event, ctx: RunContext) -> None:
        received.append((event.type, ctx.thread_id))

    registry.register(obs)
    await registry.dispatch(FakeEvent("RunStarted"), RunContext(thread_id="t1", run_id="r1"))
    assert received == [("RunStarted", "t1")]


@pytest.mark.asyncio
async def test_registry_isolates_observer_failures(caplog):
    registry = RunEventObserverRegistry()

    async def broken(event, ctx):
        raise RuntimeError("boom")

    async def healthy(event, ctx):
        healthy.calls.append(event.type)
    healthy.calls = []  # type: ignore[attr-defined]

    registry.register(broken)
    registry.register(healthy)
    await registry.dispatch(FakeEvent("RunFinished"), RunContext(thread_id="t", run_id="r"))
    assert healthy.calls == ["RunFinished"]  # type: ignore[attr-defined]
    assert any("observer failed" in r.message for r in caplog.records)
