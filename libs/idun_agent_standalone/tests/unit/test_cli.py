"""Tests for the CLI surface.

Only commands fully implemented in Phase 1 (``--help``, ``hash-password``)
are exercised here; the rest are stubs that import from modules added in
later phases.
"""

from __future__ import annotations

from click.testing import CliRunner
from idun_agent_standalone.cli import main


def test_cli_help_lists_all_commands():
    r = CliRunner().invoke(main, ["--help"])
    assert r.exit_code == 0
    for word in ("serve", "hash-password", "export", "import", "db", "init"):
        assert word in r.output


def test_hash_password_produces_bcrypt_hash():
    r = CliRunner().invoke(main, ["hash-password", "--password", "hunter2"])
    assert r.exit_code == 0
    out = r.output.strip()
    assert out.startswith("$2")
    assert len(out) >= 59
