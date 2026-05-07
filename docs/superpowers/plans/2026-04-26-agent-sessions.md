# Agent Sessions API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship `/agent/sessions` + `/agent/sessions/{id}` per `docs/superpowers/specs/2026-04-26-agent-sessions-design.md`.

**Architecture:** Sequential subagent dispatch — each task is small and self-contained but downstream tasks depend on upstream contracts. Order matters.

---

## Task SES.1 — Schemas + `BaseAgent` ABC additions

**Files:**
- Create: `libs/idun_agent_schema/src/idun_agent_schema/engine/sessions.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/__init__.py` (export new types)
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/capabilities.py` (add optional `history` field)
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py` (add 3 methods with default impls)
- Tests: `libs/idun_agent_engine/tests/unit/agent/test_base_agent_history_defaults.py` (new)

- [ ] **Step 1:** Create `engine/sessions.py` with `SessionSummary`, `SessionMessage`, `SessionDetail`, `HistoryCapabilities` per spec §2. Use `to_camel` alias generator like the rest of `engine/`.
- [ ] **Step 2:** Add `history: HistoryCapabilities | None = None` to `AgentCapabilities` (existing model). Default `None` keeps back-compat.
- [ ] **Step 3:** Add to `BaseAgent` (per spec §3):

```python
def history_capabilities(self) -> HistoryCapabilities:
    return HistoryCapabilities(can_list=False, can_get=False)

async def list_sessions(self, *, user_id: str | None = None) -> list[SessionSummary]:
    raise NotImplementedError

async def get_session(self, session_id: str, *, user_id: str | None = None) -> SessionDetail | None:
    raise NotImplementedError
```

- [ ] **Step 4:** Test in `tests/unit/agent/test_base_agent_history_defaults.py`:
  - A minimal subclass that doesn't override these returns `HistoryCapabilities(can_list=False, can_get=False)`.
  - `await subclass.list_sessions()` raises `NotImplementedError`.
  - `await subclass.get_session("x")` raises `NotImplementedError`.

- [ ] **Step 5:** Run `uv run pytest libs/idun_agent_schema libs/idun_agent_engine/tests -q`. All green.
- [ ] **Step 6:** Commit:

```
feat(schema, engine): add session history schemas + BaseAgent ABC methods (SES.1)

- New idun_agent_schema/engine/sessions.py: SessionSummary, SessionMessage,
  SessionDetail, HistoryCapabilities (camelCase aliases like the rest).
- AgentCapabilities gains optional history field (back-compat).
- BaseAgent gets history_capabilities() / list_sessions / get_session
  with NotImplementedError defaults.

Per docs/superpowers/specs/2026-04-26-agent-sessions-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task SES.2 — ADK adapter implementation

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`
- Tests: `libs/idun_agent_engine/tests/integration/agent/test_adk_sessions.py` (new — gated by `requires_adk` mark if it already exists; else unit-style with `InMemorySessionService`)

- [ ] **Step 1:** Read `adk.py`. Confirm `_session_service`, `_name`, and the existing reference to ADK's `Session` / `Event` types.
- [ ] **Step 2:** Implement per spec §4:
  - `history_capabilities()` returns `can_list=True, can_get=True` when `_session_service` is set.
  - `list_sessions(user_id)`: calls `await self._session_service.list_sessions(app_name=self._name, user_id=user_id or "anonymous")`. Sort by `last_update_time` desc. For each, fetch full session, compute preview from first user-text-event.
  - `get_session(session_id, user_id)`: calls `get_session(...)`, applies cross-user 404 guard, walks events with `_events_to_messages` (text-only).
- [ ] **Step 3:** Helpers `_first_user_text(session)` and `_events_to_messages(events)`:
  - Walk `event.content.parts`. For each part, take `part.text` if non-empty.
  - Role: `"user"` if `event.author == "user"` else `"assistant"`.
  - Drop tool/empty events.
- [ ] **Step 4:** Tests use ADK's `InMemorySessionService`:
  - Seed two sessions for user `"u1"`, one for `"u2"`. List for `"u1"` returns 2; list for `"u2"` returns 1.
  - `get_session(session_id, user_id="u1")` returns `SessionDetail` with messages reconstructed.
  - `get_session(session_id, user_id="u2")` for a u1 session returns `None` (cross-user guard).
- [ ] **Step 5:** Run + commit:

```
feat(engine): ADK adapter implements session history endpoints (SES.2)

list_sessions / get_session wrap _session_service.list_sessions and
get_session. Messages reconstructed text-only from event.content.parts.
Cross-user access returns None (404 at the route layer).

Per docs/superpowers/specs/2026-04-26-agent-sessions-design.md.
```

---

## Task SES.3 — LangGraph adapter implementation

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`
- Tests: `libs/idun_agent_engine/tests/integration/agent/test_langgraph_sessions.py` (new)

- [ ] **Step 1:** Read `langgraph.py`. Find `_compiled_graph` (the compiled StateGraph) and `_checkpointer` references. Confirm aget_state path.
- [ ] **Step 2:** Implement per spec §5:
  - `history_capabilities()` returns `can_list/can_get = (self._checkpointer is not None)`.
  - `get_session(session_id)`: `state = await self._compiled_graph.aget_state({"configurable": {"thread_id": session_id}})`. Convert `state.values["messages"]` to `SessionMessage[]` via `_lc_messages_to_session`.
  - `list_sessions()`: enumerate thread_ids via `_enumerate_thread_ids(self._checkpointer)`, then call `get_session(tid)` per thread. Build summaries with first-user-message preview.
- [ ] **Step 3:** `_enumerate_thread_ids(checkpointer)` helper:

```python
async def _enumerate_thread_ids(saver) -> list[str]:
    """Best-effort thread enumeration. Internal-API peek per saver type."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    except ImportError:
        AsyncPostgresSaver = None  # type: ignore

    if isinstance(saver, InMemorySaver):
        # InMemorySaver stores in `storage` (dict[str, dict[str, dict[str, ...]]]).
        # Top-level keys are thread_ids. Verify on installed langgraph version.
        storage = getattr(saver, "storage", None)
        if isinstance(storage, dict):
            return list(storage.keys())
        return []

    if isinstance(saver, AsyncSqliteSaver):
        async with saver.lock:
            cur = await saver.conn.execute(
                "SELECT thread_id, MAX(checkpoint_id) AS latest "
                "FROM checkpoints GROUP BY thread_id ORDER BY latest DESC LIMIT 200"
            )
            rows = await cur.fetchall()
            return [r[0] for r in rows]

    if AsyncPostgresSaver is not None and isinstance(saver, AsyncPostgresSaver):
        async with saver.conn.cursor() as cur:
            await cur.execute(
                "SELECT thread_id, MAX(checkpoint_id) AS latest "
                "FROM checkpoints GROUP BY thread_id ORDER BY latest DESC LIMIT 200"
            )
            rows = await cur.fetchall()
            return [r[0] for r in rows]

    raise NotImplementedError(
        f"thread enumeration not supported for {type(saver).__name__}"
    )
```

Wrap calls to this helper in a try/except that downgrades `NotImplementedError` to an empty list and logs a warning, so unknown checkpointers don't 500.

- [ ] **Step 4:** `_lc_messages_to_session(messages)` helper per spec §5. Walk LangChain messages, drop tool/empty, map to `SessionMessage`.
- [ ] **Step 5:** Tests:
  - Build a tiny `StateGraph(MessagesState)` with an echo node, compile with `InMemorySaver`. Run two threads (`t1`, `t2`) with different prompts. `list_sessions()` returns both with previews; `get_session("t1")` returns the t1 messages.
  - Same with SQLite saver against a `tmp_path` DB.
  - `history_capabilities` returns can_list/can_get true with checkpointer, false without.
- [ ] **Step 6:** Run + commit:

```
feat(engine): LangGraph adapter implements session history endpoints (SES.3)

get_session via the public aget_state API. list_sessions falls back to
internal-table peek (SELECT DISTINCT thread_id FROM checkpoints) for
SQLite/Postgres savers and InMemorySaver storage dict; unknown savers
log a warning and return []. Messages reconstructed text-only.

Per docs/superpowers/specs/2026-04-26-agent-sessions-design.md.
```

---

## Task SES.4 — Server route + `AgentCapabilities` wiring

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/dependencies.py` (or wherever the SSO dep lives — add `_optional_sso_user`)
- Modify: wherever `discover_capabilities()` is called to populate `AgentCapabilities.history` with `agent.history_capabilities()`.
- Tests: `libs/idun_agent_engine/tests/integration/server/test_sessions_routes.py` (new)

- [ ] **Step 1:** Read `routers/agent.py`. Locate the existing `Depends(get_agent)` pattern.
- [ ] **Step 2:** Add `GET /agent/sessions` and `GET /agent/sessions/{session_id}` per spec §6.
- [ ] **Step 3:** Add `_optional_sso_user` dependency: returns `None` when `request.app.state.sso_validator is None`, else delegates to existing `require_auth` (the validator returns the user object). If the existing `require_auth` doesn't have an "optional" variant, write one inline in the router file.
- [ ] **Step 4:** `_resolve_user_id(user, request)`: returns `user.email` if user is set, else `None`.
- [ ] **Step 5:** Wire `agent.history_capabilities()` into `AgentCapabilities.history` wherever the agent populates capabilities (likely in each adapter's `discover_capabilities()`). Ensure `GET /agent/capabilities` includes `history` in the response.
- [ ] **Step 6:** Tests:
  - LangGraph in-memory app: POST `/agent/run` once to seed a thread, then GET `/agent/sessions` returns 1 entry. GET `/agent/sessions/<id>` returns the messages. GET `/agent/sessions/<bogus>` returns 404. GET `/agent/capabilities` includes `history.canList=true`.
  - Haystack stub (or any agent without history support): GET `/agent/sessions` returns 501 with the `agent_type` payload.
  - SSO-enabled app (mocked validator): missing token → 401; valid token → user-scoped result.
- [ ] **Step 7:** Run + commit:

```
feat(engine): /agent/sessions + /agent/sessions/{id} endpoints (SES.4)

Adapter-driven session listing and detail. 501 when the active memory
backend doesn't support listing. SSO-aware user scoping when sso.enabled.
AgentCapabilities now includes optional history block.

Per docs/superpowers/specs/2026-04-26-agent-sessions-design.md.
```

---

## Task SES.5 — Standalone UI wiring

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api.ts` (add `listAgentSessions`, `getAgentSession`)
- Modify: `services/idun_agent_standalone_ui/components/chat/HistorySidebar.tsx` (switch source)
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts` (hydration switch)
- Test: `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` (extend hydration test)
- Test: `services/idun_agent_standalone_ui/e2e/chat.spec.ts` (existing tests still pass)

- [ ] **Step 1:** Read `lib/api.ts`. Locate the existing `listSessions` (trace) helper. Add the engine-backed counterparts:

```ts
export type AgentSessionSummary = {
  id: string;
  lastUpdateTime: number | null;
  userId: string | null;
  threadId: string | null;
  preview: string | null;
};

export type AgentSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number | null;
};

export type AgentSessionDetail = {
  id: string;
  lastUpdateTime: number | null;
  userId: string | null;
  threadId: string | null;
  messages: AgentSessionMessage[];
};

export const api = {
  // ... existing ...
  listAgentSessions: () => apiFetch<AgentSessionSummary[]>("/agent/sessions"),
  getAgentSession: (id: string) =>
    apiFetch<AgentSessionDetail>(`/agent/sessions/${encodeURIComponent(id)}`),
};
```

The existing `apiFetch` already handles JSON / errors / `credentials: include`.

- [ ] **Step 2:** `HistorySidebar` switches its `useQuery` to:

```ts
queryFn: () => api.listAgentSessions().catch(() => null),
```

The existing render code uses `last_event_at` (snake_case from the trace endpoint). Adapt to `lastUpdateTime` (camelCase from the engine endpoint). Same for `title` → `preview`.

- [ ] **Step 3:** `useChat`'s hydration switch:
  - On `threadId` change, call `api.getAgentSession(threadId)` instead of `api.getSessionEvents(threadId)`.
  - The response is already reconstructed `messages` — set them directly on state. No event replay.
  - Drop the snapshot pre-pass / reducer replay path for hydration. (Live streaming still uses the reducer for live events.)

- [ ] **Step 4:** Capability-driven UI:
  - On first load, call `api.getCapabilities()` (existing or new helper around `/agent/capabilities`).
  - Cache the result in zustand or a React context.
  - If `history.canList === false`, replace HistorySidebar with a small "History not available with this memory backend" hint.
- [ ] **Step 5:** Update `__tests__/use-chat.test.ts`:
  - The existing hydration test asserts events from `getSessionEvents` reconstitute messages. Update to assert messages from `getAgentSession` are set directly.
- [ ] **Step 6:** Verify `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` all green. The E2E `+ New clears the chat thread` test should still pass — the new flow keeps reset-on-threadId-change semantics; only the data source changes.
- [ ] **Step 7:** Commit:

```
feat(standalone-ui): chat history reads from /agent/sessions (SES.5)

HistorySidebar lists from the engine's memory-backed /agent/sessions
endpoint instead of the trace-events table. useChat hydrates conversations
via /agent/sessions/{id} (text-only messages). Capability-aware fallback
when listing isn't supported by the active memory backend. Admin /traces
remains on the trace endpoints (admin-level event inspection).

Per docs/superpowers/specs/2026-04-26-agent-sessions-design.md.
```

---

## Wrap-up

After SES.1–SES.5 land:

```bash
uv run pytest libs/idun_agent_schema libs/idun_agent_engine/tests -q   # green
uv run pytest libs/idun_agent_standalone/tests -q                       # green
cd services/idun_agent_standalone_ui
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e              # green
```

Then mark spec status: `Shipped — 2026-04-26`. Push branch.

Manual smoke after deploy:
1. Reboot standalone with the langgraph-tool-add agent (already wired).
2. Send a few `7+35` style messages.
3. Click `+ New` → chat clears.
4. Reload the page — HistorySidebar lists prior threads (now from `/agent/sessions`, not traces).
5. Click a prior thread row → useChat hydrates from `/agent/sessions/{id}` and shows the prior text messages (no tool calls — text-only by design).
