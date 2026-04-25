"""Unit test for the run-event observer factory."""

import pytest
from idun_agent_engine.agent.observers import RunContext
from idun_agent_standalone.traces.observer import make_observer
from idun_agent_standalone.traces.writer import BatchedTraceWriter


class _Capture:
    def __init__(self):
        self.items = []

    async def flush(self, items):
        self.items.extend(items)


class _FakeEvent:
    """Mimics a Pydantic BaseEvent — has a model_dump method."""

    def __init__(self, type: str):
        self.type = type

    def model_dump(self):
        return {"type": self.type}


@pytest.mark.asyncio
async def test_observer_writes_per_run_sequence():
    sink = _Capture()
    writer = BatchedTraceWriter(sink=sink, batch_size=100, max_latency_ms=10000)
    await writer.start()

    obs = make_observer(writer)
    ctx = RunContext(thread_id="t1", run_id="r1")
    await obs(_FakeEvent("RunStarted"), ctx)
    await obs(_FakeEvent("TextMessageContent"), ctx)
    await obs(_FakeEvent("RunFinished"), ctx)

    # different run, sequence resets
    ctx2 = RunContext(thread_id="t1", run_id="r2")
    await obs(_FakeEvent("RunStarted"), ctx2)

    await writer.drain()

    sequences = {(item["run_id"], item["sequence"]) for item in sink.items}
    assert sequences == {("r1", 0), ("r1", 1), ("r1", 2), ("r2", 0)}
    assert all(item["session_id"] == "t1" for item in sink.items)
