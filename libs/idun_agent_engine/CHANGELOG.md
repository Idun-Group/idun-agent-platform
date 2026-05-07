# Changelog

## 0.6.0 — 2026-04-25

### Added

- `BaseAgent.register_run_event_observer(observer)` — async callbacks receive every AG-UI event from `/agent/run` before SSE encoding. Implemented via a new `RunEventObserverRegistry` (`idun_agent_engine.agent.observers`). Per-observer exceptions are isolated and logged via `logger.exception`; they never break the SSE stream. Route-synthesized `RunErrorEvent` fallbacks are not dispatched (observers see only events yielded by the agent itself).
- `create_app(..., reload_auth=...)` — pluggable FastAPI dependency for the `POST /reload` endpoint. The configured callable (sync or async) is responsible for raising `HTTPException` to deny a request. `None` (default) keeps the previous unprotected behavior for back-compat.
- `IDUN_UI_DIR` environment variable — when set to a readable directory, the engine mounts it at `/` as `StaticFiles(html=True)`. The previous JSON info payload formerly served at `/` is reachable at `/_engine/info`; `/` falls back to the same payload only when no static UI is mounted.

### Changed

- `BaseAgent.__init__` now exists and instantiates the observer registry. All built-in adapters (`LanggraphAgent`, `AdkAgent`, `HaystackAgent`) call `super().__init__()` so the registry is available on every agent instance.

### Non-breaking

- Existing consumers see no behavior change unless they opt in via the new APIs or env var.
