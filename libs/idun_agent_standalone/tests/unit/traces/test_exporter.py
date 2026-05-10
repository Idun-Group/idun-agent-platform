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
        # Bound the join so a regression that deadlocks ``export()`` cannot
        # hang the whole suite — fail fast and surface the regression
        # instead.
        for t in threads:
            t.join(timeout=5)
            assert not t.is_alive(), "worker thread hung during concurrent export"
        assert exporter.qsize() == 1000
        # No span should have triggered drop-oldest; the queue ceiling is
        # exactly the number of spans we pushed.
        assert exporter.overflow_count == 0

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

    def test_full_then_empty_race_retries_put(self):
        """Drop-oldest must retry the put after a full→empty race.

        Reproduces the race CodeRabbit flagged: ``put_nowait`` raises
        ``queue.Full``; before the fallback ``get_nowait`` runs, the
        writer drains the queue. The fallback then sees ``Empty``. The
        previous code ``break``ed at that point and lost the row.
        """
        import queue as _queue

        exporter = StandaloneSpanExporter(max_queue_size=2)

        # Simulate the race by replacing the queue with a stub that
        # raises Full once, then Empty once on get, then accepts put.
        class RacyQueue:
            def __init__(self):
                self.real = _queue.Queue(maxsize=2)
                self._put_calls = 0
                self._get_calls = 0

            def put_nowait(self, item):
                self._put_calls += 1
                if self._put_calls == 1:
                    # First put: pretend full.
                    raise _queue.Full
                # Second put: actually accept.
                self.real.put_nowait(item)

            def get_nowait(self):
                self._get_calls += 1
                # Pretend the writer already drained the queue.
                raise _queue.Empty

            def qsize(self):
                return self.real.qsize()

        racy = RacyQueue()
        exporter._queue = racy  # type: ignore[assignment]
        exporter.export([_fake_span("victim")])

        assert racy._put_calls == 2, (
            "expected exactly two put_nowait attempts: initial Full, then retry"
        )
        assert racy.qsize() == 1, "the row must land on retry, not be dropped"
        assert exporter.overflow_count == 0, (
            "no row was actually evicted -- overflow counter must stay zero"
        )

    def test_retry_cap_prevents_runaway_loop(self):
        """A pathological queue that never accepts must not spin forever.

        We cap retries at ``_PUT_RETRY_LIMIT``; the test confirms the
        loop exits and does not hang the export call.
        """
        import queue as _queue

        exporter = StandaloneSpanExporter(max_queue_size=2)

        class AlwaysRacingQueue:
            def __init__(self):
                self.put_calls = 0

            def put_nowait(self, item):
                self.put_calls += 1
                raise _queue.Full

            def get_nowait(self):
                raise _queue.Empty

            def qsize(self):
                return 0

        racy = AlwaysRacingQueue()
        exporter._queue = racy  # type: ignore[assignment]

        # Returns instead of looping forever.
        exporter.export([_fake_span("ghost")])

        # Bounded: at most _PUT_RETRY_LIMIT attempts.
        assert racy.put_calls == StandaloneSpanExporter._PUT_RETRY_LIMIT


class TestExporterADKProjection:
    """End-to-end projection regression at the exporter row-build seam.

    The exporter calls ``project_to_openinference`` between attribute
    truncation and the kind read, so an ADK-shape span (kind=INTERNAL,
    only ``gen_ai.*`` keys) must produce a row whose ``kind`` flips to
    the projected OpenInference value and whose materialised columns
    (``model``, ``prompt_tokens``, ``completion_tokens``) come out
    populated.
    """

    def test_adk_call_llm_produces_populated_llm_columns(self):
        exporter = StandaloneSpanExporter(max_queue_size=10)
        span = _fake_span(
            "call_llm",
            attributes={
                # No ``openinference.span.kind`` — ADK does not emit it.
                "gen_ai.system": "gcp.vertex.agent",
                "gen_ai.request.model": "gemini-2.5-flash",
                "gen_ai.usage.input_tokens": 756,
                "gen_ai.usage.output_tokens": 11,
            },
        )

        row = exporter._span_to_row(span)

        assert row["kind"] == "LLM"
        assert row["model"] == "gemini-2.5-flash"
        assert row["provider"] == "google"
        assert row["prompt_tokens"] == 756
        assert row["completion_tokens"] == 11
        assert row["total_tokens"] == 767

    def test_adk_invoke_agent_flips_kind_to_agent(self):
        exporter = StandaloneSpanExporter(max_queue_size=10)
        span = _fake_span(
            "invoke_agent planner_node",
            attributes={
                "gen_ai.operation.name": "invoke_agent",
                "gen_ai.agent.name": "planner_node",
            },
        )

        row = exporter._span_to_row(span)

        assert row["kind"] == "AGENT"
        # AGENT spans don't materialise LLM columns.
        assert row["model"] is None
        assert row["prompt_tokens"] is None

    def test_adk_execute_tool_flips_kind_to_tool(self):
        exporter = StandaloneSpanExporter(max_queue_size=10)
        span = _fake_span(
            "execute_tool transfer_to_agent",
            attributes={
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": "transfer_to_agent",
                "gcp.vertex.agent.tool_call_args": '{"agent_name": "x"}',
            },
        )

        row = exporter._span_to_row(span)

        assert row["kind"] == "TOOL"
        # TOOL spans should not produce phantom LLM columns.
        assert row["model"] is None
        assert row["prompt_tokens"] is None

    def test_langgraph_openinference_passthrough_unchanged(self):
        """OpenInference-shaped spans flow through identical to pre-projection behaviour."""
        exporter = StandaloneSpanExporter(max_queue_size=10)
        span = _fake_span(
            "ChatOpenAI",
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o",
                "llm.provider": "openai",
                "llm.token_count.prompt": 100,
                "llm.token_count.completion": 50,
            },
        )

        row = exporter._span_to_row(span)

        assert row["kind"] == "LLM"
        assert row["model"] == "gpt-4o"
        assert row["provider"] == "openai"
        assert row["prompt_tokens"] == 100
        assert row["completion_tokens"] == 50
