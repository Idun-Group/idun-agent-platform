"""Unit tests for the standalone SpanExporter."""

from __future__ import annotations

import threading

from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from opentelemetry.sdk.trace.export import SpanExportResult
from opentelemetry.trace import StatusCode

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

    def test_status_unset_maps_to_none_not_error(self):
        """OTel ``StatusCode.UNSET`` must NOT collapse to ``"ERROR"``.

        Most spans never call ``set_status`` and end with the default
        ``UNSET`` (0). The previous implementation mapped any
        non-``OK`` value to ``"ERROR"`` which painted every implicit
        span as failed.
        """
        exporter = StandaloneSpanExporter(max_queue_size=4)
        # Test both: bare int (mock convention) and the real enum.
        exporter.export([_fake_span(status_code=StatusCode.UNSET.value)])
        row = exporter._queue.get_nowait()
        assert row["status"] is None

    def test_status_unset_via_enum_member(self):
        """The exporter must accept the real enum member, not just the int.

        OTel's SDK returns ``StatusCode.UNSET`` (an ``enum.Enum``, not
        an ``IntEnum``), so a naive ``status == 0`` comparison fails
        in production -- guard the conversion path with a real enum.
        """
        exporter = StandaloneSpanExporter(max_queue_size=4)
        span = _fake_span()
        span.status.status_code = StatusCode.UNSET
        exporter.export([span])
        row = exporter._queue.get_nowait()
        assert row["status"] is None

    def test_status_ok_maps_to_ok(self):
        exporter = StandaloneSpanExporter(max_queue_size=4)
        exporter.export([_fake_span(status_code=StatusCode.OK.value)])
        row = exporter._queue.get_nowait()
        assert row["status"] == "OK"

    def test_status_ok_via_enum_member(self):
        exporter = StandaloneSpanExporter(max_queue_size=4)
        span = _fake_span()
        span.status.status_code = StatusCode.OK
        exporter.export([span])
        row = exporter._queue.get_nowait()
        assert row["status"] == "OK"

    def test_status_error_maps_to_error(self):
        exporter = StandaloneSpanExporter(max_queue_size=4)
        exporter.export([_fake_span(status_code=StatusCode.ERROR.value)])
        row = exporter._queue.get_nowait()
        assert row["status"] == "ERROR"

    def test_status_error_via_enum_member(self):
        exporter = StandaloneSpanExporter(max_queue_size=4)
        span = _fake_span()
        span.status.status_code = StatusCode.ERROR
        exporter.export([span])
        row = exporter._queue.get_nowait()
        assert row["status"] == "ERROR"
