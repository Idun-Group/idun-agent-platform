"""Read/write helpers for the singleton runtime state row.

The reload pipeline calls these helpers to record the outcome of
every commit_with_reload run. The boot-path state machine (Phase 6)
reads from the same helpers to compute StandaloneRuntimeStatusKind.

Caller controls transaction boundaries — this module does not
commit or rollback. The pattern in commit_with_reload is:
1. rollback the user's failed mutation,
2. record_reload_outcome(...) writes the failure record,
3. caller commits the failure record.
"""

from __future__ import annotations

from datetime import datetime

from idun_agent_schema.standalone import StandaloneReloadStatus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.infrastructure.db.models.runtime_state import (
    StandaloneRuntimeStateRow,
)

_SINGLETON_ID = "singleton"


async def get(session: AsyncSession) -> StandaloneRuntimeStateRow | None:
    """Return the singleton state row, or None on first boot."""
    result = await session.execute(
        select(StandaloneRuntimeStateRow).where(
            StandaloneRuntimeStateRow.id == _SINGLETON_ID
        )
    )
    return result.scalar_one_or_none()


async def record_reload_outcome(
    session: AsyncSession,
    *,
    status: StandaloneReloadStatus,
    message: str,
    error: str | None,
    config_hash: str | None,
    reloaded_at: datetime,
) -> StandaloneRuntimeStateRow:
    """Upsert the singleton row with the given outcome.

    Caller controls the transaction boundary; this helper only stages
    the change via session.flush().
    """
    row = await get(session)
    if row is None:
        row = StandaloneRuntimeStateRow(id=_SINGLETON_ID)
        session.add(row)
    row.last_status = status.value
    row.last_message = message
    row.last_error = error
    row.last_applied_config_hash = config_hash
    row.last_reloaded_at = reloaded_at
    await session.flush()
    return row


async def clear(session: AsyncSession) -> None:
    """Delete the singleton row (test helper)."""
    row = await get(session)
    if row is not None:
        await session.delete(row)
        await session.flush()
