"""Unit tests for the standalone SpanExporter."""

from __future__ import annotations

import threading

from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from opentelemetry.sdk.trace.export import SpanExportResult

from ._helpers import fake_span as _fake_span

# Re-export so tests in other modules (test_writer.py) can import it via
# ``from tests.unit.traces.test_exporter import _fake_span`` while the
# canonical implementation lives in ``_helpers.py``.
__all__ = ["_fake_span"]


class TestStandaloneSpanExporter:
    def test_export_pushes_row_onto_queue(self):
        exporter = StandaloneSpanExporter(max_queue_size=10)
        result = exporter.export([_fake_span()])
        assert result == SpanExportResult.SUCCESS
        assert exporter.qsize() == 1

    def test_drop_oldest_when_queue_full(self):
        exporter = StandaloneSpanExporter(max_queue_size=2)
        exporter.export([_fake_span("first")])
        exporter.export([_fake_span("second")])
        exporter.export([_fake_span("third")])  # should drop "first"
        assert exporter.qsize() == 2
        assert exporter.overflow_count == 1

    def test_thread_safe_under_concurrent_export(self):
        exporter = StandaloneSpanExporter(max_queue_size=1000)

        def push():
            for _ in range(100):
                exporter.export([_fake_span()])

        threads = [threading.Thread(target=push) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert exporter.qsize() == 1000
