"""Unit tests for the batched trace writer."""

import asyncio

import pytest
from idun_agent_standalone.traces.writer import BatchedTraceWriter


class _Sink:
    def __init__(self):
        self.batches: list[list[dict]] = []

    async def flush(self, items):
        self.batches.append(list(items))


@pytest.mark.asyncio
async def test_flushes_on_batch_size():
    sink = _Sink()
    w = BatchedTraceWriter(sink=sink, batch_size=3, max_latency_ms=10000)
    await w.start()
    for i in range(3):
        await w.enqueue({"i": i})
    await w.drain()
    assert sum(len(b) for b in sink.batches) == 3


@pytest.mark.asyncio
async def test_flushes_on_latency():
    sink = _Sink()
    w = BatchedTraceWriter(sink=sink, batch_size=100, max_latency_ms=50)
    await w.start()
    await w.enqueue({"i": 1})
    await asyncio.sleep(0.2)
    await w.drain()
    assert sum(len(b) for b in sink.batches) == 1


@pytest.mark.asyncio
async def test_sink_failure_isolated_from_writer(caplog):
    """The writer must swallow flush errors so a single bad sink can't
    break the SSE stream. We verify both behaviours: ``drain`` completes
    cleanly and the failure is logged via ``logger.exception``.
    """

    import logging

    from idun_agent_standalone.traces import writer as writer_module

    # Alembic-driven tests in the same session call ``logging.config.fileConfig``
    # which sets ``disable_existing_loggers=True`` and silences this logger.
    # Re-enable + force propagation so ``caplog`` sees the record.
    writer_module.logger.disabled = False
    writer_module.logger.propagate = True

    calls: list[int] = []

    class _Bad:
        async def flush(self, items):
            calls.append(len(items))
            raise RuntimeError("sink boom")

    caplog.set_level(logging.ERROR, logger=writer_module.logger.name)
    w = BatchedTraceWriter(sink=_Bad(), batch_size=1, max_latency_ms=10000)
    await w.start()
    await w.enqueue({"i": 1})
    # If the writer didn't swallow the exception, drain would propagate it.
    await w.drain()
    assert calls == [1]
    assert any("trace flush failed" in r.message for r in caplog.records), (
        f"messages captured: {[r.message for r in caplog.records]}"
    )


@pytest.mark.asyncio
async def test_drain_flushes_remaining():
    sink = _Sink()
    w = BatchedTraceWriter(sink=sink, batch_size=100, max_latency_ms=10000)
    await w.start()
    await w.enqueue({"i": 1})
    await w.enqueue({"i": 2})
    await w.drain()
    assert sum(len(b) for b in sink.batches) == 2
