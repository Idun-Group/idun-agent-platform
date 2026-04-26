"""Wrappers around Alembic for use from CLI and from tests."""

from __future__ import annotations

from importlib import resources

from alembic import command
from alembic.config import Config


def _alembic_ini_path() -> str:
    """Resolve packaged ``alembic.ini`` in both editable and wheel installs."""
    return str(resources.files("idun_agent_standalone") / "alembic.ini")


def _alembic_config() -> Config:
    """Build an Alembic ``Config`` pointing at the packaged ``alembic.ini``.

    The ini file ships inside the package at
    ``idun_agent_standalone/alembic.ini`` and uses ``%(here)s/db/migrations``
    so the script location resolves correctly regardless of install layout
    (editable checkout, installed wheel, or running ``alembic`` from the
    package directory).
    """
    return Config(_alembic_ini_path())


def upgrade_head() -> None:
    command.upgrade(_alembic_config(), "head")


def downgrade_base() -> None:
    command.downgrade(_alembic_config(), "base")
