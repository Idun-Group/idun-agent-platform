from __future__ import annotations

import os
from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services.reload import (
    ReloadInitFailed,
    commit_with_reload,
)


@pytest.fixture(autouse=True)
def _graph_module_in_cwd(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """Materialize ``agent.py:graph`` in a tmp cwd for round-2.5 probes.

    See the matching fixture in ``test_reload.py`` for rationale.
    """
    cwd_dir = tmp_path_factory.mktemp("graph_cwd")
    src = (
        "from langgraph.graph import StateGraph\n"
        "from typing_extensions import TypedDict\n"
        "class S(TypedDict, total=False):\n"
        "    x: int\n"
        "graph = StateGraph(S)\n"
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


async def _seed_agent(async_session) -> None:
    async_session.add(
        StandaloneAgentRow(name="Ada", base_engine_config=_seed_engine_config_dict())
    )
    await async_session.flush()


def _wrap(session):
    real_commit = session.commit
    real_rollback = session.rollback
    commit_mock = AsyncMock(side_effect=real_commit)
    rollback_mock = AsyncMock(side_effect=real_rollback)
    session.commit = commit_mock
    session.rollback = rollback_mock
    return commit_mock, rollback_mock


async def test_success_path_commits_twice_no_rollback(
    async_session, stub_reload_callable, frozen_now
):
    await _seed_agent(async_session)
    commit_mock, rollback_mock = _wrap(async_session)

    await commit_with_reload(
        async_session,
        reload_callable=stub_reload_callable,
        now=frozen_now,
    )

    assert commit_mock.await_count == 2
    assert rollback_mock.await_count == 0
    stub_reload_callable.assert_awaited_once()


async def test_round2_failure_rolls_back_no_commit(
    async_session, stub_reload_callable, frozen_now
):
    async_session.add(
        StandaloneAgentRow(
            name="bad",
            base_engine_config={
                "agent": {"type": "LANGGRAPH", "config": {"name": "x"}},
            },
        )
    )
    await async_session.flush()
    commit_mock, rollback_mock = _wrap(async_session)

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=stub_reload_callable,
            now=frozen_now,
        )

    assert exc_info.value.status_code == 422
    assert commit_mock.await_count == 0
    assert rollback_mock.await_count == 1
    stub_reload_callable.assert_not_awaited()


async def test_round3_failure_rolls_back_then_commits_outcome(
    async_session, frozen_now
):
    await _seed_agent(async_session)
    commit_mock, rollback_mock = _wrap(async_session)
    failing_reload = AsyncMock(side_effect=ReloadInitFailed("boom"))

    with pytest.raises(AdminAPIError) as exc_info:
        await commit_with_reload(
            async_session,
            reload_callable=failing_reload,
            now=frozen_now,
        )

    assert exc_info.value.status_code == 500
    assert commit_mock.await_count == 1
    assert rollback_mock.await_count == 1
