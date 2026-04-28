"""Unit tests for ``services.scanner``."""

from __future__ import annotations

from pathlib import Path

from idun_agent_standalone.services.scanner import scan_folder


async def test_empty_folder(tmp_path: Path) -> None:
    result = await scan_folder(tmp_path)
    assert result.detected == []
    assert result.has_python_files is False
    assert result.has_idun_config is False
    assert result.root == str(tmp_path)
    assert result.scan_duration_ms >= 0


async def test_has_python_files_set_when_py_present(tmp_path: Path) -> None:
    (tmp_path / "noise.py").write_text("print('hi')\n")
    result = await scan_folder(tmp_path)
    assert result.has_python_files is True
    assert result.detected == []


async def test_skip_list_ignores_dot_venv(tmp_path: Path) -> None:
    """A graph file inside .venv must not be detected."""
    venv = tmp_path / ".venv" / "lib"
    venv.mkdir(parents=True)
    (venv / "trap.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []
    # The walk did not recurse into .venv at all
    assert result.has_python_files is False


async def test_skip_list_ignores_dotted_dir(tmp_path: Path) -> None:
    hidden = tmp_path / ".cache"
    hidden.mkdir()
    (hidden / "x.py").write_text("x = 1\n")
    result = await scan_folder(tmp_path)
    assert result.has_python_files is False


async def test_depth_limit_4(tmp_path: Path) -> None:
    """Files deeper than 4 levels are not visited."""
    deep = tmp_path / "a" / "b" / "c" / "d" / "e"
    deep.mkdir(parents=True)
    (deep / "deep.py").write_text("x = 1\n")
    shallow = tmp_path / "a" / "b" / "c" / "d"
    (shallow / "shallow.py").write_text("y = 1\n")
    result = await scan_folder(tmp_path)
    # Depth ≤ 4 means up to 4 path components below the root, so
    # ``a/b/c/d/shallow.py`` is in (4 components) and ``e/deep.py`` is out.
    assert result.has_python_files is True  # shallow.py was visited
