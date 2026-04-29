"""Starter project scaffolder.

Pure-IO module: emits a fixed set of files into a target directory.
No DB, no FastAPI, no event loop. Imported by the onboarding HTTP
endpoint and (later) by sub-project D's ``idun init`` CLI.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Literal

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)


class ScaffoldConflictError(Exception):
    """Raised when one or more target files already exist.

    Holds ``paths`` so the router can echo them back to the UI for a
    human-readable conflict message. The scaffolder writes nothing
    when it raises this, so the user can resolve manually and retry.
    """

    def __init__(self, paths: list[Path]) -> None:
        self.paths = paths
        super().__init__(f"Scaffold conflict: {[str(p) for p in paths]}")


_LANGGRAPH_AGENT_PY: Final[str] = '''\
"""Minimal LangGraph hello-world agent."""

from typing import TypedDict

from langgraph.graph import END, StateGraph


class State(TypedDict):
    message: str


def echo(state: State) -> State:
    return {"message": f"You said: {state['message']}"}


_builder = StateGraph(State)
_builder.add_node("echo", echo)
_builder.set_entry_point("echo")
_builder.add_edge("echo", END)
graph = _builder.compile()
'''


_LANGGRAPH_REQUIREMENTS: Final[str] = """\
idun-agent-standalone
langgraph>=0.2.0
langchain-core>=0.3.0
langchain-openai>=0.2.0
"""


_LANGGRAPH_ENV_EXAMPLE: Final[str] = "OPENAI_API_KEY=\n"


_ADK_AGENT_PY: Final[str] = '''\
"""Minimal Google ADK hello-world agent."""

from google.adk.agents import Agent

agent = Agent(
    name="starter",
    model="gemini-2.5-flash",
    description="A minimal starter agent.",
    instruction="You are a helpful assistant. Respond concisely.",
)
'''


_ADK_REQUIREMENTS: Final[str] = """\
idun-agent-standalone
google-adk>=1.19.0,<2.0.0
"""


_ADK_ENV_EXAMPLE: Final[str] = "GOOGLE_API_KEY=\n"


_README: Final[str] = """\
# My Idun Agent

Quick start:

1. Copy `.env.example` to `.env` and fill in your API key.
2. `pip install -r requirements.txt`
3. `idun-standalone`

Edit `agent.py` to customize the agent.
"""


_GITIGNORE: Final[str] = """\
.env
__pycache__/
*.pyc
.venv/
.idun/
"""


def _build_file_map(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> dict[Path, str]:
    if framework == "LANGGRAPH":
        agent_py = _LANGGRAPH_AGENT_PY
        requirements = _LANGGRAPH_REQUIREMENTS
        env_example = _LANGGRAPH_ENV_EXAMPLE
    elif framework == "ADK":
        agent_py = _ADK_AGENT_PY
        requirements = _ADK_REQUIREMENTS
        env_example = _ADK_ENV_EXAMPLE
    else:  # pragma: no cover — Literal exhausts at type-check time
        raise ValueError(f"Unknown framework: {framework}")
    return {
        root / "agent.py": agent_py,
        root / "requirements.txt": requirements,
        root / ".env.example": env_example,
        root / "README.md": _README,
        root / ".gitignore": _GITIGNORE,
    }


def create_starter_project(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> list[Path]:
    """Atomically write the 5-file starter into ``root``.

    Either all files land or none do. On any mid-write IO failure we
    remove anything we managed to create so the user's working
    directory is untouched.
    """
    files = _build_file_map(root, framework)
    conflicts = [p for p in files if p.exists()]
    if conflicts:
        logger.info("scaffold.conflict count=%d", len(conflicts))
        raise ScaffoldConflictError(conflicts)

    written: list[Path] = []
    current_tmp: Path | None = None
    try:
        for path, content in files.items():
            current_tmp = path.with_suffix(path.suffix + ".idun-tmp")
            current_tmp.write_text(content)
            current_tmp.replace(path)
            current_tmp = None
            written.append(path)
    except Exception:
        if current_tmp is not None:
            current_tmp.unlink(missing_ok=True)
        for p in written:
            p.unlink(missing_ok=True)
        raise

    logger.info("scaffold.written framework=%s count=%d", framework, len(written))
    return written
