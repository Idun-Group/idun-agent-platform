"""Unit tests for the starter-project scaffolder."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from idun_agent_standalone.services import scaffold


def test_create_starter_langgraph_writes_five_files(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")

    expected_names = {
        "agent.py",
        "requirements.txt",
        ".env.example",
        "README.md",
        ".gitignore",
    }
    assert {p.name for p in written} == expected_names
    for path in written:
        assert path.exists()
        assert path.is_file()


def test_langgraph_agent_py_is_syntactically_valid(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    source = (tmp_path / "agent.py").read_text()
    # ast.parse raises SyntaxError on invalid source
    ast.parse(source)
    # Sanity: the variable our scanner expects is present.
    assert "graph = " in source


def test_langgraph_requirements_lists_idun_and_langgraph(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    contents = (tmp_path / "requirements.txt").read_text()
    assert "idun-agent-standalone" in contents
    assert "langgraph" in contents


def test_langgraph_env_example_carries_openai_key(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    assert "OPENAI_API_KEY" in (tmp_path / ".env.example").read_text()


def test_gitignore_covers_env_and_caches(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    contents = (tmp_path / ".gitignore").read_text()
    for entry in (".env", "__pycache__/", ".venv/"):
        assert entry in contents


def test_create_starter_adk_writes_five_files(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="ADK")
    assert {p.name for p in written} == {
        "agent.py",
        "requirements.txt",
        ".env.example",
        "README.md",
        ".gitignore",
    }


def test_adk_agent_py_is_syntactically_valid(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    source = (tmp_path / "agent.py").read_text()
    ast.parse(source)
    # The scanner expects an `agent` variable bound to an ADK Agent.
    assert "agent = " in source
    assert "Agent(" in source


def test_adk_requirements_lists_idun_and_adk(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    contents = (tmp_path / "requirements.txt").read_text()
    assert "idun-agent-standalone" in contents
    assert "google-adk" in contents


def test_adk_env_example_carries_google_key(tmp_path: Path) -> None:
    scaffold.create_starter_project(tmp_path, framework="ADK")
    assert "GOOGLE_API_KEY" in (tmp_path / ".env.example").read_text()


def test_conflict_pre_check_raises_with_paths(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text("# pre-existing\n")
    (tmp_path / ".gitignore").write_text("# pre-existing\n")
    with pytest.raises(scaffold.ScaffoldConflictError) as exc_info:
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    conflicts = {p.name for p in exc_info.value.paths}
    assert conflicts == {"agent.py", ".gitignore"}


def test_conflict_writes_zero_files(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text("# pre-existing\n")
    pre_count = len(list(tmp_path.iterdir()))
    with pytest.raises(scaffold.ScaffoldConflictError):
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    assert len(list(tmp_path.iterdir())) == pre_count


def test_mid_write_failure_cleans_up_partial_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If write_text raises midway through, already-written files get unlinked."""
    real_write_text = Path.write_text
    call_count = {"n": 0}

    def flaky_write_text(
        self: Path, content: str, *args: object, **kwargs: object
    ) -> int:
        call_count["n"] += 1
        # Fail on the 3rd file written (any in-progress write triggers cleanup).
        if call_count["n"] == 3:
            raise OSError("simulated disk full")
        return real_write_text(self, content, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", flaky_write_text)

    with pytest.raises(OSError, match="simulated disk full"):
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")

    # Cleanup must remove all final files we successfully renamed AND any
    # in-flight `.idun-tmp` file from the failed write. Directory must be
    # restored to its pre-call state (empty in this fixture).
    assert (
        list(tmp_path.iterdir()) == []
    ), f"unexpected leftover files: {[p.name for p in tmp_path.iterdir()]}"


def test_mid_write_failure_cleans_up_orphan_tmp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An OSError during write_text leaves no orphan .idun-tmp file behind."""
    real_write_text = Path.write_text

    def fail_first_write(
        self: Path, content: str, *args: object, **kwargs: object
    ) -> int:
        # Fail on the very first write_text call — no files renamed yet,
        # but the tmp file may have been created and partially written.
        # The contract says: zero leftover files in tmp_path.
        if self.name.endswith(".idun-tmp"):
            # Simulate a write that creates the file then fails.
            real_write_text(self, content[:5], *args, **kwargs)
            raise OSError("simulated mid-write failure")
        return real_write_text(self, content, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", fail_first_write)

    with pytest.raises(OSError, match="simulated mid-write failure"):
        scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")

    # No final files, no `.idun-tmp` orphans.
    assert (
        list(tmp_path.iterdir()) == []
    ), f"unexpected leftover files: {[p.name for p in tmp_path.iterdir()]}"


def test_returned_paths_resolve_inside_root(tmp_path: Path) -> None:
    written = scaffold.create_starter_project(tmp_path, framework="LANGGRAPH")
    for path in written:
        assert path.parent == tmp_path
