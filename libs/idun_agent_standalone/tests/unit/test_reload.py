"""Unit tests for the reload orchestrator."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from idun_agent_standalone.reload import orchestrate_reload


@dataclass
class _FakeEngine:
    fail_on: object | None = None
    initialized_with: object | None = None
    shutdown_called: bool = False

    async def shutdown_agent(self) -> None:
        self.shutdown_called = True

    async def initialize(self, cfg: object) -> None:
        if self.fail_on is not None and cfg == self.fail_on:
            raise RuntimeError("init boom")
        self.initialized_with = cfg


@pytest.mark.asyncio
async def test_success_path():
    eng = _FakeEngine()
    out = await orchestrate_reload(
        engine=eng, new_config="NEW", previous_config="OLD", structural_change=False
    )
    assert out.kind == "reloaded"
    assert eng.initialized_with == "NEW"


@pytest.mark.asyncio
async def test_structural_change_skips_swap():
    eng = _FakeEngine()
    out = await orchestrate_reload(
        engine=eng, new_config="NEW", previous_config="OLD", structural_change=True
    )
    assert out.kind == "restart_required"
    assert eng.initialized_with is None


@pytest.mark.asyncio
async def test_failure_recovers_to_previous():
    eng = _FakeEngine(fail_on="NEW")
    out = await orchestrate_reload(
        engine=eng, new_config="NEW", previous_config="OLD", structural_change=False
    )
    assert out.kind == "init_failed"
    assert out.recovered is True
    assert eng.initialized_with == "OLD"


@pytest.mark.asyncio
async def test_failure_recovery_also_fails():
    class _BreakAll:
        async def shutdown_agent(self) -> None:
            return None

        async def initialize(self, cfg: object) -> None:
            raise RuntimeError("both boom")

    out = await orchestrate_reload(
        engine=_BreakAll(),
        new_config="N",
        previous_config="O",
        structural_change=False,
    )
    assert out.kind == "init_failed"
    assert out.recovered is False
