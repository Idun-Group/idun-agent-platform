# A2UI for Idun LangGraph MVP findings

Date: 2026-04-30

## Executive summary

The recommended MVP is to keep AG-UI as Idun's runtime transport, keep the
AG-UI LangGraph adapter for LangGraph event translation, and add a thin
Idun-owned A2UI convention over AG-UI `CUSTOM` events.

The target architecture is:

```text
LangGraph graph
  -> ag-ui-langgraph adapter
  -> /agent/run AG-UI SSE stream
  -> Idun standalone UI AG-UI client
  -> A2UI message processor and renderer
```

This avoids reimplementing the complex LangGraph-to-AG-UI mapping while also
avoiding a dependency on CopilotKit's A2UI runtime, provider, or tool injection
model.

The main change from the earlier rough idea is important: Idun should not
rewrite AG-UI LangGraph streaming logic. It should keep using the AG-UI Python
libraries for LangGraph, and only own the A2UI payload contract and frontend
rendering behavior.

## Sources reviewed

- [A2UI homepage](https://a2ui.org/)
- [A2UI over MCP](https://a2ui.org/guides/a2ui_over_mcp/)
- [A2UI with any agent framework through AG-UI](https://a2ui.org/guides/a2ui-with-any-agent-framework/)
- [A2UI protocol v0.9](https://a2ui.org/specification/v0.9-a2ui/)
- [A2UI GitHub repository](https://github.com/google/A2UI)
- [AG-UI overview](https://docs.ag-ui.com/introduction)
- [AG-UI events](https://docs.ag-ui.com/concepts/events)
- [AG-UI and generative UI specs](https://docs.ag-ui.com/concepts/generative-ui-specs)
- [AG-UI Python event SDK](https://docs.ag-ui.com/sdk/python/core/events)
- [AG-UI GitHub repository](https://github.com/ag-ui-protocol/ag-ui)
- [ag-ui-langgraph on PyPI](https://pypi.org/project/ag-ui-langgraph/)
- Local Idun files:
  - `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`
  - `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`
  - `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py`
  - `services/idun_agent_standalone_ui/lib/agui.ts`
  - `services/idun_agent_standalone_ui/lib/use-chat.ts`

## Terminology

AG-UI and A2UI solve different layers of the problem.

AG-UI is the agent-user interaction protocol. It carries runs, messages, tool
calls, state snapshots, interrupts, custom events, and other event types between
an agent backend and a user-facing frontend.

A2UI is a declarative generative UI specification. It describes UI surfaces,
components, data models, bindings, and actions as JSON messages. It is not
itself the full agent runtime transport.

The clean mental model is:

```text
AG-UI = runtime/event transport
A2UI = declarative UI payload format
```

AG-UI documentation explicitly positions A2UI as a generative UI spec that can
be carried by AG-UI. A2UI documentation also describes AG-UI as a valid
transport for A2UI messages.

## Current Idun state

Idun already has most of the runtime shape needed for an MVP:

- `POST /agent/run` is the canonical AG-UI endpoint.
- The endpoint accepts `RunAgentInput` and streams AG-UI events over SSE using
  `ag_ui.encoder.EventEncoder`.
- The standalone UI has a small custom AG-UI SSE client in `lib/agui.ts`.
- The chat hook in `lib/use-chat.ts` already handles text, tool, reasoning,
  state, message snapshot, step, and run lifecycle events.
- The current frontend intentionally avoids shipping the full AG-UI client
  package.
- The engine currently depends on AG-UI packages, including `ag-ui-protocol`,
  `ag-ui-langgraph`, `ag-ui-adk`, and `copilotkit`.

The LangGraph adapter currently creates `copilotkit.LangGraphAGUIAgent` and
delegates canonical `run()` to it. On inspection, that CopilotKit class
subclasses `ag_ui_langgraph.agent.LangGraphAgent`, so the actual hard
LangGraph-to-AG-UI translation is coming from the lower-level
`ag-ui-langgraph` adapter.

This matters because Idun can keep using the lower-level AG-UI LangGraph
adapter without taking on CopilotKit's A2UI integration model.

## Important local finding

`ag-ui-langgraph` already supports LangGraph custom events.

In the installed adapter, `LangGraphAgent._handle_single_event()` handles
LangGraph `on_custom_event` and emits an AG-UI `CustomEvent`:

```text
LangGraph on_custom_event
  -> ag_ui.core.CustomEvent(type=CUSTOM, name=event["name"], value=event["data"])
```

The AG-UI event docs define `CUSTOM` as the extension mechanism for
application-specific events:

```json
{
  "type": "CUSTOM",
  "name": "some.application.event",
  "value": {}
}
```

That makes `CUSTOM` the right MVP channel for A2UI envelopes.

## Recommended MVP architecture

### Backend

Do not create a new A2UI transport for the MVP. Keep `/agent/run` as the only
runtime stream.

Add an Idun convention:

```json
{
  "type": "CUSTOM",
  "name": "idun.a2ui.messages",
  "value": {
    "a2uiVersion": "v0.9",
    "surfaceId": "example_surface",
    "messages": [
      {
        "version": "v0.9",
        "createSurface": {
          "surfaceId": "example_surface",
          "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json"
        }
      },
      {
        "version": "v0.9",
        "updateComponents": {
          "surfaceId": "example_surface",
          "components": []
        }
      }
    ]
  }
}
```

A LangGraph node can emit this through LangGraph custom events. The exact
LangGraph API should be verified against the installed LangGraph version, but
the likely pattern is `adispatch_custom_event(...)` from LangChain/LangGraph
callback utilities.

Conceptually:

```python
await adispatch_custom_event(
    "idun.a2ui.messages",
    {
        "a2uiVersion": "v0.9",
        "surfaceId": "search_results",
        "messages": [
            {
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": "search_results",
                    "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
                },
            },
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": "search_results",
                    "components": [
                        {"id": "root", "component": "Text", "text": "Hello from A2UI"}
                    ],
                },
            },
        ],
    },
)
```

The agent should still emit normal text as a fallback. A2UI's MCP guide makes
the same recommendation: include a text summary alongside the rich UI so
clients without A2UI support still have a useful answer.

### Frontend

Extend the standalone UI, not CopilotKit.

The standalone UI should:

- Install `@a2ui/react` and `@a2ui/web_core`.
- Add an A2UI renderer component near the chat message renderer.
- Extend the local `Message` type with A2UI surfaces or A2UI message batches.
- Update `applyEvent()` in `lib/use-chat.ts` to catch:
  - `type === "CUSTOM"`
  - `name === "idun.a2ui.messages"`
- Feed `value.messages` into the A2UI message processor.
- Render the requested surface inside the assistant bubble.

The first frontend pass can support only the A2UI basic catalog. Custom Idun
catalogs can come later.

### Action handling

A2UI actions need a client-to-agent return path.

For MVP, use `/agent/run` again. When a user clicks an A2UI button or submits
an A2UI form, the frontend sends another `RunAgentInput` containing an
A2UI-specific action payload.

Recommended shape:

```json
{
  "threadId": "existing-thread",
  "runId": "new-run-id",
  "messages": [
    {
      "id": "new-run-id-u",
      "role": "user",
      "content": "A2UI action: submit_form"
    }
  ],
  "state": {},
  "tools": [],
  "context": [],
  "forwardedProps": {
    "idun": {
      "a2uiAction": {
        "surfaceId": "contact_form",
        "name": "submit_form",
        "context": {
          "email": "jane@example.com"
        },
        "dataModel": {
          "contact": {
            "email": "jane@example.com"
          }
        }
      }
    }
  }
}
```

This has two advantages:

- It keeps A2UI actions inside the existing AG-UI runtime.
- `ag-ui-langgraph` already merges `forwardedProps` into the stream input, so
  LangGraph nodes can route on the action without a new route.

This should be verified with a small test graph because `ag-ui-langgraph`
normalizes `forwarded_props` keys from camelCase to snake_case.

## Why not depend on CopilotKit for A2UI?

CopilotKit's A2UI path is optimized for CopilotKit applications:

- Backend: configure `CopilotRuntime` with `a2ui: { injectA2UITool: true }`.
- Frontend: use `CopilotKitProvider` with A2UI renderer settings.
- Custom components: register a CopilotKit A2UI catalog.

That is not the right ownership boundary for Idun standalone because:

- Idun already has its own FastAPI runtime and `/agent/run` endpoint.
- Idun already has its own static Next.js standalone UI.
- Idun wants a small, controlled frontend bundle.
- Idun should own the supported A2UI catalog and action behavior.
- Idun should keep working for non-CopilotKit clients.

The useful part to keep is the protocol stack: AG-UI as transport, A2UI as
declarative UI payload. The part to avoid is CopilotKit-specific runtime and UI
provider coupling.

## Dependency strategy

### Keep

Keep using AG-UI protocol packages:

- `ag-ui-protocol`
- `ag-ui-encoder`
- `ag-ui-langgraph`

These handle the shared protocol models, event encoding, and LangGraph event
translation.

### Prefer

Prefer instantiating `ag_ui_langgraph.LangGraphAgent` directly instead of
`copilotkit.LangGraphAGUIAgent` once it is verified against Idun's existing
tests. Because `copilotkit.LangGraphAGUIAgent` subclasses
`ag_ui_langgraph.agent.LangGraphAgent`, this should be a low-risk simplification
if the constructor and behavior remain compatible.

### Avoid For A2UI MVP

Avoid depending on:

- `@copilotkit/react-core`
- `@copilotkit/a2ui-renderer`
- `CopilotRuntime` A2UI tool injection
- CopilotKit provider-level catalog registration

### Investigate

Current `idun_agent_engine` pins `ag-ui-langgraph==0.0.25`, while PyPI shows
`0.0.35` as the latest version released on 2026-04-29. Before implementation,
compare the installed version with the latest release:

- Does `on_custom_event` behavior remain compatible?
- Did event names or fields change?
- Are `THINKING_*` events replaced by `REASONING_*` events in newer versions?
- Does the current Idun monkey patch in `server/patches.py` still apply?
- Can patches be removed after upgrading?

## MVP scope

### MVP 1: render A2UI from LangGraph custom events

Goal: prove an Idun LangGraph agent can render a simple A2UI surface in the
standalone chat.

Backend:

- Add an example LangGraph node that emits `idun.a2ui.messages`.
- Use A2UI `v0.9`.
- Use the basic catalog only.
- Emit text fallback before or after the A2UI event.
- Do not add new config schema yet unless needed.

Frontend:

- Install A2UI React packages.
- Add minimal A2UI surface renderer.
- Catch `CUSTOM idun.a2ui.messages`.
- Render a single surface in an assistant message.
- Ignore actions initially or log them.

Tests:

- Backend unit test: custom event passes through `/agent/run`.
- Frontend unit test: `CUSTOM idun.a2ui.messages` updates message state.
- E2E smoke test: prompt renders both fallback text and A2UI component.

### MVP 2: A2UI actions back to LangGraph

Goal: user interaction in A2UI can trigger a follow-up LangGraph run.

Backend:

- Define how `forwardedProps.idun.a2uiAction` is exposed to graph state.
- Add a test graph that branches on action name.
- Return a confirmation A2UI surface or normal text.

Frontend:

- Wire A2UI renderer action handler.
- Resolve action context and data model.
- Send follow-up `/agent/run`.
- Preserve thread ID.

Tests:

- Clicking an A2UI button sends a run with action metadata.
- Graph receives the action metadata.
- UI updates after the action.

### MVP 3: validation and catalog discipline

Goal: reduce risk from malformed or unsafe model-generated UI.

Backend:

- Add optional validation using `a2ui-agent-sdk` or JSON schemas from A2UI.
- Decide whether validation happens in engine, graph helper, or standalone UI.
- Add an Idun helper to generate a prompt section describing supported A2UI.

Frontend:

- Handle renderer errors and show fallback text.
- Report render errors back to agent through a structured action or custom
  `forwardedProps` payload.

Tests:

- Invalid A2UI payload does not break the chat stream.
- Renderer error path shows fallback UI.
- Validation failure can be surfaced as an AG-UI `RUN_ERROR` or non-fatal
  warning event.

## Suggested event contract

Use one custom event name for the MVP:

```text
idun.a2ui.messages
```

Payload:

```ts
type IdunA2UIEvent = {
  a2uiVersion: "v0.9";
  surfaceId: string;
  messages: A2UIMessage[];
  fallbackText?: string;
  metadata?: {
    source?: "agent" | "tool" | "mcp";
    catalogIds?: string[];
  };
};
```

Rules:

- `messages` must be an ordered list of A2UI envelope messages.
- The first message for a new surface should be `createSurface`.
- The target surface should have a `root` component before it is expected to
  render visibly.
- `surfaceId` should be stable within a thread.
- The assistant message should keep fallback text even if rendering fails.
- Unknown custom event names should continue to be ignored by the chat reducer.

## MCP and A2UI later

A2UI over MCP uses embedded resources:

- URI prefix: `a2ui://...`
- MIME type: `application/json+a2ui`
- Tool response contains text fallback plus embedded A2UI resource.

This is not necessary for MVP 1, but it is a natural follow-up because Idun
already supports MCP tools in the engine.

Future bridge:

```text
MCP tool response
  -> detect EmbeddedResource mimeType application/json+a2ui
  -> extract text fallback and A2UI JSON
  -> emit idun.a2ui.messages custom event
  -> standalone UI renders A2UI
```

Questions to answer before building this:

- Does `langchain-mcp-adapters` preserve MCP embedded resources, or does it
  flatten them into text/tool messages?
- Can tool results be inspected before `ag-ui-langgraph` normalizes them?
- Should A2UI MCP resources be shown as tool output, assistant content, or both?
- Should raw A2UI JSON be hidden from the LLM context, following A2UI resource
  annotation guidance?

## Open questions to dig into

### AG-UI LangGraph

- What is the exact API for emitting custom events from LangGraph nodes in the
  LangGraph version Idun uses?
- Does `ag-ui-langgraph==0.0.35` improve custom event handling or action/state
  handling compared with the pinned `0.0.25`?
- Can Idun remove `copilotkit.LangGraphAGUIAgent` and instantiate
  `ag_ui_langgraph.LangGraphAgent` directly without changing behavior?
- Are Idun's current monkey patches still needed on the latest
  `ag-ui-langgraph`?
- Does the adapter yield Pydantic event objects or strings in all versions?
  Locally, type hints say strings in `ag-ui-langgraph`, but Idun's route treats
  yielded values as events for `EventEncoder`. Existing tests should lock this
  down before upgrading.

### A2UI renderer

- What is the exact React API for `@a2ui/react` v0.9?
- Does the React renderer expose one processor per chat thread, per assistant
  message, or per surface?
- How should multiple A2UI surfaces inside one conversation be managed?
- Does the renderer handle incremental `updateComponents` cleanly when messages
  arrive through AG-UI `CUSTOM` events?
- What is the smallest Basic Catalog setup that works in the standalone UI?

### A2UI protocol version

- Should MVP use v0.8 stable or v0.9 draft?
- v0.9 appears better aligned with a new implementation because it has explicit
  `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface`.
- v0.8 is more stable, so it may be safer if the MVP is intended for near-term
  production use.
- If v0.9 is selected, keep it behind an `experimental` flag and include the
  version in all event payloads.

### Validation

- Should Idun depend on `a2ui-agent-sdk` in the Python engine?
- Should validation live in the graph helper, engine route, or frontend?
- How strict should MVP validation be?
- Should invalid A2UI be a failed run, a warning, or silently ignored with text
  fallback?
- How do custom catalogs get validated without pulling frontend code into the
  Python runtime?

### UX

- Should A2UI render inline in the assistant message, as a separate card below
  the message, or in a side panel?
- How should the inspector layout show raw A2UI messages?
- Should users be able to collapse rich UI and inspect fallback text?
- How should streaming text and streaming A2UI coexist in the same assistant
  bubble?

### Security

- A2UI is declarative and safer than generated code, but the client still needs
  a strict catalog allowlist.
- MVP should not support arbitrary iframe/html components.
- External URLs in image/video/link components need policy decisions.
- Server actions should be namespaced and validated.
- Client-side local functions should be explicitly registered, not dynamically
  executed from payloads.

## Proposed implementation order

1. Add one test-only LangGraph fixture that emits `idun.a2ui.messages`.
2. Verify `/agent/run` streams the custom event through the current
   `copilotkit.LangGraphAGUIAgent` path.
3. Add a frontend reducer test for the custom event.
4. Add `@a2ui/react` and `@a2ui/web_core` to standalone UI.
5. Render one hardcoded basic A2UI surface from captured event payload.
6. Add a standalone demo agent or example config that emits A2UI.
7. Add A2UI action handling through `forwardedProps`.
8. Only after that, decide whether to remove direct CopilotKit backend usage and
   instantiate `ag_ui_langgraph.LangGraphAgent` directly.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `ag-ui-langgraph` version drift | Runtime stream behavior changes | Add event-contract tests before upgrading |
| A2UI v0.9 changes | Renderer or schema churn | Gate behind experimental config and include version |
| Invalid model-generated UI | Broken chat bubble | Validate and keep fallback text |
| Frontend bundle growth | Standalone UI gets heavier | Use A2UI packages only, avoid CopilotKit frontend |
| Action payload ambiguity | Graph cannot route interactions reliably | Define one Idun action shape early |
| Security issues in rich components | Unsafe URLs or side effects | Catalog allowlist and explicit action/function registry |

## Recommended MVP decision

Proceed with:

- AG-UI as the transport.
- `ag-ui-langgraph` as the LangGraph AG-UI adapter.
- A2UI `v0.9` as the experimental payload format.
- `CUSTOM` event name `idun.a2ui.messages`.
- Standalone UI rendering through A2UI React packages, not CopilotKit.
- Text fallback required for every rich UI response.

Do not start by replacing `ag-ui-langgraph`. Do not start by adding an MCP A2UI
bridge. Do not start by building a custom Idun catalog. The first MVP should
prove that LangGraph can emit A2UI messages through the existing `/agent/run`
stream and that the standalone UI can render them safely.
