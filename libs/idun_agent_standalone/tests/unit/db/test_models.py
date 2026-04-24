"""Smoke test that all ORM models create cleanly and roundtrip a row."""

from __future__ import annotations

from datetime import datetime

import pytest
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.db.models import (
    AdminUserRow,
    AgentRow,
    GuardrailRow,
    IntegrationRow,
    McpServerRow,
    MemoryRow,
    ObservabilityRow,
    PromptRow,
    SessionRow,
    ThemeRow,
)
from sqlalchemy import select


@pytest.mark.asyncio
async def test_all_models_create_and_roundtrip(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'x.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)

    async with sm() as s:
        s.add(
            AgentRow(
                id="singleton",
                name="x",
                framework="langgraph",
                graph_definition="a.py:g",
                config={"k": 1},
            )
        )
        s.add(GuardrailRow(id="singleton", config={"guardrails": []}, enabled=True))
        s.add(MemoryRow(id="singleton", config={"type": "memory"}))
        s.add(ObservabilityRow(id="singleton", config={}))
        s.add(ThemeRow(id="singleton", config={"appName": "X"}))
        s.add(AdminUserRow(id="admin", password_hash="$2b$xxx"))
        s.add(McpServerRow(id="m1", name="time", config={}, enabled=True))
        s.add(
            PromptRow(
                id="p1",
                prompt_key="k",
                version=1,
                content="hello",
                tags=[],
            )
        )
        s.add(IntegrationRow(id="i1", kind="whatsapp", config={}, enabled=False))
        s.add(SessionRow(id="sess", message_count=0))
        await s.commit()

    async with sm() as s:
        agent = (await s.execute(select(AgentRow))).scalar_one()
        assert agent.config == {"k": 1}
        assert isinstance(agent.updated_at, datetime)

    await engine.dispose()
