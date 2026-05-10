"""Standalone SpanExporter — pushes parsed row dicts onto a bounded
thread-safe queue. The asyncio writer (``writer.py``) drains it.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/08-otel-pipeline-integration.md``
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/13-sizing-perf.md``
"""

from __future__ import annotations

import logging
import queue
import threading
from datetime import UTC, datetime
from typing import Any

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import StatusCode

from . import _attrs, costs

logger = logging.getLogger(__name__)


_OPENINFERENCE_KIND_KEY = "openinference.span.kind"
# Default per-attribute byte cap retained as a module constant for
# backwards-compatible direct construction in tests. Production paths
# pass ``max_attribute_bytes`` explicitly from ``StandaloneSettings``.
_DEFAULT_MAX_BYTES = 65536


class StandaloneSpanExporter(SpanExporter):
    """Thread-safe in-process SpanExporter with drop-oldest backpressure."""

    def __init__(
        self,
        *,
        max_queue_size: int = 8192,
        max_attribute_bytes: int = _DEFAULT_MAX_BYTES,
    ) -> None:
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue(
            maxsize=max_queue_size
        )
        self._max_queue_size = max_queue_size
        self._max_attribute_bytes = max_attribute_bytes
        self._overflow_count = 0
        self._lock = threading.Lock()

    def qsize(self) -> int:
        return self._queue.qsize()

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()

    @property
    def max_queue_size(self) -> int:
        return self._max_queue_size

    @property
    def overflow_count(self) -> int:
        return self._overflow_count

    def export(self, spans: list[ReadableSpan]) -> SpanExportResult:
        for span in spans:
            row = self._span_to_row(span)
            with self._lock:
                while True:
                    try:
                        self._queue.put_nowait(row)
                        break
                    except queue.Full:
                        # Drop-oldest: discard one row, retry once.
                        try:
                            self._queue.get_nowait()
                            self._overflow_count += 1
                        except queue.Empty:
                            break  # racy edge — treat as success-with-loss
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        # The writer task drains and closes; nothing to do here.
        return

    def force_flush(self, timeout_millis: int | None = None) -> bool:
        # The asyncio writer is the source of truth for flush.
        return True

    def drain_into(self, batch: list[dict[str, Any]], max_batch: int) -> int:
        """Used by the writer task — pulls up to ``max_batch`` rows."""
        n = 0
        while n < max_batch:
            try:
                batch.append(self._queue.get_nowait())
                n += 1
            except queue.Empty:
                break
        return n

    def _span_to_row(self, span: ReadableSpan) -> dict[str, Any]:
        """Parse OpenInference attrs into a row dict.

        Truncates large string attrs at ``self._max_attribute_bytes``
        (default 64 KB, configurable via
        ``IDUN_TRACES_INPUT_VALUE_MAX_BYTES`` through
        ``StandaloneSettings``) to defend against TOAST inflection on
        Postgres.
        """
        attrs = dict(span.attributes or {})
        max_bytes = self._max_attribute_bytes
        # Truncate large attributes to defend against TOAST inflection.
        for key, val in list(attrs.items()):
            if isinstance(val, str) and len(val.encode("utf-8")) > max_bytes:
                truncated = val.encode("utf-8")[:max_bytes].decode(
                    "utf-8", errors="ignore"
                )
                attrs[key] = truncated + "…[truncated]"

        kind = attrs.get(_OPENINFERENCE_KIND_KEY) or "INTERNAL"
        started_at = datetime.fromtimestamp(span.start_time / 1e9, tz=UTC)
        ended_at = (
            datetime.fromtimestamp(span.end_time / 1e9, tz=UTC)
            if span.end_time
            else None
        )
        latency_ms = (
            (span.end_time - span.start_time) / 1e6 if span.end_time else None
        )

        # OTel trace_id is 128-bit int. The standalone_span table stores
        # only the trailing 8 bytes — the standalone_trace table holds
        # the full 16-byte W3C id, which the writer stamps on the
        # finalize-trace pass via the ``_full_trace_id`` carry field.
        trace_id_bytes = span.context.trace_id.to_bytes(16, "big")
        span_id_bytes = span.context.span_id.to_bytes(8, "big")
        parent_id_bytes = (
            span.parent.span_id.to_bytes(8, "big") if span.parent else None
        )

        # LLM-specific fields default to None for non-LLM spans.
        invocation_params = attrs.get("llm.invocation_parameters")
        streaming = (
            bool(invocation_params.get("stream", False))
            if isinstance(invocation_params, dict)
            else False
        )
        if kind == "LLM":
            llm = _attrs.extract_llm_span(attrs, streaming=streaming)
        else:
            llm = {
                "model": None,
                "provider": None,
                "prompt_tokens": None,
                "completion_tokens": None,
                "cache_read_tokens": None,
                "cache_write_tokens": None,
            }

        cost_breakdown = (
            costs.compute_span_cost(
                model=llm["model"],
                prompt_tokens=llm["prompt_tokens"],
                completion_tokens=llm["completion_tokens"],
                cache_read_tokens=llm["cache_read_tokens"],
                cache_write_tokens=llm["cache_write_tokens"],
                streaming=streaming,
            )
            if kind == "LLM"
            else None
        )

        # Normalise OTel ``StatusCode`` to its numeric value. The SDK
        # returns the enum member, but tests mock it with a bare int --
        # both paths converge on ``status_value`` so the mapping below
        # is consistent.
        raw_status = span.status.status_code
        status_value = (
            raw_status.value if isinstance(raw_status, StatusCode) else raw_status
        )

        prompt_tokens = llm["prompt_tokens"]
        completion_tokens = llm["completion_tokens"]
        total_tokens: int | None
        if prompt_tokens is None and completion_tokens is None:
            total_tokens = None
        else:
            total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)

        return {
            "started_at": started_at,
            "otel_span_id": span_id_bytes,
            "otel_trace_id": trace_id_bytes[8:],  # 8-byte parent trace
            "parent_span_id": parent_id_bytes,
            "name": span.name,
            "kind": str(kind),
            "ended_at": ended_at,
            "latency_ms": latency_ms,
            "model": llm["model"],
            "provider": llm["provider"],
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cache_read_tokens": llm["cache_read_tokens"],
            "cache_write_tokens": llm["cache_write_tokens"],
            "total_tokens": total_tokens,
            "cost_usd": cost_breakdown["total"] if cost_breakdown else None,
            "cost_breakdown": cost_breakdown,
            "cost_source": costs.snapshot_version() if cost_breakdown else None,
            # OTel ``StatusCode`` is a 3-value enum: UNSET (0), OK (1),
            # ERROR (2). Mapping non-OK to ERROR conflates UNSET (the
            # default for a span that ended without an explicit status)
            # with a real failure -- store NULL for UNSET so the trace
            # status surfaces correctly downstream.
            "status": (
                "OK"
                if status_value == StatusCode.OK.value
                else "ERROR"
                if status_value == StatusCode.ERROR.value
                else None
            ),
            "attributes": attrs,
            "events": [
                {"name": e.name, "ts": e.timestamp} for e in (span.events or [])
            ],
            # Writer-internal carry: 16-byte trace id used to stamp the
            # ``standalone_trace`` row's PK. Stripped before insert.
            "_full_trace_id": trace_id_bytes,
        }
