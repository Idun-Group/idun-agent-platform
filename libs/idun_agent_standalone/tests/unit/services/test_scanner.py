"""Unit tests for ``services.scanner``."""

from __future__ import annotations

import json
from pathlib import Path

import yaml
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
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
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


async def test_detect_minimal_langgraph(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_detect_uncompiled_langgraph(tmp_path: Path) -> None:
    """A bare StateGraph(...) assignment counts."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int)\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_detect_compiled_via_intermediate(tmp_path: Path) -> None:
    """g = StateGraph(...); graph = g.compile() → 1 detection on the compiled binding."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "g = StateGraph(int)\n"
        "graph = g.compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_no_false_positive_on_unrelated_compile(tmp_path: Path) -> None:
    """``something.compile()`` with no traceable StateGraph receiver is ignored."""
    (tmp_path / "noise.py").write_text("import re\n" "pat = re.compile(r'x')\n")
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_detect_minimal_adk(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from google.adk.agents import Agent\n" "root_agent = Agent(name='x')\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "ADK"
    assert d.variable_name == "root_agent"
    assert d.source == "source"


async def test_detect_adk_subclasses(tmp_path: Path) -> None:
    """LlmAgent / SequentialAgent / ParallelAgent / LoopAgent all count."""
    src = (
        "from google.adk.agents import LlmAgent, SequentialAgent\n"
        "from google.adk.agents import ParallelAgent, LoopAgent\n"
        "a = LlmAgent(name='a')\n"
        "b = SequentialAgent(name='b')\n"
        "c = ParallelAgent(name='c')\n"
        "d = LoopAgent(name='d')\n"
    )
    (tmp_path / "agents.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"a", "b", "c", "d"}


async def test_skip_unparseable_source(tmp_path: Path) -> None:
    """A SyntaxError in one file does not crash the scan."""
    (tmp_path / "broken.py").write_text(
        "from langgraph.graph import StateGraph\n"
        "graph = StateGraph(int  # missing paren\n"
    )
    (tmp_path / "good.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    files = {d.file_path for d in result.detected}
    assert files == {"good.py"}


async def test_langgraph_json_single_graph(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text(
        json.dumps(
            {
                "dependencies": ["./agent.py"],
                "graphs": {"helpdesk": "./agent.py:graph"},
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "HIGH"
    assert d.source == "langgraph_json"
    # has_idun_config is *not* set by langgraph.json
    assert result.has_idun_config is False


async def test_langgraph_json_multiple_graphs(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text(
        json.dumps(
            {
                "graphs": {
                    "alpha": "./a.py:graph",
                    "beta": "./b.py:graph",
                },
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2
    assert {d.variable_name for d in result.detected} == {"graph"}
    assert {d.file_path for d in result.detected} == {"a.py", "b.py"}


async def test_langgraph_json_malformed_skipped(tmp_path: Path) -> None:
    (tmp_path / "langgraph.json").write_text("{not valid json")
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_langgraph_json_only_at_root(tmp_path: Path) -> None:
    """langgraph.json deeper than depth 0 is not consulted."""
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "langgraph.json").write_text(
        json.dumps({"graphs": {"x": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_idun_config_langgraph(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Helpdesk",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "HIGH"
    assert d.source == "config"


async def test_idun_config_adk(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "ADK",
                    "config": {
                        "name": "Helpdesk",
                        "agent": "./agent.py:root_agent",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "ADK"
    assert d.variable_name == "root_agent"


async def test_idun_config_yml_extension(tmp_path: Path) -> None:
    (tmp_path / "config.yml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True
    assert len(result.detected) == 1


async def test_idun_config_at_depth_2(tmp_path: Path) -> None:
    nested = tmp_path / "sub" / "deeper"
    nested.mkdir(parents=True)
    (nested / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is True


async def test_idun_config_at_depth_3_ignored(tmp_path: Path) -> None:
    """Idun config at depth > 2 is not consulted."""
    nested = tmp_path / "a" / "b" / "c"
    nested.mkdir(parents=True)
    (nested / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {"graph_definition": "./agent.py:graph"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False


async def test_idun_config_malformed_skipped(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text("not: valid: yaml: at: all:")
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False
    assert result.detected == []


async def test_idun_config_unsupported_type_skipped(tmp_path: Path) -> None:
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "HAYSTACK",
                    "config": {"component_definition": "./pipe.py:pipe"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False
    assert result.detected == []
