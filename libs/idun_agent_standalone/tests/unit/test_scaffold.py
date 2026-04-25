"""Tests for ``idun_agent_standalone.scaffold``.

These verify both the structural shape of the generated project (all five
files exist and parse) and that the templates are functional — the
generated ``agent.py`` must produce a graph that ``langgraph`` can compile,
and the generated ``config.yaml`` must round-trip through
``seed_from_yaml``.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import click
import pytest
import yaml
from idun_agent_standalone.config_io import seed_from_yaml
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.scaffold import scaffold_project

EXPECTED_FILES = (
    "config.yaml",
    "agent.py",
    ".env.example",
    "requirements.txt",
    "README.md",
)


def test_scaffold_creates_expected_files(tmp_path: Path) -> None:
    target = tmp_path / "foo"
    result = scaffold_project("foo", target)
    assert result == target.resolve()
    assert result.is_dir()
    for filename in EXPECTED_FILES:
        assert (result / filename).is_file(), f"missing {filename}"


def test_scaffold_default_target_is_cwd_plus_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    result = scaffold_project("alpha")
    assert result == (tmp_path / "alpha").resolve()
    assert (result / "config.yaml").is_file()


def test_readme_includes_project_name(tmp_path: Path) -> None:
    result = scaffold_project("my-shiny-agent", tmp_path / "my-shiny-agent")
    readme = (result / "README.md").read_text()
    assert "# my-shiny-agent" in readme


def test_generated_config_yaml_is_valid(tmp_path: Path) -> None:
    result = scaffold_project("foo", tmp_path / "foo")
    parsed = yaml.safe_load((result / "config.yaml").read_text())
    assert parsed["agent"]["type"] == "LANGGRAPH"
    assert parsed["agent"]["config"]["graph_definition"] == "./agent.py:graph"


@pytest.mark.asyncio
async def test_generated_config_seeds_into_db(tmp_path: Path) -> None:
    result = scaffold_project("foo", tmp_path / "foo")
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = create_sessionmaker(engine)
    async with sessionmaker() as session:
        await seed_from_yaml(session, result / "config.yaml")
        await session.commit()
    await engine.dispose()


def test_generated_agent_compiles_via_langgraph(tmp_path: Path) -> None:
    result = scaffold_project("foo", tmp_path / "foo")
    agent_path = result / "agent.py"

    spec = importlib.util.spec_from_file_location("scaffolded_agent", agent_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    graph = module.graph
    compiled = graph.compile()
    assert compiled is not None


def test_scaffold_refuses_existing_non_empty_dir(tmp_path: Path) -> None:
    target = tmp_path / "foo"
    target.mkdir()
    (target / "existing.txt").write_text("hi")

    with pytest.raises(click.UsageError):
        scaffold_project("foo", target)


def test_scaffold_succeeds_on_existing_empty_dir(tmp_path: Path) -> None:
    target = tmp_path / "foo"
    target.mkdir()

    result = scaffold_project("foo", target)
    assert (result / "config.yaml").is_file()


def test_scaffold_force_overwrites_non_empty_dir(tmp_path: Path) -> None:
    target = tmp_path / "foo"
    target.mkdir()
    (target / "existing.txt").write_text("hi")

    result = scaffold_project("foo", target, force=True)
    assert (result / "config.yaml").is_file()
    assert (target / "existing.txt").is_file(), "existing files should be preserved"


def test_scaffold_rejects_empty_name(tmp_path: Path) -> None:
    with pytest.raises(click.UsageError):
        scaffold_project("", tmp_path / "foo")
