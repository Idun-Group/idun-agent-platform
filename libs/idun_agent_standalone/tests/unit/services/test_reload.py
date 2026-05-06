"""Tests for the reload pipeline service.

Tests use sqlite+aiosqlite memory DB with the standalone agent +
memory + runtime_state ORMs. The reload_callable is stubbed via
AsyncMock; the now callable is frozen for deterministic timestamps.

Note: assemble_engine_config requires an agent row (and optionally
memory) to be present in the staged session state. Each test seeds
the necessary rows before calling commit_with_reload.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    StandaloneErrorCode,
    StandaloneReloadStatus,
)
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import (
    ReloadInitFailed,
    _reload_mutex,
    commit_with_reload,
)
from sqlalchemy import select


@pytest.fixture(autouse=True)
def _graph_module_in_cwd(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """Materialize ``agent.py:graph`` in a tmp cwd for round-2.5 probes.

    Round 2.5 (file-reference probe in ``commit_with_reload``) runs
    ``validate_graph_definition(framework="langgraph", definition,
    project_root=Path.cwd())``. The seed config in this file uses
    ``"agent.py:graph"`` as a placeholder, which the probe resolves
    against the cwd. Without a real file, every test that exercises
    the pipeline would fail at round 2.5. Fixing the fixture (rather
    than every test) preserves the existing seed shape and keeps the
    test signal focused on pipeline behavior.
    """
    cwd_dir = tmp_path_factory.mktemp("graph_cwd")
    src = (
        "from langgraph.graph import StateGraph\n"
        "from typing_extensions import TypedDict\n"
        "class S(TypedDict, total=False):\n"
        "    x: int\n"
        "graph = StateGraph(S)\n"
        "other_graph = StateGraph(S)\n"
    )
    (cwd_dir / "agent.py").write_text(src)
    cwd = os.getcwd()
    os.chdir(cwd_dir)
    try:
        yield
    finally:
        os.chdir(cwd)


def _seed_engine_config_dict() -> dict:
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "ada",
                "graph_definition": "agent.py:graph",
            },
        },
    }


async def _seed_agent(async_session, *, name: str = "Ada") -> StandaloneAgentRow:
    row = StandaloneAgentRow(
        name=name,
        base_engine_config=_seed_engine_config_dict(),
    )
    async_session.add(row)
    await async_session.flush()
    return row


@pytest.mark.asyncio
async def test_happy_path_returns_reloaded(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    result = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert result.status == StandaloneReloadStatus.RELOADED
    stub_reload_callable.assert_called_once()
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"
    # SQLite drops tzinfo on DateTime columns, so compare naive components.
    assert state.last_reloaded_at.replace(tzinfo=None) == frozen_now().replace(
        tzinfo=None
    )


@pytest.mark.asyncio
async def test_round_2_failure_rolls_back_and_raises_422(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """Stage an invalid agent row; round 2 must reject it."""
    # Bypass Phase 1 base_engine_config validation by injecting a
    # malformed dict directly. The assemble step rebuilds an
    # EngineConfig that Pydantic re-validates in round 2.
    row = StandaloneAgentRow(
        name="bad",
        base_engine_config={
            "agent": {"type": "LANGGRAPH", "config": {"name": "x"}}
        },  # missing graph_definition
    )
    async_session.add(row)
    await async_session.flush()

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=stub_reload_callable,
            now=frozen_now,
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.error.code == StandaloneErrorCode.VALIDATION_FAILED
    stub_reload_callable.assert_not_called()


@pytest.mark.asyncio
async def test_round_3_failure_rolls_back_and_records_failure(
    async_session, frozen_now
) -> None:
    """Reload callable raises ReloadInitFailed; pipeline rolls back DB
    but still records the failure outcome to runtime_state."""
    await _seed_agent(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("engine boom"))

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )
    assert exc_info.value.status_code == 500
    assert exc_info.value.error.code == StandaloneErrorCode.RELOAD_FAILED
    assert exc_info.value.error.details == {"recovered": True}

    # Failure record must exist
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reload_failed"
    assert state.last_error == "engine boom"
    assert state.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_structural_change_returns_restart_required(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """First reload sets a baseline; second reload with a different
    structural slice (graph_definition path) returns restart_required."""
    await _seed_agent(async_session)
    first = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert first.status == StandaloneReloadStatus.RELOADED

    # Mutate graph_definition (structural)
    agent = (await async_session.execute(select(StandaloneAgentRow))).scalar_one()
    agent.base_engine_config = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "ada",
                "graph_definition": "agent.py:other_graph",
            },
        },
    }
    await async_session.flush()

    second = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert second.status == StandaloneReloadStatus.RESTART_REQUIRED
    assert stub_reload_callable.call_count == 1  # NOT called for structural


@pytest.mark.asyncio
async def test_first_reload_is_not_structural(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """No prior runtime_state -> first config is never structural."""
    await _seed_agent(async_session)
    result = await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    assert result.status == StandaloneReloadStatus.RELOADED


@pytest.mark.asyncio
async def test_reload_callable_dependency_injected(async_session, frozen_now) -> None:
    """The reload callable can be replaced; tests don't need a real engine."""
    await _seed_agent(async_session)
    custom_calls = []

    async def custom_reload(config: EngineConfig) -> None:
        custom_calls.append(config)

    await commit_with_reload(
        async_session,
        reload_callable=custom_reload,
        now=frozen_now,
    )
    assert len(custom_calls) == 1
    assert isinstance(custom_calls[0], EngineConfig)


@pytest.mark.asyncio
async def test_now_dependency_injected(async_session, stub_reload_callable) -> None:
    fixed = datetime(2027, 1, 1, tzinfo=UTC)
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=lambda: fixed,
    )
    state = await runtime_state.get(async_session)
    assert state is not None
    # SQLite drops tzinfo on DateTime columns, so compare naive components.
    assert state.last_reloaded_at.replace(tzinfo=None) == fixed.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_mutex_serializes_concurrent_acquires() -> None:
    """Two coroutines acquiring the mutex serialize.

    Direct test of the mutex itself, without the full pipeline.
    """
    held: list[str] = []

    async def acquire_then_release(label: str) -> None:
        async with _reload_mutex:
            held.append(f"start:{label}")
            await asyncio.sleep(0)  # yield
            held.append(f"end:{label}")

    await asyncio.gather(
        acquire_then_release("A"),
        acquire_then_release("B"),
    )
    # Either A fully then B fully, or B fully then A fully — never interleaved
    pairs = list(zip(held[0::2], held[1::2], strict=False))
    for start, end in pairs:
        assert start.replace("start:", "") == end.replace("end:", "")


@pytest.mark.asyncio
async def test_hash_propagated_to_runtime_state_on_success(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_applied_config_hash is not None
    assert len(state.last_applied_config_hash) == 64


@pytest.mark.asyncio
async def test_hash_not_propagated_on_failure(async_session, frozen_now) -> None:
    await _seed_agent(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("engine boom"))
    with pytest.raises(AdminAPIError):
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_runtime_state_full_shape_on_reloaded(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"
    assert state.last_message == "Saved and reloaded."
    assert state.last_error is None
    assert state.last_applied_config_hash is not None


@pytest.mark.asyncio
async def test_runtime_state_full_shape_on_restart_required(
    async_session, stub_reload_callable, frozen_now
) -> None:
    await _seed_agent(async_session)
    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )

    agent = (await async_session.execute(select(StandaloneAgentRow))).scalar_one()
    agent.base_engine_config = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {"name": "ada", "graph_definition": "agent.py:other_graph"},
        },
    }
    await async_session.flush()

    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )

    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "restart_required"
    assert "restart" in state.last_message.lower()
    assert state.last_error is None
    assert state.last_applied_config_hash is not None


@pytest.mark.asyncio
async def test_runtime_state_full_shape_on_reload_failed(
    async_session, frozen_now
) -> None:
    await _seed_agent(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("engine boom"))
    with pytest.raises(AdminAPIError):
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reload_failed"
    assert state.last_message == "Engine reload failed; config not saved."
    assert state.last_error == "engine boom"
    assert state.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_round_two_and_a_half_blocks_bad_graph_definition(
    async_session, stub_reload_callable, frozen_now
) -> None:
    """A broken ``graph_definition`` must be caught at round 2.5 with a
    field-mapped 422, before the reload callable runs."""
    row = StandaloneAgentRow(
        name="bad-graph",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "./missing_module_x.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.flush()

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=stub_reload_callable,
            now=frozen_now,
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.error.code == StandaloneErrorCode.VALIDATION_FAILED
    field_paths = [fe.field for fe in exc_info.value.error.field_errors or []]
    assert "agent.config.graphDefinition" in field_paths
    stub_reload_callable.assert_not_called()
