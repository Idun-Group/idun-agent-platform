# ADK + LangGraph Graph Visualizer Design

> **Status:** Locked — ready for implementation plan
> **Branch:** `worktree-graph-display` (based on `feat/onboarding-mvp`)
> **Depends on:** `feat/onboarding-mvp` (engine `agent_not_ready` boot mode + standalone UI shell)

---

## 1. Goal

Build a framework-agnostic graph visualizer for agents loaded by the Idun engine. Three deliverables:

1. **Engine routes** — `GET /agent/graph` (JSON IR), `/agent/graph/mermaid` (str), `/agent/graph/ascii` (str) — supporting both LangGraph and ADK agents.
2. **Schema-package IR** — versioned Pydantic models in `idun_agent_schema` describing agents (LlmAgent, Sequential, Parallel, Loop, Custom), tools (native, MCP, built-in), and edges (parent_child, sequential_step, parallel_branch, loop_step, tool_attach, graph_edge).
3. **Standalone-UI rendering** — a custom React component using ReactFlow + dagre layout. Mounts on `WizardDone` (post-onboarding success) and `app/admin/agent` (admin tab). Pan + zoom + minimap; no inspection panel in v1.

The admin web (`services/idun_agent_web`) is not migrated in this branch — it keeps its existing Mermaid graph section, with a **3-line URL update** to point at `/agent/graph/mermaid` so it stays functional through the contract change.

## 2. Why

The engine currently exposes `GET /agent/graph` returning `{"graph": "<mermaid>"}` for LangGraph only (PR #312). ADK has no equivalent. After the onboarding wizard detects an existing agent, the user has no visual confirmation of what was found beyond a name — no surface that says "here's what your agent looks like." This branch closes that gap for ADK and standardizes both frameworks on a single UI-renderable contract.

A custom UI component (rather than Mermaid pass-through) was a deliberate choice — Mermaid's visual language constrains us to its primitives; ReactFlow + custom node components let us render agents and tools as branded cards that adapt to user-themed standalone deployments.

## 3. Out of scope

- **Wizard pre-detection preview** (graph in `WizardOneDetected` before agent is materialized). Engine has no loaded agent at that point; preview would need a separate dynamic-import-and-introspect path. Deferred.
- **Inspection side panel** (click a node → drawer with details). The IR carries the data; a follow-up branch adds the panel.
- **Admin-web ReactFlow swap**. The `graph-section.tsx` component in `idun_agent_web` keeps using Mermaid; this branch only updates its URL to the new mermaid endpoint.
- **Haystack support**. `HaystackAgent.get_graph_ir()` is not implemented; the routes 404 for Haystack agents.
- **Server-rendered images** (PNG/SVG from the engine). All rendering is client-side.
- **Editable graph** — read-only forever.
- **Live updates / streaming** — graph fetched once per page; React Query handles invalidation on `/reload`.
- **Layout direction toggle, search, expand/collapse subtrees** — possible follow-ups; not in this scope.

## 4. Architecture

Three packages collaborate. Each owns one slice; nothing leaks.

```
libs/idun_agent_schema/
  └─ engine/graph.py                  NEW — Pydantic IR models (versioned)

libs/idun_agent_engine/
  ├─ agent/base.py                    MODIFY — add get_graph_ir(), draw_mermaid(), draw_ascii()
  ├─ agent/langgraph/langgraph.py     MODIFY — implement get_graph_ir(); override draw_* to native
  ├─ agent/adk/adk.py                 MODIFY — implement get_graph_ir() walking App.root_agent
  ├─ server/graph/__init__.py         NEW
  ├─ server/graph/mermaid.py          NEW — render_mermaid(graph) -> str (framework-agnostic)
  ├─ server/graph/ascii.py            NEW — render_ascii(graph) -> str (framework-agnostic)
  └─ server/routers/agent.py          MODIFY — replace /agent/graph with three routes

services/idun_agent_standalone_ui/
  ├─ package.json                     MODIFY — add @xyflow/react, @dagrejs/dagre
  ├─ lib/api/types/graph.ts           NEW — hand-written TS mirror of schema models
  ├─ lib/api/index.ts                 MODIFY — add api.getAgentGraph{,Mermaid,Ascii}()
  ├─ components/graph/AgentGraph.tsx  NEW — ReactFlow canvas + dagre layout
  ├─ components/graph/nodes/AgentNode.tsx  NEW — agent card
  ├─ components/graph/nodes/ToolNode.tsx   NEW — tool pill
  ├─ components/graph/edges/index.tsx      NEW — edge styles per EdgeKind
  ├─ components/onboarding/WizardDone.tsx  MODIFY — embed <AgentGraph>
  └─ app/admin/agent/page.tsx         MODIFY — add "Graph" tab with <AgentGraph>

services/idun_agent_web/
  └─ src/pages/agent-detail/tabs/overview-tab/sections/graph-section.tsx  MODIFY (3 lines)
                                      Switch URL to /agent/graph/mermaid; read data.mermaid
```

Boundary: **engine produces the IR; UI knows how to render it**. Mermaid/ASCII are convenience renderings emitted by the engine for debug/copy-paste — the UI doesn't consume them. The engine stays UI-agnostic; the UI stays framework-agnostic (it never imports `langgraph`/`google-adk`).

## 5. JSON IR data model

New file: `libs/idun_agent_schema/src/idun_agent_schema/engine/graph.py`.

```python
from enum import Enum
from typing import Annotated, Literal
from pydantic import BaseModel, Field
from idun_agent_schema.engine.agent_framework import AgentFramework


class AgentKind(str, Enum):
    LLM = "llm"
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    LOOP = "loop"
    CUSTOM = "custom"  # subclasses we don't recognize


class ToolKind(str, Enum):
    NATIVE = "native"      # plain function tool or unknown
    MCP = "mcp"            # MCPToolset instance
    BUILT_IN = "built_in"  # ADK built-in (google_search, load_artifacts, etc.)


class EdgeKind(str, Enum):
    PARENT_CHILD = "parent_child"          # generic agent → sub-agent
    SEQUENTIAL_STEP = "sequential_step"    # SequentialAgent → step (order set)
    PARALLEL_BRANCH = "parallel_branch"    # ParallelAgent → branch
    LOOP_STEP = "loop_step"                # LoopAgent → step
    TOOL_ATTACH = "tool_attach"            # agent → tool
    GRAPH_EDGE = "graph_edge"              # LangGraph edge (condition optional)


class AgentNode(BaseModel):
    kind: Literal["agent"] = "agent"
    id: str
    name: str
    agent_kind: AgentKind
    is_root: bool = False
    description: str | None = None
    model: str | None = None              # LlmAgent only
    loop_max_iterations: int | None = None  # LoopAgent only


class ToolNode(BaseModel):
    kind: Literal["tool"] = "tool"
    id: str
    name: str
    tool_kind: ToolKind
    description: str | None = None
    mcp_server_name: str | None = None    # MCP tools only — descriptive (stdio cmd or URL)


AgentGraphNode = Annotated[AgentNode | ToolNode, Field(discriminator="kind")]


class AgentGraphEdge(BaseModel):
    source: str           # node id
    target: str
    kind: EdgeKind
    order: int | None = None       # SEQUENTIAL_STEP only
    condition: str | None = None   # GRAPH_EDGE only (LangGraph conditional)
    label: str | None = None       # display override


class AgentGraphMetadata(BaseModel):
    framework: AgentFramework
    agent_name: str
    root_id: str                       # entry point for layout
    warnings: list[str] = Field(default_factory=list)


class AgentGraph(BaseModel):
    format_version: Literal["1"] = "1"
    metadata: AgentGraphMetadata
    nodes: list[AgentGraphNode]
    edges: list[AgentGraphEdge]
```

**Notes:**

- `format_version: "1"` is the migration anchor. v2 (when we add it) lives alongside, not as a breaking change.
- `id` is stable within a single response (e.g., `"agent:billing_agent"`, `"tool:refund@billing_agent"`) — collision-safe even when two agents use a tool with the same name. Not stable across requests.
- `warnings` lists best-effort introspection issues: e.g., `"Agent 'X' is a custom BaseAgent subclass; introspected as 'custom'"` or `"MCP toolset detection fell back to duck-typing"`.

## 6. Engine: introspection

### 6.1 `BaseAgent.get_graph_ir()` (`agent/base.py`)

```python
def get_graph_ir(self) -> AgentGraph:
    """Return a framework-agnostic graph IR. Default: not supported."""
    raise NotImplementedError(
        f"{self.agent_type} does not support graph introspection"
    )

def draw_mermaid(self) -> str:
    """Default: render the IR with the engine's framework-agnostic renderer."""
    from idun_agent_engine.server.graph.mermaid import render_mermaid
    return render_mermaid(self.get_graph_ir())

def draw_ascii(self) -> str:
    """Default: render the IR with the engine's framework-agnostic renderer."""
    from idun_agent_engine.server.graph.ascii import render_ascii
    return render_ascii(self.get_graph_ir())
```

`NotImplementedError` (not `@abstractmethod`) so Haystack stays valid without a stub. The route translates `NotImplementedError` → 404.

### 6.2 `LanggraphAgent.get_graph_ir()`

Walk `CompiledStateGraph.get_graph(xray=False)`:

- Each entry in `lg_graph.nodes.items()` becomes one `AgentNode` with `agent_kind=AgentKind.CUSTOM` (LangGraph nodes don't map to ADK kinds), `is_root=True` for the `__start__` node.
- Each entry in `lg_graph.edges` becomes one `AgentGraphEdge(kind=GRAPH_EDGE)`. Populate `condition` from the edge's conditional metadata if present (verify exact attribute name against pinned `langgraph` version during implementation; fall back to `condition=None` and emit a warning if the API differs). Populate `label` from the edge's display label.
- `metadata.framework=AgentFramework.LANGGRAPH`, `metadata.root_id="node:__start__"`.
- **Override `draw_mermaid()` and `draw_ascii()`** to delegate to LangGraph's native `instance.get_graph().draw_mermaid()` and `draw_ascii()`. They produce polished, battle-tested output for LangGraph specifically; we don't reinvent.
- `xray=False` matches the existing route's behavior (PR #312). A future query-param toggle (`?xray=true`) can expose subgraph internals; not in v1.

### 6.3 `AdkAgent.get_graph_ir()`

Recursive walk from `self._agent_instance.root_agent`. The `_agent_instance` is a `google.adk.apps.app.App`; the root is `App.root_agent`.

The pseudo-code below illustrates shape and decision points; helper functions (`_describe_mcp_params`, `_looks_like_user_function`) are private implementation details to be defined during the implementation pass.

```python
def get_graph_ir(self) -> AgentGraph:
    from google.adk.agents import (
        BaseAgent as ADKBaseAgent, LlmAgent,
        SequentialAgent, ParallelAgent, LoopAgent,
    )
    # ... import IR models ...

    if self._agent_instance is None:
        raise RuntimeError("Agent not initialized")

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
        # MCP toolset detection
        try:
            from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
            if isinstance(tool, MCPToolset):
                # Describe the toolset (stdio cmd or URL)
                params = getattr(tool, "connection_params", None)
                desc = _describe_mcp_params(params)
                return (ToolKind.MCP, desc)
        except ImportError:
            pass
        # Built-in detection: ADK ships these in google.adk.tools
        module = getattr(tool, "__module__", "") or ""
        if module.startswith("google.adk.tools") and not _looks_like_user_function(tool):
            return (ToolKind.BUILT_IN, None)
        return (ToolKind.NATIVE, None)

    def _walk(agent, is_root: bool = False) -> str:
        agent_id = f"agent:{agent.name}"
        kind = _agent_kind(agent)

        nodes.append(AgentNode(
            id=agent_id, name=agent.name, agent_kind=kind, is_root=is_root,
            description=getattr(agent, "description", None),
            model=getattr(agent, "model", None) if kind == AgentKind.LLM else None,
            loop_max_iterations=getattr(agent, "max_iterations", None) if kind == AgentKind.LOOP else None,
        ))
        if kind == AgentKind.CUSTOM:
            warnings.append(f"Agent '{agent.name}' is a custom BaseAgent subclass; introspected best-effort")

        # Tools
        for tool in getattr(agent, "tools", None) or []:
            tool_name = getattr(tool, "name", None) or getattr(tool, "__name__", None) or repr(tool)[:40]
            tool_id = f"tool:{tool_name}@{agent.name}"
            tool_kind, server_desc = _classify_tool(tool)
            nodes.append(ToolNode(
                id=tool_id, name=tool_name, tool_kind=tool_kind,
                description=getattr(tool, "description", None),
                mcp_server_name=server_desc,
            ))
            edges.append(AgentGraphEdge(
                source=agent_id, target=tool_id, kind=EdgeKind.TOOL_ATTACH,
            ))

        # Sub-agents
        for i, sub in enumerate(getattr(agent, "sub_agents", None) or []):
            child_id = _walk(sub, is_root=False)
            edge_kind = {
                AgentKind.SEQUENTIAL: EdgeKind.SEQUENTIAL_STEP,
                AgentKind.PARALLEL:   EdgeKind.PARALLEL_BRANCH,
                AgentKind.LOOP:       EdgeKind.LOOP_STEP,
            }.get(kind, EdgeKind.PARENT_CHILD)
            edges.append(AgentGraphEdge(
                source=agent_id, target=child_id, kind=edge_kind,
                order=i if edge_kind == EdgeKind.SEQUENTIAL_STEP else None,
            ))
        return agent_id

    root_id = _walk(self._agent_instance.root_agent, is_root=True)
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK, agent_name=self.name,
            root_id=root_id, warnings=warnings,
        ),
        nodes=nodes, edges=edges,
    )
```

**Tool granularity (v1)**: one `ToolNode` per entry in `agent.tools`. If the entry is an `MCPToolset`, the node represents the toolset as a whole (label: stdio command or SSE URL), **not** the tools inside it. Enumerating tools inside a toolset requires async connection (`await toolset.get_tools()`) at introspection time and is deferred to v1.5.

**Stable tool IDs**: scoped by owner agent (`tool:{name}@{owner}`) so two agents using `google_search` don't collide on a shared id.

### 6.4 `HaystackAgent`

No override. Default `NotImplementedError` from `BaseAgent` stands → route returns 404.

## 7. Engine: renderers

New module: `libs/idun_agent_engine/src/idun_agent_engine/server/graph/`.

### 7.1 `mermaid.py` — `render_mermaid(graph: AgentGraph) -> str`

Pure function. Emits a Mermaid `graph TD` source string from any `AgentGraph` (framework-agnostic). Edge styles:

- `PARENT_CHILD`: `A --> B`
- `TOOL_ATTACH`: `A -.-> T`
- `SEQUENTIAL_STEP`: `A == "1." ==> B` (order in label)
- `PARALLEL_BRANCH`: `A ==> B` (thicker)
- `LOOP_STEP`: `A -. "↻ ×N" .-> B` (where N is parent's `loop_max_iterations`)
- `GRAPH_EDGE`: `A --> B` or `A -- "{condition}" --> B`

Mermaid node style:

- `AgentNode`: `id["{name}<br/>{agent_kind}"]` with class for root vs non-root.
- `ToolNode`: `id(["{name}"])` (rounded) with class differentiating native/mcp/built_in.

LangGraph delegates to native `draw_mermaid()` instead of using this — its native output is preferred.

### 7.2 `ascii.py` — `render_ascii(graph: AgentGraph) -> str`

Pure function. Tree printer rooted at `metadata.root_id`, using `├─` / `└─` / `│  ` connectors. Tools shown as leaves under each agent.

```
support_agent (LlmAgent, root)
├─ tools
│  └─ search_faq (mcp: stdio: npx ... server-filesystem)
├─ billing_agent (LlmAgent)
│  └─ tools
│     └─ refund (native)
└─ tech_support_agent (LlmAgent)
   └─ tools
      └─ create_ticket (native)
```

Adds a header line with framework, agent name, and any warnings. LangGraph delegates to native `draw_ascii()` (which uses `grandalf` — already a transitive dep via langgraph).

## 8. Engine: HTTP routes

`libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`. Replace the existing `/agent/graph` route (which returned `{"graph": "<mermaid>"}`) with three:

```python
@agent_router.get("/graph", response_model=AgentGraph)
async def get_graph_ir(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> AgentGraph:
    try:
        return agent.get_graph_ir()
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        logger.exception("Graph IR extraction failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Graph introspection failed")


@agent_router.get("/graph/mermaid")
async def get_graph_mermaid(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> dict[str, str]:
    try:
        return {"mermaid": agent.draw_mermaid()}
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


@agent_router.get("/graph/ascii")
async def get_graph_ascii(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
) -> dict[str, str]:
    try:
        return {"ascii": agent.draw_ascii()}
    except NotImplementedError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
```

**Auth**: same `get_verified_user` dep as `/agent/run`. Reused, not duplicated.

**Status codes**:

- `200` — success
- `401`/`403` — auth failure (handled by dep)
- `404` — `NotImplementedError` from adapter (Haystack today, custom adapters in future)
- `503` — `agent_not_ready` (`get_agent` dep raises this from `feat/onboarding-mvp`'s unconfigured boot mode)
- `500` — unexpected introspection error, with safe public message and full traceback in logs

**Response shapes**:

- IR route: `AgentGraph` (FastAPI `response_model` = OpenAPI auto-doc + Pydantic validation)
- Mermaid/ASCII routes: JSON-wrapped `{"mermaid": str}` / `{"ascii": str}` to stay consistent with existing API conventions

**Backward-compat** (admin web): the existing `services/idun_agent_web/src/pages/agent-detail/tabs/overview-tab/sections/graph-section.tsx` consumes `{"graph": str}`. Update it to call `/agent/graph/mermaid` and read `data.mermaid` — a 3-line change. No UI behavior change; the admin web continues to render via `mermaid` lib until the follow-up branch swaps in `<AgentGraph>`.

## 9. Standalone-UI integration

### 9.1 Dependencies

Add to `services/idun_agent_standalone_ui/package.json`:

- `@xyflow/react` (^12.x, MIT) — graph rendering
- `@dagrejs/dagre` (^1.x, MIT) — hierarchical layout

### 9.2 TypeScript types

New `lib/api/types/graph.ts` — hand-written mirror of the schema-package Pydantic models. The standalone-UI's CLAUDE.md establishes hand-written types as the convention; codegen is not in place. Discriminated union via TS literal types — `AgentGraphNode = AgentNode | ToolNode` narrowed on `kind`.

### 9.3 API client

In `lib/api/index.ts`:

```ts
api.getAgentGraph        = () => apiFetch<AgentGraph>("/agent/graph")
api.getAgentGraphMermaid = () => apiFetch<{mermaid: string}>("/agent/graph/mermaid")
api.getAgentGraphAscii   = () => apiFetch<{ascii: string}>("/agent/graph/ascii")
```

These hit the **engine surface** (`/agent/*`), not the standalone admin (`/admin/api/v1/*`). The same FastAPI app serves both — `apiFetch` already handles relative paths correctly.

### 9.4 Components

`components/graph/AgentGraph.tsx` — main canvas. Props: `graph: AgentGraph`. Behavior:

1. Map IR → ReactFlow `nodes` and `edges` (a pure function `irToReactFlow(graph)` so we can unit-test the mapping).
2. Compute positions with `dagre` (`rankdir: "TB"`, `nodesep: 40`, `ranksep: 60`).
3. Render `<ReactFlow nodeTypes={...} edgeTypes={...} fitView proOptions={{ hideAttribution: true }}>` with `<Background>`, `<Controls>`, `<MiniMap>`.
4. Pan + zoom default; no click handlers in v1.

`components/graph/nodes/AgentNode.tsx` — custom React Flow node for `kind: "agent"`. Renders a card with: framework icon (lucide), name (semibold), `agent_kind` chip, `model` badge (LlmAgent), root indicator. Color accent uses theme CSS variables (`--accent`, `--card`, `--border`) so user-themed deployments inherit branding.

`components/graph/nodes/ToolNode.tsx` — custom node for `kind: "tool"`. Pill shape, smaller. Tool icon by `tool_kind` (function for native, plug for MCP, sparkle for built-in). Optional `mcp_server_name` chip below name.

`components/graph/edges/index.tsx` — single custom edge component that picks style per `EdgeKind`:

| `EdgeKind` | Style | Label |
|---|---|---|
| `parent_child` | solid 1.5px, `--accent` | none |
| `tool_attach` | dashed 1.2px, `--muted-foreground` | none |
| `sequential_step` | solid 1.5px | `"{order+1}."` |
| `parallel_branch` | solid 1.5px, slightly thicker | none |
| `loop_step` | dashed 1.5px | `"×{loop_max_iterations}"` if set |
| `graph_edge` | solid 1.2px | `condition` if set |

### 9.5 Render points

**`components/onboarding/WizardDone.tsx`** — currently a single `Card` ("Agent is ready" + framework badge + env reminder + "Go to chat"). Add a second `Card` titled **"Your agent"** below it, body is `<AgentGraph graph={data} />`. Fetched via `useQuery(["agent-graph"], () => api.getAgentGraph())`. Loading: skeleton card. Error 404: friendly text "Graph view isn't available for this agent type yet." Error other: muted alert + retry.

**`app/admin/agent/page.tsx`** — already uses a `<Tabs>` component (Identity / Config / etc.). Add a new tab **"Graph"** as the last tab. Body is the same `<AgentGraph>` with the same query (cache key shared). Same error UX.

### 9.6 Theming

Cards use existing shadcn/ui tokens (`bg-card`, `border-border`, `text-foreground`). Accent color reads `var(--accent)` from `ThemeLoader` so a self-hosted standalone with custom branding inherits the user's accent in the graph automatically — no extra wiring.

### 9.7 Bundle size

`@xyflow/react` + `@dagrejs/dagre` adds ~250KB gzipped to the static export. Two mitigations if it bites first-paint budget:

1. **Lazy-load**: the graph component is only used on `WizardDone` (wizard flow) and `app/admin/agent` (admin). Neither is the chat first paint. Use `dynamic(() => import("@/components/graph/AgentGraph"), { ssr: false })`.
2. **Tree-shake**: import only the React Flow primitives we use (`ReactFlow`, `Background`, `Controls`, `MiniMap`); avoid `@xyflow/react/full`.

Decision: ship lazy-loaded by default. Measure before merge; revisit if needed.

## 10. Testing

### 10.1 Schema package — `libs/idun_agent_schema/tests/`

- `AgentNode` and `ToolNode` round-trip via `model_dump()` / `model_validate()`.
- Discriminated `AgentGraphNode` parses both variants from JSON correctly.
- `format_version` rejects unknown versions.

### 10.2 Engine — adapter introspection

`libs/idun_agent_engine/tests/unit/agent/test_graph_ir_langgraph.py`:

- Single-node graph (`START → my_node → END`).
- Multi-node graph with `add_conditional_edges` — `condition` populated per branch label.
- Edge labels preserved in `label`.

`libs/idun_agent_engine/tests/unit/agent/test_graph_ir_adk.py`:

- Root `LlmAgent` only.
- `LlmAgent` with native function tool — `tool_kind=native`.
- `LlmAgent` with `MCPToolset` — `tool_kind=mcp`, `mcp_server_name` populated.
- `LlmAgent` with `google_search` — `tool_kind=built_in`.
- `SequentialAgent` with 3 sub-agents — three `sequential_step` edges with `order=0,1,2`.
- `ParallelAgent` with 2 sub-agents — `parallel_branch` edges.
- `LoopAgent` with 1 sub-agent and `max_iterations=5` — parent's `loop_max_iterations=5`, edge `loop_step`.
- Nested: root `LlmAgent` → `SequentialAgent` → 2 `LlmAgent` leaves with tools.
- Custom `BaseAgent` subclass — `agent_kind=custom`, warning emitted.

For each: assert node count, edge count, root id, and that specific edges/nodes exist with the right `kind`. Don't assert exhaustive structure — keep tests readable.

### 10.3 Engine — renderers

`tests/unit/server/graph/test_mermaid.py` and `test_ascii.py`. Build hand-crafted `AgentGraph` fixtures (no framework imports — these tests stay framework-agnostic) and assert renderer output. Plain string-equality with file fixtures (`.txt`); no `syrupy` dep introduced.

LangGraph's native delegations don't need new tests — they're thin pass-throughs to LangGraph's tested code.

### 10.4 Engine — routes

Extend `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py` (already 55 lines covering the legacy mermaid path):

- `GET /agent/graph` → `200`, body validates as `AgentGraph`.
- `GET /agent/graph/mermaid` → `200`, `{"mermaid": str}` non-empty.
- `GET /agent/graph/ascii` → `200`, `{"ascii": str}` non-empty.
- All three → `404` when adapter raises `NotImplementedError` (mock a Haystack agent).
- All three → `503` when agent unconfigured.
- All three → `401` when auth dep rejects.

Mock `get_agent` to return a fake `BaseAgent` with canned IR / strings — keeps route tests fast and decoupled from introspection tests.

### 10.5 Standalone-UI — components

`components/graph/__tests__/AgentGraph.test.tsx` (vitest + jsdom):

- `irToReactFlow` (pure function) — assert it produces the right number of nodes and edges from a fixture IR.
- `<AgentGraph>` renders without throwing for the same fixture.
- `<AgentNode>` renders agent name + type chip text.
- `<ToolNode>` renders MCP server chip when `tool_kind="mcp"`.

Skip a heavy snapshot of the SVG — ReactFlow's DOM is verbose and brittle.

### 10.6 Standalone-UI — E2E (light touch)

Extend the existing wizard playwright spec (`e2e/wizard.spec.ts`): after `WizardDone` appears, the graph card is visible and contains at least one element matching `[data-id^="agent:"]`. One assertion, no introspection details. Skip a separate admin-page E2E for v1.

### 10.7 Out of scope for testing

- Visual regression on the rendered graph (would need Playwright + screenshot diffing).
- Performance benchmarks for graphs with 100+ nodes.
- Tool-discovery edge cases for unrecognized tool subclasses (we log a warning, don't error).

## 11. Known unknowns to validate during implementation

1. **LangGraph `Graph` edge attributes**: the runtime Graph object's edge representation has evolved (older versions: `Edge` dataclass with `source`, `target`, `data`, `conditional`; newer: includes Command-based routing surfaced as edges via `xray=True`). Verify against the version pinned by this repo before writing the walker. Fall back to `condition=None` and emit a warning if the API shifted.
2. **ADK `MCPToolset` import path**: snippets show both `from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset` (older) and `from google.adk.tools import McpToolset` (newer). Try both imports; if both fail, fall back to duck-typed check (`hasattr(tool, "connection_params")`) and emit a warning.
3. **ADK built-in tool detection heuristic**: the current heuristic ("module starts with `google.adk.tools` and not a user function") is conservative. Edge case: a user reimports `google_search` and wraps it. Acceptable false-positive rate for v1; revisit if needed.
4. **`@xyflow/react` v12 attribution**: `proOptions={{ hideAttribution: true }}` is acceptable for self-hosted MIT use only when the legal terms are met. Verify license before merging — likely fine, but worth a 1-minute check.

## 12. Follow-ups (out of scope for this branch)

- **Wizard pre-detection preview** (`WizardOneDetected`): introspect the agent before materialization. Needs a `POST /agent/graph/preview` route that takes `{type, agent_path}` and runs an isolated import + introspection. Engine surface +1 route, IR consumer reused.
- **Inspection side panel** (Q5 option C): click handlers + a sheet/drawer with node details (model, instructions excerpt, tool description, MCP server). UI only; the IR already carries the data.
- **Admin-web ReactFlow swap**: replace `services/idun_agent_web`'s mermaid `graph-section.tsx` with the new `<AgentGraph>` component. Port to admin-web's styled-components conventions.
- **Haystack support**: walk `Pipeline` graph; produce a different IR variant (Haystack pipelines aren't agent trees).
- **MCP tool enumeration**: for MCPToolset entries, list the tools inside the toolset as individual ToolNodes (requires async toolset connection at introspection time).
- **`xray=true` toggle**: query parameter on the IR/Mermaid routes to expose LangGraph subgraph internals.
- **Layout interaction polish**: TB/LR direction toggle, expand/collapse subtrees, search.
