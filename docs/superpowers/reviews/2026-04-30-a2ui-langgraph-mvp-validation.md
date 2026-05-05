# A2UI LangGraph MVP — independent validation

Date: 2026-04-30
Branch: `explore/a2ui-langgraph`
Companion to: `2026-04-30-a2ui-langgraph-mvp-findings.md`

## Why this doc exists

The original findings doc proposes AG-UI as transport, `ag-ui-langgraph` as adapter, and a thin Idun convention `idun.a2ui.messages` carried over `CUSTOM` events. Four independent research streams were run on (1) the actual codebase, (2) AG-UI / `ag-ui-langgraph` versions and behavior, (3) A2UI spec + `@a2ui/react` renderer, (4) LangGraph custom-event API + MCP embedded-resource path. This doc reports what those streams found and which parts of the original recommendation hold up.

Verdict line up front: **the high-level architecture is correct, but the original doc underestimated three things — version drift in `ag-ui-langgraph`, the protocol-wide `THINKING_*` → `REASONING_*` rename, and the MCP-adapter mimeType stripping.** Section-by-section detail follows.

## Confirmed

The original recommendation holds on these points:

- **Keep AG-UI as transport, not A2UI directly.** AG-UI gives Idun the run/message lifecycle, tool-call and reasoning streams, state snapshots, interrupts, and `forwardedProps`. A2UI on its own does not. Carrying A2UI envelopes inside AG-UI `CUSTOM` events is the right layering.
- **Keep `ag-ui-langgraph` rather than re-emitting AG-UI events from LangGraph nodes manually.** The adapter handles ~1000 LOC of message-state reconciliation, tool-call lifecycle, interrupt translation, and `forwardedProps` plumbing. Verified: `LangGraphAgent.run()` yields Pydantic events, the engine's `EventEncoder` (`server/routers/agent.py:174,194`) turns them into SSE.
- **Drop the `copilotkit.LangGraphAGUIAgent` subclass for the base `ag_ui_langgraph.LangGraphAgent`.** Verified by audit: `agent/langgraph/langgraph.py:1011-1013` only calls `.run()`. The subclass adds state injection (`state["copilotkit"]`), `ManuallyEmit*` interception, and schema flags — none of which Idun's existing graphs depend on. Trade-off: removes the transitive `copilotkit==0.1.78` pin.
- **`forwardedProps` reaches LangGraph nodes as snake_case.** Verified in `ag_ui_langgraph/agent.py` (`forwarded_props = {camel_to_snake(k): v ...}`). Idun's engine already reads `input.forwarded_props` only (`server/patches.py:423,440,528,532`). A2UI action routing must adopt snake_case server-side.
- **`CUSTOM` is the right MVP channel.** AG-UI `CustomEvent` schema is `{type, name, value}` plus optional `timestamp` / `raw_event`. `value: Any` is JSON-serializable. The adapter passes the LangGraph event's `data` field through `dump_json_safe` (drops non-serializable fields silently — fine for A2UI which is pure JSON).
- **Text fallback alongside rich UI.** Verified consistent with A2UI MCP guide and A2UI renderer behavior (renderer placeholder-renders invalid components rather than throwing, so a text fallback in the same assistant message is the correct degraded path).

## Amended

These claims in the original doc need correction or sharpening:

### A2UI v0.9 is shipped, not "draft"

The original doc gates v0.9 behind an `experimental` flag because it called v0.9 a draft. Reality (researched 2026-04-30): **v0.9 is the current release**, published by Google on **2026-04-17** (Google Developers Blog announcement). v0.8 is effectively dead — npm packages, docs, and the React renderer all moved. v0.9 is still pre-1.0 (the GitHub README lists "Spec stabilization toward v1.0" as future), so breaking-change risk before v1.0 is real, but the framing changes: v0.9 is *the* version, not a draft to fence off.

Practical implication: pin `@a2ui/react@^0.9.1` and `@a2ui/web_core@^0.9.2` (current versions on npm). Treat v0.9 → v1.0 as the next risk window, not v0.8 vs v0.9.

### `ag-ui-langgraph` is 10 patch versions stale, with a protocol rename

Original doc flagged version drift as something to "investigate." Reality: Idun pins `ag-ui-langgraph==0.0.25` (2026-02-10), latest on PyPI is **0.0.35** (2026-04-29). Between them, AG-UI completed a **protocol-wide `THINKING_*` → `REASONING_*` rename** (events now use `role: "reasoning"` and `ReasoningEncryptedValue`).

This matters for Idun directly: `services/idun_agent_standalone_ui/lib/use-chat.ts` only handles `THINKING_START`, `THINKING_TEXT_MESSAGE_START/CONTENT/END`, `THINKING_END` (lines 183-221). If the engine upgrades to `ag-ui-langgraph` 0.0.35, those events may stop arriving and the reasoning panel goes silent. **Upgrade and frontend rename must land together.**

Independent question to revisit: do Idun's monkey patches in `server/patches.py` still apply on 0.0.35? Three patches today, all targeting 0.0.25:
1. `_handle_single_event` — OnToolEnd list/raw outputs (ag-ui#1072) and Gemini `finish_reason` early-return.
2. `prepare_stream` — `Message ID not found in history` ValueError on 2nd+ message in a thread.

These need re-evaluation after upgrading. Some may have been fixed upstream (free win); others may need re-targeting (risk).

### MCP-bridge is partially blocked, not "natural follow-up"

Original doc framed the A2UI-over-MCP bridge as a clean future extension. Reality: `langchain-mcp-adapters` (the package Idun uses to bridge MCP into LangGraph tools) **silently strips `mimeType` from text `EmbeddedResource` content** when converting MCP tool results into LangChain messages (`langchain_mcp_adapters/tools.py:119-125`). The URI is also dropped. This means an MCP tool returning A2UI JSON via `EmbeddedResource{mimeType: "application/json+a2ui"}` arrives at the LangGraph node as a plain text block with no signal that it's A2UI.

Workarounds, in increasing effort order:
1. **`structuredContent`** — if the MCP server controls its response, use `CallToolResult.structuredContent` (a separate JSON dict). The adapter packages it as `MCPToolArtifact{structured_content}` and exposes it on `ToolMessage.artifact` (lines 70-81, 191-195, 431). Cleanest path.
2. **`ToolCallInterceptor`** (`langchain_mcp_adapters/interceptors.py:112+`) — intercept the raw `CallToolResult` *before* flattening. Captures the full `EmbeddedResource` list, lets you forward A2UI payloads via `adispatch_custom_event`. Officially documented escape hatch.
3. **Custom tool wrapper** — bypass `convert_mcp_tool_to_langchain_tool` and call `session.call_tool` directly.

This doesn't kill the MCP bridge MVP, but it's not free. Pick option 1 if Idun controls the MCP servers it bridges; option 2 otherwise.

### `dump_json_safe` is a quiet contract

Original doc says custom-event payloads pass through. Closer reading: `ag-ui-langgraph` runs the LangGraph event's `data` through `dump_json_safe()` before constructing `CustomEvent.value`. JSON-only fields survive verbatim; Pydantic models / dataclasses get recursively dumped; non-serializable fields are dropped silently. A2UI envelopes are pure JSON, so this is fine — but flag in any helper code so future contributors don't try to attach a callable, datetime, or numpy array and watch it disappear.

### Reserved custom-event names

The adapter special-cases certain custom event names and won't pass them through as `CustomEvent`:
- `"exit"` → terminates run
- `"ManuallyEmitState"` → emits `STATE_SNAPSHOT`
- `"ManuallyEmitMessage"`, `"ManuallyEmitToolCall"` → message/tool-call interception
- `"copilotkit_exit"` → CopilotKit-specific terminate

Idun's proposed name `idun.a2ui.messages` is dot-namespaced and does not collide. Keep it. Avoid the reserved names if introducing more Idun-specific custom events later.

## What the original doc missed

### Frontend renderer integration is more invasive than implied

Original doc says "add an A2UI renderer component near the chat message renderer." Audit reality: assistant messages render in `services/idun_agent_standalone_ui/components/chat/MessageView.tsx:52-106`, with the body going through `<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>`. There is no rich-content slot and no per-message extension point — A2UI surfaces will need a new branch in the assistant bubble + a `Message` shape extension (`lib/agui.ts:30-49`). Not a blocker, just scope.

`@a2ui/react` is also per-surface, not per-message: `<A2UISurface processor={...} surfaceId={...} onAction={...}>`. The `MessageProcessor` lives outside the surface and is keyed by `surfaceId`. The MVP needs to decide *where* the processor lives:
- One per chat thread (simplest, but cross-thread state leakage)
- One per assistant message (clean isolation, more memory)
- One per surface across threads (matches A2UI's data model, more bookkeeping)

Recommendation: one processor per assistant message that emits A2UI. Simplest mental model, isolated state, cleaned up when the message is removed.

### Bundle weight is ~150 KB gzipped

`@a2ui/react@0.9.1` is 994 KB unpacked, `@a2ui/web_core@0.9.2` is 2.27 MB unpacked. Realistic gzipped browser cost is **~120–180 KB** (Tailwind + ShadCN tree-shaken). The standalone UI ships inside the wheel; this hits cold-start size. Not a deal-breaker but worth budgeting and worth verifying via actual `next build` output before committing.

### `agui.ts` is hand-rolled

Frontend has no `@ag-ui/client` dependency. `lib/agui.ts:63-114` is a raw `fetch` + `ReadableStream` SSE parser sending camelCase wire body. This is fine for adding `CUSTOM` event handling, but means the A2UI integration owns its own event-shape decoding — there is no upstream client surface to lean on. Add `name === "idun.a2ui.messages"` detection inside `applyEvent` directly.

### Observability callbacks pinning

`agent/langgraph/langgraph.py:384-389` passes `config={"callbacks": self._obs_callbacks}` into the wrapper. The base `ag_ui_langgraph.LangGraphAgent` constructor accepts `config` (verified). Swap should preserve callbacks — but worth a smoke test that Langfuse / Phoenix traces still show up after the swap, because the CopilotKit subclass had its own metadata-flag filtering that may interact with which callback events are surfaced.

### LangGraph emit API is correct, but only via `astream_events`

`adispatch_custom_event(name, data, config=config)` from `langchain_core.callbacks.manager` is the API. Critical detail the original doc didn't lock down: **`ag-ui-langgraph` listens for `on_custom_event` events from `astream_events(version="v2")`, not from `get_stream_writer()` / `stream_mode="custom"`.** If a graph uses `get_stream_writer()` instead, the events bypass the adapter and never reach AG-UI. Document this in the example.

### Action payload: pin the shape now

Original doc proposes a free-form `forwardedProps.idun.a2uiAction` envelope. Lock the shape so graphs and the frontend can rely on it:

```typescript
// Frontend → POST /agent/run forwardedProps
{
  idun: {
    a2uiAction: {
      surfaceId: string,        // which surface fired the action
      actionId: string,         // action name from the catalog
      context: Record<string, unknown>,  // resolved data-bound subset
      threadId: string,         // for graph correlation, redundant with run input
    }
  }
}
```

After `ag-ui-langgraph` snake-cases keys, the LangGraph node sees `forwarded_props["idun"]["a2ui_action"]["surface_id"]` etc. (recursive snake-casing — verify this in the adapter code, the original doc only flagged it without confirming depth).

Open: `ag-ui-langgraph` may snake-case only the top level. If it doesn't recurse, nested keys stay camelCase and graphs read `forwarded_props["idun"]["a2uiAction"]["surfaceId"]`. This is a 5-minute test; don't guess in code.

## Updated open questions

| Question | Answer |
|---|---|
| `ag-ui-langgraph` 0.0.35 vs 0.0.25? | Upgrade. THINKING→REASONING is protocol-wide, 10 patches of fixes accumulated. Coordinate with frontend rename in `use-chat.ts`. |
| Swap `copilotkit.LangGraphAGUIAgent` for base class? | Yes. Idun calls only `.run()`. Removes transitive copilotkit dep. Smoke-test obs callbacks after. |
| Are monkey patches in `patches.py` still needed on 0.0.35? | Re-evaluate per patch. ag-ui#1072 may be fixed upstream. `prepare_stream` ValueError handler may still be needed. |
| LangGraph custom-event API? | `await adispatch_custom_event(name, data, config=config)` from `langchain_core.callbacks.manager`. Must be inside a graph node with `config` available. Listened to via `astream_events(version="v2")`. |
| A2UI v0.8 or v0.9? | v0.9. v0.8 is dead. |
| `@a2ui/react` API? | Per-surface `<A2UISurface processor={...} surfaceId={...} onAction={...}/>`. Action callback gets `{surfaceId, actionId, context}`. Renderer placeholder-renders invalid components, doesn't throw. |
| Processor lifecycle? | One per assistant message that emits A2UI (recommended). Cleanup on message removal. |
| Where does validation live? | Renderer enforces catalog allowlist at the React layer. Add optional Pydantic validation in a graph helper for v0.9 envelope shape. Don't block in the engine route. |
| MCP embedded-resource bridge? | Partially blocked. `langchain-mcp-adapters` strips text `EmbeddedResource` mimeType. Use `structuredContent` if you control the MCP server, or `ToolCallInterceptor` otherwise. |
| Reserved CUSTOM event names? | Avoid `exit`, `ManuallyEmitState`, `ManuallyEmitMessage`, `ManuallyEmitToolCall`, `copilotkit_exit`. `idun.a2ui.messages` is fine. |
| Bundle weight? | ~150 KB gzipped for `@a2ui/react` + `@a2ui/web_core`. Verify with actual `next build` before committing. |
| `forwardedProps` snake-case depth? | Top-level confirmed. Nested objects: unverified — needs a 5-minute test. |
| MVP action shape? | `forwardedProps.idun.a2uiAction = {surfaceId, actionId, context, threadId}`. Lock it now. |

## Refined MVP recommendation

```text
LangGraph node
  -> adispatch_custom_event("idun.a2ui.messages", {a2uiVersion: "v0.9", surfaceId, messages})
  -> astream_events(version="v2")
  -> ag_ui_langgraph.LangGraphAgent (BASE CLASS, 0.0.35)
  -> CustomEvent(name="idun.a2ui.messages", value=<A2UI payload>)
  -> /agent/run SSE
  -> standalone UI agui.ts SSE reader
  -> use-chat.ts applyEvent — new CUSTOM branch
  -> Message {a2uiSurfaces?: A2UISurfaceState[]}
  -> MessageView.tsx — new branch renders <A2UISurface processor onAction />
  -> onAction → POST /agent/run with forwardedProps.idun.a2uiAction
```

Three coordinated workstreams:

**WS1 — Engine modernization (independent, do first):**
1. Bump `ag-ui-langgraph` 0.0.25 → 0.0.35; bump `ag-ui-protocol` accordingly.
2. Re-evaluate `server/patches.py` — drop or re-target each of the 3 patches against 0.0.35.
3. Swap `copilotkit.LangGraphAGUIAgent` for `ag_ui_langgraph.LangGraphAgent`.
4. Remove `copilotkit==0.1.78` from `pyproject.toml` deps (transitive only after this).
5. Smoke-test obs callbacks (Langfuse, Phoenix) and existing tests.
6. Add THINKING→REASONING handling in `use-chat.ts` (keep THINKING for backward compat with old engine versions).

**WS2 — A2UI MVP 1 (depends on WS1):**
1. Backend: add a test LangGraph fixture node that emits `idun.a2ui.messages` via `adispatch_custom_event`.
2. Backend: assert custom event passes through `/agent/run` SSE in a unit test.
3. Frontend: add `@a2ui/react` and `@a2ui/web_core` to `services/idun_agent_standalone_ui/package.json`. Verify bundle delta.
4. Frontend: extend `Message` shape with `a2uiSurfaces?` and add CUSTOM branch in `use-chat.ts applyEvent`.
5. Frontend: add `<A2UISurface>` slot in `MessageView.tsx` assistant branch, above the markdown body.
6. Frontend: render the test fixture's surface end-to-end.
7. E2E smoke test: prompt → fallback text + A2UI component visible.

**WS3 — Actions (depends on MVP 1):**
1. Lock the `forwardedProps.idun.a2uiAction` shape in a TypeScript type and a Pydantic helper.
2. Verify nested key snake-casing depth in `ag-ui-langgraph` (5-minute test).
3. Frontend: wire `<A2UISurface onAction>` to a `useChat` action that POSTs `/agent/run` with thread continuity.
4. Backend: add a test graph node that branches on `forwarded_props.idun.a2ui_action.action_id`.
5. E2E smoke test: click button → run with action metadata → graph receives it → confirmation surface.

**Out of scope for MVP:** validation lib (`a2ui-agent-sdk`), custom catalogs, MCP bridge, security policy beyond catalog allowlist.

## Risks reassessed

| Risk | Updated impact | Mitigation |
|---|---|---|
| `ag-ui-langgraph` upgrade breaks existing behavior | Higher than original doc said — protocol rename + 3 monkey patches to revisit | Land WS1 as its own PR with full test pass before A2UI work begins. |
| A2UI v0.9 → v1.0 churn | Real, but v0.9 is the live release, not a draft | Pin `^0.9.x`, plan a v1.0 migration window when announced. |
| Bundle size hit (~150 KB gzipped) | Material for the standalone wheel | Measure on `next build` before merging. Consider lazy-load if A2UI surfaces are uncommon. |
| Invalid model-generated UI | Lower than original doc said — renderer placeholder-renders, doesn't throw | Keep text fallback. Catalog allowlist via renderer config. |
| MCP A2UI bridge regresses | Higher — adapter strips mimeType silently | Out of MVP. When tackled, prefer `structuredContent`. |
| `forwarded_props` nested camelCase | Medium — affects action routing | 5-minute test before locking the action shape. |
| Obs callbacks drift after CopilotKit swap | Low | Smoke test Langfuse + Phoenix in WS1. |

## Recommendation

Proceed with the original architecture **after** completing WS1 (engine modernization). Do not start A2UI work directly on the current pinned versions — the THINKING→REASONING rename and the `ag-ui-langgraph` version drift are real risks that compound with new A2UI work and make debugging harder. WS1 is independently valuable (10 patches of upstream fixes, removal of CopilotKit transitive dep) and clears the runway for MVP 1 + MVP 2.

If WS1 surfaces unexpected breakage on 0.0.35 that can't be resolved quickly, fall back to staying on 0.0.25 + skipping the CopilotKit swap, but accept that the frontend `use-chat.ts` thinking events keep working as-is.
