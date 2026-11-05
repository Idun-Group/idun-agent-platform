"""Regression tests for agent-loader sys.path setup (issue #686).

Both the LangGraph and ADK dynamic loaders import the user's agent file via
``importlib.util.spec_from_file_location``, which never adds the agent's
project root to ``sys.path``. Agent files using absolute, package-relative
imports (e.g. ``from myapp.config import config``) therefore failed to boot
with ``ModuleNotFoundError``. These tests pin the fixed behaviour.
"""

import sys
from pathlib import Path

import pytest


@pytest.fixture
def clean_import_state():
    """Snapshot and restore sys.path / sys.modules around a test.

    Loading an agent file inserts its project root onto sys.path and imports
    the user's package into sys.modules. Restore both so tests don't leak.
    """
    saved_path = list(sys.path)
    saved_modules = set(sys.modules)
    try:
        yield
    finally:
        sys.path[:] = saved_path
        for name in set(sys.modules) - saved_modules:
            del sys.modules[name]


def _write_package_project(root: Path, package: str) -> Path:
    """Create ``root/<package>/{__init__,config}.py`` and return the package dir."""
    pkg_dir = root / package
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("")
    (pkg_dir / "config.py").write_text("SETTING = 'from-package-relative-import'\n")
    return pkg_dir


# ensure_import_root unit behaviour


def test_ensure_import_root_uses_package_parent(tmp_path, clean_import_state):
    """A file inside a package resolves to the package's parent directory."""
    from idun_agent_engine.agent.loader_utils import ensure_import_root

    pkg_dir = _write_package_project(tmp_path, "myapp")
    agent_file = pkg_dir / "agent.py"
    agent_file.write_text("x = 1\n")

    root = ensure_import_root(agent_file.resolve())

    assert Path(root) == tmp_path.resolve()
    assert str(tmp_path.resolve()) == sys.path[0]


def test_ensure_import_root_walks_nested_packages(tmp_path, clean_import_state):
    """The walk climbs the full __init__.py chain, not just one level."""
    from idun_agent_engine.agent.loader_utils import ensure_import_root

    outer = tmp_path / "pkg"
    inner = outer / "sub"
    inner.mkdir(parents=True)
    (outer / "__init__.py").write_text("")
    (inner / "__init__.py").write_text("")
    agent_file = inner / "agent.py"
    agent_file.write_text("x = 1\n")

    root = ensure_import_root(agent_file.resolve())

    assert Path(root) == tmp_path.resolve()


def test_ensure_import_root_flat_layout_uses_file_dir(tmp_path, clean_import_state):
    """A file not inside a package resolves to its own directory."""
    from idun_agent_engine.agent.loader_utils import ensure_import_root

    agent_file = tmp_path / "agent.py"
    agent_file.write_text("x = 1\n")

    root = ensure_import_root(agent_file.resolve())

    assert Path(root) == tmp_path.resolve()


def test_ensure_import_root_is_idempotent(tmp_path, clean_import_state):
    """Repeated calls (hot-reload) never add duplicate sys.path entries."""
    from idun_agent_engine.agent.loader_utils import ensure_import_root

    agent_file = tmp_path / "agent.py"
    agent_file.write_text("x = 1\n")

    ensure_import_root(agent_file.resolve())
    ensure_import_root(agent_file.resolve())

    assert sys.path.count(str(tmp_path.resolve())) == 1


def test_ensure_import_root_moves_existing_root_to_front(tmp_path, clean_import_state):
    """A root already on sys.path but behind another entry is moved to index 0.

    Regression for the precedence gap: without moving it, an earlier same-named
    package would shadow the agent's own project.
    """
    from idun_agent_engine.agent.loader_utils import ensure_import_root

    pkg_dir = _write_package_project(tmp_path, "myapp")
    agent_file = pkg_dir / "agent.py"
    agent_file.write_text("x = 1\n")

    # Simulate the root sitting behind a decoy entry at index 0.
    root_str = str(tmp_path.resolve())
    sys.path.insert(0, "/decoy/earlier/entry")
    sys.path.append(root_str)

    ensure_import_root(agent_file.resolve())

    assert sys.path[0] == root_str
    assert sys.path.count(root_str) == 1


def test_ensure_import_root_namespace_package_uses_marker_root(
    tmp_path, clean_import_state
):
    """An implicit namespace package (no __init__.py) resolves via a project marker.

    Regression for the namespace-package gap: the package's parent (the project
    root holding pyproject.toml) must land on sys.path so `from app.config
    import ...` resolves.
    """
    import importlib

    from idun_agent_engine.agent.loader_utils import ensure_import_root

    (tmp_path / "pyproject.toml").write_text("[project]\nname = 'demo'\n")
    ns_pkg = tmp_path / "app"  # NOTE: no __init__.py -> namespace package
    ns_pkg.mkdir()
    (ns_pkg / "config.py").write_text("SETTING = 'namespace-ok'\n")
    agent_file = ns_pkg / "agent.py"
    agent_file.write_text("x = 1\n")

    ensure_import_root(agent_file.resolve())

    assert str(tmp_path.resolve()) in sys.path
    # The parent-on-path is what makes the package-relative import resolve.
    mod = importlib.import_module("app.config")
    assert mod.SETTING == "namespace-ok"


# LangGraph loader — the reported regression


def test_langgraph_loader_resolves_package_relative_import(
    tmp_path, clean_import_state
):
    from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

    pkg_dir = _write_package_project(tmp_path, "lg_app")
    agent_file = pkg_dir / "agent.py"
    agent_file.write_text(
        "from lg_app.config import SETTING\n"
        "from langgraph.graph import END, StateGraph\n"
        "from typing import TypedDict\n"
        "\n"
        "class State(TypedDict):\n"
        "    value: str\n"
        "\n"
        "def node(state: State):\n"
        "    return {'value': SETTING}\n"
        "\n"
        "builder = StateGraph(State)\n"
        "builder.add_node('n', node)\n"
        "builder.set_entry_point('n')\n"
        "builder.add_edge('n', END)\n"
        "graph = builder\n"
    )

    loader = LanggraphAgent()
    graph_builder = loader._load_graph_builder(f"{agent_file.resolve()}:graph")

    assert graph_builder is not None


def test_langgraph_loader_raises_clear_error_without_fix(tmp_path, clean_import_state):
    """Sanity check: a genuinely missing import still surfaces as an error."""
    from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

    agent_file = tmp_path / "agent.py"
    agent_file.write_text("import a_module_that_does_not_exist_anywhere\n")

    loader = LanggraphAgent()
    with pytest.raises(ValueError):
        loader._load_graph_builder(f"{agent_file.resolve()}:graph")


# ADK loader


def test_adk_loader_resolves_package_relative_import(tmp_path, clean_import_state):
    from idun_agent_engine.agent.adk.adk import AdkAgent

    pkg_dir = _write_package_project(tmp_path, "adk_app")
    agent_file = pkg_dir / "agent.py"
    agent_file.write_text(
        "from adk_app.config import SETTING\n"
        "from google.adk.agents import BaseAgent\n"
        "from google.adk.events import Event\n"
        "from google.genai.types import Content, Part\n"
        "\n"
        "class Mock(BaseAgent):\n"
        "    async def _run_async_impl(self, ctx):\n"
        "        yield Event(author='mock', content=Content(parts=[Part(text=SETTING)]))\n"
        "\n"
        "root_agent = Mock(name='mock', description='pkg-relative import test')\n"
    )

    loader = AdkAgent()
    agent_instance = loader._load_agent(f"{agent_file.resolve()}:root_agent")

    assert agent_instance is not None
    assert agent_instance.name == "mock"


# Full-boot reproduction of issue #686


@pytest.mark.asyncio
async def test_issue_686_full_boot_relative_path_from_cwd(
    tmp_path, monkeypatch, clean_import_state
):
    """Faithful repro of #686: a RELATIVE graph_definition pointing into an
    ``app`` package, booted through the real ConfigBuilder path from the
    project cwd (as ``idun init`` would). Before the fix this raised
    ``No module named 'app'``."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    pkg_dir = _write_package_project(tmp_path, "app")
    (pkg_dir / "agent.py").write_text(
        "from app.config import SETTING  # the exact failing import from #686\n"
        "from langgraph.graph import END, StateGraph\n"
        "from typing import TypedDict\n"
        "\n"
        "class State(TypedDict):\n"
        "    value: str\n"
        "\n"
        "def node(state):\n"
        "    return {'value': SETTING}\n"
        "\n"
        "builder = StateGraph(State)\n"
        "builder.add_node('n', node)\n"
        "builder.set_entry_point('n')\n"
        "builder.add_edge('n', END)\n"
        "root_agent = builder\n"
    )

    # Run from the project root, exactly like the reproduction.
    monkeypatch.chdir(tmp_path)

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "issue686",
                "graph_definition": "app/agent.py:root_agent",  # relative
            },
        },
    }
    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert agent is not None
    assert agent.name == "issue686"
