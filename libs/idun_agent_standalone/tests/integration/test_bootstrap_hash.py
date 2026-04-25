"""Bootstrap-hash drift warning — spec §3.1.

After first-boot seed the DB is the source of truth. Edits to the
on-disk YAML are silently ignored. The warning gives operators a
single signal that the file has drifted from the bootstrap snapshot.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import yaml
from idun_agent_standalone.app import _bootstrap_if_needed
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.settings import StandaloneSettings


@pytest.fixture(autouse=True)
def _reenable_app_logger():
    """Alembic's ``fileConfig`` (run by other tests) disables our logger.

    ``disable_existing_loggers`` defaults to True, so any test that
    invokes ``upgrade_head`` ahead of this module silently drops our
    log records. Re-enable the standalone app logger explicitly so
    caplog captures our drift warning.
    """
    logger = logging.getLogger("idun_agent_standalone.app")
    previous = logger.disabled
    logger.disabled = False
    yield
    logger.disabled = previous


@asynccontextmanager
async def _schema(database_url: str):
    engine = create_db_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


def _yaml(name: str = "v1") -> dict:
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": name,
                "graph_definition": "module:graph",
                "checkpointer": {"type": "memory"},
            },
        }
    }


@pytest.mark.asyncio
async def test_drift_warning_emitted_on_second_boot(
    tmp_path: Path, monkeypatch, caplog
):
    """First boot seeds + records hash. Second boot with edited YAML warns."""
    db_path = tmp_path / "boot.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(_yaml(name="agent-v1")))

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(config_path))

    async with _schema(f"sqlite+aiosqlite:///{db_path}") as engine:
        sm = create_sessionmaker(engine)
        settings = StandaloneSettings()

        # First boot: seeds the DB and records the YAML hash.
        with caplog.at_level(logging.WARNING, logger="idun_agent_standalone.app"):
            await _bootstrap_if_needed(settings, sm)
        assert not [
            r for r in caplog.records if "IDUN_CONFIG_PATH YAML hash" in r.message
        ]

        # Edit the YAML on disk (simulating a stale operator file).
        caplog.clear()
        config_path.write_text(yaml.safe_dump(_yaml(name="agent-v2")))

        with caplog.at_level(logging.WARNING, logger="idun_agent_standalone.app"):
            await _bootstrap_if_needed(settings, sm)

        warnings = [
            r for r in caplog.records if "IDUN_CONFIG_PATH YAML hash" in r.message
        ]
        assert warnings, (
            f"expected drift warning on second boot. "
            f"records: {[r.message for r in caplog.records]}"
        )
        assert "differs from bootstrap hash" in warnings[0].message


@pytest.mark.asyncio
async def test_no_warning_when_yaml_unchanged(
    tmp_path: Path, monkeypatch, caplog
):
    """Re-booting with the same YAML must NOT log a warning."""
    db_path = tmp_path / "stable.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(_yaml(name="stable")))

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(config_path))

    async with _schema(f"sqlite+aiosqlite:///{db_path}") as engine:
        sm = create_sessionmaker(engine)
        settings = StandaloneSettings()

        await _bootstrap_if_needed(settings, sm)
        caplog.clear()
        with caplog.at_level(logging.WARNING, logger="idun_agent_standalone.app"):
            await _bootstrap_if_needed(settings, sm)
        assert not [
            r for r in caplog.records if "IDUN_CONFIG_PATH YAML hash" in r.message
        ]
