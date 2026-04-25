"""Tests for the CLI surface.

Only commands fully implemented in Phase 1 (``--help``, ``hash-password``)
are exercised here; the rest are stubs that import from modules added in
later phases.
"""

from __future__ import annotations

from pathlib import Path

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


def test_init_scaffolds_project(tmp_path: Path):
    target = tmp_path / "demo-cli"
    r = CliRunner().invoke(main, ["init", "demo-cli", "--target", str(target)])
    assert r.exit_code == 0, r.output
    for filename in (
        "config.yaml",
        "agent.py",
        ".env.example",
        "requirements.txt",
        "README.md",
    ):
        assert (target / filename).is_file(), f"missing {filename}"
    assert "Scaffolded" in r.output
    assert "idun-standalone serve" in r.output


def test_init_refuses_existing_non_empty_dir(tmp_path: Path):
    target = tmp_path / "demo-cli"
    target.mkdir()
    (target / "x.txt").write_text("hi")
    r = CliRunner().invoke(main, ["init", "demo-cli", "--target", str(target)])
    assert r.exit_code != 0
    assert "refusing to overwrite" in r.output


def test_init_force_overwrites(tmp_path: Path):
    target = tmp_path / "demo-cli"
    target.mkdir()
    (target / "x.txt").write_text("hi")
    r = CliRunner().invoke(
        main, ["init", "demo-cli", "--target", str(target), "--force"]
    )
    assert r.exit_code == 0, r.output
    assert (target / "config.yaml").is_file()
