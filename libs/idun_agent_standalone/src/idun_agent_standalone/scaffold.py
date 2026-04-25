"""Project scaffolding for ``idun-standalone init``.

Generates a small, self-contained project directory with a runnable LangGraph
echo agent, a working ``config.yaml``, an ``.env.example``, a
``requirements.txt`` and a ``README.md``. The output deliberately does not
require a working LLM key — users can ``idun-standalone serve`` immediately
and then customise ``agent.py`` to add their own model.

Templates are kept inline as plain strings so the wheel build does not need
to ship a separate ``templates/`` package data directory.
"""

from __future__ import annotations

from pathlib import Path

import click

CONFIG_YAML_TEMPLATE = """\
agent:
  type: LANGGRAPH
  config:
    name: My Agent
    graph_definition: ./agent.py:graph
    checkpointer:
      type: memory

# Add your observability provider here (Langfuse, Phoenix, GCP)
# observability:
#   - provider: LANGFUSE
#     enabled: true
#     config:
#       host: https://cloud.langfuse.com
#       public_key: ${LANGFUSE_PUBLIC_KEY}
#       secret_key: ${LANGFUSE_SECRET_KEY}

# Add MCP servers here
# mcp_servers:
#   - name: time
#     transport: stdio
#     command: uvx
#     args: ["mcp-server-time"]
"""


AGENT_PY_TEMPLATE = '''\
"""A minimal LangGraph agent. Replace this with your real graph.

This template uses no LLM by default so it runs out of the box. Add your
LLM (langchain-openai, langchain-google-genai, langchain-anthropic, ...) and
extend the graph as needed.
"""

from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def respond(state: AgentState) -> AgentState:
    last = state["messages"][-1] if state["messages"] else None
    text = getattr(last, "content", "") if last else ""
    return {"messages": [AIMessage(content=f"You said: {text}")]}


workflow = StateGraph(AgentState)
workflow.add_node("respond", respond)
workflow.set_entry_point("respond")
workflow.add_edge("respond", END)

graph = workflow
'''


ENV_EXAMPLE_TEMPLATE = """\
# === Standalone runtime ===
IDUN_PORT=8000
# Database — defaults to a local SQLite file. Use Postgres in production.
# DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/idun

# === Auth ===
# Default is "none" on a laptop, "password" inside Docker.
# IDUN_ADMIN_AUTH_MODE=password
# IDUN_ADMIN_PASSWORD_HASH=$(idun-standalone hash-password)
# IDUN_SESSION_SECRET=$(openssl rand -hex 32)

# === Your agent secrets ===
# OPENAI_API_KEY=sk-...
# GOOGLE_API_KEY=...
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_BASE_URL=https://cloud.langfuse.com
"""


REQUIREMENTS_TEMPLATE = """\
idun-agent-standalone>=0.1.0
langgraph>=0.2.0
langchain-core>=0.3.0
"""


README_TEMPLATE = """\
# {name}

Run locally:

```bash
pip install -r requirements.txt
cp .env.example .env  # then edit
idun-standalone serve
```

Then open http://localhost:8000 for the chat UI and http://localhost:8000/admin/ for the admin panel.

Edit `agent.py` to define your graph; edit `config.yaml` to wire guardrails, MCP servers, observability.
"""


_TEMPLATE_FILES: tuple[tuple[str, str], ...] = (
    ("config.yaml", CONFIG_YAML_TEMPLATE),
    ("agent.py", AGENT_PY_TEMPLATE),
    (".env.example", ENV_EXAMPLE_TEMPLATE),
    ("requirements.txt", REQUIREMENTS_TEMPLATE),
)


def _is_non_empty_dir(path: Path) -> bool:
    return path.exists() and path.is_dir() and any(path.iterdir())


def scaffold_project(
    name: str,
    target_dir: Path | None = None,
    *,
    force: bool = False,
) -> Path:
    """Scaffold a new agent project.

    Args:
        name: Project name. Used as the README title and the default
            directory name when ``target_dir`` is not provided.
        target_dir: Absolute path of the directory to create. Defaults to
            ``Path.cwd() / name``.
        force: When True, overwrite an existing non-empty directory in
            place. When False, raise ``click.UsageError``.

    Returns:
        The absolute path of the directory that was scaffolded.

    Raises:
        click.UsageError: If the target already exists and is non-empty
            and ``force`` is False.
    """
    if not name:
        raise click.UsageError("Project name must be a non-empty string.")

    target = (target_dir or (Path.cwd() / name)).resolve()

    if _is_non_empty_dir(target) and not force:
        raise click.UsageError(
            f"Directory {target} already exists; refusing to overwrite. "
            "Pass --force to ignore."
        )

    target.mkdir(parents=True, exist_ok=True)

    for filename, body in _TEMPLATE_FILES:
        (target / filename).write_text(body)

    (target / "README.md").write_text(README_TEMPLATE.format(name=name))

    return target
