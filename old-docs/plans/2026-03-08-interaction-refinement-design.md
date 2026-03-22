# Agent Interaction Refinement Design (Issue #355 Phase 2)

**Date:** 2026-03-08
**Issue:** #355
**Branch:** issue-355
**Status:** Approved design, pending implementation

## Summary

Refine the framework-agnostic agent interaction feature to fix UI failures with structured agents, add schema-driven form generation, structured output visualization, improved error display, and comprehensive testing. The `/agent/run` endpoint remains a standard AG-UI endpoint; framework differences are handled in the UI layer.

## Decisions

| Decision | Choice |
|---|---|
| Structured input routing | Frontend framework-aware (respects AG-UI protocol) |
| LangGraph structured input | `RunAgentInput.state` = parsed JSON, messages = [] |
| ADK structured input | `RunAgentInput.messages[-1].content` = JSON string |
| Structured output source | Extract from `STATE_SNAPSHOT` event (no custom events) |
| Form generation | Schema-driven fields from `capabilities.input.schema.properties` |
| UI polish level | Full: form generation + output viewer + error details + info bar |
| Testing scope | Automated unit/integration + manual curl test script |
| Haystack | Out of scope |
| Legacy endpoints | Untouched, stay deprecated |

## 1. Framework-Aware Request Building

**Problem:** UI always sends structured input as `messages[-1].content`. LangGraph expects it in `state`.

**Solution:** The `useChat` hook and `StructuredInputForm` become framework-aware:

```
capabilities.framework == "LANGGRAPH" && input.mode == "structured"
  -> RunAgentInput.state = parsedJsonData, messages = []

capabilities.framework == "ADK" && input.mode == "structured"
  -> RunAgentInput.state = {}, messages = [{ role: "user", content: JSON.stringify(data) }]

input.mode == "chat" (any framework)
  -> RunAgentInput.state = userState, messages = [conversationHistory]
```

Framework-awareness lives in the hook/form layer where `RunAgentInput` is constructed. The `agui-client.ts` `runAgent()` passes `RunAgentInput` through unchanged.

## 2. Structured Input Form with Schema-Generated Fields

**Problem:** Current `StructuredInputForm` is a raw JSON textarea with no schema visualization.

**Solution:** Generate form fields from `capabilities.input.schema.properties`:

| Schema type | Form element |
|---|---|
| `string` | TextInput (TextArea if description hints at long text) |
| `number` / `integer` | NumberInput |
| `boolean` | Checkbox/Toggle |
| `array` of strings | TagInput (comma-separated) |
| `object` | Nested JSON textarea |

- Required fields marked with `*` from `schema.required[]`
- Field labels from property key, descriptions from `property.description`
- Toggle: "Switch to Raw JSON" for power users
- Fallback: raw JSON only when schema is null/empty or has no properties

The form collects values into a plain object, then the hook applies framework-aware routing from section 1.

## 3. Structured Output Viewer

**Problem:** Structured output not displayed. UI listens for `RUN_FINISHED.result` / `CUSTOM("structured_output")` which are never emitted. Actual output arrives in `STATE_SNAPSHOT`.

**Event handling changes in `useChat.ts`:**

```
case STATE_SNAPSHOT:
  -> store snapshot in stateSnapshot ref
  -> if capabilities.output.mode == "structured":
       extract relevant fields using output schema keys
       set structuredOutput = extracted data
  -> else: store as raw state for debugging
```

**Output Viewer renders based on data shape:**

| Data shape | Rendering |
|---|---|
| Flat object (all scalar values) | Key-value table (label / value) |
| Array of flat objects | HTML table with column headers |
| Nested/complex object | Pretty-printed JSON with syntax highlighting |
| String | Rendered as text/markdown |

**Placement:**
- Structured agents: Output viewer below the input form, appears after run completes
- Chat agents with structured output: Collapsible viewer below assistant's last message
- Always: Raw JSON toggle for the full `STATE_SNAPSHOT`

## 4. Error Display Improvements

**Problem:** `RunErrorEvent` only shows `e.message`. No error code, no structured details.

**For structured agents (form mode):**

| Error code | Display |
|---|---|
| `VALIDATION_ERROR` | Inline error below the form. Red border + error text. |
| `FRAMEWORK_ERROR` / `INTERNAL_ERROR` | Error banner below output viewer with code badge + expandable details. |

- Client-side JSON validation before sending (immediate feedback)
- `RunErrorEvent.code` captured and displayed (currently ignored)

**For chat agents:**
- Keep current `ErrorBanner` behavior
- Add error code badge from `RunErrorEvent.code`

## 5. Capabilities Info Bar & Mode Switching

**Problem:** Current capabilities bar uses inline styles, shows minimal info.

**Redesigned info bar:**
- Framework badge (LANGGRAPH / ADK)
- Input/output mode labels
- Capability flags as small badges (Streaming, History, ThreadId)
- Mode toggle: Form / Chat (available when agent is structured)
- Fallback: warning when capabilities fetch fails, defaults to chat

Proper CSS classes in `chat-tab.css` replacing inline styles.

## 6. Testing & Validation

**Automated tests:**

| Test file | New coverage |
|---|---|
| `test_discovery.py` | ADK structured/chat discovery |
| `test_routes_run.py` | All 4 agent types, validation errors, state snapshot extraction |

**Manual test script** (`docs/test-scripts/test-agent-run.sh`):
- curl commands for all 4 agents (LangGraph chat/structured, ADK chat/structured)
- Happy path + validation error cases
- Expected output patterns documented inline

**Out of scope:**
- Playwright/Vitest UI tests (deferred)
- Haystack
- Legacy endpoints

## Files To Modify

**Frontend (`services/idun_agent_web/src/`):**
- `components/agent-detail/tabs/chat-tab/useChat.ts` — Framework-aware request building, STATE_SNAPSHOT handling
- `components/agent-detail/tabs/chat-tab/component.tsx` — StructuredInputForm rewrite, StructuredOutputViewer, capabilities info bar, error improvements
- `components/agent-detail/tabs/chat-tab/agui-client.ts` — Update `buildCurlCommand` for framework-aware format
- `components/agent-detail/tabs/chat-tab/chat-tab.css` — New styles for form fields, output viewer, info bar
- `components/agent-detail/tabs/chat-tab/types.ts` — Update error type to include code

**Backend tests (`libs/idun_agent_engine/tests/`):**
- `unit/agent/test_discovery.py` — ADK discovery tests
- `unit/server/test_routes_run.py` — Expanded route tests

**Documentation:**
- `docs/test-scripts/test-agent-run.sh` — Manual test script
