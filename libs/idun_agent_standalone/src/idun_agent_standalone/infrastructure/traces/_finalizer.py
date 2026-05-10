"""Build aggregate ``standalone_trace`` rows from a batch of span rows.

Pure (no I/O) helper used by ``writer.py``. Kept in its own module so
the aggregation logic — which has its own subtle invariants around the
16-byte ``_full_trace_id`` carry, the ``parent_span_id IS None``
root-detection check, and the per-trace status/model/user/session
roll-up — can be unit-tested in isolation.

Locked behaviour (v1):

* A trace row is emitted **only when the batch contains the root span**
  (``parent_span_id IS None``). Late-arriving descendants of an already
  finalised trace land as span rows but do not retroactively update
  the trace row. See ``writer.py`` module docstring for rationale.
* Aggregates are computed from spans **in the batch**, not from spans
  already persisted in the DB — so they may underestimate
  ``total_tokens`` / ``total_cost_usd`` / ``ended_at`` if a child span
  arrived in a later flush. The detail view recomputes from spans on
  read; the list-view aggregate is documented as approximate.
* ``models`` is a sorted distinct list of LLM-span ``model`` values
  (already pre-filtered by the exporter — non-LLM spans have
  ``model is None`` and are skipped).
* ``status`` is ``"ERROR"`` when any span in the batch has
  ``status == "ERROR"``, otherwise ``"OK"``.
* ``user_id`` / ``session_id`` are read from span ``attributes`` keys
  ``user.id`` / ``session.id`` (OpenInference convention). First
  non-``None`` value wins.

Design source:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/README.md``
    § Tables, § Decision 2.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def build_trace_rows(batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group ``batch`` of span row-dicts by trace id and emit trace rows.

    Returns one trace-row dict per unique 16-byte ``_full_trace_id``
    *only* when the batch contains that trace's root span (the span with
    ``parent_span_id IS None``). Batches that hold orphan descendants of
    already-finalised traces produce no trace rows.

    The returned dicts use the SQLAlchemy ORM **attribute names** of
    :class:`StandaloneTraceRow` so they can be passed straight through
    ``session.execute(insert(StandaloneTraceRow), rows)`` /
    ``insert(...).values(rows)``.
    """
    by_trace: dict[bytes, list[dict[str, Any]]] = {}
    for raw in batch:
        full_id = raw.get("_full_trace_id")
        if not isinstance(full_id, (bytes, bytearray)):
            # Defensive: a row without the carry can't be reconciled
            # against the trace PK. Skip silently — span insert still
            # runs from the same batch.
            continue
        by_trace.setdefault(bytes(full_id), []).append(raw)

    trace_rows: list[dict[str, Any]] = []
    for full_id, spans in by_trace.items():
        root = next((s for s in spans if s.get("parent_span_id") is None), None)
        if root is None:
            # No root in this batch — defer the trace finalise. The
            # design KB allows the trace row to be missed for traces
            # whose root was never flushed in a single batch with
            # finite descendants; in practice the BatchSpanProcessor's
            # 2-second window catches the common case.
            continue

        # started_at / ended_at — MIN/MAX of the spans in this batch
        # (which is approximate by design — see module docstring).
        starts: list[datetime] = [
            s["started_at"] for s in spans if s.get("started_at") is not None
        ]
        ends: list[datetime] = [
            s["ended_at"] for s in spans if s.get("ended_at") is not None
        ]
        started_at = min(starts) if starts else root.get("started_at")
        ended_at = max(ends) if ends else None
        latency_ms: float | None
        if started_at is not None and ended_at is not None:
            latency_ms = (ended_at - started_at).total_seconds() * 1000.0
        else:
            latency_ms = None

        # Tokens / cost — sum of non-None values across the batch.
        tok_vals = [
            s.get("total_tokens") for s in spans if s.get("total_tokens") is not None
        ]
        total_tokens: int | None = sum(tok_vals) if tok_vals else None

        cost_vals = [s.get("cost_usd") for s in spans if s.get("cost_usd") is not None]
        total_cost_usd: float | None = float(sum(cost_vals)) if cost_vals else None

        # Distinct models, sorted for stable list-view ordering. LLM
        # spans always carry a model; non-LLM spans have ``model=None``
        # and are skipped here.
        models_set: set[str] = {s["model"] for s in spans if s.get("model")}
        models: list[str] = sorted(models_set) if models_set else []

        # Status — ERROR if any span errored, else OK.
        status = "ERROR" if any(s.get("status") == "ERROR" for s in spans) else "OK"

        # user_id / session_id — first non-None from span attrs
        # (OpenInference convention: ``user.id``, ``session.id``).
        user_id: str | None = None
        session_id: str | None = None
        for s in spans:
            attrs = s.get("attributes") or {}
            if user_id is None:
                candidate = attrs.get("user.id")
                if isinstance(candidate, str) and candidate:
                    user_id = candidate
            if session_id is None:
                candidate = attrs.get("session.id")
                if isinstance(candidate, str) and candidate:
                    session_id = candidate
            if user_id is not None and session_id is not None:
                break

        trace_rows.append(
            {
                "started_at": started_at,
                "otel_trace_id": full_id,  # 16 bytes — full W3C id
                "name": root.get("name") or "",
                "user_id": user_id,
                "session_id": session_id,
                "ended_at": ended_at,
                "status": status,
                "latency_ms": latency_ms,
                "total_tokens": total_tokens,
                "total_cost_usd": total_cost_usd,
                "models": models,
                "tags": [],
                # ``metadata_`` (column name ``metadata``) defaults to
                # NULL on insert; explicitly omitting the key keeps the
                # insert payload minimal.
            }
        )
    return trace_rows
