"""Unit tests for the starter-project scaffolder."""

from __future__ import annotations

import ast
from pathlib import Path

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
