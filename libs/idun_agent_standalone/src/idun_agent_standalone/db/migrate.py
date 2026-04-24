"""Wrappers around Alembic for use from CLI and from tests."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_config() -> Config:
    """Locate ``alembic.ini`` relative to the installed package.

    The ``alembic.ini`` ships at the package root next to ``src/``; the
    migrations directory is inside ``src/idun_agent_standalone/db/migrations``.
    Both paths are resolved from this module so the helper works whether the
    package is installed editable or from a wheel.
    """
    pkg_root = Path(__file__).resolve().parents[3]
    ini_path = pkg_root / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option(
        "script_location", str(Path(__file__).parent / "migrations")
    )
    return cfg


def upgrade_head() -> None:
    command.upgrade(_alembic_config(), "head")


def downgrade_base() -> None:
    command.downgrade(_alembic_config(), "base")
