# WS2 — A2UI MVP 1 design

Date: 2026-04-30
Branch: `explore/a2ui-langgraph` (continues from WS1)
Companion docs:
- `docs/superpowers/reviews/2026-04-30-a2ui-langgraph-mvp-validation.md` (research that motivated WS1+WS2)
- `docs/superpowers/plans/2026-04-30-ws1-engine-modernization.md` (executed)

## Goal

Render A2UI v0.9 surfaces inside the standalone-UI assistant bubble when a LangGraph agent emits them. Read-only — clicks and form submits land in WS3.

## Non-goals (explicit)

- Action handling (click → follow-up run): WS3.
- ADK or Haystack adapters: LangGraph only.
- Custom Idun A2UI catalog: Basic Catalog v0.9 only.
- Server-side Pydantic validation of A2UI envelopes.
- MCP A2UI bridge (`langchain-mcp-adapters` strips text `EmbeddedResource` mimeType — separate workstream).
- A2UI v0.8 compatibility: dead, drop on the floor.
- Inspector / debug-mode surface error display.
- Bundle-size hard cap (measure first; revisit if delta is unacceptable).

## Architecture

```text
LangGraph node
  └─ await emit_surface(config, surface_id, components, fallback_text)
       └─ adispatch_custom_event("idun.a2ui.messages", envelope, config=config)
            └─ astream_events(version="v2") on_custom_event
                 └─ ag_ui_langgraph.LangGraphAgent
                      └─ CustomEvent(name="idun.a2ui.messages", value=envelope)
                           └─ /agent/run SSE
                                └─ standalone-ui lib/agui.ts SSE reader
                                     └─ use-chat.ts applyEvent
                                          └─ Message.a2uiSurfaces[]
                                               └─ MessageView.tsx
                                                    └─ <A2UISurfaceErrorBoundary>
                                                         └─ <A2UISurfaceWrapper>
                                                              └─ <A2UISurface processor surfaceId />
```

The pipe is end-to-end transparent for the engine. WS1 already cleared the runway: ag-ui-langgraph 0.0.35 emits `CustomEvent` from LangGraph custom events natively, and the engine's existing `/agent/run` SSE encoder doesn't need to know A2UI exists.

## Locked design decisions

These came out of brainstorming and are fixed for WS2.

| # | Decision | Choice |
|---|---|---|
| 1 | Helper API shape | Two functions: `emit_surface()` (one-shot create + update) and `update_components()` (incremental updates only) |
| 2 | MessageProcessor lifecycle | One processor per assistant message; garbage-collected when the message is removed |
| 3 | Server-side validation | Function-signature only; trust the dev. Renderer placeholder-renders invalid components client-side |
| 4 | Surface placement in assistant bubble | Text above, surface below, both inside the same bubble |
| 5 | Failure-mode UX | Silent fallback (text only), `console.error` for devs. ErrorBoundary is non-negotiable |
| M1 | Helper module path | `idun_agent_engine.a2ui` submodule. Public API: `from idun_agent_engine.a2ui import emit_surface, update_components` |
| M2 | Catalog default | Hardcode `https://a2ui.org/specification/v0_9/basic_catalog.json`; allow override via `catalog_id=` kwarg |
| M3 | Multiple surfaces per message | Stack vertically; each gets its own ErrorBoundary + processor |
| M4 | Streaming text + surface coexistence | Render surface as soon as `createSurface` lands; renderer handles empty state |
| M5 | Bundle-size budget | Measure with `next build`; record delta; no hard cap for MVP |

## Backend SDK

### Module layout

```
libs/idun_agent_engine/src/idun_agent_engine/a2ui/
├── __init__.py        # public API: emit_surface, update_components, BASIC_CATALOG_V09
├── helpers.py         # implementation
└── envelope.py        # _build_envelope helper (shared between emit_surface + update_components)
```

Three small files, one clear responsibility each. `__init__.py` is the public surface; `helpers.py` is what tests target; `envelope.py` is the shared envelope builder. The split is small but lets `helpers.py` stay focused on dispatch logic and `envelope.py` stay focused on shape.

### Public API

```python
# libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py

from idun_agent_engine.a2ui.helpers import emit_surface, update_components
from idun_agent_engine.a2ui.envelope import BASIC_CATALOG_V09

__all__ = ["emit_surface", "update_components", "BASIC_CATALOG_V09"]
```

### `emit_surface(...)` contract

```python
async def emit_surface(
    config: RunnableConfig,
    *,
    surface_id: str,
    components: list[dict],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict | None = None,
) -> None:
    """Dispatch an A2UI v0.9 envelope (createSurface + updateComponents)
    as a LangGraph custom event named ``idun.a2ui.messages``.

    Must be called from inside a LangGraph node where ``config`` is
    available (the second positional arg of the node function). The
    event reaches the AG-UI adapter via ``astream_events(version="v2")``.

    Args:
        config: The ``RunnableConfig`` passed to the LangGraph node.
            Required so the event is correlated with the active run.
        surface_id: A surface identifier. Should be stable within a
            thread for clients that want to update the same surface
            across turns.
        components: A2UI Basic Catalog v0.9 components. The first
            component should have ``id="root"``.
        fallback_text: Plain-text summary shown above the surface in
            Idun standalone UI and used by clients that cannot render
            A2UI. Strongly recommended.
        catalog_id: Catalog URI. Defaults to the v0.9 basic catalog.
        metadata: Optional metadata dict passed through verbatim
            (e.g., ``{"source": "tool", "tool_name": "search"}``).

    Returns:
        None. The event is fire-and-forget on the LangGraph stream.

    Notes:
        Pure JSON only — non-serializable values in ``components`` or
        ``metadata`` will be silently dropped by ag-ui-langgraph's
        ``dump_json_safe``. Do not pass datetime, callables, or
        Pydantic models without dumping them first.
    """
```

### `update_components(...)` contract

```python
async def update_components(
    config: RunnableConfig,
    *,
    surface_id: str,
    components: list[dict],
) -> None:
    """Dispatch an ``updateComponents``-only A2UI envelope. Use after
    a previous ``emit_surface`` call to update components on an
    existing surface incrementally.

    Args mirror ``emit_surface``. No ``createSurface`` is sent — the
    client must already know about the surface from a prior emit.
    """
```

### Envelope shape (built by both helpers)

For `emit_surface`:
```json
{
  "a2uiVersion": "v0.9",
  "surfaceId": "<surface_id>",
  "fallbackText": "<fallback_text>",
  "messages": [
    {
      "version": "v0.9",
      "createSurface": {
        "surfaceId": "<surface_id>",
        "catalogId": "<catalog_id>"
      }
    },
    {
      "version": "v0.9",
      "updateComponents": {
        "surfaceId": "<surface_id>",
        "components": [...]
      }
    }
  ],
  "metadata": {...}
}
```

For `update_components`: drop `fallbackText`, keep only the second message.

The envelope name on the wire is `"idun.a2ui.messages"`. Reserved AG-UI custom event names that we MUST NOT use: `exit`, `ManuallyEmitState`, `ManuallyEmitMessage`, `ManuallyEmitToolCall`, `copilotkit_exit` (verified against ag-ui-langgraph 0.0.35 source).

### Why `config` must be the first positional arg

LangGraph's `adispatch_custom_event` requires the active `RunnableConfig` to correlate the event with the running node. Passing it positionally (rather than buried in kwargs) makes the constraint visible at the call site and aligns with the LangGraph idiom.

## Frontend integration

### `Message` shape extension

In `services/idun_agent_standalone_ui/lib/agui.ts`:

```typescript
export type IdunA2UIMessage = {
  version: "v0.9";
  createSurface?: { surfaceId: string; catalogId: string };
  updateComponents?: { surfaceId: string; components: unknown[] };
  updateDataModel?: { surfaceId: string; data: unknown };
  // other v0.9 envelope members reserved
};

export type IdunA2UIEvent = {
  a2uiVersion: "v0.9";
  surfaceId: string;
  fallbackText?: string;
  messages: IdunA2UIMessage[];
  metadata?: Record<string, unknown>;
};

export type A2UISurfaceState = {
  surfaceId: string;
  catalogId: string;
  messages: IdunA2UIMessage[];   // accumulated, in order
  fallbackText?: string;
};

export type Message = {
  // ... existing fields stay unchanged
  a2uiSurfaces?: A2UISurfaceState[];
};
```

### `applyEvent` — new CUSTOM branch

In `services/idun_agent_standalone_ui/lib/use-chat.ts`, add a case after the existing event handlers, before the `default`:

```typescript
case "CUSTOM":
case "CustomEvent": {
  const name = String(e.name ?? "");
  if (name !== "idun.a2ui.messages") break;

  const value = e.value as IdunA2UIEvent | undefined;
  if (!value || !Array.isArray(value.messages)) break;

  updateLatestAssistant((m) => {
    if (m.role !== "assistant") return m;

    const surfaces = m.a2uiSurfaces ?? [];
    const idx = surfaces.findIndex((s) => s.surfaceId === value.surfaceId);

    if (idx === -1) {
      // First time we've seen this surface — find catalogId from
      // the createSurface message if present, else default to basic.
      const createMsg = value.messages.find((msg) => msg.createSurface);
      const catalogId =
        createMsg?.createSurface?.catalogId ??
        "https://a2ui.org/specification/v0_9/basic_catalog.json";
      return {
        ...m,
        a2uiSurfaces: [
          ...surfaces,
          {
            surfaceId: value.surfaceId,
            catalogId,
            messages: value.messages,
            fallbackText: value.fallbackText,
          },
        ],
      };
    }

    // Existing surface — append messages, preserve catalogId, refresh
    // fallbackText if a new one is provided.
    const next = [...surfaces];
    next[idx] = {
      ...next[idx],
      messages: [...next[idx].messages, ...value.messages],
      fallbackText: value.fallbackText ?? next[idx].fallbackText,
    };
    return { ...m, a2uiSurfaces: next };
  });
  break;
}
```

### New components

```
services/idun_agent_standalone_ui/components/chat/a2ui/
├── A2UISurfaceErrorBoundary.tsx   # React class component, ErrorBoundary
└── A2UISurfaceWrapper.tsx          # owns MessageProcessor, renders <A2UISurface>
```

`A2UISurfaceErrorBoundary.tsx`:
```tsx
type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class A2UISurfaceErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[a2ui] surface render failed", error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
```

`A2UISurfaceWrapper.tsx`:
```tsx
import { useEffect, useMemo, useRef } from "react";
import { A2UISurface } from "@a2ui/react";
import { MessageProcessor } from "@a2ui/web_core";
import type { A2UISurfaceState } from "@/lib/agui";

type Props = { surface: A2UISurfaceState };

export function A2UISurfaceWrapper({ surface }: Props) {
  // One processor per wrapper instance (= one per assistant message
  // surface entry). React's per-component lifecycle is the cleanup
  // boundary we want.
  const processor = useMemo(() => new MessageProcessor(), []);

  // Replay messages whenever the surface.messages array changes.
  // Processor is responsible for idempotency — duplicate messages
  // re-applied are a no-op for unchanged components.
  const lastSeenLength = useRef(0);
  useEffect(() => {
    const newMessages = surface.messages.slice(lastSeenLength.current);
    for (const msg of newMessages) {
      processor.process(msg);
    }
    lastSeenLength.current = surface.messages.length;
  }, [surface.messages, processor]);

  return <A2UISurface processor={processor} surfaceId={surface.surfaceId} />;
}
```

### `MessageView.tsx` assistant-branch slot

Below the existing ReactMarkdown body (currently around lines 96-103 in the assistant branch), add:

```tsx
{m.a2uiSurfaces?.map((surface) => (
  <A2UISurfaceErrorBoundary key={surface.surfaceId}>
    <A2UISurfaceWrapper surface={surface} />
  </A2UISurfaceErrorBoundary>
))}
```

Each surface gets its own boundary + wrapper. If one surface crashes, the others (and the text) survive.

## Error handling

| Failure mode | What happens | What user sees |
|---|---|---|
| Renderer hits invalid component (catalog allowlist miss) | Renderer placeholder-renders | text + surface with placeholder square |
| Malformed envelope (no `surfaceId`, no `messages` array) | `applyEvent` short-circuits via the `Array.isArray` guard | text only; nothing in `a2uiSurfaces` |
| Streaming partial (`createSurface` arrives, `updateComponents` doesn't) | Surface renders empty | text + empty surface frame (renderer handles) |
| React render exception | ErrorBoundary catches, logs to `console.error` | text only; ErrorBoundary returns `null` |
| Unknown CUSTOM event name | `applyEvent` `break`s out of the case | nothing changes |
| `value` is null/undefined | Guarded; `break` early | nothing changes |

The user always gets the text. The ErrorBoundary is the last line of defense — without it, a `@a2ui/react` render bug crashes the whole chat bubble.

## Testing

### Backend (Python, pytest)

In `libs/idun_agent_engine/tests/unit/a2ui/`:

```
test_envelope.py
  - test_emit_surface_envelope_shape
  - test_update_components_envelope_shape (no createSurface)
  - test_metadata_passes_through
  - test_default_catalog_id
  - test_custom_catalog_id

test_helpers.py
  - test_emit_surface_dispatches_via_adispatch_custom_event
    (mock adispatch_custom_event, assert it was called with the right
     name and payload)
  - test_update_components_dispatches
```

In `libs/idun_agent_engine/tests/integration/`:

```
test_a2ui_passthrough.py
  - test_idun_a2ui_messages_streams_through_agent_run
    (build a tiny LangGraph fixture node that calls emit_surface,
     run it through the agent router, assert a CUSTOM event with
     name "idun.a2ui.messages" appears in the SSE stream)
```

### Frontend (Vitest + React Testing Library)

In `services/idun_agent_standalone_ui/__tests__/`:

```
use-chat.a2ui.test.ts
  - applyEvent CUSTOM idun.a2ui.messages creates a new surface entry
  - applyEvent appends to existing surface when surfaceId matches
  - applyEvent ignores CUSTOM events with other names
  - applyEvent ignores malformed envelopes (null, missing messages)
  - applyEvent uses default catalogId when createSurface is absent

a2ui-surface-wrapper.test.tsx
  - MessageProcessor receives all surface.messages on mount
  - Newly added messages are processed without re-processing old ones

a2ui-surface-error-boundary.test.tsx
  - Boundary catches a thrown render and returns null
  - console.error is called with the error and info

message-view.a2ui.test.tsx
  - Assistant message with a2uiSurfaces renders the wrapper inside
    the boundary
  - Multiple surfaces stack vertically
  - No surfaces → no wrapper rendered (back-compat)
```

### E2E smoke (Vitest integration scope)

A single end-to-end test that:
1. Mocks `runAgent` to emit a synthetic `CUSTOM idun.a2ui.messages` event during a stream.
2. Renders the chat hook + `MessageView`.
3. Asserts the assistant message contains both the fallback text and the rendered surface (find by test id).

No Playwright in MVP — Vitest + RTL is sufficient for the surface-renders-end-to-end claim.

## Dependencies

### Engine

No new dependencies. `langchain_core.callbacks.manager.adispatch_custom_event` is already available via existing `langchain-core` pin.

### Standalone UI

```json
{
  "@a2ui/react": "^0.9.1",
  "@a2ui/web_core": "^0.9.2"
}
```

Add to `dependencies` (not `devDependencies`).

## Acceptance criteria

WS2 is complete when:

1. `from idun_agent_engine.a2ui import emit_surface, update_components` works in user code.
2. A LangGraph node calling `await emit_surface(config, surface_id="...", components=[...], fallback_text="...")` causes a `CUSTOM idun.a2ui.messages` event to land on `/agent/run` SSE.
3. The standalone UI renders the surface inside the assistant bubble, below the text body, in the order text → surface.
4. Multiple surfaces from one assistant message stack vertically, each with its own ErrorBoundary.
5. A render error inside one A2UI surface does NOT crash the chat bubble or the other surfaces.
6. `console.error` logs the failure when an ErrorBoundary catches.
7. `next build` produces a static export; bundle delta is recorded.
8. Engine + standalone-ui CLAUDE.md files updated to document the new SDK and rendering surface.
9. All new tests pass; existing trimmed engine suite stays at 397 passed / 2 skipped; frontend suite gains the new tests with no regressions.

## Open questions deferred to WS3 / future workstreams

- Action handling — `forwardedProps.idun.a2uiAction` shape, `<A2UISurface onAction>` wiring, follow-up `/agent/run` POST. (WS3)
- `forwarded_props` snake-case depth verification. (WS3 prerequisite, 5-min test)
- Custom Idun catalog (e.g., guardrail-warning components). (Future)
- Inspector / debug mode for raw A2UI payload viewing. (Future)
- MCP A2UI bridge via `structuredContent` or `ToolCallInterceptor`. (Future)
- Pydantic envelope validation. (Future, MVP 3)
- LLM steering via prompt fragment listing supported components. (Future)
- ADK / Haystack A2UI support. (Future workstream)
