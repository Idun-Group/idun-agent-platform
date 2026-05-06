"""Unit tests for validate_graph_definition."""

from __future__ import annotations

from pathlib import Path

import pytest

from idun_agent_engine.agent.validation import (
    GraphValidationCode,
    validate_graph_definition,
)


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    return tmp_path


def _write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)


def test_file_not_found(project_root: Path) -> None:
    result = validate_graph_definition(
        framework="langgraph",
        definition="./missing.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.FILE_NOT_FOUND
    assert "missing.py" in result.message


def test_import_error(project_root: Path) -> None:
    _write(project_root / "broken.py", "import nonexistent_top_level_module_xyz\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./broken.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.IMPORT_ERROR


def test_attribute_not_found(project_root: Path) -> None:
    _write(project_root / "agent.py", "x = 1\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.ATTRIBUTE_NOT_FOUND
    assert "graph" in result.message


def test_wrong_type(project_root: Path) -> None:
    _write(project_root / "agent.py", "graph = 'not a state graph'\n")
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is False
    assert result.code == GraphValidationCode.WRONG_TYPE


def test_happy_path_state_graph(project_root: Path) -> None:
    _write(
        project_root / "agent.py",
        """
from typing import TypedDict
from langgraph.graph import StateGraph

class State(TypedDict):
    x: int

graph = StateGraph(State)
graph.add_node("noop", lambda s: s)
graph.set_entry_point("noop")
graph.set_finish_point("noop")
""".strip(),
    )
    result = validate_graph_definition(
        framework="langgraph",
        definition="./agent.py:graph",
        project_root=project_root,
    )
    assert result.ok is True
    assert result.code is None
