# Framework-Agnostic Agent Interaction Design

**Date:** 2026-03-08
**Issue:** #355
**Branch:** issue/348
**Status:** Approved design, pending implementation

## Summary

Introduce a single, framework-agnostic interaction surface for agents built with LangGraph and ADK. Replace the current fragmented route family (`/agent/invoke`, `/agent/stream`, `/agent/copilotkit/stream`) with one canonical AG-UI stream route (`POST /agent/run`) plus a discovery endpoint (`GET /agent/capabilities`). Evolve the web UI chat tab into a discovery-driven interaction surface with Auto, Chat, Form, and Events views.

## Decisions

| Decision | Choice |
|---|---|
| Framework scope | LangGraph + ADK only (Haystack out of scope) |
| Migration strategy | Shim-based cutover, old routes deprecated with TODO comments |
| Schema discovery | Best-effort inferred from framework native constructs |
| Route architecture | Single AG-UI stream route (`POST /agent/run`), batch = collect stream |
| Discovery endpoint | `GET /agent/capabilities`, framework-informed heuristic for mode detection |
| Web UI | Pragmatic evolution: Auto + Chat + Form + Events |
| Old schema config fields | Remove `input_schema_definition` / `output_schema_definition` entirely |
| Thread semantics | Pass-through to framework, discovery reports capability |
| Test agents | Test fixtures + proper examples in `examples/` |

## Engine: Discovery Endpoint

`GET /agent/capabilities` returns a cached, static descriptor resolved once at startup.

```json
{
  "version": "1",
  "framework": "LANGGRAPH",
  "capabilities": {
    "streaming": true,
    "history": true,
    "threadId": true
  },
  "input": {
    "mode": "chat",
    "schema": {}
  },
  "output": {
    "mode": "structured",
    "schema": {}
  }
}
```

### Auto-Discovery Logic

| Framework | Input detection | Output detection |
|---|---|---|
| LangGraph | `graph.input_schema` — if default `MessagesState` or contains only a `messages` field → `chat`. Otherwise → `structured`. | `graph.output_schema` — if different from input schema and has typed fields → `structured`. If same as state or only has messages → `text`. |
| ADK | `agent.input_schema is None` → `chat`. Otherwise → `structured`. | `agent.output_schema is None` → `text`. Otherwise → `structured`. |

JSON Schema generated via `model_json_schema()` (Pydantic) or TypedDict-to-schema conversion.

### Schema Models (in `idun_agent_schema`)

```python
class AgentCapabilities(BaseModel):
    version: str = "1"
    framework: AgentFramework
    capabilities: CapabilityFlags
    input: InputDescriptor
    output: OutputDescriptor

class CapabilityFlags(BaseModel):
    streaming: bool
    history: bool
    thread_id: bool

class InputDescriptor(BaseModel):
    mode: Literal["chat", "structured"]
    schema_: dict[str, Any] | None = Field(None, alias="schema")

class OutputDescriptor(BaseModel):
    mode: Literal["text", "structured", "unknown"]
    schema_: dict[str, Any] | None = Field(None, alias="schema")
```

## Engine: Canonical Run Route

`POST /agent/run` accepts AG-UI `RunAgentInput`, returns SSE stream.

```
POST /agent/run
Content-Type: application/json
Accept: text/event-stream

{
  "threadId": "thread_123",
  "runId": "run_456",
  "state": {},
  "messages": [
    { "id": "msg_1", "role": "user", "content": "Hello" }
  ],
  "tools": [],
  "context": [],
  "forwardedProps": {}
}
```

### Input Extraction Per Agent Type

| Agent type | Input extraction | Output mapping |
|---|---|---|
| LangGraph chat | Last user message from `messages[]` → `{"messages": [("user", content)]}` | `messages[-1].content` → `TextMessage` events + `RunFinished` |
| LangGraph structured | Last user message content parsed as JSON, validated against `input_schema` → typed input | Graph output → `Custom("structured_output")` + `RunFinished.result` |
| ADK chat | Last user message from `messages[]` → `Content(parts=[Part(text=...)])` | Text → `TextMessage` events + `RunFinished` |
| ADK structured | Last user message content parsed as JSON, validated against `input_schema` → JSON string | Response → `Custom("structured_output")` + `RunFinished.result` |

### AG-UI Conventions

- `RunStarted` carries `threadId` + `runId`
- `RunFinished.result` carries normalized output (structured data for structured agents)
- `Custom` event with `name: "structured_output"` emitted before `RunFinished` for structured output
- Standard AG-UI events (`TextMessage*`, `ToolCall*`, `Step*`) emitted during execution
- Errors → `RunError` with typed codes

### Batch Behavior

No separate batch endpoint. Client collects the full SSE stream and reads `RunFinished.result`.

## Engine: Adapter Changes

### Base Agent Protocol

Two new methods added to `BaseAgent`:

```python
class BaseAgent[ConfigType](ABC):
    # Existing
    async def initialize(self, ...) -> None
    async def invoke(self, message: Any) -> Any      # deprecated
    async def stream(self, message: Any) -> AsyncGenerator[Any]  # deprecated

    # New
    def discover_capabilities(self) -> AgentCapabilities
    async def run(self, input: RunAgentInput) -> AsyncGenerator[BaseEvent]
```

### Both Frameworks Delegate to AG-UI Wrappers

| Framework | Delegation |
|---|---|
| LangGraph | `LangGraphAGUIAgent.run(input)` → yields AG-UI events |
| ADK | `ADKAGUIAgent.run(input)` → yields AG-UI events |

The `run()` method on both adapters:

1. Inspect `RunAgentInput` — if structured mode, parse and validate last user message content against input schema
2. Delegate to the framework's AG-UI wrapper
3. Intercept output — if structured output schema exists, emit `Custom("structured_output", data)` before `RunFinished`

No custom event mapping code in either adapter. The AG-UI wrapper packages handle all framework → AG-UI translation.

## Engine: Config & Schema Changes

### Removals

- `LangGraphAgentConfig.input_schema_definition` — removed
- `LangGraphAgentConfig.output_schema_definition` — removed
- `ADKAgentConfig.input_schema_definition` — removed (if present)
- `resolve_input_model()` in `config_builder.py` — removed
- Dynamic route registration for `/agent/invoke` — removed
- Manual `astream_events` → AG-UI mapping in LangGraph adapter — removed

### App Factory Changes

- Register `GET /agent/capabilities` (static response from cached capabilities)
- Register `POST /agent/run` (canonical route)
- Register deprecated shim routes
- Remove dynamic input model logic

## Engine: Deprecated Route Shims

| Old route | Shim behavior |
|---|---|
| `POST /agent/invoke` | Build `RunAgentInput` from `ChatRequest`, call `run()`, collect stream, return `ChatResponse` |
| `POST /agent/stream` | Build `RunAgentInput` from `ChatRequest`, call `run()`, re-yield events as SSE |
| `POST /agent/copilotkit/stream` | Pass `RunAgentInput` through to `run()`, wrap with `EventEncoder` |

Each shim gets:
- `Deprecated: true` response header
- Deprecation notice in OpenAPI docs
- `# TODO: DEPRECATED — remove in vX.X` comment in code

## Engine: Error Handling

Errors within the stream are emitted as `RunError` AG-UI events:

| Error class | When |
|---|---|
| `VALIDATION_ERROR` | Structured input fails schema validation |
| `FRAMEWORK_ERROR` | Agent framework raises during execution |
| `INTERNAL_ERROR` | Unexpected engine failure |

Pre-stream errors (malformed request, auth failure) return standard HTTP status codes (400, 401, 403).

UI renders errors clearly:
- `VALIDATION_ERROR` → inline error below form/composer, highlighting failed fields
- `FRAMEWORK_ERROR` / `INTERNAL_ERROR` → error banner with expandable details

## Web UI: Interaction Surface Evolution

### Discovery-Driven Rendering

On tab mount, fetch `GET {agent.base_url}/agent/capabilities`. Response drives interaction mode.

```
capabilities.input.mode == "chat"       → render Chat composer
capabilities.input.mode == "structured" → render Form view
capabilities fetch fails                → fallback to Chat composer
```

### Chat Composer (existing, evolved)

- Uses `POST /agent/run` with `RunAgentInput`
- Messages accumulated in `messages[]`, sent with each request
- `threadId` managed as today (UUID, user-editable)
- Structured output: if response contains object data, render in collapsible structured viewer below assistant message

### Form View (new)

- Generated from `capabilities.input.schema` using existing `DynamicForm` component
- User fills fields, submits → serialized as JSON string in last user message of `RunAgentInput`
- Response displayed in structured output viewer
- Falls back to Monaco JSON editor if schema too complex for DynamicForm

### Structured Output Viewer (new component)

- Objects → formatted key-value pairs
- Arrays of flat objects → simple tables
- Complex nested → pretty-printed JSON
- Collapsible, inline within conversation or result area

### Events View (existing, unchanged)

- Current event inspector works identically with `/agent/run`
- Same AG-UI event protocol

### Tab Header

- View-mode indicator: `Chat` or `Form` (auto-detected)
- Manual toggle to override auto-detection
- Capabilities summary info bar

### API Client Changes

- New: `runAgent(agentUrl, input: RunAgentInput)` using `@ag-ui/client` `HttpAgent` at `/agent/run`
- Old `streamAgent` functions kept for deprecated routes
- cURL generator updated for `/agent/run` format

## What Gets Retired

### Removed Entirely

| Item | Location |
|---|---|
| `input_schema_definition` field | `LangGraphAgentConfig`, `ADKAgentConfig` |
| `output_schema_definition` field | `LangGraphAgentConfig` |
| `resolve_input_model()` | `config_builder.py` |
| `_custom_input_model`, `_input_state_key`, `_output_schema` properties | `langgraph.py` |
| Custom input model extraction logic | `langgraph.py` |
| Dynamic route registration for invoke | `app_factory.py` |
| Manual `astream_events` → AG-UI mapping | `langgraph.py` |

### Deprecated (shims with TODO comments)

| Item | Location |
|---|---|
| `POST /agent/invoke` | `agent.py` |
| `POST /agent/stream` | `agent.py` |
| `POST /agent/copilotkit/stream` | `agent.py` |
| `ChatRequest` / `ChatResponse` | `idun_agent_schema` |
| `invoke()` / `stream()` on `BaseAgent` | `base.py` |

### Not Affected

- `/agent/config`, `/agent/graph`, `/health`, `/reload`
- WhatsApp/Discord integration routes
- Checkpointer/store setup
- Observability callbacks
- MCP tool management

## Example Agents

### Test Fixtures (`libs/idun_agent_engine/tests/`)

| Fixture | Framework | Input | Output |
|---|---|---|---|
| `chat_agent_langgraph` | LangGraph | `MessagesState` | Text via messages |
| `structured_agent_langgraph` | LangGraph | `InputState(user_input: str)` | `OutputState(graph_output: str)` |
| `chat_agent_adk` | ADK | No `input_schema` | Text response |
| `structured_agent_adk` | ADK | Pydantic `input_schema` + `output_schema` | Pydantic model |

### Proper Examples (`examples/`)

Same four agents with README, YAML config, expected discovery response, and example curl commands.

## Test Coverage

| Test area | What to verify |
|---|---|
| Discovery | Each fixture returns correct `AgentCapabilities` |
| Run — chat | `RunAgentInput` → `TextMessage*` events → `RunFinished` |
| Run — structured | `RunAgentInput` with JSON → `Custom("structured_output")` → `RunFinished.result` |
| Validation | Invalid structured input → `RunError(VALIDATION_ERROR)` |
| Shims | Old routes work, return correct responses, include deprecation header |
| Schema generation | JSON Schema matches actual models |
