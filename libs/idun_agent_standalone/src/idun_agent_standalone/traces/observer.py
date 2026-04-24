"""Closure factory that produces an engine ``RunEventObserver``.

Per-run sequence numbers live in a dict so concurrent runs in the same
thread don't clobber each other's ordering. The map can grow unbounded if
runs never complete; for MVP-1 that is acceptable (an operator restart
clears it; we never expose this map externally).
"""

from __future__ import annotations

from typing import Any

from idun_agent_engine.agent.observers import RunContext

from idun_agent_standalone.traces.writer import BatchedTraceWriter


def make_observer(writer: BatchedTraceWriter):
    sequences: dict[str, int] = {}

    async def observe(event: Any, ctx: RunContext) -> None:
        key = f"{ctx.thread_id}:{ctx.run_id}"
        seq = sequences.get(key, 0)
        sequences[key] = seq + 1

        payload = (
            event.model_dump()
            if hasattr(event, "model_dump")
            else {"repr": repr(event)}
        )
        event_type = type(event).__name__

        await writer.enqueue(
            {
                "session_id": ctx.thread_id,
                "run_id": ctx.run_id,
                "sequence": seq,
                "event_type": event_type,
                "payload": payload,
            }
        )

    return observe
