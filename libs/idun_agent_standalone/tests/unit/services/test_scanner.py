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


async def test_detect_langgraph_via_build_function(tmp_path: Path) -> None:
    """Issue #555: ``def _build(): ...; return builder.compile()`` + ``graph = _build()``.

    The canonical LangGraph idiom wraps construction in a function so the
    build can be parameterized (env switches, conditional nodes, DI).
    The scanner must follow a module-level call into a same-module
    function whose body returns a compiled StateGraph.
    """
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "def _build():\n"
        "    builder = StateGraph(int)\n"
        "    builder.add_node('a', lambda s: s)\n"
        "    return builder.compile()\n"
        "\n"
        "graph = _build()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.file_path == "agent.py"
    assert d.variable_name == "graph"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_detect_langgraph_via_build_function_chained(tmp_path: Path) -> None:
    """``return StateGraph(int).compile()`` (no intermediate variable)."""
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "def build():\n"
        "    return StateGraph(int).compile()\n"
        "\n"
        "graph = build()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_detect_langgraph_via_async_build_function(tmp_path: Path) -> None:
    """``async def _build()`` is a legitimate (if rare) builder shape."""
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "async def _build():\n"
        "    builder = StateGraph(int)\n"
        "    return builder.compile()\n"
        "\n"
        "graph = _build()\n"  # await elided — AST shape is what we test
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_detect_langgraph_via_build_function_returning_uncompiled(
    tmp_path: Path,
) -> None:
    """A builder returning a bare (uncompiled) StateGraph still counts.

    Mirrors the module-level behavior where ``graph = StateGraph(int)``
    is detected even without a ``.compile()``.
    """
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "def build():\n"
        "    builder = StateGraph(int)\n"
        "    return builder\n"
        "\n"
        "graph = build()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "graph"


async def test_no_detection_when_build_function_does_not_return_graph(
    tmp_path: Path,
) -> None:
    """A function that builds a StateGraph but returns ``None`` is ignored.

    Guards against the false positive of "any function that touches
    StateGraph is a builder." We require an actual return chain.
    """
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "def configure():\n"
        "    builder = StateGraph(int)\n"
        "    builder.add_node('a', lambda s: s)\n"
        "    builder.compile()\n"  # compiled but discarded
        "\n"
        "graph = configure()\n"  # actually None at runtime
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_no_detection_for_unrelated_function_call(tmp_path: Path) -> None:
    """``graph = some_helper()`` where the helper is not a builder must not match."""
    src = (
        "from langgraph.graph import StateGraph\n"  # langgraph imported elsewhere
        "\n"
        "def helper():\n"
        "    return 42\n"
        "\n"
        "_real = StateGraph(int).compile()\n"
        "value = helper()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    # Only `_real` should be detected; `value = helper()` must not.
    names = {d.variable_name for d in result.detected}
    assert names == {"_real"}


async def test_detect_langgraph_via_build_function_called_twice(tmp_path: Path) -> None:
    """One builder, two module-level calls → two detections."""
    src = (
        "from langgraph.graph import StateGraph\n"
        "\n"
        "def build():\n"
        "    return StateGraph(int).compile()\n"
        "\n"
        "alpha = build()\n"
        "beta = build()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"alpha", "beta"}


async def test_detect_create_deep_agent(tmp_path: Path) -> None:
    """``agent = create_deep_agent(...)`` is the canonical deepagents shape."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "agent = create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.variable_name == "agent"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_detect_create_react_agent(tmp_path: Path) -> None:
    """``agent = create_react_agent(...)`` is the canonical langgraph prebuilt shape."""
    src = (
        "from langgraph.prebuilt import create_react_agent\n"
        "\n"
        "agent = create_react_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].framework == "LANGGRAPH"
    assert result.detected[0].variable_name == "agent"


async def test_detect_factory_with_aliased_import(tmp_path: Path) -> None:
    """``from deepagents import create_deep_agent as build`` honors the alias."""
    src = (
        "from deepagents import create_deep_agent as build\n"
        "\n"
        "agent = build(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_factory_wrapped_in_function(tmp_path: Path) -> None:
    """Wrapper function returning a factory call is recognized without an annotation.

    Mirrors the exact text-to-sql-agent shape: a builder function that
    forwards to ``create_deep_agent`` with no return annotation.
    """
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "def make():\n"
        "    return create_deep_agent(model=None, tools=[])\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_factory_wrapped_in_async_function(tmp_path: Path) -> None:
    """``async def make(): return create_deep_agent(...)`` is also a builder."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "async def make():\n"
        "    return create_deep_agent(model=None, tools=[])\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_factory_wrapped_via_local_binding(tmp_path: Path) -> None:
    """Wrapper that binds the factory result and returns the name still counts."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "def make():\n"
        "    tmp = create_deep_agent(model=None, tools=[])\n"
        "    return tmp\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_multiple_factories_in_same_file(tmp_path: Path) -> None:
    """Two factory calls produce two detections."""
    src = (
        "from langgraph.prebuilt import create_react_agent\n"
        "from deepagents import create_deep_agent\n"
        "\n"
        "alpha = create_react_agent(model=None, tools=[])\n"
        "beta = create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"alpha", "beta"}
    assert all(d.framework == "LANGGRAPH" for d in result.detected)


async def test_detect_factory_among_other_imports_from_same_module(
    tmp_path: Path,
) -> None:
    """Mixed import list: only the recognized factory name is bound."""
    src = (
        "from deepagents import create_deep_agent, FilesystemBackend\n"
        "\n"
        "_backend = FilesystemBackend(root_dir='.')\n"
        "agent = create_deep_agent(model=None, tools=[], backend=_backend)\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"agent"}


async def test_detect_langgraph_via_compiled_state_graph_return_annotation(
    tmp_path: Path,
) -> None:
    """``def make() -> CompiledStateGraph`` is a builder even with an opaque body."""
    src = (
        "from langgraph.graph.state import CompiledStateGraph\n"
        "\n"
        "def make() -> CompiledStateGraph:\n"
        "    return _something_opaque()  # type: ignore[name-defined]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_langgraph_via_compiled_state_graph_subscript_annotation(
    tmp_path: Path,
) -> None:
    """Generic ``-> CompiledStateGraph[State]`` is still recognized."""
    src = (
        "from langgraph.graph.state import CompiledStateGraph\n"
        "\n"
        "def make() -> CompiledStateGraph[dict]:\n"
        "    return _opaque()  # type: ignore[name-defined]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_langgraph_via_compiled_state_graph_dotted_annotation(
    tmp_path: Path,
) -> None:
    """Fully qualified ``langgraph.graph.state.CompiledStateGraph`` is recognized."""
    src = (
        "import langgraph.graph.state\n"
        "\n"
        "def make() -> langgraph.graph.state.CompiledStateGraph:\n"
        "    return _opaque()  # type: ignore[name-defined]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_detect_async_function_with_compiled_state_graph_annotation(
    tmp_path: Path,
) -> None:
    """Async builder with the annotation is recognized."""
    src = (
        "from langgraph.graph.state import CompiledStateGraph\n"
        "\n"
        "async def make() -> CompiledStateGraph:\n"
        "    return _opaque()  # type: ignore[name-defined]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_no_detection_for_factory_name_without_import(tmp_path: Path) -> None:
    """A local function named ``create_deep_agent`` is not a factory.

    Confirms the import gate: only names actually imported from the
    recognized factory modules count.
    """
    src = (
        "from langgraph.graph import StateGraph\n"  # forces has_lg=True
        "\n"
        "def create_deep_agent():\n"
        "    return 'fake'\n"
        "\n"
        "agent = create_deep_agent()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert "agent" not in names


async def test_no_detection_for_factory_import_without_call(tmp_path: Path) -> None:
    """Imported but never called → no detection."""
    src = "from deepagents import create_deep_agent\n"
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_no_detection_for_factory_in_conditional_expression(
    tmp_path: Path,
) -> None:
    """``agent = factory(...) if cond else None`` is an IfExp, not a Call."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "cond = True\n"
        "agent = create_deep_agent(model=None, tools=[]) if cond else None\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert "agent" not in names


async def test_no_detection_for_factory_in_dict_value(tmp_path: Path) -> None:
    """Factory call inside a dict literal is not a module-level agent binding."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "agents = {'sql': create_deep_agent(model=None, tools=[])}\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_no_detection_when_wrapper_discards_factory_result(
    tmp_path: Path,
) -> None:
    """A wrapper that calls the factory but returns ``None`` is not a builder."""
    src = (
        "from deepagents import create_deep_agent\n"
        "\n"
        "def make():\n"
        "    create_deep_agent(model=None, tools=[])  # result discarded\n"
        "    return None\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_no_detection_for_factory_via_star_import(tmp_path: Path) -> None:
    """``from deepagents import *`` is not statically resolvable.

    The scanner can't know which names the wildcard brought in, so the
    safe default is no detection. Documented limitation.
    """
    src = (
        "from deepagents import *\n"
        "\n"
        "agent = create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_no_detection_for_compiled_state_graph_annotation_without_langgraph_import(
    tmp_path: Path,
) -> None:
    """A ``-> CompiledStateGraph`` annotation in a file with no langgraph
    or deepagents import is not enough on its own.

    Pins the contract that ``_annotation_is_compiled_state_graph`` is
    gate-agnostic and the caller (the ``has_lg`` regex pre-filter) owns
    the trust decision. Without the import gate firing, the annotation
    pre-pass never runs.
    """
    src = (
        "def make() -> CompiledStateGraph:  # type: ignore[name-defined]\n"
        "    return None  # type: ignore[return-value]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_detect_compiled_state_graph_annotation_with_none_body(
    tmp_path: Path,
) -> None:
    """The annotation is trusted even when the body returns ``None``.

    The annotation is treated as a declarative contract — we don't try to
    second-guess the body. This pins that ``trust-the-annotation``
    contract explicitly.
    """
    src = (
        "from langgraph.graph.state import CompiledStateGraph\n"
        "\n"
        "def make() -> CompiledStateGraph:\n"
        "    return None  # type: ignore[return-value]\n"
        "\n"
        "agent = make()\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    assert result.detected[0].variable_name == "agent"


async def test_no_detection_for_factory_via_module_import_attribute_access(
    tmp_path: Path,
) -> None:
    """``import deepagents`` + ``deepagents.create_deep_agent(...)`` is not detected.

    The scanner only resolves bare ``Name`` calls, not ``Attribute``
    calls. Documented limitation matching the existing scanner's
    ``StateGraph`` recognizer (which also requires the unqualified
    name). Users who hit this should switch to ``from deepagents import
    create_deep_agent``.
    """
    src = (
        "import deepagents\n"
        "\n"
        "agent = deepagents.create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    assert result.detected == []


async def test_factory_and_state_graph_coexist_in_same_file(tmp_path: Path) -> None:
    """A file with both a StateGraph compile and a factory call emits both."""
    src = (
        "from langgraph.graph import StateGraph\n"
        "from deepagents import create_deep_agent\n"
        "\n"
        "graph = StateGraph(int).compile()\n"
        "agent = create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "agent.py").write_text(src)
    result = await scan_folder(tmp_path)
    names = {d.variable_name for d in result.detected}
    assert names == {"graph", "agent"}
    assert all(d.framework == "LANGGRAPH" for d in result.detected)


async def test_factory_in_file_does_not_block_adk_in_another_file(
    tmp_path: Path,
) -> None:
    """Factory detection in one file is independent of ADK detection in another."""
    (tmp_path / "lg.py").write_text(
        "from deepagents import create_deep_agent\n"
        "agent = create_deep_agent(model=None, tools=[])\n"
    )
    (tmp_path / "adk.py").write_text(
        "from google.adk.agents import Agent\n" "root_agent = Agent(name='x')\n"
    )
    result = await scan_folder(tmp_path)
    by_framework = {d.framework: d.variable_name for d in result.detected}
    assert by_framework == {"LANGGRAPH": "agent", "ADK": "root_agent"}


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
                    "type": "FOOBAR",
                    "config": {"component_definition": "./pipe.py:pipe"},
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.has_idun_config is False
    assert result.detected == []


async def test_dedup_config_over_source(tmp_path: Path) -> None:
    """Config (HIGH) and source (MEDIUM) on same file:var → 1 entry, HIGH wins."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "From config",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.confidence == "HIGH"
    assert d.source == "config"
    assert d.inferred_name == "From config"


async def test_dedup_langgraph_json_over_source(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "langgraph.json").write_text(
        json.dumps({"graphs": {"helpdesk": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.source == "langgraph_json"
    assert d.inferred_name == "helpdesk"


async def test_distinct_files_not_deduped(tmp_path: Path) -> None:
    """Two genuinely different agents both surface."""
    (tmp_path / "alpha.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "beta.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2


async def test_dedup_config_beats_langgraph_json_on_tie(tmp_path: Path) -> None:
    """HIGH-vs-HIGH tiebreaker: first-seen (config.yaml) wins over langgraph.json.

    Both detection paths emit a HIGH-confidence entry for the same
    ``(file_path, variable_name)`` pair. ``scan_folder`` runs config
    detection first, so the config entry is in the dedup map before
    the langgraph.json entry; with the strict ``>`` comparison in
    ``_dedup`` the config entry survives.
    """
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "From config",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    (tmp_path / "langgraph.json").write_text(
        json.dumps({"graphs": {"helpdesk": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.source == "config"
    assert d.inferred_name == "From config"


async def test_inferred_name_uses_pyproject(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "my-bot"\nversion = "0.1.0"\n'
    )
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "My Bot"


async def test_inferred_name_falls_back_to_parent_dir(tmp_path: Path) -> None:
    sub = tmp_path / "chat_assistant"
    sub.mkdir()
    (sub / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "Chat Assistant"


async def test_inferred_name_skips_src_in_parent(tmp_path: Path) -> None:
    """A src/ wrapper is skipped during parent-dir inference.

    The cascade falls through to filename-based inference (rule 5) and
    then to the fallback (rule 6) because the stem ``agent`` strips to
    empty under the ``_?agent$`` regex. Confirms src/ is correctly NOT
    used as the inferred name.
    """
    src = tmp_path / "src"
    src.mkdir()
    (src / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    # src/ skipped → rule 5 strips "agent" → empty → rule 6 fallback.
    assert result.detected[0].inferred_name == "My Agent"


async def test_inferred_name_strips_underscore_agent_suffix(tmp_path: Path) -> None:
    (tmp_path / "chatbot_agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "Chatbot"


async def test_inferred_name_fallback(tmp_path: Path) -> None:
    """Filename ``agent.py`` strips to empty → ``My Agent`` fallback."""
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    # No pyproject, no parent dir, filename ``agent`` after stripping is empty
    # so we fall through to the literal "My Agent" fallback.
    assert result.detected[0].inferred_name == "My Agent"


async def test_inferred_name_langgraph_json_key_wins(tmp_path: Path) -> None:
    """langgraph.json key takes priority over pyproject."""
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "my-bot"\n')
    (tmp_path / "langgraph.json").write_text(
        json.dumps({"graphs": {"helpdesk": "./agent.py:graph"}})
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "helpdesk"


async def test_inferred_name_config_name_wins(tmp_path: Path) -> None:
    """Idun config.name takes priority over everything."""
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "my-bot"\n')
    (tmp_path / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "From Config",
                        "graph_definition": "./agent.py:graph",
                    },
                }
            }
        )
    )
    result = await scan_folder(tmp_path)
    assert result.detected[0].inferred_name == "From Config"


async def test_ipynb_files_ignored(tmp_path: Path) -> None:
    """Notebook files are never parsed."""
    (tmp_path / "agent.ipynb").write_text(
        '{ "cells": [{ "source": ["from langgraph.graph import StateGraph\\n",'
        ' "graph = StateGraph(int).compile()\\n"] }] }'
    )
    result = await scan_folder(tmp_path)
    assert result.detected == []
    assert result.has_python_files is False


async def test_oversized_py_skipped(tmp_path: Path) -> None:
    """Files > 1 MB are skipped (binary heuristic)."""
    (tmp_path / "huge.py").write_text("# pad\n" * 200_000)  # ~1.4 MB
    result = await scan_folder(tmp_path)
    assert result.has_python_files is False  # huge.py was skipped
    assert result.detected == []


async def test_scan_duration_populated(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.scan_duration_ms >= 0


async def test_full_state_2_shape(tmp_path: Path) -> None:
    """End-to-end: state-2 (one supported agent) feeds the wizard correctly."""
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "support-bot"\n')
    (tmp_path / "agent.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    result = await scan_folder(tmp_path)
    assert result.has_python_files is True
    assert result.has_idun_config is False
    assert len(result.detected) == 1
    d = result.detected[0]
    assert d.framework == "LANGGRAPH"
    assert d.inferred_name == "Support Bot"
    assert d.confidence == "MEDIUM"
    assert d.source == "source"


async def test_full_state_3_shape(tmp_path: Path) -> None:
    """End-to-end: state-3 (multiple agents) returns a list the wizard can show."""
    (tmp_path / "alpha.py").write_text(
        "from langgraph.graph import StateGraph\n" "graph = StateGraph(int).compile()\n"
    )
    (tmp_path / "beta.py").write_text(
        "from google.adk.agents import Agent\n" "root_agent = Agent(name='b')\n"
    )
    result = await scan_folder(tmp_path)
    assert len(result.detected) == 2
    frameworks = {d.framework for d in result.detected}
    assert frameworks == {"LANGGRAPH", "ADK"}
