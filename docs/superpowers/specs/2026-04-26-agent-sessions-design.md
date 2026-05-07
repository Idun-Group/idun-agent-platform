# Agent Sessions API — Design Spec

**Status:** Draft

**Goal:** Expose `GET /agent/sessions` (list) and `GET /agent/sessions/{id}` (detail) on the engine so the standalone chat UI (and any other consumer) can list prior conversations and rehydrate one. Backend swaps based on the configured memory: ADK uses `session_service`; LangGraph uses the `_checkpointer`. Source for inspiration: `customer-service-adk/SESSION_RETRIEVAL.md` (ADK-only flow).

**Reference:** `/Users/geoffreyharrazi/Documents/GitHub/customer-service-adk/SESSION_RETRIEVAL.md`

---

## 1. User answers

1. Engine + standalone UI wiring.
2. **Approach A** — adapter implements listing including LangGraph internal-table peek.
3. Auth scoping: `forwardedProps.user_id` when SSO is on, else single-user (matches reference's `app_name + user_email` model).
4. Restored messages: **text only**. Drop tool calls / steps / thinking blocks.
5. Routes: `/agent/sessions` and `/agent/sessions/{id}` (namespaced under `/agent/`).

---

## 2. Schemas (`idun_agent_schema/engine/sessions.py` — new)

```python
class SessionSummary(BaseModel):
    id: str                          # thread_id (LangGraph) or session_id (ADK)
    last_update_time: float | None   # epoch seconds
    user_id: str | None
    thread_id: str | None            # AG-UI thread id; equals id for LangGraph
    preview: str | None              # first user-authored text, ~120 chars

class SessionMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: float | None

class SessionDetail(BaseModel):
    id: str
    last_update_time: float | None
    user_id: str | None
    thread_id: str | None
    messages: list[SessionMessage]

class HistoryCapabilities(BaseModel):
    can_list: bool
    can_get: bool
```

CamelCase aliases via the existing `to_camel` convention (matches the rest of `idun_agent_schema/engine/`).

---

## 3. `BaseAgent` additions

Three new methods (default implementations return "not supported"):

```python
def history_capabilities(self) -> HistoryCapabilities:
    return HistoryCapabilities(can_list=False, can_get=False)

async def list_sessions(self, *, user_id: str | None = None) -> list[SessionSummary]:
    raise NotImplementedError

async def get_session(self, session_id: str, *, user_id: str | None = None) -> SessionDetail | None:
    raise NotImplementedError
```

Concrete adapters override per below.

---

## 4. ADK adapter (`agent/adk/adk.py`)

Mirror the reference's flow. `_session_service` already exposes `list_sessions(app_name, user_id)` and `get_session(app_name, user_id, session_id)`.

```python
def history_capabilities(self) -> HistoryCapabilities:
    return HistoryCapabilities(can_list=True, can_get=True)

async def list_sessions(self, *, user_id: str | None = None) -> list[SessionSummary]:
    if not self._session_service:
        return []
    res = await self._session_service.list_sessions(
        app_name=self._name,
        user_id=user_id or "anonymous",
    )
    sessions = sorted(res.sessions, key=lambda s: s.last_update_time or 0, reverse=True)
    out: list[SessionSummary] = []
    for s in sessions:
        # Fetch full session to compute preview (first user-authored text).
        full = await self._session_service.get_session(
            app_name=self._name, user_id=s.user_id, session_id=s.id,
        )
        preview = _first_user_text(full) if full else None
        thread_id = (full.state or {}).get("_ag_ui_thread_id") if full else None
        out.append(SessionSummary(
            id=s.id, last_update_time=s.last_update_time, user_id=s.user_id,
            thread_id=thread_id, preview=preview,
        ))
    return out

async def get_session(self, session_id: str, *, user_id: str | None = None) -> SessionDetail | None:
    if not self._session_service:
        return None
    s = await self._session_service.get_session(
        app_name=self._name, user_id=user_id or "anonymous", session_id=session_id,
    )
    if s is None:
        return None
    # 404-equivalent guard: cross-user check
    if user_id and s.user_id != user_id:
        return None
    return SessionDetail(
        id=s.id, last_update_time=s.last_update_time, user_id=s.user_id,
        thread_id=(s.state or {}).get("_ag_ui_thread_id"),
        messages=_events_to_messages(s.events),
    )
```

`_events_to_messages` walks `event.content.parts`, takes only `parts[i].text` where present, maps `event.author == "user"` → `"user"` else `"assistant"` (per reference). Tool calls dropped.

---

## 5. LangGraph adapter (`agent/langgraph/langgraph.py`)

LangGraph's `BaseCheckpointSaver` has no public "list threads" — verified via context7. We peek internal storage per saver type. The `thread_id` column is the documented primary key in the SQLite/Postgres checkpoint table (`PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)`), stable across LangGraph 0.5–1.0.

```python
def history_capabilities(self) -> HistoryCapabilities:
    return HistoryCapabilities(
        can_list=self._checkpointer is not None,
        can_get=self._checkpointer is not None,
    )

async def get_session(self, session_id: str, *, user_id: str | None = None) -> SessionDetail | None:
    if not self._compiled_graph or not self._checkpointer:
        return None
    config = {"configurable": {"thread_id": session_id}}
    state = await self._compiled_graph.aget_state(config)
    if state is None or not state.values:
        return None
    msgs = state.values.get("messages") or []
    return SessionDetail(
        id=session_id,
        last_update_time=_state_ts(state),
        user_id=None,
        thread_id=session_id,
        messages=_lc_messages_to_session(msgs),
    )

async def list_sessions(self, *, user_id: str | None = None) -> list[SessionSummary]:
    if not self._checkpointer:
        return []
    thread_ids = await _enumerate_thread_ids(self._checkpointer)
    out: list[SessionSummary] = []
    for tid in thread_ids:
        detail = await self.get_session(tid)
        if detail is None:
            continue
        first = next((m for m in detail.messages if m.role == "user"), None)
        out.append(SessionSummary(
            id=tid,
            last_update_time=detail.last_update_time,
            user_id=None,
            thread_id=tid,
            preview=(first.content[:120] if first else None),
        ))
    return out
```

`_enumerate_thread_ids(checkpointer)` is the workaround:

- `InMemorySaver` (langgraph 1.x): `list(checkpointer.storage.keys())` (the in-memory dict keyed by thread_id; verify field name on the actual installed version).
- `AsyncSqliteSaver`: query via `await checkpointer.conn.execute("SELECT thread_id, MAX(checkpoint_id) AS latest FROM checkpoints GROUP BY thread_id ORDER BY latest DESC LIMIT 200")`.
- `AsyncPostgresSaver`: same query against `checkpointer.conn`.

Encapsulate this in a single helper with `isinstance` dispatch + a clear `NotImplementedError("listing not supported for <type>")` for unknown savers (e.g., custom user-supplied checkpointers).

`_lc_messages_to_session(messages)` — walks LangChain messages:
- `HumanMessage` → `role="user"`, content=str
- `AIMessage` (or chunk) → `role="assistant"`, content=str (skip if empty)
- `ToolMessage` → drop (per user answer 4)
- Skip messages where `content` is empty after stringification.

User scoping: not supported in this phase for LangGraph (single-user). `user_id` arg is accepted but ignored. Documented in adapter docstring + the route's response (`user_id` always `null` for LangGraph results).

---

## 6. Server routes (`server/routers/agent.py`)

Two new endpoints:

```python
@agent_router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(request: Request, agent: BaseAgent = Depends(get_agent), user=Depends(_optional_sso_user)):
    caps = agent.history_capabilities()
    if not caps.can_list:
        raise HTTPException(501, detail={
            "error": "listing not supported by current memory backend",
            "agent_type": agent.agent_type,
        })
    user_id = _resolve_user_id(user, request)
    return await agent.list_sessions(user_id=user_id)

@agent_router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str, request: Request, agent: BaseAgent = Depends(get_agent), user=Depends(_optional_sso_user)):
    caps = agent.history_capabilities()
    if not caps.can_get:
        raise HTTPException(501)
    user_id = _resolve_user_id(user, request)
    detail = await agent.get_session(session_id, user_id=user_id)
    if detail is None:
        raise HTTPException(404)
    return detail
```

`_resolve_user_id`: returns `user.email` if SSO is enabled and the JWT validated; else returns `None`. Matches the existing engine SSO pattern (`require_auth` already exists; we add an `_optional_sso_user` variant that doesn't 401 when SSO is off).

`_optional_sso_user`: if `app.state.sso_validator is None`, return `None`. Else require the JWT and return the validated user. (We may already have something close — check existing dependencies; reuse if so.)

The standalone's chat surface (`auth_mode=none|password`) is NOT SSO; the engine sees no SSO; user_id is `None`. The standalone single-admin model means all sessions are visible to the admin — matches the reference's intent.

When SSO is on (engine deployed with `sso.enabled=true`), the route extracts `user.email` and scopes per-user — same model as the reference.

---

## 7. Capabilities discovery

Extend `AgentCapabilities` (existing model in `idun_agent_schema/engine/capabilities.py`) to include a `history` field of type `HistoryCapabilities`. The standalone UI reads this via `GET /agent/capabilities` to decide whether to show the History sidebar at all.

Backwards compat: field is optional / default to `HistoryCapabilities(can_list=False, can_get=False)`. Existing consumers ignore it.

---

## 8. Standalone UI wiring

Today the standalone uses `api.listSessions` (trace-events) and `api.getSessionEvents` (trace-events) for the chat HistorySidebar + useChat hydration. After this phase:

- **`HistorySidebar`** switches to `api.listAgentSessions()` (engine `/agent/sessions`).
- **`useChat.hydrate`** switches to `api.getAgentSession(sid)` (engine `/agent/sessions/{id}`). Returns text-only messages — fine per user answer 4.
- **`/admin/traces/`** keeps its existing trace-based endpoints (admin-level event inspection — different concern, richer surface).

If `agent.history_capabilities.can_list === false`, the HistorySidebar is replaced with a small "History not available with this memory backend" hint.

`api.ts` adds:
- `listAgentSessions(): Promise<SessionSummary[]>`
- `getAgentSession(id: string): Promise<SessionDetail | null>`

`useChat`'s `applyEvent` reducer is bypassed for hydration: the engine endpoint returns reconstructed messages directly, so we set `messages` from the `SessionDetail.messages` payload. No event replay needed (text-only is enough). Saves bandwidth + simpler.

---

## 9. Architecture decisions

**D1: Adapter abstraction (Approach A).** Single ABC method per concern. Asymmetry hidden behind `history_capabilities`. UI degrades gracefully via the capability flag.

**D2: LangGraph table peek is contained in one helper.** `_enumerate_thread_ids` is the only place that introspects checkpointer internals. If LangGraph schema shifts, one fix point.

**D3: Restored messages are text-only.** Per user answer 4. Tool calls and steps are observable via the standalone's `/traces/` admin surface; they're not part of chat-history rehydration.

**D4: User scoping is best-effort.** ADK supports it natively. LangGraph adapter accepts the arg but doesn't filter (single-user assumption). The route's response always reports the actual scoping in `SessionSummary.user_id`.

**D5: 501 instead of empty list when listing isn't supported.** Surfaces the asymmetry honestly to consumers. UI shows a clear "not available" message instead of an unexplained empty rail.

**D6: Capabilities folded into existing `AgentCapabilities`.** No new endpoint; one query at app boot covers the discovery.

---

## 10. Out of scope

- Pagination on `/agent/sessions` — initial cap of 200 most-recent threads. Add later if needed.
- Search / filter on listing — defer.
- Restored tool calls / reasoning — defer (admin /traces handles this richer view).
- LangGraph user scoping — defer until LangGraph adds first-class user/thread metadata (or until a session-index module ships).
- Haystack adapter — stays at default (501).

---

## 11. Verification

```bash
# Backend
uv run pytest libs/idun_agent_engine/tests -q                # +N tests across adapters
uv run pytest libs/idun_agent_standalone/tests -q            # unchanged

# Frontend
cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm test && pnpm build

# Manual smoke (LangGraph + Gemini tool agent — already running on :8001 from prior phase):
curl -s http://127.0.0.1:8001/agent/sessions | jq
curl -s http://127.0.0.1:8001/agent/sessions/<known-thread-id> | jq

# Manual smoke (ADK):
# Boot a customer-service-adk-style template, send a chat, then GET /agent/sessions.
```

---

## 12. Acceptance criteria

- Engine: `GET /agent/sessions` and `GET /agent/sessions/{id}` work for both LangGraph and ADK adapters, with the right capability flags and per-user scoping rules.
- Engine: Haystack adapter returns 501.
- Standalone UI: HistorySidebar reads from `/agent/sessions`. useChat hydrates from `/agent/sessions/{id}`. Admin /traces unchanged.
- All existing engine + standalone backend + frontend tests stay green.
- New tests cover: (a) LangGraph + InMemory + 2 threads → list returns both; (b) LangGraph + SQLite + persisted thread → get_session returns expected messages; (c) ADK + InMemory + 2 sessions → list works + scopes by user; (d) capability flag set correctly per adapter.
