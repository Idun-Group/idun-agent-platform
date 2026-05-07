# ADK + LangGraph Graph Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a framework-agnostic graph visualizer for LangGraph and ADK agents — JSON IR + Mermaid + ASCII engine routes, plus a custom-styled ReactFlow component in the standalone UI rendered on the onboarding success screen and the admin agent page.

**Architecture:** The IR is a versioned Pydantic contract in `idun_agent_schema`. The engine introspects framework runtime objects and exposes three routes (`/agent/graph`, `/agent/graph/mermaid`, `/agent/graph/ascii`). The standalone UI reads the JSON IR and renders it with `@xyflow/react` + `@dagrejs/dagre`. Admin web stays on Mermaid for now via a 3-line URL swap.

**Tech Stack:** Python 3.12, Pydantic 2.11, FastAPI, LangGraph, Google ADK, Next.js 15, React 19, TypeScript, ReactFlow v12 (`@xyflow/react`), `@dagrejs/dagre`, Tailwind v4 + shadcn/ui, vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-04-30-adk-langgraph-graph-visualizer-design.md` — the source of truth. This plan implements that spec verbatim. If the spec and plan disagree, update the spec first.

---

## File Structure

### Schema package
| File | Status | Responsibility |
|---|---|---|
| `libs/idun_agent_schema/src/idun_agent_schema/engine/graph.py` | NEW | Pydantic IR models + enums |
| `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py` | MODIFY | Re-export new graph symbols |
| `libs/idun_agent_schema/tests/standalone/test_graph.py` | NEW | Round-trip / discriminator / format_version tests |

### Engine
| File | Status | Responsibility |
|---|---|---|
| `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py` | MODIFY | `get_graph_ir()`, `draw_mermaid()`, `draw_ascii()` defaults |
| `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` | MODIFY | `get_graph_ir()` walking `CompiledStateGraph`; native `draw_*` overrides |
| `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py` | MODIFY | `get_graph_ir()` walking `App.root_agent` |
| `libs/idun_agent_engine/src/idun_agent_engine/server/graph/__init__.py` | NEW | Module marker |
| `libs/idun_agent_engine/src/idun_agent_engine/server/graph/mermaid.py` | NEW | `render_mermaid(graph) -> str` |
| `libs/idun_agent_engine/src/idun_agent_engine/server/graph/ascii.py` | NEW | `render_ascii(graph) -> str` |
| `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py` | MODIFY | Replace `/agent/graph` with three routes |
| `libs/idun_agent_engine/tests/unit/agent/test_base_graph.py` | NEW | BaseAgent default behavior |
| `libs/idun_agent_engine/tests/unit/server/graph/__init__.py` | NEW | |
| `libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py` | NEW | Renderer golden tests |
| `libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py` | NEW | Renderer golden tests |
| `libs/idun_agent_engine/tests/unit/server/graph/fixtures/*.txt` | NEW | Golden output strings |
| `libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py` | NEW | LangGraph adapter introspection |
| `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py` | NEW | ADK adapter introspection |
| `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py` | MODIFY | Add fixtures for graph-IR tests |
| `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py` | MODIFY | Cover new IR / mermaid / ascii routes |

### Admin web
| File | Status | Responsibility |
|---|---|---|
| `services/idun_agent_web/src/services/agents.ts` | MODIFY | Switch URL + field |

### Standalone UI
| File | Status | Responsibility |
|---|---|---|
| `services/idun_agent_standalone_ui/package.json` | MODIFY | Add `@xyflow/react`, `@dagrejs/dagre` |
| `services/idun_agent_standalone_ui/lib/api/types/graph.ts` | NEW | TS mirror of IR |
| `services/idun_agent_standalone_ui/lib/api/types/index.ts` | MODIFY | Re-export graph types |
| `services/idun_agent_standalone_ui/lib/api/index.ts` | MODIFY | Add `getAgentGraph{,Mermaid,Ascii}()` |
| `services/idun_agent_standalone_ui/components/graph/irToReactFlow.ts` | NEW | Pure IR → ReactFlow mapper |
| `services/idun_agent_standalone_ui/components/graph/layout.ts` | NEW | dagre wrapper |
| `services/idun_agent_standalone_ui/components/graph/nodes/AgentNode.tsx` | NEW | Custom node |
| `services/idun_agent_standalone_ui/components/graph/nodes/ToolNode.tsx` | NEW | Custom node |
| `services/idun_agent_standalone_ui/components/graph/edges/PrettyEdge.tsx` | NEW | Edge styling per `EdgeKind` |
| `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx` | NEW | ReactFlow canvas |
| `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx` | MODIFY | Embed graph card |
| `services/idun_agent_standalone_ui/app/admin/agent/page.tsx` | MODIFY | Add Graph tab |
| `services/idun_agent_standalone_ui/components/graph/__tests__/irToReactFlow.test.ts` | NEW | |
| `services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx` | NEW | |
| `services/idun_agent_standalone_ui/e2e/onboarding-detection.spec.ts` (or existing wizard spec) | MODIFY | E2E: graph visible on WizardDone |

---

## Task 1: Schema — `AgentGraph` IR Pydantic models

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/engine/graph.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py`
- Create: `libs/idun_agent_schema/tests/standalone/test_graph.py`

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_schema/tests/standalone/test_graph.py`:

```python
"""Tests for the graph IR Pydantic models."""

import json
import pytest
from pydantic import ValidationError

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphMetadata,
    AgentKind,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)


def _sample_graph() -> AgentGraph:
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
            warnings=[],
        ),
        nodes=[
            AgentNode(
                id="agent:root",
                name="root",
                agent_kind=AgentKind.LLM,
                is_root=True,
                model="gemini-2.5-flash",
            ),
            ToolNode(
                id="tool:search@root",
                name="search",
                tool_kind=ToolKind.MCP,
                mcp_server_name="stdio: npx server-filesystem",
            ),
        ],
        edges=[
            AgentGraphEdge(source="agent:root", target="tool:search@root", kind=EdgeKind.TOOL_ATTACH),
        ],
    )


def test_agent_graph_round_trips_through_json():
    graph = _sample_graph()
    raw = graph.model_dump_json()
    parsed = AgentGraph.model_validate_json(raw)
    assert parsed == graph


def test_node_discriminator_parses_both_variants():
    payload = {
        "format_version": "1",
        "metadata": {
            "framework": "ADK",
            "agent_name": "root",
            "root_id": "agent:root",
            "warnings": [],
        },
        "nodes": [
            {"kind": "agent", "id": "agent:root", "name": "root", "agent_kind": "llm", "is_root": True},
            {"kind": "tool", "id": "tool:t@root", "name": "t", "tool_kind": "native"},
        ],
        "edges": [
            {"source": "agent:root", "target": "tool:t@root", "kind": "tool_attach"},
        ],
    }
    parsed = AgentGraph.model_validate(payload)
    assert isinstance(parsed.nodes[0], AgentNode)
    assert isinstance(parsed.nodes[1], ToolNode)


def test_format_version_rejects_unknown():
    payload = {
        "format_version": "2",
        "metadata": {
            "framework": "ADK", "agent_name": "n", "root_id": "agent:r", "warnings": [],
        },
        "nodes": [], "edges": [],
    }
    with pytest.raises(ValidationError):
        AgentGraph.model_validate(payload)


def test_format_version_defaults_to_1():
    g = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.LANGGRAPH, agent_name="n", root_id="r",
        ),
        nodes=[], edges=[],
    )
    assert g.format_version == "1"
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_graph.py -v
```

Expected: ImportError / ModuleNotFoundError (`idun_agent_schema.engine.graph` doesn't exist yet).

- [ ] **Step 3: Create the IR module**

Create `libs/idun_agent_schema/src/idun_agent_schema/engine/graph.py`:

```python
"""Framework-agnostic graph IR shared by engine and UI consumers.

Versioned via `format_version`. New variants ship alongside, never as a
breaking change.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from idun_agent_schema.engine.agent_framework import AgentFramework


class AgentKind(str, Enum):
    LLM = "llm"
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    LOOP = "loop"
    CUSTOM = "custom"


class ToolKind(str, Enum):
    NATIVE = "native"
    MCP = "mcp"
    BUILT_IN = "built_in"


class EdgeKind(str, Enum):
    PARENT_CHILD = "parent_child"
    SEQUENTIAL_STEP = "sequential_step"
    PARALLEL_BRANCH = "parallel_branch"
    LOOP_STEP = "loop_step"
    TOOL_ATTACH = "tool_attach"
    GRAPH_EDGE = "graph_edge"


class AgentNode(BaseModel):
    kind: Literal["agent"] = "agent"
    id: str
    name: str
    agent_kind: AgentKind
    is_root: bool = False
    description: str | None = None
    model: str | None = None
    loop_max_iterations: int | None = None


class ToolNode(BaseModel):
    kind: Literal["tool"] = "tool"
    id: str
    name: str
    tool_kind: ToolKind
    description: str | None = None
    mcp_server_name: str | None = None


AgentGraphNode = Annotated[
    AgentNode | ToolNode, Field(discriminator="kind")
]


class AgentGraphEdge(BaseModel):
    source: str
    target: str
    kind: EdgeKind
    order: int | None = None
    condition: str | None = None
    label: str | None = None


class AgentGraphMetadata(BaseModel):
    framework: AgentFramework
    agent_name: str
    root_id: str
    warnings: list[str] = Field(default_factory=list)


class AgentGraph(BaseModel):
    format_version: Literal["1"] = "1"
    metadata: AgentGraphMetadata
    nodes: list[AgentGraphNode]
    edges: list[AgentGraphEdge]
```

- [ ] **Step 4: Re-export from the engine subpackage**

Modify `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py` — append the new exports to whatever is already there:

```python
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphMetadata,
    AgentGraphNode,
    AgentKind,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)
```

(Read the existing file first; add to its `__all__` list if it has one.)

- [ ] **Step 5: Run tests — confirm they pass**

```bash
uv run pytest libs/idun_agent_schema/tests/standalone/test_graph.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_schema/src/idun_agent_schema/engine/graph.py \
        libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py \
        libs/idun_agent_schema/tests/standalone/test_graph.py
git commit -m "feat(schema): add framework-agnostic AgentGraph IR (format_version=1)"
```

---

## Task 2: Engine base — `BaseAgent.get_graph_ir()` + `draw_*` defaults

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py`
- Create: `libs/idun_agent_engine/tests/unit/agent/test_base_graph.py`

- [ ] **Step 1: Write the failing test**

Create `libs/idun_agent_engine/tests/unit/agent/test_base_graph.py`:

```python
"""Tests for BaseAgent default graph methods (NotImplementedError fallback)."""

import pytest

from idun_agent_engine.agent.base import BaseAgent


class _StubAgent(BaseAgent):
    """Bare BaseAgent subclass that doesn't override graph methods."""

    @property
    def id(self) -> str: return "stub"
    @property
    def agent_type(self) -> str: return "STUB"
    @property
    def name(self) -> str: return "stub"
    @property
    def agent_instance(self): return None
    @property
    def copilotkit_agent_instance(self): return None
    @property
    def configuration(self): return None
    @property
    def infos(self): return {}

    async def initialize(self, *a, **kw): pass
    async def invoke(self, message): return None
    async def stream(self, message):
        yield None
    def discover_capabilities(self): return None  # type: ignore[return-value]
    async def run(self, input_data):
        yield None


def test_get_graph_ir_default_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        _StubAgent().get_graph_ir()


def test_draw_mermaid_default_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        _StubAgent().draw_mermaid()


def test_draw_ascii_default_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        _StubAgent().draw_ascii()
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_base_graph.py -v
```

Expected: AttributeError (`'_StubAgent' object has no attribute 'get_graph_ir'`).

- [ ] **Step 3: Add the default methods to BaseAgent**

Modify `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py` — add these three methods to the `BaseAgent` class (location: anywhere at the same indent level as the other concrete methods, e.g. after `discover_capabilities`). Add the `AgentGraph` import inside a `TYPE_CHECKING` block at the top if not already imported:

```python
# Add to TYPE_CHECKING block at the top of the file (alongside existing imports):
if TYPE_CHECKING:
    from idun_agent_schema.engine.graph import AgentGraph
```

Add to the `BaseAgent` class body:

```python
def get_graph_ir(self) -> "AgentGraph":
    """Return a framework-agnostic graph IR.

    Override in subclasses that can introspect their underlying agent.
    """
    raise NotImplementedError(
        f"{self.agent_type} does not support graph introspection"
    )

def draw_mermaid(self) -> str:
    """Render the agent graph as a Mermaid source string.

    Default: render the IR via the engine's framework-agnostic renderer.
    Adapters with native diagram support (e.g. LangGraph) may override.
    """
    from idun_agent_engine.server.graph.mermaid import render_mermaid

    return render_mermaid(self.get_graph_ir())

def draw_ascii(self) -> str:
    """Render the agent graph as ASCII art.

    Default: render the IR via the engine's framework-agnostic renderer.
    Adapters with native ASCII support (e.g. LangGraph + grandalf) may override.
    """
    from idun_agent_engine.server.graph.ascii import render_ascii

    return render_ascii(self.get_graph_ir())
```

(`render_mermaid` / `render_ascii` are introduced in Tasks 3-4 — leave the imports inside the methods so they don't fire at module-import time.)

- [ ] **Step 4: Run test — confirm it passes**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_base_graph.py -v
```

Expected: 3 passed. (The two `draw_*` defaults raise `NotImplementedError` because they call `get_graph_ir()`, which raises.)

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/base.py \
        libs/idun_agent_engine/tests/unit/agent/test_base_graph.py
git commit -m "feat(engine): add BaseAgent.get_graph_ir + draw_mermaid/ascii defaults"
```

---

## Task 3: Engine — `render_mermaid` (framework-agnostic IR consumer)

**Files:**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/server/graph/__init__.py`
- Create: `libs/idun_agent_engine/src/idun_agent_engine/server/graph/mermaid.py`
- Create: `libs/idun_agent_engine/tests/unit/server/graph/__init__.py`
- Create: `libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py`
- Create: `libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.mermaid`

- [ ] **Step 1: Write the failing test**

Create `libs/idun_agent_engine/tests/unit/server/graph/__init__.py` (empty file).

Create `libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py`:

```python
"""Golden tests for render_mermaid (framework-agnostic)."""

from pathlib import Path

import pytest

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphMetadata,
    AgentKind,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)
from idun_agent_engine.server.graph.mermaid import render_mermaid

FIXTURES = Path(__file__).parent / "fixtures"


def _build_simple_graph() -> AgentGraph:
    """root LlmAgent with one native tool and one MCP tool, no sub-agents."""
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
        ),
        nodes=[
            AgentNode(id="agent:root", name="root", agent_kind=AgentKind.LLM, is_root=True),
            ToolNode(id="tool:search@root", name="search", tool_kind=ToolKind.MCP),
            ToolNode(id="tool:lookup@root", name="lookup", tool_kind=ToolKind.NATIVE),
        ],
        edges=[
            AgentGraphEdge(source="agent:root", target="tool:search@root", kind=EdgeKind.TOOL_ATTACH),
            AgentGraphEdge(source="agent:root", target="tool:lookup@root", kind=EdgeKind.TOOL_ATTACH),
        ],
    )


@pytest.mark.unit
def test_render_mermaid_matches_golden():
    output = render_mermaid(_build_simple_graph())
    expected = (FIXTURES / "simple.mermaid").read_text()
    assert output.strip() == expected.strip()


@pytest.mark.unit
def test_render_mermaid_handles_workflow_edges():
    graph = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK, agent_name="root", root_id="agent:root",
        ),
        nodes=[
            AgentNode(id="agent:root", name="root", agent_kind=AgentKind.SEQUENTIAL, is_root=True),
            AgentNode(id="agent:a", name="a", agent_kind=AgentKind.LLM),
            AgentNode(id="agent:b", name="b", agent_kind=AgentKind.LLM),
        ],
        edges=[
            AgentGraphEdge(source="agent:root", target="agent:a", kind=EdgeKind.SEQUENTIAL_STEP, order=0),
            AgentGraphEdge(source="agent:root", target="agent:b", kind=EdgeKind.SEQUENTIAL_STEP, order=1),
        ],
    )
    out = render_mermaid(graph)
    assert "graph TD" in out
    # Order labels should appear
    assert "1." in out and "2." in out
```

Create the golden fixture at `libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.mermaid` (we'll write the implementation to match this output exactly):

```
graph TD
  agent_root["root<br/>llm"]:::agentRoot
  tool_search_root(["search"]):::toolMcp
  tool_lookup_root(["lookup"]):::toolNative
  agent_root -.-> tool_search_root
  agent_root -.-> tool_lookup_root
  classDef agentRoot fill:#f3efff,stroke:#7a6cf0,stroke-width:1.5px
  classDef agent fill:#fff,stroke:#cfcfd6
  classDef toolMcp fill:#eaf3ff,stroke:#5a8de6
  classDef toolNative fill:#f4faf2,stroke:#7cae5d
  classDef toolBuiltIn fill:#fff7e6,stroke:#d99b3a
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py -v
```

Expected: ModuleNotFoundError (renderer doesn't exist).

- [ ] **Step 3: Implement the renderer**

Create `libs/idun_agent_engine/src/idun_agent_engine/server/graph/__init__.py` (empty file).

Create `libs/idun_agent_engine/src/idun_agent_engine/server/graph/mermaid.py`:

```python
"""Render an AgentGraph IR as a Mermaid source string.

Framework-agnostic — consumes only the IR. LangGraph adapters override
draw_mermaid() to use LangGraph's native renderer; ADK uses this.
"""

from __future__ import annotations

from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphNode,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)


def _node_id(node_id: str) -> str:
    """Mermaid identifiers can't contain ':' — convert to underscores."""
    return node_id.replace(":", "_").replace("@", "_")


def _node_class(node: AgentGraphNode) -> str:
    if isinstance(node, AgentNode):
        return "agentRoot" if node.is_root else "agent"
    assert isinstance(node, ToolNode)
    return {
        ToolKind.MCP: "toolMcp",
        ToolKind.NATIVE: "toolNative",
        ToolKind.BUILT_IN: "toolBuiltIn",
    }[node.tool_kind]


def _node_line(node: AgentGraphNode) -> str:
    nid = _node_id(node.id)
    cls = _node_class(node)
    if isinstance(node, AgentNode):
        label = f"{node.name}<br/>{node.agent_kind.value}"
        return f'  {nid}["{label}"]:::{cls}'
    assert isinstance(node, ToolNode)
    return f'  {nid}(["{node.name}"]):::{cls}'


def _edge_line(edge: AgentGraphEdge, node_lookup: dict[str, AgentGraphNode]) -> str:
    src = _node_id(edge.source)
    dst = _node_id(edge.target)

    if edge.kind == EdgeKind.PARENT_CHILD:
        return f"  {src} --> {dst}"
    if edge.kind == EdgeKind.TOOL_ATTACH:
        return f"  {src} -.-> {dst}"
    if edge.kind == EdgeKind.SEQUENTIAL_STEP:
        order = (edge.order or 0) + 1
        return f'  {src} == "{order}." ==> {dst}'
    if edge.kind == EdgeKind.PARALLEL_BRANCH:
        return f"  {src} ==> {dst}"
    if edge.kind == EdgeKind.LOOP_STEP:
        parent = node_lookup.get(edge.source)
        max_iter = getattr(parent, "loop_max_iterations", None)
        label = f"↻ ×{max_iter}" if max_iter else "↻"
        return f'  {src} -. "{label}" .-> {dst}'
    if edge.kind == EdgeKind.GRAPH_EDGE:
        if edge.condition:
            return f'  {src} -- "{edge.condition}" --> {dst}'
        return f"  {src} --> {dst}"
    raise ValueError(f"Unknown edge kind: {edge.kind}")


_CLASS_DEFS = [
    "  classDef agentRoot fill:#f3efff,stroke:#7a6cf0,stroke-width:1.5px",
    "  classDef agent fill:#fff,stroke:#cfcfd6",
    "  classDef toolMcp fill:#eaf3ff,stroke:#5a8de6",
    "  classDef toolNative fill:#f4faf2,stroke:#7cae5d",
    "  classDef toolBuiltIn fill:#fff7e6,stroke:#d99b3a",
]


def render_mermaid(graph: AgentGraph) -> str:
    lookup: dict[str, AgentGraphNode] = {n.id: n for n in graph.nodes}
    lines = ["graph TD"]
    lines.extend(_node_line(n) for n in graph.nodes)
    lines.extend(_edge_line(e, lookup) for e in graph.edges)
    lines.extend(_CLASS_DEFS)
    return "\n".join(lines)
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py -v
```

Expected: 2 passed. If the golden file doesn't match exactly, adjust the golden file (not the implementation) — the implementation defines the output, the golden locks it in.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/graph/__init__.py \
        libs/idun_agent_engine/src/idun_agent_engine/server/graph/mermaid.py \
        libs/idun_agent_engine/tests/unit/server/graph/__init__.py \
        libs/idun_agent_engine/tests/unit/server/graph/test_mermaid.py \
        libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.mermaid
git commit -m "feat(engine): add framework-agnostic Mermaid renderer for AgentGraph IR"
```

---

## Task 4: Engine — `render_ascii` (framework-agnostic IR consumer)

**Files:**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/server/graph/ascii.py`
- Create: `libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py`
- Create: `libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.ascii`

- [ ] **Step 1: Write the failing test**

Create `libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py`:

```python
"""Golden tests for render_ascii (framework-agnostic)."""

from pathlib import Path

import pytest

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphMetadata,
    AgentKind,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)
from idun_agent_engine.server.graph.ascii import render_ascii

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.unit
def test_render_ascii_matches_golden():
    graph = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
        ),
        nodes=[
            AgentNode(id="agent:root", name="root", agent_kind=AgentKind.LLM, is_root=True),
            ToolNode(id="tool:search@root", name="search", tool_kind=ToolKind.MCP,
                     mcp_server_name="stdio: npx server-filesystem"),
            AgentNode(id="agent:child", name="child", agent_kind=AgentKind.LLM),
            ToolNode(id="tool:fetch@child", name="fetch", tool_kind=ToolKind.NATIVE),
        ],
        edges=[
            AgentGraphEdge(source="agent:root", target="tool:search@root", kind=EdgeKind.TOOL_ATTACH),
            AgentGraphEdge(source="agent:root", target="agent:child", kind=EdgeKind.PARENT_CHILD),
            AgentGraphEdge(source="agent:child", target="tool:fetch@child", kind=EdgeKind.TOOL_ATTACH),
        ],
    )
    output = render_ascii(graph)
    expected = (FIXTURES / "simple.ascii").read_text()
    assert output.rstrip() == expected.rstrip()
```

Create golden fixture `libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.ascii`:

```
ADK · root
root (LlmAgent, root)
├─ tools
│  └─ search (mcp: stdio: npx server-filesystem)
└─ child (LlmAgent)
   └─ tools
      └─ fetch (native)
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement the renderer**

Create `libs/idun_agent_engine/src/idun_agent_engine/server/graph/ascii.py`:

```python
"""Render an AgentGraph IR as ASCII art (tree printer).

Framework-agnostic. LangGraph adapters override draw_ascii() to use
LangGraph's native draw_ascii() (which uses grandalf).
"""

from __future__ import annotations

from collections import defaultdict

from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentNode,
    EdgeKind,
    ToolNode,
)


def _agent_label(node: AgentNode) -> str:
    kind_name = {
        "llm": "LlmAgent",
        "sequential": "SequentialAgent",
        "parallel": "ParallelAgent",
        "loop": "LoopAgent",
        "custom": "Custom",
    }[node.agent_kind.value]
    suffix = ", root" if node.is_root else ""
    return f"{node.name} ({kind_name}{suffix})"


def _tool_label(node: ToolNode) -> str:
    if node.tool_kind.value == "mcp":
        server = f": {node.mcp_server_name}" if node.mcp_server_name else ""
        return f"{node.name} (mcp{server})"
    return f"{node.name} ({node.tool_kind.value})"


def render_ascii(graph: AgentGraph) -> str:
    nodes_by_id = {n.id: n for n in graph.nodes}

    sub_agents: dict[str, list[str]] = defaultdict(list)
    tools: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.kind == EdgeKind.TOOL_ATTACH:
            tools[edge.source].append(edge.target)
        elif edge.kind in {
            EdgeKind.PARENT_CHILD,
            EdgeKind.SEQUENTIAL_STEP,
            EdgeKind.PARALLEL_BRANCH,
            EdgeKind.LOOP_STEP,
        }:
            sub_agents[edge.source].append(edge.target)
        # GRAPH_EDGE handled below by LangGraph native; we still render any sub-agent-style edges if present.

    lines: list[str] = []
    lines.append(f"{graph.metadata.framework.value} · {graph.metadata.agent_name}")
    if graph.metadata.warnings:
        for w in graph.metadata.warnings:
            lines.append(f"⚠ {w}")

    def _walk(node_id: str, prefix: str, is_last: bool, is_root: bool) -> None:
        node = nodes_by_id[node_id]
        connector = "" if is_root else ("└─ " if is_last else "├─ ")
        if isinstance(node, AgentNode):
            lines.append(f"{prefix}{connector}{_agent_label(node)}")
        else:
            assert isinstance(node, ToolNode)
            lines.append(f"{prefix}{connector}{_tool_label(node)}")
            return  # tools are leaves

        child_prefix = prefix + ("" if is_root else ("   " if is_last else "│  "))

        node_tools = tools.get(node_id, [])
        node_subs = sub_agents.get(node_id, [])

        if node_tools:
            tools_is_last = not node_subs
            tools_connector = "└─ " if tools_is_last else "├─ "
            lines.append(f"{child_prefix}{tools_connector}tools")
            tool_prefix = child_prefix + ("   " if tools_is_last else "│  ")
            for i, tid in enumerate(node_tools):
                _walk(tid, tool_prefix, i == len(node_tools) - 1, is_root=False)

        for i, sid in enumerate(node_subs):
            _walk(sid, child_prefix, i == len(node_subs) - 1, is_root=False)

    _walk(graph.metadata.root_id, "", True, is_root=True)
    return "\n".join(lines)
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py -v
```

Expected: 1 passed. If the golden differs, adjust the golden file to match the implementation output.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/graph/ascii.py \
        libs/idun_agent_engine/tests/unit/server/graph/test_ascii.py \
        libs/idun_agent_engine/tests/unit/server/graph/fixtures/simple.ascii
git commit -m "feat(engine): add framework-agnostic ASCII renderer for AgentGraph IR"
```

---

## Task 5: Engine — `LanggraphAgent.get_graph_ir()` + native `draw_*` overrides

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`
- Create: `libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py`

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py`:

```python
"""Tests for LanggraphAgent graph introspection."""

from pathlib import Path

import pytest

from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import AgentGraph, AgentNode, EdgeKind


@pytest.mark.asyncio
async def test_langgraph_get_graph_ir_simple():
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }
    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    ir = agent.get_graph_ir()

    assert isinstance(ir, AgentGraph)
    assert ir.metadata.framework == AgentFramework.LANGGRAPH
    assert ir.format_version == "1"
    assert any(isinstance(n, AgentNode) and n.is_root for n in ir.nodes)
    # Every edge has GRAPH_EDGE kind for LangGraph
    assert all(e.kind == EdgeKind.GRAPH_EDGE for e in ir.edges)


@pytest.mark.asyncio
async def test_langgraph_draw_mermaid_uses_native_output():
    """LangGraph delegates to native draw_mermaid; output should not contain
    our renderer's classDef definitions."""
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }
    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    output = agent.draw_mermaid()
    assert "graph TD" in output or "%%{init" in output  # LangGraph native marker
    # Our renderer's classDef sentinels are NOT present
    assert "classDef agentRoot" not in output
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py -v
```

Expected: AttributeError or NotImplementedError (no get_graph_ir override).

- [ ] **Step 3: Implement on `LanggraphAgent`**

Modify `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` — add three methods to the `LanggraphAgent` class:

```python
def get_graph_ir(self):
    from langgraph.graph.state import CompiledStateGraph
    from idun_agent_schema.engine.agent_framework import AgentFramework
    from idun_agent_schema.engine.graph import (
        AgentGraph,
        AgentGraphEdge,
        AgentGraphMetadata,
        AgentKind,
        AgentNode,
        EdgeKind,
    )

    if not isinstance(self._agent_instance, CompiledStateGraph):
        raise NotImplementedError(
            "LangGraph graph introspection requires a CompiledStateGraph"
        )

    lg_graph = self._agent_instance.get_graph()
    nodes: list[AgentNode] = []
    edges: list[AgentGraphEdge] = []

    for node_id, _ in lg_graph.nodes.items():
        is_root = node_id == "__start__"
        nodes.append(AgentNode(
            id=f"node:{node_id}",
            name=node_id,
            agent_kind=AgentKind.CUSTOM,
            is_root=is_root,
        ))

    for lg_edge in lg_graph.edges:
        # Public attrs: source, target. `conditional` and `data` are documented;
        # if a future LangGraph version renames them, fall back gracefully.
        condition = None
        try:
            if getattr(lg_edge, "conditional", False):
                data = getattr(lg_edge, "data", None)
                condition = str(data) if data is not None else None
        except Exception:
            condition = None
        label = getattr(lg_edge, "data", None)
        edges.append(AgentGraphEdge(
            source=f"node:{lg_edge.source}",
            target=f"node:{lg_edge.target}",
            kind=EdgeKind.GRAPH_EDGE,
            condition=condition,
            label=str(label) if label is not None and not condition else None,
        ))

    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.LANGGRAPH,
            agent_name=self.name,
            root_id="node:__start__",
        ),
        nodes=nodes,
        edges=edges,
    )

def draw_mermaid(self) -> str:
    """Delegate to LangGraph's native draw_mermaid for polish/parity."""
    from langgraph.graph.state import CompiledStateGraph

    if not isinstance(self._agent_instance, CompiledStateGraph):
        raise NotImplementedError(
            "LangGraph mermaid rendering requires a CompiledStateGraph"
        )
    return self._agent_instance.get_graph().draw_mermaid()

def draw_ascii(self) -> str:
    """Delegate to LangGraph's native draw_ascii (grandalf-backed)."""
    from langgraph.graph.state import CompiledStateGraph

    if not isinstance(self._agent_instance, CompiledStateGraph):
        raise NotImplementedError(
            "LangGraph ascii rendering requires a CompiledStateGraph"
        )
    return self._agent_instance.get_graph().draw_ascii()
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py \
        libs/idun_agent_engine/tests/unit/agent/test_langgraph_graph_ir.py
git commit -m "feat(engine): LangGraph adapter implements get_graph_ir + native draw overrides"
```

---

## Task 6: Engine — ADK adapter introspection (single agent + tools)

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`
- Modify: `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py`
- Create: `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py`

- [ ] **Step 1: Extend the mock ADK fixtures**

Modify `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py` — add new fixture agents at the bottom of the file (keep the existing `MockADKAgent` and `mock_adk_agent_instance`):

```python
# -----------------------------------------------------------------------------
# Fixtures for graph IR tests
# -----------------------------------------------------------------------------

from google.adk.agents import LlmAgent

# Simple LlmAgent, no tools, no sub-agents
mock_llm_simple = LlmAgent(
    name="simple",
    model="gemini-2.5-flash",
    instruction="You are a test agent.",
    description="A simple test agent.",
)


def _native_func(x: str) -> str:
    """A plain function tool."""
    return x


# LlmAgent with one native function tool
mock_llm_with_native_tool = LlmAgent(
    name="with_native",
    model="gemini-2.5-flash",
    instruction="You are a test agent.",
    tools=[_native_func],
)
```

- [ ] **Step 2: Write the failing tests**

Create `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py`:

```python
"""Tests for AdkAgent graph introspection — single agent + tools cases."""

from pathlib import Path

import pytest

from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)


def _adk_config(agent_var: str) -> dict:
    fixture_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_adk_agent.py"
    )
    return {
        "agent": {
            "type": "ADK",
            "config": {
                "name": f"adk_{agent_var}",
                "app_name": f"adk_{agent_var}",
                "agent": f"{fixture_path}:{agent_var}",
            },
        },
    }


@pytest.mark.asyncio
async def test_adk_simple_llm_agent():
    config = ConfigBuilder.from_dict(_adk_config("mock_llm_simple")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    assert isinstance(ir, AgentGraph)
    assert ir.metadata.framework == AgentFramework.ADK
    agent_nodes = [n for n in ir.nodes if isinstance(n, AgentNode)]
    tool_nodes = [n for n in ir.nodes if isinstance(n, ToolNode)]
    assert len(agent_nodes) == 1
    assert len(tool_nodes) == 0
    assert agent_nodes[0].is_root is True
    assert agent_nodes[0].name == "simple"
    assert agent_nodes[0].model == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_adk_llm_with_native_tool():
    config = ConfigBuilder.from_dict(_adk_config("mock_llm_with_native_tool")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    tool_nodes = [n for n in ir.nodes if isinstance(n, ToolNode)]
    assert len(tool_nodes) == 1
    assert tool_nodes[0].tool_kind == ToolKind.NATIVE
    # one tool_attach edge exists
    attach_edges = [e for e in ir.edges if e.kind == EdgeKind.TOOL_ATTACH]
    assert len(attach_edges) == 1
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py -v
```

Expected: NotImplementedError (default `BaseAgent.get_graph_ir`).

- [ ] **Step 4: Implement `AdkAgent.get_graph_ir()` (initial scope: single agent + tool kinds)**

Modify `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py` — add these methods to the `AdkAgent` class. The implementation here covers single agents + tools only; workflow-agent edge dispatch is added in Task 7. We deliberately stage the scope to keep diffs reviewable.

```python
def get_graph_ir(self):
    from google.adk.agents import (
        BaseAgent as ADKBaseAgent,
        LlmAgent,
        LoopAgent,
        ParallelAgent,
        SequentialAgent,
    )
    from idun_agent_schema.engine.agent_framework import AgentFramework
    from idun_agent_schema.engine.graph import (
        AgentGraph,
        AgentGraphEdge,
        AgentGraphMetadata,
        AgentGraphNode,
        AgentKind,
        AgentNode,
        EdgeKind,
        ToolKind,
        ToolNode,
    )

    if self._agent_instance is None:
        raise RuntimeError("Agent not initialized. Call initialize() first.")

    root_agent = self._agent_instance.root_agent
    nodes: list[AgentGraphNode] = []
    edges: list[AgentGraphEdge] = []
    warnings: list[str] = []

    def _agent_kind(a: object) -> AgentKind:
        if isinstance(a, SequentialAgent): return AgentKind.SEQUENTIAL
        if isinstance(a, ParallelAgent):   return AgentKind.PARALLEL
        if isinstance(a, LoopAgent):       return AgentKind.LOOP
        if isinstance(a, LlmAgent):        return AgentKind.LLM
        return AgentKind.CUSTOM

    def _classify_tool(tool: object) -> tuple[ToolKind, str | None]:
        # Try MCP toolset detection — both old and new import paths.
        for mod_path in (
            "google.adk.tools.mcp_tool.mcp_toolset",
            "google.adk.tools",
        ):
            try:
                module = __import__(mod_path, fromlist=["MCPToolset", "McpToolset"])
                cls = getattr(module, "MCPToolset", None) or getattr(module, "McpToolset", None)
                if cls is not None and isinstance(tool, cls):
                    return (ToolKind.MCP, _describe_mcp_params(getattr(tool, "connection_params", None)))
            except Exception:  # noqa: BLE001 — best-effort import
                continue
        # Built-in detection: anything in the google.adk.tools module hierarchy
        # that wasn't already matched as MCP above. User-defined function tools
        # live in the user's own module (e.g. their agent module or __main__).
        module = getattr(tool, "__module__", "") or ""
        if module.startswith("google.adk.tools"):
            return (ToolKind.BUILT_IN, None)
        return (ToolKind.NATIVE, None)

    def _walk(agent: object, is_root: bool = False) -> str:
        agent_id = f"agent:{agent.name}"
        kind = _agent_kind(agent)
        nodes.append(AgentNode(
            id=agent_id,
            name=agent.name,
            agent_kind=kind,
            is_root=is_root,
            description=getattr(agent, "description", None),
            model=getattr(agent, "model", None) if kind == AgentKind.LLM else None,
            loop_max_iterations=(
                getattr(agent, "max_iterations", None) if kind == AgentKind.LOOP else None
            ),
        ))
        if kind == AgentKind.CUSTOM:
            warnings.append(
                f"Agent '{agent.name}' is a custom BaseAgent subclass; "
                f"introspected best-effort"
            )

        for tool in getattr(agent, "tools", None) or []:
            tool_name = getattr(tool, "name", None) or getattr(tool, "__name__", None) or repr(tool)[:40]
            tool_id = f"tool:{tool_name}@{agent.name}"
            tool_kind, server_desc = _classify_tool(tool)
            nodes.append(ToolNode(
                id=tool_id,
                name=tool_name,
                tool_kind=tool_kind,
                description=getattr(tool, "description", None),
                mcp_server_name=server_desc,
            ))
            edges.append(AgentGraphEdge(
                source=agent_id, target=tool_id, kind=EdgeKind.TOOL_ATTACH,
            ))

        # Sub-agents — Task 7 will add edge-kind dispatch; for now use PARENT_CHILD.
        for sub in getattr(agent, "sub_agents", None) or []:
            child_id = _walk(sub, is_root=False)
            edges.append(AgentGraphEdge(
                source=agent_id, target=child_id, kind=EdgeKind.PARENT_CHILD,
            ))
        return agent_id

    root_id = _walk(root_agent, is_root=True)
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name=self.name,
            root_id=root_id,
            warnings=warnings,
        ),
        nodes=nodes,
        edges=edges,
    )


def _describe_mcp_params(params: object) -> str | None:
    """Best-effort label for an MCPToolset connection params object."""
    if params is None:
        return None
    cmd = getattr(params, "command", None)
    args = getattr(params, "args", None)
    if cmd is not None:
        joined = " ".join(args or [])
        return f"stdio: {cmd} {joined}".strip()
    url = getattr(params, "url", None)
    if url is not None:
        return f"http: {url}"
    return type(params).__name__
```

(The `_describe_mcp_params` helper sits at module level near the other helpers in `adk.py` — not inside the class. Place it adjacent to `_extract_text_from_event`.)

- [ ] **Step 5: Run tests — confirm they pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py \
        libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py \
        libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py
git commit -m "feat(engine): ADK adapter get_graph_ir for single agent + tool kinds"
```

---

## Task 7: Engine — ADK adapter workflow agents (Sequential, Parallel, Loop)

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py` (extend `_walk`'s edge-kind dispatch)
- Modify: `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py` (add workflow fixtures)
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py` (add tests)

- [ ] **Step 1: Add workflow-agent fixtures**

Append to `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py`:

```python
from google.adk.agents import LoopAgent, ParallelAgent, SequentialAgent

mock_seq_step_a = LlmAgent(name="seq_a", model="gemini-2.5-flash", instruction="A")
mock_seq_step_b = LlmAgent(name="seq_b", model="gemini-2.5-flash", instruction="B")
mock_seq_step_c = LlmAgent(name="seq_c", model="gemini-2.5-flash", instruction="C")
mock_sequential_agent = SequentialAgent(
    name="seq_root",
    sub_agents=[mock_seq_step_a, mock_seq_step_b, mock_seq_step_c],
)

mock_par_a = LlmAgent(name="par_a", model="gemini-2.5-flash", instruction="A")
mock_par_b = LlmAgent(name="par_b", model="gemini-2.5-flash", instruction="B")
mock_parallel_agent = ParallelAgent(name="par_root", sub_agents=[mock_par_a, mock_par_b])

mock_loop_step = LlmAgent(name="loop_step", model="gemini-2.5-flash", instruction="L")
mock_loop_agent = LoopAgent(
    name="loop_root",
    sub_agents=[mock_loop_step],
    max_iterations=5,
)
```

- [ ] **Step 2: Write failing tests**

Append to `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py`:

```python
@pytest.mark.asyncio
async def test_adk_sequential_agent():
    config = ConfigBuilder.from_dict(_adk_config("mock_sequential_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    seq_edges = sorted(
        [e for e in ir.edges if e.kind == EdgeKind.SEQUENTIAL_STEP],
        key=lambda e: e.order or 0,
    )
    assert [e.order for e in seq_edges] == [0, 1, 2]


@pytest.mark.asyncio
async def test_adk_parallel_agent():
    config = ConfigBuilder.from_dict(_adk_config("mock_parallel_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    par_edges = [e for e in ir.edges if e.kind == EdgeKind.PARALLEL_BRANCH]
    assert len(par_edges) == 2


@pytest.mark.asyncio
async def test_adk_loop_agent_max_iterations():
    config = ConfigBuilder.from_dict(_adk_config("mock_loop_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    root = next(n for n in ir.nodes if isinstance(n, AgentNode) and n.is_root)
    assert root.loop_max_iterations == 5
    assert any(e.kind == EdgeKind.LOOP_STEP for e in ir.edges)
```

- [ ] **Step 3: Run tests — confirm new ones fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py -v
```

Expected: 3 of the new tests fail (existing 2 still pass) — sub-agent edges are all `parent_child` today.

- [ ] **Step 4: Update `_walk` to dispatch edge kind**

In `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`, replace the inner sub-agent loop in `_walk` with:

```python
# Sub-agents
for i, sub in enumerate(getattr(agent, "sub_agents", None) or []):
    child_id = _walk(sub, is_root=False)
    edge_kind = {
        AgentKind.SEQUENTIAL: EdgeKind.SEQUENTIAL_STEP,
        AgentKind.PARALLEL:   EdgeKind.PARALLEL_BRANCH,
        AgentKind.LOOP:       EdgeKind.LOOP_STEP,
    }.get(kind, EdgeKind.PARENT_CHILD)
    edges.append(AgentGraphEdge(
        source=agent_id,
        target=child_id,
        kind=edge_kind,
        order=i if edge_kind == EdgeKind.SEQUENTIAL_STEP else None,
    ))
```

- [ ] **Step 5: Run tests — confirm all 5 pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py \
        libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py \
        libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py
git commit -m "feat(engine): ADK adapter encodes Sequential/Parallel/Loop edge kinds"
```

---

## Task 8: Engine — ADK adapter custom subclass + nested cases

**Files:**
- Modify: `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py`
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py`

(No production code changes — the existing `_walk` already supports nested + custom; this task locks behavior in tests.)

- [ ] **Step 1: Add fixtures**

Append to `libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py`:

```python
# Nested: root LlmAgent with a SequentialAgent sub-agent + native tool
mock_nested_inner_a = LlmAgent(name="inner_a", model="gemini-2.5-flash", instruction="ia")
mock_nested_inner_b = LlmAgent(name="inner_b", model="gemini-2.5-flash", instruction="ib")
mock_nested_seq = SequentialAgent(
    name="inner_seq", sub_agents=[mock_nested_inner_a, mock_nested_inner_b],
)
mock_nested_root = LlmAgent(
    name="nested_root",
    model="gemini-2.5-flash",
    instruction="root",
    tools=[_native_func],
    sub_agents=[mock_nested_seq],
)

# Custom subclass — reuse MockADKAgent already defined above.
mock_custom_root = MockADKAgent(
    name="custom_root",
    description="Custom subclass for graph IR test",
)
```

- [ ] **Step 2: Add tests**

Append to `libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py`:

```python
@pytest.mark.asyncio
async def test_adk_nested_root_with_sequential_subagent():
    config = ConfigBuilder.from_dict(_adk_config("mock_nested_root")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    agent_nodes = [n for n in ir.nodes if isinstance(n, AgentNode)]
    # nested_root + inner_seq + inner_a + inner_b
    assert len(agent_nodes) == 4
    # Root → SequentialAgent uses PARENT_CHILD (root is LLM, not workflow)
    parent_edges = [e for e in ir.edges if e.kind == EdgeKind.PARENT_CHILD]
    assert len(parent_edges) == 1
    # Inner_seq → its 2 children use SEQUENTIAL_STEP
    seq_edges = [e for e in ir.edges if e.kind == EdgeKind.SEQUENTIAL_STEP]
    assert len(seq_edges) == 2


@pytest.mark.asyncio
async def test_adk_custom_baseagent_subclass_emits_warning():
    config = ConfigBuilder.from_dict(_adk_config("mock_custom_root")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    root = next(n for n in ir.nodes if isinstance(n, AgentNode) and n.is_root)
    from idun_agent_schema.engine.graph import AgentKind
    assert root.agent_kind == AgentKind.CUSTOM
    assert any("custom_root" in w for w in ir.metadata.warnings)
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py -v
```

Expected: 7 passed (5 existing + 2 new).

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_engine/tests/fixtures/agents/mock_adk_agent.py \
        libs/idun_agent_engine/tests/unit/agent/test_adk_graph_ir.py
git commit -m "test(engine): cover nested ADK + custom BaseAgent subclass cases"
```

---

## Task 9: Engine — replace `/agent/graph` route with three new routes

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`
- Modify: `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py`

- [ ] **Step 1: Update tests for the new contract**

Replace the entire content of `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py` with:

```python
"""Tests for the /agent/graph, /agent/graph/mermaid, /agent/graph/ascii endpoints."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


def _langgraph_app():
    config = ConfigBuilder.from_dict({
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
            },
        },
    }).build()
    return create_app(engine_config=config)


def _haystack_app():
    mock_path = (
        Path(__file__).resolve().parent.parent.parent.parent.parent
        / "fixtures" / "agents" / "mock_haystack_pipeline.py"
    )
    config = ConfigBuilder.from_dict({
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "HAYSTACK",
            "config": {
                "name": "Haystack Agent",
                "component_type": "pipeline",
                "component_definition": f"{mock_path}:mock_haystack_pipeline",
            },
        },
    }).build()
    return create_app(engine_config=config)


@pytest.mark.unit
class TestAgentGraphRoutes:
    def test_ir_route_returns_agent_graph(self):
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph")
        assert response.status_code == 200
        body = response.json()
        assert body["format_version"] == "1"
        assert "metadata" in body and "nodes" in body and "edges" in body
        assert body["metadata"]["framework"] == "LANGGRAPH"

    def test_mermaid_route_returns_string(self):
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/mermaid")
        assert response.status_code == 200
        body = response.json()
        assert "mermaid" in body
        assert isinstance(body["mermaid"], str) and body["mermaid"]

    def test_ascii_route_returns_string(self):
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/ascii")
        assert response.status_code == 200
        body = response.json()
        assert "ascii" in body
        assert isinstance(body["ascii"], str) and body["ascii"]

    def test_ir_route_404_for_haystack(self):
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph")
        assert response.status_code == 404

    def test_mermaid_route_404_for_haystack(self):
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/mermaid")
        assert response.status_code == 404

    def test_ascii_route_404_for_haystack(self):
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/ascii")
        assert response.status_code == 404
```

- [ ] **Step 2: Run tests — confirm IR + ascii routes fail**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py -v
```

Expected: ir/ascii routes 404 (don't exist), mermaid passes only for the legacy `{"graph": str}` shape (will fail because we now expect `mermaid` key).

- [ ] **Step 3: Replace the route block in `agent.py`**

In `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`, find the existing `@agent_router.get("/graph")` handler (currently at lines ~140-155, returning `{"graph": instance.get_graph().draw_mermaid()}`). Replace that single handler with **three** handlers:

```python
from idun_agent_schema.engine.graph import AgentGraph


@agent_router.get("/graph", response_model=AgentGraph)
async def get_graph_ir(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> AgentGraph:
    """Framework-agnostic JSON IR — primary contract for UI rendering."""
    try:
        return agent.get_graph_ir()
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        logger.exception("Graph IR extraction failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Graph introspection failed",
        )


@agent_router.get("/graph/mermaid")
async def get_graph_mermaid(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> dict[str, str]:
    """Mermaid source string."""
    try:
        return {"mermaid": agent.draw_mermaid()}
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        logger.exception("Mermaid rendering failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mermaid rendering failed",
        )


@agent_router.get("/graph/ascii")
async def get_graph_ascii(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> dict[str, str]:
    """ASCII art rendering."""
    try:
        return {"ascii": agent.draw_ascii()}
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        logger.exception("ASCII rendering failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ASCII rendering failed",
        )
```

(Delete the original handler. Imports for `AgentGraph` and `status` should already be present or covered; add them if not.)

- [ ] **Step 4: Run tests — confirm all 6 pass**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Run the full engine test suite to catch regressions**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/ -v -m "not requires_langfuse and not requires_phoenix and not requires_postgres"
```

Expected: all green (no regressions in other agent tests).

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py \
        libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py
git commit -m "feat(engine): replace /agent/graph with IR + mermaid + ascii routes"
```

---

## Task 10: Admin web URL swap (3-line compat fix)

**Files:**
- Modify: `services/idun_agent_web/src/services/agents.ts` (around line 230-235)

- [ ] **Step 1: Update the API call**

Open `services/idun_agent_web/src/services/agents.ts`, find the `getAgentGraph` function (around lines 225-240, the one calling `buildAgentUrl(baseUrl, '/agent/graph')` and returning `data.graph`). Update:

- Change the URL from `'/agent/graph'` to `'/agent/graph/mermaid'`
- Change `data.graph ?? null` to `data.mermaid ?? null`

The function shape should now look like:

```ts
const url = buildAgentUrl(baseUrl, '/agent/graph/mermaid');
// ... fetch ...
return data.mermaid ?? null;
```

- [ ] **Step 2: Verify the consumer still typechecks**

```bash
cd services/idun_agent_web && npx tsc --noEmit && cd -
```

Expected: no new TS errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/services/agents.ts
git commit -m "fix(web): point graph-section to /agent/graph/mermaid for new engine contract"
```

---

## Task 11: Standalone-UI — dependencies, types, API client

**Files:**
- Modify: `services/idun_agent_standalone_ui/package.json`
- Create: `services/idun_agent_standalone_ui/lib/api/types/graph.ts`
- Modify: `services/idun_agent_standalone_ui/lib/api/types/index.ts` (re-export)
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd services/idun_agent_standalone_ui
npm install --save @xyflow/react @dagrejs/dagre
cd -
```

(If the project uses pnpm based on `pnpm-lock.yaml`, swap to `pnpm add @xyflow/react @dagrejs/dagre`. Check which lockfile is committed.)

- [ ] **Step 2: Add TS mirror of the IR**

Create `services/idun_agent_standalone_ui/lib/api/types/graph.ts`:

```ts
/**
 * TypeScript mirror of idun_agent_schema.engine.graph (Pydantic).
 *
 * The schema package is the source of truth — when those models change, this
 * file must follow. Discriminated unions on `kind`.
 */

export type AgentKind =
  | "llm"
  | "sequential"
  | "parallel"
  | "loop"
  | "custom";

export type ToolKind = "native" | "mcp" | "built_in";

export type EdgeKind =
  | "parent_child"
  | "sequential_step"
  | "parallel_branch"
  | "loop_step"
  | "tool_attach"
  | "graph_edge";

export interface AgentNode {
  kind: "agent";
  id: string;
  name: string;
  agent_kind: AgentKind;
  is_root: boolean;
  description: string | null;
  model: string | null;
  loop_max_iterations: number | null;
}

export interface ToolNode {
  kind: "tool";
  id: string;
  name: string;
  tool_kind: ToolKind;
  description: string | null;
  mcp_server_name: string | null;
}

export type AgentGraphNode = AgentNode | ToolNode;

export interface AgentGraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  order: number | null;
  condition: string | null;
  label: string | null;
}

export interface AgentGraphMetadata {
  framework: "LANGGRAPH" | "ADK" | "HAYSTACK";
  agent_name: string;
  root_id: string;
  warnings: string[];
}

export interface AgentGraph {
  format_version: "1";
  metadata: AgentGraphMetadata;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
}
```

- [ ] **Step 3: Re-export from the types barrel**

Open `services/idun_agent_standalone_ui/lib/api/types/index.ts` (or whichever file aggregates type re-exports — check for one near `lib/api/types/`). Append:

```ts
export type {
  AgentGraph,
  AgentGraphEdge,
  AgentGraphMetadata,
  AgentGraphNode,
  AgentKind,
  AgentNode,
  EdgeKind,
  ToolKind,
  ToolNode,
} from "./graph";
```

If no `index.ts` exists, create one that re-exports the existing typed sub-files plus this one.

- [ ] **Step 4: Add API client methods**

Open `services/idun_agent_standalone_ui/lib/api/index.ts`. Add an import for `AgentGraph`:

```ts
import type { AgentGraph } from "./types/graph";
```

Inside the `api` object literal (near the bottom), add three methods. **Important:** these hit the engine surface (`/agent/graph`), not `${ADMIN}/...`:

```ts
  // Engine surface — graph visualizer (LangGraph + ADK)
  getAgentGraph: () => apiFetch<AgentGraph>("/agent/graph"),
  getAgentGraphMermaid: () =>
    apiFetch<{ mermaid: string }>("/agent/graph/mermaid"),
  getAgentGraphAscii: () =>
    apiFetch<{ ascii: string }>("/agent/graph/ascii"),
```

- [ ] **Step 5: Verify build**

```bash
cd services/idun_agent_standalone_ui && npm run typecheck && cd -
```

Expected: `tsc --noEmit` passes (the project has `ignoreBuildErrors: true` for builds, but `npm run typecheck` is cleaner).

If the project's pre-existing TS errors block this, manually scope the check:

```bash
cd services/idun_agent_standalone_ui && npx tsc --noEmit lib/api/types/graph.ts && cd -
```

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/package.json \
        services/idun_agent_standalone_ui/package-lock.json \
        services/idun_agent_standalone_ui/lib/api/types/graph.ts \
        services/idun_agent_standalone_ui/lib/api/types/index.ts \
        services/idun_agent_standalone_ui/lib/api/index.ts
# (or pnpm-lock.yaml if pnpm)
git commit -m "feat(standalone-ui): add ReactFlow deps, IR types, graph API methods"
```

---

## Task 12: Standalone-UI — `irToReactFlow` pure mapping function

**Files:**
- Create: `services/idun_agent_standalone_ui/components/graph/irToReactFlow.ts`
- Create: `services/idun_agent_standalone_ui/components/graph/__tests__/irToReactFlow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/components/graph/__tests__/irToReactFlow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AgentGraph } from "@/lib/api/types/graph";
import { irToReactFlow } from "../irToReactFlow";

const SAMPLE: AgentGraph = {
  format_version: "1",
  metadata: {
    framework: "ADK",
    agent_name: "root",
    root_id: "agent:root",
    warnings: [],
  },
  nodes: [
    {
      kind: "agent",
      id: "agent:root",
      name: "root",
      agent_kind: "llm",
      is_root: true,
      description: null,
      model: "gemini-2.5-flash",
      loop_max_iterations: null,
    },
    {
      kind: "tool",
      id: "tool:search@root",
      name: "search",
      tool_kind: "mcp",
      description: null,
      mcp_server_name: "stdio: x",
    },
  ],
  edges: [
    {
      source: "agent:root",
      target: "tool:search@root",
      kind: "tool_attach",
      order: null,
      condition: null,
      label: null,
    },
  ],
};

describe("irToReactFlow", () => {
  it("maps every IR node to one ReactFlow node with the IR id", () => {
    const { nodes, edges } = irToReactFlow(SAMPLE);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["agent:root", "tool:search@root"].sort(),
    );
  });

  it("uses 'agent' / 'tool' for ReactFlow node types", () => {
    const { nodes } = irToReactFlow(SAMPLE);
    expect(nodes.find((n) => n.id === "agent:root")?.type).toBe("agent");
    expect(nodes.find((n) => n.id === "tool:search@root")?.type).toBe("tool");
  });

  it("maps every IR edge to one ReactFlow edge", () => {
    const { edges } = irToReactFlow(SAMPLE);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "agent:root",
      target: "tool:search@root",
      type: "pretty",
    });
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/irToReactFlow.test.ts && cd -
```

Expected: FAIL — `irToReactFlow` not found.

- [ ] **Step 3: Implement the mapper**

Create `services/idun_agent_standalone_ui/components/graph/irToReactFlow.ts`:

```ts
import type { Edge, Node } from "@xyflow/react";

import type {
  AgentGraph,
  AgentGraphEdge,
  AgentGraphNode,
} from "@/lib/api/types/graph";

export interface ReactFlowGraph {
  nodes: Node<AgentGraphNode>[];
  edges: Edge<AgentGraphEdge>[];
}

export function irToReactFlow(graph: AgentGraph): ReactFlowGraph {
  const nodes: Node<AgentGraphNode>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind, // "agent" | "tool"
    position: { x: 0, y: 0 }, // dagre layout fills these in later
    data: n,
  }));

  const edges: Edge<AgentGraphEdge>[] = graph.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    type: "pretty", // single custom edge component dispatches on data.kind
    data: e,
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/irToReactFlow.test.ts && cd -
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/graph/irToReactFlow.ts \
        services/idun_agent_standalone_ui/components/graph/__tests__/irToReactFlow.test.ts
git commit -m "feat(standalone-ui): add pure IR→ReactFlow mapping function"
```

---

## Task 13: Standalone-UI — `AgentNode` and `ToolNode` components

**Files:**
- Create: `services/idun_agent_standalone_ui/components/graph/nodes/AgentNode.tsx`
- Create: `services/idun_agent_standalone_ui/components/graph/nodes/ToolNode.tsx`
- Create: `services/idun_agent_standalone_ui/components/graph/__tests__/nodes.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/components/graph/__tests__/nodes.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { AgentNode as AgentNodeData, ToolNode as ToolNodeData } from "@/lib/api/types/graph";

import { AgentNode } from "../nodes/AgentNode";
import { ToolNode } from "../nodes/ToolNode";

const wrap = (ui: React.ReactNode) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe("AgentNode", () => {
  it("renders name, kind chip, and root indicator", () => {
    const data: AgentNodeData = {
      kind: "agent",
      id: "agent:root",
      name: "support_agent",
      agent_kind: "llm",
      is_root: true,
      description: null,
      model: "gemini-2.5-flash",
      loop_max_iterations: null,
    };
    wrap(<AgentNode data={data} id={data.id} selected={false} />);
    expect(screen.getByText("support_agent")).toBeInTheDocument();
    expect(screen.getByText(/LlmAgent/i)).toBeInTheDocument();
    expect(screen.getByText(/root/i)).toBeInTheDocument();
  });
});

describe("ToolNode", () => {
  it("renders MCP server name when tool_kind=mcp", () => {
    const data: ToolNodeData = {
      kind: "tool",
      id: "tool:search@root",
      name: "search_faq",
      tool_kind: "mcp",
      description: null,
      mcp_server_name: "stdio: npx server-filesystem",
    };
    wrap(<ToolNode data={data} id={data.id} selected={false} />);
    expect(screen.getByText("search_faq")).toBeInTheDocument();
    expect(screen.getByText(/stdio: npx server-filesystem/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/nodes.test.tsx && cd -
```

Expected: imports fail.

- [ ] **Step 3: Implement `AgentNode`**

Create `services/idun_agent_standalone_ui/components/graph/nodes/AgentNode.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentNode as AgentNodeData, AgentKind } from "@/lib/api/types/graph";

const KIND_LABEL: Record<AgentKind, string> = {
  llm: "LlmAgent",
  sequential: "SequentialAgent",
  parallel: "ParallelAgent",
  loop: "LoopAgent",
  custom: "Custom",
};

export function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border bg-card px-3 py-2 shadow-sm",
        data.is_root
          ? "border-accent/60 bg-accent/5"
          : "border-border",
        selected && "ring-2 ring-accent",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-accent/40" />
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-accent">
          {data.is_root ? <Crown size={16} /> : <Bot size={16} />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight text-foreground">
            {data.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {KIND_LABEL[data.agent_kind]}
            </Badge>
            {data.is_root && (
              <Badge variant="outline" className="text-[10px]">
                root
              </Badge>
            )}
            {data.model && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {data.model}
              </Badge>
            )}
            {data.loop_max_iterations != null && (
              <Badge variant="outline" className="text-[10px]">
                ×{data.loop_max_iterations}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-accent/40" />
    </div>
  );
}
```

- [ ] **Step 4: Implement `ToolNode`**

Create `services/idun_agent_standalone_ui/components/graph/nodes/ToolNode.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plug, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolKind, ToolNode as ToolNodeData } from "@/lib/api/types/graph";

const ICON: Record<ToolKind, React.ReactNode> = {
  native: <Wrench size={12} />,
  mcp: <Plug size={12} />,
  built_in: <Sparkles size={12} />,
};

const ACCENT: Record<ToolKind, string> = {
  native: "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  mcp: "border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  built_in: "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-300",
};

export function ToolNode({ data, selected }: NodeProps<ToolNodeData>) {
  return (
    <div
      className={cn(
        "min-w-[140px] rounded-full border px-2.5 py-1 text-xs shadow-sm",
        ACCENT[data.tool_kind],
        selected && "ring-2 ring-accent",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-current opacity-40" />
      <div className="flex items-center gap-1.5">
        {ICON[data.tool_kind]}
        <span className="font-medium">{data.name}</span>
      </div>
      {data.mcp_server_name && (
        <div className="mt-0.5 truncate text-[10px] opacity-70">
          {data.mcp_server_name}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/nodes.test.tsx && cd -
```

Expected: 2 passed. (If `Badge` / `cn` paths differ in this codebase, adjust the imports — read the existing `components/ui/badge.tsx` and `lib/utils.ts` to confirm.)

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/components/graph/nodes/ \
        services/idun_agent_standalone_ui/components/graph/__tests__/nodes.test.tsx
git commit -m "feat(standalone-ui): add AgentNode + ToolNode custom ReactFlow nodes"
```

---

## Task 14: Standalone-UI — `PrettyEdge` (per-`EdgeKind` styling)

**Files:**
- Create: `services/idun_agent_standalone_ui/components/graph/edges/PrettyEdge.tsx`

(Edge appearance is hard to assert in unit tests cheaply — visual quality is verified by Task 15's integration test and the E2E in Task 18. We commit this without a dedicated test.)

- [ ] **Step 1: Implement the edge component**

Create `services/idun_agent_standalone_ui/components/graph/edges/PrettyEdge.tsx`:

```tsx
"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

import type { AgentGraphEdge, EdgeKind } from "@/lib/api/types/graph";

interface StylePreset {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const STYLES: Record<EdgeKind, StylePreset> = {
  parent_child:    { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.5 },
  sequential_step: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.5 },
  parallel_branch: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 2 },
  loop_step:       { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.5, strokeDasharray: "5 4" },
  tool_attach:     { stroke: "currentColor", strokeWidth: 1.2, strokeDasharray: "4 3" },
  graph_edge:      { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.2 },
};

function edgeLabel(data: AgentGraphEdge | undefined, sourceLoopMax: number | null = null): string | null {
  if (!data) return null;
  if (data.kind === "sequential_step" && data.order != null) {
    return `${data.order + 1}.`;
  }
  if (data.kind === "loop_step") {
    return sourceLoopMax != null ? `↻ ×${sourceLoopMax}` : "↻";
  }
  if (data.kind === "graph_edge" && data.condition) {
    return data.condition;
  }
  return data.label ?? null;
}

export function PrettyEdge(props: EdgeProps<AgentGraphEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });
  const style = data ? STYLES[data.kind] : STYLES.parent_child;
  const label = edgeLabel(data);

  return (
    <>
      <BaseEdge id={props.id} path={path} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="pointer-events-none rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_standalone_ui/components/graph/edges/PrettyEdge.tsx
git commit -m "feat(standalone-ui): add PrettyEdge custom edge with per-kind styling"
```

---

## Task 15: Standalone-UI — `AgentGraph` main canvas (dagre + ReactFlow)

**Files:**
- Create: `services/idun_agent_standalone_ui/components/graph/layout.ts`
- Create: `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx`
- Create: `services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";

import { AgentGraph } from "../AgentGraph";

const FIXTURE: AgentGraphIR = {
  format_version: "1",
  metadata: {
    framework: "ADK",
    agent_name: "root",
    root_id: "agent:root",
    warnings: [],
  },
  nodes: [
    {
      kind: "agent", id: "agent:root", name: "root", agent_kind: "llm",
      is_root: true, description: null, model: null, loop_max_iterations: null,
    },
  ],
  edges: [],
};

describe("AgentGraph", () => {
  it("renders a single-node graph without crashing", () => {
    render(<AgentGraph graph={FIXTURE} />);
    expect(screen.getByText("root")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/AgentGraph.test.tsx && cd -
```

Expected: import error.

- [ ] **Step 3: Implement the dagre layout helper**

Create `services/idun_agent_standalone_ui/components/graph/layout.ts`:

```ts
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

export function applyDagreLayout<TN, TE>(
  nodes: Node<TN>[],
  edges: Edge<TE>[],
): Node<TN>[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}
```

- [ ] **Step 4: Implement the canvas component**

Create `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx`:

```tsx
"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useMemo } from "react";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";

import { PrettyEdge } from "./edges/PrettyEdge";
import { irToReactFlow } from "./irToReactFlow";
import { applyDagreLayout } from "./layout";
import { AgentNode } from "./nodes/AgentNode";
import { ToolNode } from "./nodes/ToolNode";

interface AgentGraphProps {
  graph: AgentGraphIR;
  /** Height of the canvas. Defaults to a sensible value for a card embed. */
  height?: number;
}

const NODE_TYPES = { agent: AgentNode, tool: ToolNode };
const EDGE_TYPES = { pretty: PrettyEdge };

export function AgentGraph({ graph, height = 420 }: AgentGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const mapped = irToReactFlow(graph);
    return { nodes: applyDagreLayout(mapped.nodes, mapped.edges), edges: mapped.edges };
  }, [graph]);

  return (
    <div style={{ height }} className="w-full overflow-hidden rounded-md border bg-background">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          minZoom={0.4}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 5: Run test — confirm pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run components/graph/__tests__/AgentGraph.test.tsx && cd -
```

Expected: 1 passed.

(Note: `@xyflow/react` requires a `width` and `height` on its parent in jsdom; the wrapper div above provides height. If the test errors with "container has no width", wrap the component in `<div style={{ width: 800 }}>` in the test.)

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/components/graph/layout.ts \
        services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx \
        services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx
git commit -m "feat(standalone-ui): add AgentGraph ReactFlow canvas with dagre layout"
```

---

## Task 16: Standalone-UI — embed graph in `WizardDone`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx`

- [ ] **Step 1: Update the component**

Open `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx`. Wrap the existing `<Card>` in a `<div className="space-y-4 w-full max-w-lg">` and add a second card below containing the graph. Add the necessary imports:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError, type AgentRead, type Framework } from "@/lib/api";

const AgentGraph = dynamic(
  () => import("@/components/graph/AgentGraph").then((m) => m.AgentGraph),
  { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-md bg-muted" /> },
);

// ... (existing Mode type, envReminder helper, props interface — keep as-is) ...

export function WizardDone({
  agent,
  framework,
  mode,
  onGoToChat,
}: WizardDoneProps) {
  const graphQuery = useQuery({
    queryKey: ["agent-graph"],
    queryFn: () => api.getAgentGraph(),
    retry: (failureCount, err) => {
      // Don't retry on 404 (framework not supported)
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  return (
    <div className="w-full max-w-lg space-y-4">
      <Card className="w-full">
        {/* ... existing CardHeader/CardContent/CardFooter — keep as-is ... */}
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Your agent</CardTitle>
        </CardHeader>
        <CardContent>
          {graphQuery.isLoading && (
            <div className="h-[420px] animate-pulse rounded-md bg-muted" />
          )}
          {graphQuery.isError && graphQuery.error instanceof ApiError && graphQuery.error.status === 404 && (
            <p className="text-sm text-muted-foreground">
              Graph view isn&apos;t available for this agent type yet.
            </p>
          )}
          {graphQuery.isError && !(graphQuery.error instanceof ApiError && graphQuery.error.status === 404) && (
            <Alert>
              <AlertTitle>Graph unavailable</AlertTitle>
              <AlertDescription>Try reloading the page.</AlertDescription>
            </Alert>
          )}
          {graphQuery.data && <AgentGraph graph={graphQuery.data} />}
        </CardContent>
      </Card>
    </div>
  );
}
```

(Keep the existing `envReminder` helper, the `Mode` type, and the props interface unchanged. Only the JSX and the imports change.)

- [ ] **Step 2: Manual smoke test (optional but recommended)**

```bash
cd services/idun_agent_standalone_ui && npm run typecheck && cd -
```

Expected: no new TS errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx
git commit -m "feat(standalone-ui): show agent graph on WizardDone success screen"
```

---

## Task 17: Standalone-UI — add Graph tab to admin agent page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1: Add the new tab**

Open `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`. Find the `<Tabs>` component and its `<TabsList>` / `<TabsContent>` blocks. Add:

1. Import `useQuery` from `@tanstack/react-query` (likely already imported), `dynamic` from `next/dynamic`, and `ApiError` from `@/lib/api`.

2. Add a lazy-loaded `AgentGraph` import near the top of the file:

```tsx
const AgentGraph = dynamic(
  () => import("@/components/graph/AgentGraph").then((m) => m.AgentGraph),
  { ssr: false, loading: () => <div className="h-[480px] animate-pulse rounded-md bg-muted" /> },
);
```

3. Inside the component, alongside the existing queries, add:

```tsx
const graphQuery = useQuery({
  queryKey: ["admin-agent-graph"],
  queryFn: () => api.getAgentGraph(),
  retry: (failureCount, err) => {
    if (err instanceof ApiError && err.status === 404) return false;
    return failureCount < 2;
  },
});
```

4. In `<TabsList>`, append:

```tsx
<TabsTrigger value="graph">Graph</TabsTrigger>
```

5. After the existing `<TabsContent>` blocks, append:

```tsx
<TabsContent value="graph">
  <Card>
    <CardHeader>
      <CardTitle>Agent graph</CardTitle>
      <CardDescription>
        A visual map of this agent&apos;s sub-agents and tools.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {graphQuery.isLoading && (
        <div className="h-[480px] animate-pulse rounded-md bg-muted" />
      )}
      {graphQuery.isError && graphQuery.error instanceof ApiError && graphQuery.error.status === 404 && (
        <p className="text-sm text-muted-foreground">
          Graph view isn&apos;t available for this agent type yet.
        </p>
      )}
      {graphQuery.isError && !(graphQuery.error instanceof ApiError && graphQuery.error.status === 404) && (
        <Alert>
          <AlertTitle>Graph unavailable</AlertTitle>
          <AlertDescription>Try reloading the page.</AlertDescription>
        </Alert>
      )}
      {graphQuery.data && <AgentGraph graph={graphQuery.data} height={480} />}
    </CardContent>
  </Card>
</TabsContent>
```

(Adjust the `<CardDescription>` import if not already present.)

- [ ] **Step 2: Verify typecheck**

```bash
cd services/idun_agent_standalone_ui && npm run typecheck && cd -
```

Expected: no new TS errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "feat(standalone-ui): add Graph tab to admin agent page"
```

---

## Task 18: Standalone-UI — extend wizard E2E test

**Files:**
- Locate the existing playwright spec under `services/idun_agent_standalone_ui/e2e/` that exercises the onboarding wizard. The spec name varies by setup — check `e2e/` for `wizard.spec.ts`, `onboarding.spec.ts`, or similar.
- Modify whichever existing spec drives the wizard to `WizardDone`.

- [ ] **Step 1: Discover the existing wizard E2E**

```bash
ls services/idun_agent_standalone_ui/e2e/
```

If multiple specs exist, the right one is the one whose existing assertions reach the `WizardDone` screen (look for assertions about "Set up your model credentials" or the "Go to chat" button).

- [ ] **Step 2: Add an assertion after `WizardDone` is visible**

Inside the existing test (after the assertions that confirm `WizardDone` rendered), append:

```ts
// Graph card visible with at least one agent node rendered by ReactFlow
const graphCard = page.getByText("Your agent", { exact: true });
await expect(graphCard).toBeVisible();
// ReactFlow renders nodes with [data-id="..."] attributes matching the IR ids
await expect(page.locator('[data-id^="agent:"]').first()).toBeVisible({ timeout: 10_000 });
```

- [ ] **Step 3: Run the spec locally to confirm**

```bash
cd services/idun_agent_standalone_ui && npm run test:e2e -- <spec-file> && cd -
```

Expected: spec passes including the new assertion. (If E2E requires a running standalone server fixture, follow the project's existing pattern — likely the spec already starts it via `playwright.config.ts` or a `before` hook.)

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e/<spec-file>
git commit -m "test(standalone-ui): assert graph card renders on WizardDone"
```

---

## Final verification — full suite

After Task 18, run end-to-end checks:

- [ ] **Engine + schema lint + tests**

```bash
make lint
make pytest -- -m "not requires_langfuse and not requires_phoenix and not requires_postgres"
```

Expected: all green.

- [ ] **Engine type check**

```bash
make mypy
```

Expected: no new errors.

- [ ] **Standalone UI typecheck + unit tests**

```bash
cd services/idun_agent_standalone_ui
npm run typecheck
npx vitest run
cd -
```

Expected: no new TS errors; all vitest tests pass.

- [ ] **Standalone UI build (catches lazy-load issues)**

```bash
cd services/idun_agent_standalone_ui && npm run build && cd -
```

Expected: clean build, no runtime errors. Inspect `out/` size — confirm the chunk split for `@xyflow/react` is reasonable (lazy-loaded chunk, not in main bundle).

- [ ] **Manual smoke test against a real ADK agent**

```bash
# In one terminal: serve a sample ADK agent
uv run idun agent serve --source file --path examples/adk-config.yaml

# In another: visit http://localhost:<port>/admin/agent and click the Graph tab
# Visit http://localhost:<port>/onboarding (if accessible) and complete the wizard
```

Expected: graph renders; nodes show correct names/types; tools show MCP server name when applicable.

---

## Self-review against the spec

Quick coverage check (run mentally before claiming done):

| Spec section | Implemented in task |
|---|---|
| §5 IR data model | Task 1 |
| §6.1 BaseAgent defaults | Task 2 |
| §6.2 LangGraph adapter | Task 5 |
| §6.3 ADK adapter (single + tools) | Task 6 |
| §6.3 ADK adapter (workflow agents) | Task 7 |
| §6.3 ADK adapter (custom + nested) | Task 8 |
| §6.4 Haystack 404 | Task 9 (route 404 test) |
| §7.1 render_mermaid | Task 3 |
| §7.2 render_ascii | Task 4 |
| §8 HTTP routes | Task 9 |
| §8 admin web URL swap | Task 10 |
| §9.1 deps | Task 11 |
| §9.2 TS types | Task 11 |
| §9.3 API client | Task 11 |
| §9.4 components (nodes) | Task 13 |
| §9.4 components (edges) | Task 14 |
| §9.4 components (canvas + layout) | Task 15 |
| §9.4 IR mapper | Task 12 |
| §9.5 WizardDone integration | Task 16 |
| §9.5 admin agent page Graph tab | Task 17 |
| §9.7 lazy-loading | Task 16, 17 (`dynamic` imports) |
| §10.6 E2E | Task 18 |

If a spec requirement isn't covered, add or extend a task — don't quietly drop it.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-30-adk-langgraph-graph-visualizer.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
