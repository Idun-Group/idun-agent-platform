"""Phase 2 P2.5: trace events from multiple runs in one session must group, not interleave.

Per ``docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md``
§"Trace Event Ordering Can Interleave Multi-Run Sessions": ordering by per-run
``sequence`` alone interleaves runs in a multi-run session, since ``sequence``
restarts at 0 for each run. Ordering by ``(created_at, run_id, sequence, id)``
keeps runs grouped while preserving chronological order between runs.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.db.models import SessionRow, TraceEventRow


@pytest.mark.asyncio
async def test_multi_run_events_do_not_interleave(standalone_app):
    """Events from run r1 and run r2 in session t1 must come back grouped:
    [r1.0, r1.1, r1.2, r2.0, r2.1, r2.2] — not interleaved by ``sequence``.
    """
    app, sm = standalone_app

    # r1 runs first; r2 starts a second later. Within each run, sequence is 0..2.
    # Without the fix, ORDER BY sequence ASC would yield
    # [r1.0, r2.0, r1.1, r2.1, r1.2, r2.2] — interleaved.
    base = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    async with sm() as session:
        session.add(SessionRow(id="t1", message_count=6))
        for seq in range(3):
            session.add(
                TraceEventRow(
                    session_id="t1",
                    run_id="r1",
                    sequence=seq,
                    event_type="x",
                    payload={"r": "r1", "s": seq},
                    created_at=base + timedelta(milliseconds=seq),
                )
            )
        for seq in range(3):
            session.add(
                TraceEventRow(
                    session_id="t1",
                    run_id="r2",
                    sequence=seq,
                    event_type="x",
                    payload={"r": "r2", "s": seq},
                    created_at=base + timedelta(seconds=1, milliseconds=seq),
                )
            )
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        r = await client.get("/admin/api/v1/traces/sessions/t1/events")
        assert r.status_code == 200, r.text
        events = r.json()["events"]

    pairs = [(e["run_id"], e["sequence"]) for e in events]
    assert pairs == [
        ("r1", 0),
        ("r1", 1),
        ("r1", 2),
        ("r2", 0),
        ("r2", 1),
        ("r2", 2),
    ], f"Expected runs grouped, got pairs={pairs}"

    # Sanity: collapse adjacent duplicates of run_id; the resulting sequence of
    # run ids must be [r1, r2] — i.e. the runs do not alternate.
    seen_runs: list[str] = []
    for run_id, _ in pairs:
        if not seen_runs or seen_runs[-1] != run_id:
            seen_runs.append(run_id)
    assert seen_runs == [
        "r1",
        "r2",
    ], f"Expected runs grouped [r1, r2], got pairs={pairs}, run order={seen_runs}"
