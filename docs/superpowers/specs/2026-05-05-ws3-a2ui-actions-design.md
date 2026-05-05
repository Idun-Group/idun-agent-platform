# WS3 — A2UI v0.9 Actions Round-Trip Design

**Date:** 2026-05-05
**Status:** Draft (pre-implementation-plan)
**Branch:** `explore/a2ui-langgraph`
**Predecessors:** WS1 (engine modernization) ✅, WS2 (A2UI surface emit) ✅

## 1. Goal

Close the A2UI loop. WS2 lets a LangGraph agent emit a v0.9 surface; the user can see and interact with form inputs (TextField, CheckBox, Slider, …) but clicks land nowhere. WS3 wires the user's actions back to the agent so the agent can read them, branch on them, and respond — typically with a follow-up surface.

The MVP target: any A2UI v0.9 catalog action (Button click, etc.) emitted from a surface in the standalone-UI round-trips to the LangGraph agent over the existing AG-UI `/agent/run` SSE channel, accompanied by a snapshot of the surface's dataModel for form-style flows. The agent reads the action via a typed Python helper and emits whatever follow-up it wants.

## 2. Non-goals

- A new HTTP endpoint. Actions ride `/agent/run` via `forwardedProps`.
- A synthetic user message in the chat history representing the click.
- Action queueing or stacking while a run is in flight.
- Agent-to-frontend "disable surface X" flags. Interactivity is computed on the frontend.
- A2UI v0.8 support. Idun is v0.9-only after WS2.
- Action error reports flowing back to the agent. Frontend logs them locally.
- Mintlify public-docs page for the action helper (engine-side `CLAUDE.md` is the source of truth for now, same as WS2).

## 3. Architecture and data flow

```text
Standalone-UI                                   Engine                       LangGraph
─────────────                                   ──────                       ─────────
<A2uiSurface surface={model}/>
  │  surface.onAction → MessageProcessor's
  │  global actionHandler fires
  │
  ▼
A2UISurfaceWrapper.handleAction(A2uiClientAction)
  ├─ guard: isInteractive?  (latest msg ∧ chat idle)
  ├─ dataModel = processor.getClientDataModel()
  └─ useChat.sendAction(action, dataModel)
       │
       ▼
runAgent({ threadId, runId, forwardedProps })
       │  POST /agent/run
       │  body: { messages: <history unchanged>,
       │          forwardedProps: { idun: { a2uiClientMessage, a2uiClientDataModel? } } }
       │
       ▼
                                          ag_ui_langgraph.LangGraphAgent.run()
                                            ├─ snake-case TOP-LEVEL keys of forwarded_props
                                            │   (nested keys preserved as-is — verified
                                            │    in agent.py:171-176)
                                            └─ stream_input = {**forwarded_props,
                                                               **payload_input}
                                                          │
                                                          ▼
                                                graph.astream_events(stream_input, ...)
                                                          │
                                                          ▼
                                                node(state, config):
                                                  ctx = read_a2ui_context(state)
                                                  if ctx is None:                # text-mode
                                                      ...
                                                  elif ctx.action.name == "submit_form":
                                                      form = ctx.data_for(
                                                          ctx.action.surface_id)
                                                      await emit_surface(...)
                                                  ...
       ▲
       │  SSE: standard AG-UI events + custom idun.a2ui.messages
       │
A2UISurfaceWrapper renders the new surface inside the new
  assistant message bubble; previous surfaces become uninteractive.
```

### Architectural calls

1. **One transport, one endpoint.** `/agent/run` carries both text turns and action turns. The frontend toggles whether `forwardedProps.idun.a2uiClientMessage` is set on a given POST.
2. **Action ingest reads from LangGraph state, not config.** Verified by code-reading `ag_ui_langgraph/agent.py:540`: `stream_input = {**forwarded_props, **payload_input}` is the dict passed to `astream_events(input=...)`, so top-level `forwarded_props` keys appear as top-level state keys.
3. **Agents that read A2UI actions MUST declare `idun: dict[str, Any]` in their State TypedDict.** Empirically verified during T7 implementation: `StateGraph(<TypedDict>)` filters out top-level keys not declared on the schema, even with `total=False`. So `forwarded_props.idun` arrives at the engine, gets spread into the initial input via `{**forwarded_props, **payload_input}`, but is then stripped by LangGraph before the first node runs — UNLESS `idun` is in the State. Side effect: declaring a second top-level field flips `LanggraphAgent.discover_capabilities()` to report `input.mode == "structured"`. Acceptable in practice — the AG-UI input-mode just signals "this agent accepts more than chat text"; for action-only turns (`messages: []`) the structured-input JSON-validator short-circuits cleanly. The smoke + LLM picker agents adopt `class State(TypedDict): messages: ...; idun: dict[str, Any] | None`.
4. **No checkpointer staleness.** The `idun` field is overwritten on each turn by the new `forwardedProps` (or unset on text-mode turns). Agents must NOT reduce-merge `idun` across turns; declare it as plain `dict[str, Any] | None` (no `add_*` reducer), so the latest turn's value wins.
5. **A2UI v0.9 native schemas are the source of truth.** Validation backed by `a2ui-agent-sdk==0.2.1`'s bundled JSON Schemas (`client_to_server.json`, `client_data_model.json`, `server_to_client.json`, `basic_catalog/component-catalog.json`). Pydantic models are typed mirrors only — they do not contain validation logic.

## 4. Locked decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Scope of MVP actions | Generic action passthrough — any catalog action — plus dataModel snapshot in the action POST. |
| Q2 | Chat-bubble representation of an action click | No synthetic user message; chat shows the existing transient streaming indicator only. |
| Q3 | Payload shape | A2UI v0.9 native — `A2uiClientAction` + `A2uiClientDataModel` carried in `forwardedProps.idun.a2uiClientMessage` and `forwardedProps.idun.a2uiClientDataModel`. |
| Q4 | Re-entrancy during a streaming run | Reject — actions inside surfaces are disabled while `chat.status !== "idle"`. |
| Q5 | Lifecycle of past surfaces | Only the latest assistant message's surfaces are interactive. Older surfaces render in history but their actions are disabled (CSS `pointer-events-none` + handler guard). |
| Q6 | Smoke-test agent demo | Combined — form echo (`submit_form`), branching menu (`option_a/b/c`), reset (`reset`) on the existing showcase. |
| Q7 | LLM example | Travel destination picker. Gemini Flash via `langchain-google-genai`. 2-node graph (`propose` / `acknowledge`). Folder `examples/a2ui-llm-picker/`. |
| — | Validation strategy | `a2ui-agent-sdk==0.2.1` pinned. **Inbound** validation in `read_a2ui_context` is Pydantic-with-`extra="forbid"` only — the SDK does not ship JSON Schemas for `client_to_server.json` or `client_data_model.json` (verified at install: only `server_to_client.json` + `common_types.json` + `basic_catalog.json` ship as wheel assets at `a2ui/assets/0.9/`). This matches the SDK's own design — `a2ui.schema.validator` only builds a server→client validator, treating client→server as Pydantic/Zod-validated. **Outbound** validation in `build_emit_envelope` / `build_update_envelope` uses the SDK's bundled `server_to_client.json` (mandatory, raises `ValueError` on malformed envelopes). |

## 5. Wire contract

### POST body — action turn

```jsonc
{
  "threadId": "…",
  "runId": "…",
  "messages": [/* unchanged history; no synthetic action message */],
  "forwardedProps": {
    "idun": {
      "a2uiClientMessage": {
        "version": "v0.9",
        "action": {
          "name": "submit_form",
          "surfaceId": "a2ui_showcase",
          "sourceComponentId": "btn_demo",
          "timestamp": "2026-05-05T10:42:13.412Z",
          "context": {/* renderer-supplied; may be empty {} */}
        }
      },
      "a2uiClientDataModel": {
        "version": "v0.9",
        "surfaces": {"a2ui_showcase": {/* per-surface dataModel */}}
      }
    }
  }
}
```

`a2uiClientMessage` matches `https://a2ui.org/specification/v0_9/json/client_to_server.json#/properties/action` exactly. `a2uiClientDataModel` matches `client_data_model.json`. Optional — omitted when no surface has `sendDataModel: true`.

### Server-side typed view

```python
from idun_agent_engine.a2ui import read_a2ui_context, A2UIContext

ctx: A2UIContext | None = read_a2ui_context(state)
ctx.action.name                    # str  — e.g., "submit_form"
ctx.action.surface_id              # str
ctx.action.source_component_id     # str  — Pydantic alias from "sourceComponentId"
ctx.action.timestamp               # str  — ISO-8601, kept as string per A2UI spec
ctx.action.context                 # dict[str, Any]
ctx.data_for(ctx.action.surface_id)  # dict | None — surface's dataModel, or None
```

## 6. Engine SDK

### 6.1 New module — `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`

```python
"""A2UI v0.9 client→server action ingest.

Validation backed by a2ui-agent-sdk's bundled JSON Schemas (Apache 2.0).
Pydantic mirrors are typed views only — they do not duplicate validation logic.
"""

from __future__ import annotations
from importlib.resources import files
from functools import cache
import json, logging
from typing import Any, Literal, Mapping
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from a2ui.schema.constants import VERSION_0_9  # noqa: F401  — version pin documentation

log = logging.getLogger(__name__)

# Note: a2ui-agent-sdk 0.2.1 does NOT ship JSON Schemas for client_to_server.json
# or client_data_model.json — only server_to_client.json + common_types.json +
# basic_catalog.json (at a2ui/assets/0.9/). This matches the SDK's own design:
# inbound (client→server) is Pydantic/Zod-validated, outbound (server→client) is
# JSON-Schema-validated. We follow the same stance:
#   - Inbound (this module): Pydantic with extra="forbid" is the validation.
#   - Outbound (envelope.py via _server_to_client_validator below): JSON Schema.


class A2UIClientAction(BaseModel):
    """Mirrors specification/v0_9/json/client_to_server.json#/properties/action."""
    name: str
    surface_id: str          = Field(alias="surfaceId")
    source_component_id: str = Field(alias="sourceComponentId")
    timestamp: str
    context: dict[str, Any]
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class A2UIClientMessage(BaseModel):
    version: Literal["v0.9"]
    action: A2UIClientAction
    model_config = ConfigDict(extra="forbid")


class A2UIClientDataModel(BaseModel):
    version: Literal["v0.9"]
    surfaces: dict[str, dict[str, Any]]
    model_config = ConfigDict(extra="forbid")


class A2UIContext(BaseModel):
    action: A2UIClientAction
    data_model: A2UIClientDataModel | None = None

    def data_for(self, surface_id: str) -> dict[str, Any] | None:
        if self.data_model is None:
            return None
        return self.data_model.surfaces.get(surface_id)


def read_a2ui_context(state: Mapping[str, Any]) -> A2UIContext | None:
    """Read + Pydantic-validate + box the A2UI action+dataModel from state.

    Validation is mandatory and Pydantic-backed (the SDK does not ship JSON
    Schemas for client→server messages, matching its own design). Pydantic
    models use extra="forbid" so malformed payloads fail loudly. Soft-fails
    to None on missing or malformed payload (logs WARNING). Text-mode turns
    (no idun.a2uiClientMessage) return None silently.
    """
    idun = state.get("idun") if state else None
    if not isinstance(idun, Mapping):
        return None
    raw_msg = idun.get("a2uiClientMessage")
    raw_dm  = idun.get("a2uiClientDataModel")
    if raw_msg is None:
        return None

    try:
        msg = A2UIClientMessage.model_validate(raw_msg)
        dm  = A2UIClientDataModel.model_validate(raw_dm) if raw_dm else None
    except ValidationError as e:
        log.warning("a2ui payload failed validation: %s", e)
        return None
    return A2UIContext(action=msg.action, data_model=dm)
```

### 6.2 Public API delta

Added to `idun_agent_engine.a2ui.__init__.__all__`:

```python
"A2UIClientAction",
"A2UIClientDataModel",
"A2UIClientMessage",
"A2UIContext",
"read_a2ui_context",
```

### 6.3 WS2 envelope retrofit

`libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py` is updated to:

1. Validate the produced envelope against `server_to_client.json` before returning. The validator wires `common_types.json` via `referencing.Registry` (or `RefResolver` on older `jsonschema`), matching the pattern `a2ui.schema.validator` uses internally. On validation error, raise `ValueError` with the JSON-Schema error path (e.g., `/messages/0/createSurface/components/2/component`). Mandatory — no opt-in flag. Schemas load from `a2ui/assets/0.9/` (the SDK's actual bundled-asset path, verified at install).
2. Validate each entry in `components: [...]` against the Basic Catalog component schema (`a2ui/assets/0.9/basic_catalog.json`). Catches typos like `{"compoonent": "Button"}` at agent side instead of silent placeholder rendering.
3. Default `sendDataModel: True` on `createSurface`. New `send_data_model: bool = True` kwarg on `build_emit_envelope` and `emit_surface` to override.

`BASIC_CATALOG_V09` stays as the canonical URL string `"https://a2ui.org/specification/v0_9/basic_catalog.json"` — that URL is A2UI's stable public catalog identifier, and the wire field is the URL itself. We do not re-export an `a2ui.basic_catalog` constant because doing so would couple Idun's public API to that package's internal naming.

### 6.4 Dependency

`libs/idun_agent_engine/pyproject.toml`:

```toml
"a2ui-agent-sdk==0.2.1",   # bundled JSON Schemas + validators + Basic Catalog (Apache 2.0)
```

Pinned. Bumped deliberately when A2UI ships v0.10. Transitive deps: `a2a-sdk` (medium-weight, new), `google-adk` (already an Idun dep), `google-genai` (already in if Gemini support is desired), `jsonschema` (already a transitive via guardrails).

A new optional extra:

```toml
[project.optional-dependencies]
examples = [
    "langchain-google-genai>=2.0.0",
]
```

Used only by the LLM travel-picker example. Default install does not include it.

## 7. Frontend wiring

### 7.1 `A2UISurfaceWrapper` — actionHandler + interactivity

`MessageProcessor` accepts a global `actionHandler` at construction. The wrapper passes a closure that delegates to a ref so the latest `sendAction` and `isInteractive` values flow through without recreating the processor:

```tsx
const handlerRef = useRef<(a: A2uiClientAction) => void>(() => {});
handlerRef.current = (action) => {
  if (!isInteractive) return;
  sendAction(action, processor.getClientDataModel());
};
const processor = useMemo(
  () => new MessageProcessor<ReactComponentImplementation>(
    [basicCatalog],
    (a) => handlerRef.current(a),
  ),
  [],
);
```

Two enforcement layers for `isInteractive`:

- CSS — `pointer-events-none opacity-60` on the surface root when `!isInteractive`.
- Handler guard — `handlerRef.current` no-ops when `!isInteractive`.

`isInteractive` is computed by the parent `MessageView` as `isLatestAssistant && chatStatus === "idle"`.

### 7.2 `useChat.sendAction`

```ts
async function sendAction(
  action: A2uiClientAction,
  dataModel: A2uiClientDataModel | undefined,
): Promise<void> {
  if (status !== "idle") return;
  setStatus("streaming");
  setError(null);
  abortRef.current = new AbortController();

  // No new user-message bubble (Q2). Empty assistant placeholder for streaming.
  const assistantMsg = newAssistantPlaceholder();
  setMessages(prev => [...prev, assistantMsg]);

  const forwardedProps: IdunForwardedProps = {
    idun: {
      a2uiClientMessage: { version: "v0.9", action },
      ...(dataModel ? { a2uiClientDataModel: dataModel } : {}),
    },
  };

  await runAgent({
    threadId, runId: newRunId(),
    forwardedProps,
    signal: abortRef.current.signal,
    onEvent: (e) => applyEvent(...),
  });
}
```

### 7.3 `runAgent` signature

```ts
async function runAgent(opts: {
  threadId: string;
  runId: string;
  signal: AbortSignal;
  onEvent: (e: ChatEvent) => void;
  message?: string;                          // text turn
  forwardedProps?: Record<string, unknown>;  // action turn
}): Promise<void>;
```

Both modes hit `/agent/run`. `messages` is appended only when `message` is set; `forwardedProps` is forwarded as-is when present.

### 7.4 `MessageView` — thread interactivity

```tsx
const isLatestAssistant =
  message.role === "assistant" && message.id === latestAssistantMessageId;
{message.a2uiSurfaces?.map(surface => (
  <A2UISurfaceErrorBoundary key={surface.surfaceId}>
    <A2UISurfaceWrapper
      surface={surface}
      isInteractive={isLatestAssistant && chatStatus === "idle"}
    />
  </A2UISurfaceErrorBoundary>
))}
```

`latestAssistantMessageId` derived once at the chat-pane level via `messages.findLast(m => m.role === "assistant")?.id`.

### 7.5 New types in `lib/agui.ts`

```ts
import type { A2uiClientAction, A2uiClientDataModel } from "@a2ui/web_core/v0_9";

export type IdunForwardedProps = {
  idun: {
    a2uiClientMessage: { version: "v0.9"; action: A2uiClientAction };
    a2uiClientDataModel?: A2uiClientDataModel;
  };
};
```

Action and data-model types are imported from `@a2ui/web_core/v0_9` directly — Idun does not redefine them.

## 8. Smoke-test agent extension

`examples/a2ui-smoke/agent.py` extends the existing showcase with three action flavors:

1. **Form echo** — the existing demo Button gains `action.event.name = "submit_form"`. On click, `acknowledge` reads `ctx.data_for(surface_id)` and emits a `submit_confirmation` Card listing the values, plus a Reset button (`name = "reset"`).
2. **Branching menu** — three new Buttons (Option A/B/C) with `name = "option_a"`, `option_b`, `option_c`. On click, `acknowledge` emits a small `branch_<name>` Card naming the action and the source component.
3. **Reset** — re-emits the original showcase via the same `_COMPONENTS` list and seed `data`.

A new `acknowledge` async node branches on `ctx.action.name`; a conditional entry point routes between `respond` (no action → showcase) and `acknowledge` (action → branch handler):

```python
def _route_entry(state):
    idun = state.get("idun") if isinstance(state, dict) else None
    has_action = isinstance(idun, dict) and "a2uiClientMessage" in idun
    return "acknowledge" if has_action else "respond"

builder.set_conditional_entry_point(_route_entry, {
    "respond": "respond",
    "acknowledge": "acknowledge",
})
```

The `State` TypedDict is unchanged (only `messages`); `idun` flows through as an extra dict key per Section 3 architecture.

## 9. LLM travel-picker example

New folder `examples/a2ui-llm-picker/` with:

- `agent.py` — 2-node LangGraph (`propose` / `acknowledge`) with conditional entry.
- `config.yaml` — engine config, port 8002, in-memory checkpointer.
- `README.md` — prerequisites (`GEMINI_API_KEY`, `uv sync --extra examples`), run instructions, customization notes.
- `tests/` — schema-shape unit, routing unit, acknowledge with patched LLM.

### 9.1 Structured-output proposal

```python
class TravelOption(BaseModel):
    id: str       = Field(description="Short slug, e.g. 'bali'")
    name: str     = Field(description="Display name with country, e.g. 'Bali, Indonesia'")
    tagline: str  = Field(description="One-line pitch — 8 to 16 words, no clichés")

class TravelProposal(BaseModel):
    intro: str
    options: list[TravelOption] = Field(min_length=3, max_length=3)
```

`_llm().with_structured_output(TravelProposal).ainvoke([...])` returns a typed instance — no JSON parsing on Idun's side.

### 9.2 Action routing

- No `idun` in state → `propose` (initial / `ask_again` retry).
- `action.name == "ask_again"` → `propose` (re-suggest based on the latest user message).
- `action.name == "pick_destination"` → `acknowledge`.
- Anything else → `acknowledge` (fall-through; the node logs and degrades gracefully).

The chosen destination travels in `action.event.context.destination` as the full `TravelOption.model_dump()` so the `acknowledge` node has all info without consulting state. `acknowledge` calls the LLM again for a 2-paragraph pitch and emits a follow-up surface that includes an "Ask another question" Button (`name = "ask_again"`).

### 9.3 Model + env

- Default model id: `gemini-3-flash-preview`. Override via `GEMINI_MODEL` env var.
- API key: read `GEMINI_API_KEY` first, fall back to `GOOGLE_API_KEY`. Raise a clear error if neither is set.

## 10. Tests

### 10.1 Engine

- **Unit `test_actions.py`** (~9 tests): camelCase ⇄ snake_case round-trip, `extra="forbid"`, schema/Pydantic agreement, text-mode None, malformed soft-fail, dataModel optional, validator caching.
- **Unit `test_envelope_validation.py`** (~5 tests): happy-path validates, typo component rejected, unknown component type rejected, `update_components` validated, `sendDataModel` default propagation.
- **Integration `test_a2ui_action_passthrough.py`** (~5 tests): typed action lands at node, dataModel landed, text-mode falls through, malformed action does not 500, nested camelCase preserved through ag-ui-langgraph.
- **Integration `test_a2ui_smoke_actions.py`**: drives the smoke agent's `submit_form` / `reset` / `option_a` flows.
- **Schema regression gate**: `test_a2ui_client_action_pydantic_matches_jsonschema` cross-checks the Pydantic model against the bundled JSON Schema; the test is the contract that prevents drift on future A2UI bumps.

### 10.2 Frontend

- `__tests__/use-chat.send-action.test.ts` — POST body shape, no synthetic user bubble, `status` lifecycle, abort cleanup, `status !== "idle"` early-return.
- `__tests__/a2ui-surface-wrapper.action.test.tsx` — `actionHandler` invokes `sendAction` with action + data model; `isInteractive=false` blocks the call and applies `pointer-events-none`.
- `__tests__/agui.run-agent.test.ts` — `runAgent` body shape with `forwardedProps` vs `message`.
- `__tests__/a2ui-surface-wrapper.test.tsx` — extend with one `pointer-events-none` test; existing 7 tests stay green.

### 10.3 LLM example

- `tests/test_proposal_surface.py` — pure helper; component graph validates against Basic Catalog schema; 3 buttons with correct `pick_destination` payload.
- `tests/test_routing.py` — all four `_route_entry` branches.
- `tests/test_acknowledge_with_fake_llm.py` — patches `_llm()`; asserts surface contains destination name + 2 paragraphs.
- Real Gemini calls are NEVER required in CI. Manual smoke before release.

### 10.4 CI implications

| Change | Impact |
|---|---|
| `+a2ui-agent-sdk==0.2.1` engine dep | One-time `uv sync` cache invalidation. No system deps. |
| `+langchain-google-genai>=2.0.0` as `[examples]` extra | Default `make test` skips it. New `make test-examples` target installs the extra. |
| New schema-fixture files (~2 KB total) | Negligible. |
| `GEMINI_API_KEY` | NEVER required in CI. README documents for local manual demo only. |
| Lint / mypy / pre-commit | Standard. No exemptions. |

## 11. File layout

```
libs/idun_agent_engine/
├── pyproject.toml                                       # MOD: +a2ui-agent-sdk==0.2.1; +[examples] extra
└── src/idun_agent_engine/a2ui/
    ├── __init__.py                                      # MOD: re-export new public API
    ├── envelope.py                                      # MOD: mandatory schema validation, sendDataModel default
    ├── helpers.py                                       # MOD: emit_surface forwards send_data_model kwarg
    └── actions.py                                       # NEW

libs/idun_agent_engine/tests/
├── unit/a2ui/
│   ├── fixtures/                                        # NEW: valid_action.json, valid_data_model.json, …
│   ├── test_actions.py                                  # NEW
│   └── test_envelope_validation.py                      # NEW
└── integration/
    ├── test_a2ui_action_passthrough.py                  # NEW
    └── test_a2ui_smoke_actions.py                       # NEW

services/idun_agent_standalone_ui/
├── lib/
│   ├── agui.ts                                          # MOD: IdunForwardedProps, A2uiClientAction re-export
│   ├── use-chat.ts                                      # MOD: +sendAction, +useChatActions hook
│   └── agui.ts                                          # MOD: runAgent gains forwardedProps option
├── components/chat/
│   ├── MessageView.tsx                                  # MOD: thread isInteractive prop
│   └── a2ui/A2UISurfaceWrapper.tsx                      # MOD: +actionHandler, +isInteractive
└── __tests__/
    ├── use-chat.send-action.test.ts                     # NEW
    ├── a2ui-surface-wrapper.action.test.tsx             # NEW
    ├── agui.run-agent.test.ts                           # NEW
    └── a2ui-surface-wrapper.test.tsx                    # MOD: +1 pointer-events test

examples/
├── a2ui-smoke/
│   ├── agent.py                                         # MOD: +acknowledge node, conditional entry, branching
│   └── README.md                                        # MOD: actions section
└── a2ui-llm-picker/                                     # NEW
    ├── agent.py
    ├── config.yaml
    ├── README.md
    └── tests/
        ├── test_proposal_surface.py
        ├── test_routing.py
        └── test_acknowledge_with_fake_llm.py

libs/idun_agent_engine/CLAUDE.md                         # MOD: +read_a2ui_context, +action ingest path
services/idun_agent_standalone_ui/CLAUDE.md              # MOD: +sendAction, +interactivity rules
```

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pydantic-only inbound validation drifts vs. a future A2UI client→server JSON Schema if the SDK ever publishes one | Low | Verified at install time that `a2ui-agent-sdk==0.2.1` only bundles `server_to_client.json` + `common_types.json` + `basic_catalog.json` (at `a2ui/assets/0.9/`). The SDK itself uses Pydantic/Zod for client→server, not JSON Schema. If a future SDK release adds the missing schema files, layer JSON-Schema validation in `read_a2ui_context` alongside the Pydantic mirror. Until then, Pydantic with `extra="forbid"` is the strongest validation available and matches the SDK's stance. |
| Gemini model id wrong or unavailable | Medium | `GEMINI_MODEL` env override; first-call exception surfaces a clear message naming the env var. |
| `with_structured_output` returns inconsistent shapes across Gemini versions | Low | Pydantic `min_length=3, max_length=3` raises a clear `ValidationError`; example degrades to a text fallback. |
| Old WS2 surfaces with no `sendDataModel` send no dataModel | Low | Engine default flips to `True`; agents handle `data_for() is None` gracefully. |
| Pydantic + JSON Schema drift on a future A2UI bump | Medium | The `test_a2ui_client_action_pydantic_matches_jsonschema` regression test is the gate. v0.10 upgrade story: fix Pydantic, refresh fixtures, bump SDK pin. |
| `processor.getClientDataModel()` returns nested format the engine doesn't expect | Low | Validate against `client_data_model.json` schema (`_client_data_model_validator`); soft-fail to None on malformed. |

## 13. Open follow-ups (post-merge)

- Public Mintlify docs page covering `read_a2ui_context` and the action wire shape.
- Additional Pydantic models for `A2uiClientMessage`'s error variant if/when error-back becomes a feature.
- Optional Playwright pass that drives a real browser action through to a real engine (not in scope for WS3 because it depends on a stable browser test harness).
- Catalog-aware action context typing — today `context: dict[str, Any]`. Per-component-action typing would require pulling in the catalog schema generator from `a2ui-agent-sdk`; deferred.
