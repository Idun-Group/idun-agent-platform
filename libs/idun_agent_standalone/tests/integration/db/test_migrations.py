"""End-to-end Alembic migration roundtrip.

The migration helper drives its own asyncio loop (Alembic's env.py uses
``asyncio.run``), so this test stays sync to avoid loop nesting.
"""

from __future__ import annotations

from idun_agent_standalone.db.migrate import downgrade_base, upgrade_head


def test_migrate_up_down_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'm.db'}")
    upgrade_head()
    downgrade_base()
