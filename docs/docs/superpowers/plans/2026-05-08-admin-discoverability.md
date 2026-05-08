# Admin discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin` reachable from every chat-layout state, expose `/docs` and `/redoc` from the admin sidebar, and re-tag all FastAPI routers into 5 domain bundles so Swagger groups operations meaningfully.

**Architecture:** Two surfaces, one PR.
- **Backend:** add `OPENAPI_TAGS` constant and an `app.openapi_tags = …` mutation in `idun_agent_standalone.app`. Move per-route/include-time tag overrides to the router-level so each router carries its own tag, then rewrite the tag values across 12 standalone routers + 7 engine routers (2 core + 5 integration webhooks).
- **Frontend:** wire the existing `HeaderActions` component into `MinimalLayout` and into `BrandedLayout`'s empty/welcome branch, and add a "Developer" `NavGroup` to `AppSidebar` with external links to `/docs` and `/redoc`.

**Tech Stack:** FastAPI 0.115+ · Python 3.12 · Next.js 15 · React 19 · Tailwind v4 · pytest · Playwright · pnpm

---

## Branch & worktree

You are on branch `feat/admin-discoverability` (off `origin/develop`) in this worktree:
`/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/gleaming-snacking-ritchie`

The spec for this work lives at `docs/docs/superpowers/specs/2026-05-08-admin-discoverability-design.md`.

All paths below are relative to the repo root.

---

## File map

### Created

| Path | Purpose |
|---|---|
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/openapi.py` | `OPENAPI_TAGS` constant — tag names + descriptions for `/docs` |
| `libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py` | Verify metadata round-trip + no-orphan-operations + tag distribution |
| `services/idun_agent_standalone_ui/e2e/admin-developer-group.spec.ts` | Playwright spec for the Developer sidebar group |

### Modified

| Path | Change |
|---|---|
| `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` | Set `app.openapi_tags = OPENAPI_TAGS` after `create_engine_app(...)` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py` | `tags=["admin"]` → `tags=["Agent Configuration"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/prompts.py` | `tags=["admin"]` → `tags=["Agent Configuration"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py` | `tags=["admin"]` → `tags=["Agent Configuration"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/guardrails.py` | `tags=["admin"]` → `tags=["Agent Configuration"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py` | `tags=["admin"]` → `tags=["Agent Configuration"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/auth.py` | `tags=["admin"]` → `tags=["Auth & SSO"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/sso.py` | `tags=["admin"]` → `tags=["Auth & SSO"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/sso_info.py` | `tags=["sso"]` → `tags=["Auth & SSO"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/mcp_servers.py` | `tags=["admin"]` → `tags=["Integrations & Tools"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/integrations.py` | `tags=["admin"]` → `tags=["Integrations & Tools"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/observability.py` | `tags=["admin"]` → `tags=["Observability"]` |
| `libs/idun_agent_standalone/src/idun_agent_standalone/runtime_config.py` | `tags=["runtime-config"]` → `tags=["Runtime"]` |
| `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py` | Add `tags=["Runtime"]` at `APIRouter(...)`; drop the `tags=["Agent"]` override on the deprecated `/agent/invoke` route (keep `deprecated=True`) |
| `libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py` | Add `tags=["Runtime"]` at `APIRouter(...)` |
| `libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py` | `app.include_router(agent_router, prefix="/agent", tags=["Agent"])` → drop the `tags=` kwarg (router-level tag wins). Same for `base_router`. |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/discord/handler.py` | Add `tags=["Runtime"]` at `APIRouter(...)` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/discord/integration.py` | Drop the `tags=["Discord"]` kwarg on `app.include_router(...)` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/google_chat/handler.py` | Add `tags=["Runtime"]` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/slack/handler.py` | Add `tags=["Runtime"]` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/teams/handler.py` | Add `tags=["Runtime"]` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/teams/integration.py` | Drop `tags=["Teams"]` kwarg |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/whatsapp/handler.py` | Add `tags=["Runtime"]` |
| `libs/idun_agent_engine/src/idun_agent_engine/integrations/whatsapp/integration.py` | Drop `tags=["WhatsApp"]` kwarg |
| `services/idun_agent_standalone_ui/components/chat/MinimalLayout.tsx` | Mount `<HeaderActions />` next to `<Logo>`; update docstring |
| `services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx` | In the `empty ?` branch, render a stripped `<header>` with `<Logo>` + `<HeaderActions>` above `<WelcomeHero>` |
| `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx` | Extend `NavItem` with optional `external?: boolean`; append a "Developer" group with `/docs` and `/redoc` entries; render external entries with `<a target="_blank">` and an `ExternalLink` icon |
| `services/idun_agent_standalone_ui/e2e/chat.spec.ts` | New test "admin link visible on welcome and conversation in all 3 layouts" |

---

## Task 1: Backend — `OPENAPI_TAGS` module + wire on app

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/openapi.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- Test (created in Task 5): `libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py`

This task only adds the constant and wires it onto the app. Router rewrites land in Tasks 2-4. The big `app.openapi()` integration test lands in Task 5 once all routers are coherent.

- [ ] **Step 1: Create `openapi.py`**

Write `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/openapi.py`:

```python
"""OpenAPI tag metadata for the standalone runtime.

Drives section ordering and per-section descriptions shown in
``/docs`` (Swagger UI) and ``/redoc``. Wired in
``idun_agent_standalone.app.create_standalone_app`` immediately after
the engine app is constructed, so the engine API surface stays
unchanged across embedders.
"""

from __future__ import annotations

OPENAPI_TAGS: list[dict[str, str]] = [
    {
        "name": "Runtime",
        "description": (
            "Public agent run endpoints, engine operations, and chat-channel "
            "webhooks. SSE streaming via the AG-UI protocol."
        ),
    },
    {
        "name": "Agent Configuration",
        "description": (
            "Singleton admin endpoints for the agent, prompts, memory, "
            "guardrails, and onboarding wizard."
        ),
    },
    {
        "name": "Auth & SSO",
        "description": (
            "Login, sessions, password change, SSO config, and the public "
            "SSO discovery endpoint."
        ),
    },
    {
        "name": "Integrations & Tools",
        "description": (
            "MCP server registry and external integration credentials."
        ),
    },
    {
        "name": "Observability",
        "description": "Tracing/logging provider configuration.",
    },
]
"""Ordered tag groups exposed in /docs. Order = display order."""

OPENAPI_TAG_NAMES: frozenset[str] = frozenset(t["name"] for t in OPENAPI_TAGS)
"""Allowed tag names — used by the no-orphan-operations test."""
```

- [ ] **Step 2: Wire on the app**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`.

Add to the import block at the top, in alphabetical position alongside other `idun_agent_standalone.api.v1.*` imports:

```python
from idun_agent_standalone.api.v1.openapi import OPENAPI_TAGS
```

Find the line `register_admin_exception_handlers(app)` (used as an anchor — it's the first standalone-side mutation that runs after the engine app is built and is followed immediately by `admin_auth = [Depends(require_auth)]` and the include_router block). Insert the new mutation directly after that line:

Before:
```python
    register_admin_exception_handlers(app)
    admin_auth = [Depends(require_auth)]
    app.include_router(auth_router)
```

After:
```python
    register_admin_exception_handlers(app)
    app.openapi_tags = OPENAPI_TAGS
    admin_auth = [Depends(require_auth)]
    app.include_router(auth_router)
```

This guarantees the metadata is present on the app object before any router is attached, which is the order FastAPI expects for clean schema generation.

- [ ] **Step 3: Smoke check the import**

Run: `uv run python -c "from idun_agent_standalone.api.v1.openapi import OPENAPI_TAGS, OPENAPI_TAG_NAMES; print(len(OPENAPI_TAGS), sorted(OPENAPI_TAG_NAMES))"`

Expected output:
```
5 ['Agent Configuration', 'Auth & SSO', 'Integrations & Tools', 'Observability', 'Runtime']
```

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/openapi.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py
git commit -m "feat(standalone): add OPENAPI_TAGS metadata for /docs grouping"
```

---

## Task 2: Backend — Re-tag standalone routers (12 files)

**Files modified:**
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/prompts.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/memory.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/guardrails.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/onboarding.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/auth.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/sso.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/sso_info.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/mcp_servers.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/integrations.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/observability.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/runtime_config.py`

Each edit changes a single `tags=[...]` keyword on the `APIRouter(...)` call. The current line in each file follows the pattern (line numbers from develop):

| File | Before | After |
|---|---|---|
| `routers/agent.py:39` | `router = APIRouter(prefix="/admin/api/v1/agent", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/agent", tags=["Agent Configuration"])` |
| `routers/prompts.py:40` | `router = APIRouter(prefix="/admin/api/v1/prompts", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/prompts", tags=["Agent Configuration"])` |
| `routers/memory.py:43` | `router = APIRouter(prefix="/admin/api/v1/memory", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/memory", tags=["Agent Configuration"])` |
| `routers/guardrails.py:51` | `router = APIRouter(prefix="/admin/api/v1/guardrails", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/guardrails", tags=["Agent Configuration"])` |
| `routers/onboarding.py:39` | `router = APIRouter(prefix="/admin/api/v1/onboarding", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/onboarding", tags=["Agent Configuration"])` |
| `routers/auth.py:42` | `router = APIRouter(prefix="/admin/api/v1/auth", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/auth", tags=["Auth & SSO"])` |
| `routers/sso.py:37` | `router = APIRouter(prefix="/admin/api/v1/sso", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/sso", tags=["Auth & SSO"])` |
| `routers/sso_info.py:21` | `router = APIRouter(tags=["sso"])` | `router = APIRouter(tags=["Auth & SSO"])` |
| `routers/mcp_servers.py:53` | `router = APIRouter(prefix="/admin/api/v1/mcp-servers", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/mcp-servers", tags=["Integrations & Tools"])` |
| `routers/integrations.py:51` | `router = APIRouter(prefix="/admin/api/v1/integrations", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/integrations", tags=["Integrations & Tools"])` |
| `routers/observability.py:42` | `router = APIRouter(prefix="/admin/api/v1/observability", tags=["admin"])` | `router = APIRouter(prefix="/admin/api/v1/observability", tags=["Observability"])` |
| `runtime_config.py:20` | `router = APIRouter(tags=["runtime-config"])` | `router = APIRouter(tags=["Runtime"])` |

- [ ] **Step 1: Apply each edit**

Use the Edit tool on each file. Match the entire `router = APIRouter(...)` line exactly so the substitution is unambiguous.

- [ ] **Step 2: Verify with grep**

Run: `git grep -n 'tags=\["admin"\]\|tags=\["sso"\]\|tags=\["runtime-config"\]' libs/idun_agent_standalone/src/`

Expected output: empty (no matches).

If any matches remain, finish those files before continuing.

- [ ] **Step 3: Sanity check that imports still work**

Run: `uv run python -c "from idun_agent_standalone.api.v1.routers import agent, auth, sso_info; from idun_agent_standalone import runtime_config; print(agent.router.tags, auth.router.tags, sso_info.router.tags, runtime_config.router.tags)"`

Expected output:
```
['Agent Configuration'] ['Auth & SSO'] ['Auth & SSO'] ['Runtime']
```

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/ \
        libs/idun_agent_standalone/src/idun_agent_standalone/runtime_config.py
git commit -m "feat(standalone): re-tag routers into 5 OpenAPI bundles"
```

---

## Task 3: Backend — Re-tag engine core routers + drop deprecated route override

**Files:**
- `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`
- `libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py`
- `libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py`

This task moves engine tags from the `app.include_router(...)` call site to the `APIRouter(...)` constructor, and drops the deprecated per-route override on `/agent/invoke`. Tags belong on the router, not on the mount point — single source of truth makes Task 5's test easy.

- [ ] **Step 1: Tag `agent_router` at the router level**

In `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py` (around line 31):

Before:
```python
agent_router = APIRouter()
```

After:
```python
agent_router = APIRouter(tags=["Runtime"])
```

- [ ] **Step 2: Drop the per-route deprecated override**

In the same file, around line 507, find the `app.add_api_route("/agent/invoke", ...)` call. Remove the `tags=["Agent"],` line — keep `deprecated=True`:

Before:
```python
    app.add_api_route(
        "/agent/invoke",
        invoke,
        methods=["POST"],
        response_model=ChatResponse,
        tags=["Agent"],
        deprecated=True,
    )
```

After:
```python
    app.add_api_route(
        "/agent/invoke",
        invoke,
        methods=["POST"],
        response_model=ChatResponse,
        deprecated=True,
    )
```

- [ ] **Step 3: Tag `base_router` at the router level**

In `libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py` (around line 16):

Before:
```python
base_router = APIRouter()
```

After:
```python
base_router = APIRouter(tags=["Runtime"])
```

- [ ] **Step 4: Drop the include_router tag overrides**

In `libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py` (around lines 178-179):

Before:
```python
    app.include_router(agent_router, prefix="/agent", tags=["Agent"])
    app.include_router(base_router, tags=["Base"])
```

After:
```python
    app.include_router(agent_router, prefix="/agent")
    app.include_router(base_router)
```

- [ ] **Step 5: Sanity import check**

Run: `uv run python -c "from idun_agent_engine.server.routers.agent import agent_router; from idun_agent_engine.server.routers.base import base_router; print(agent_router.tags, base_router.tags)"`

Expected output:
```
['Runtime'] ['Runtime']
```

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py \
        libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py \
        libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py
git commit -m "feat(engine): tag agent_router and base_router as Runtime"
```

---

## Task 4: Backend — Re-tag engine integration webhooks (5 channels)

**Files:**
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/discord/handler.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/discord/integration.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/google_chat/handler.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/slack/handler.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/teams/handler.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/teams/integration.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/whatsapp/handler.py`
- `libs/idun_agent_engine/src/idun_agent_engine/integrations/whatsapp/integration.py`

Each integration has a `handler.py` (declares the `router = APIRouter()`) and an `integration.py` (calls `app.include_router(router, prefix=..., tags=...)`). The pattern: add `tags=["Runtime"]` at the `APIRouter(...)` call in `handler.py`, drop the `tags=` kwarg in `integration.py`'s `app.include_router(...)` call (where present).

- [ ] **Step 1: Discord**

`integrations/discord/handler.py:22`:

Before:
```python
router = APIRouter()
```

After:
```python
router = APIRouter(tags=["Runtime"])
```

`integrations/discord/integration.py:42`:

Before:
```python
        app.include_router(router, prefix="/integrations/discord", tags=["Discord"])
```

After:
```python
        app.include_router(router, prefix="/integrations/discord")
```

- [ ] **Step 2: Google Chat**

`integrations/google_chat/handler.py:19`:

Before:
```python
router = APIRouter()
```

After:
```python
router = APIRouter(tags=["Runtime"])
```

(`integrations/google_chat/integration.py` already has no `tags=` kwarg — leave untouched.)

- [ ] **Step 3: Slack**

`integrations/slack/handler.py:19`:

Before:
```python
router = APIRouter()
```

After:
```python
router = APIRouter(tags=["Runtime"])
```

(`integrations/slack/integration.py` already has no `tags=` kwarg — leave untouched.)

- [ ] **Step 4: Teams**

`integrations/teams/handler.py:8`:

Before:
```python
router = APIRouter()
```

After:
```python
router = APIRouter(tags=["Runtime"])
```

`integrations/teams/integration.py:54`:

Before:
```python
        app.include_router(router, prefix="/integrations/teams", tags=["Teams"])
```

After:
```python
        app.include_router(router, prefix="/integrations/teams")
```

- [ ] **Step 5: WhatsApp**

`integrations/whatsapp/handler.py:18`:

Before:
```python
router = APIRouter()
```

After:
```python
router = APIRouter(tags=["Runtime"])
```

`integrations/whatsapp/integration.py:36`:

Before:
```python
        app.include_router(router, prefix="/integrations/whatsapp", tags=["WhatsApp"])
```

After:
```python
        app.include_router(router, prefix="/integrations/whatsapp")
```

- [ ] **Step 6: Verify**

Run: `git grep -nE 'tags=\["(Discord|Slack|Teams|WhatsApp|Google[ _]?Chat)"\]' libs/idun_agent_engine/`

Expected output: empty.

Run: `git grep -nE '^router = APIRouter\(\)$' libs/idun_agent_engine/src/idun_agent_engine/integrations/`

Expected output: empty (every integration handler has tags now).

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/integrations/
git commit -m "feat(engine): tag chat-channel webhooks as Runtime"
```

---

## Task 5: Backend — Test the full OpenAPI tag surface

**Files:**
- Create: `libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py`

This is the integration-level guarantee: every operation in a fully-wired standalone app belongs to one of the 5 declared tags. Catches future router additions that forget `tags=`.

The test builds a minimal `FastAPI` instance, includes every router we expect to ship, and asserts the resulting OpenAPI schema is coherent with `OPENAPI_TAGS`. We deliberately avoid booting `create_standalone_app(...)` (heavy — needs DB, agent config) and instead include the routers directly, which is sufficient for tag introspection.

- [ ] **Step 1: Write the failing test**

Write `libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py`:

```python
"""Verify the standalone OpenAPI surface clusters into the 5 declared tags."""

from __future__ import annotations

from fastapi import FastAPI

from idun_agent_engine.integrations.discord.handler import router as discord_router
from idun_agent_engine.integrations.google_chat.handler import (
    router as google_chat_router,
)
from idun_agent_engine.integrations.slack.handler import router as slack_router
from idun_agent_engine.integrations.teams.handler import router as teams_router
from idun_agent_engine.integrations.whatsapp.handler import router as whatsapp_router
from idun_agent_engine.server.routers.agent import agent_router as engine_agent_router
from idun_agent_engine.server.routers.base import base_router as engine_base_router
from idun_agent_standalone import runtime_config
from idun_agent_standalone.api.v1.openapi import OPENAPI_TAGS, OPENAPI_TAG_NAMES
from idun_agent_standalone.api.v1.routers import (
    agent,
    auth,
    guardrails,
    integrations,
    mcp_servers,
    memory,
    observability,
    onboarding,
    prompts,
    sso,
    sso_info,
)


def _build_test_app() -> FastAPI:
    """Mirror of standalone include_router wiring without lifespan/DB."""
    app = FastAPI(openapi_tags=OPENAPI_TAGS)
    # Engine routes (mounted by create_engine_app in production)
    app.include_router(engine_agent_router, prefix="/agent")
    app.include_router(engine_base_router)
    # Engine chat-channel webhooks (each mounted by integration.attach in
    # production when configured — we mount them all here so the test
    # catches tagging regressions even when no integration is enabled).
    app.include_router(discord_router, prefix="/integrations/discord")
    app.include_router(google_chat_router, prefix="/integrations/google-chat")
    app.include_router(slack_router, prefix="/integrations/slack")
    app.include_router(teams_router, prefix="/integrations/teams")
    app.include_router(whatsapp_router, prefix="/integrations/whatsapp")
    # Standalone admin + public routes
    app.include_router(agent.router)
    app.include_router(auth.router)
    app.include_router(guardrails.router)
    app.include_router(integrations.router)
    app.include_router(mcp_servers.router)
    app.include_router(memory.router)
    app.include_router(observability.router)
    app.include_router(onboarding.router)
    app.include_router(prompts.router)
    app.include_router(sso.router)
    app.include_router(sso_info.router)
    app.include_router(runtime_config.router)
    return app


def test_openapi_tags_metadata_exposed() -> None:
    """The /docs page sees the 5 declared groups in declared order."""
    app = _build_test_app()
    schema = app.openapi()
    assert schema["tags"] == [
        {"name": t["name"], "description": t["description"]} for t in OPENAPI_TAGS
    ]


def test_no_orphan_operations() -> None:
    """Every operation must belong to one of the 5 declared tags."""
    app = _build_test_app()
    schema = app.openapi()
    seen_unknown: dict[str, list[str]] = {}
    for path, methods in schema["paths"].items():
        for method, op in methods.items():
            tags = op.get("tags") or []
            unknown = [t for t in tags if t not in OPENAPI_TAG_NAMES]
            if unknown or not tags:
                seen_unknown.setdefault(f"{method.upper()} {path}", []).extend(
                    unknown if unknown else ["<no tag>"]
                )
    assert not seen_unknown, (
        f"Operations with unknown or missing tags: {seen_unknown}"
    )


def test_every_tag_has_at_least_one_operation() -> None:
    """No declared tag should orphan a whole bundle."""
    app = _build_test_app()
    schema = app.openapi()
    used: set[str] = set()
    for methods in schema["paths"].values():
        for op in methods.values():
            used.update(op.get("tags") or [])
    missing = OPENAPI_TAG_NAMES - used
    assert not missing, f"Tags declared in OPENAPI_TAGS but unused: {missing}"
```

- [ ] **Step 2: Run the test**

Run: `uv run pytest libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py -v`

Expected: 3 tests PASS. If any fail, the failure message names the offending operation/tag — fix the source router or `OPENAPI_TAGS` accordingly.

If `test_no_orphan_operations` fails on a route you didn't anticipate, audit it: either tag it, or set `include_in_schema=False` on the route (e.g. internal redirects).

- [ ] **Step 3: Run the full standalone test suite to confirm no regressions**

Run: `uv run pytest libs/idun_agent_standalone/tests/ -q`

Expected: all tests pass. Existing route tests are unaffected by metadata-only changes.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py
git commit -m "test(standalone): assert OpenAPI tag bundles are coherent"
```

---

## Task 6: Frontend — Mount `HeaderActions` in MinimalLayout

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/MinimalLayout.tsx`

`MinimalLayout` currently renders only `<Logo>` in its header. Add `<HeaderActions>` to the right of the logo, convert the flex container to `justify-between`, update the docstring.

- [ ] **Step 1: Open the file and locate the header**

Read `services/idun_agent_standalone_ui/components/chat/MinimalLayout.tsx`. The header block (around the top of the returned JSX) looks like:

```tsx
<header className="border-b border-border">
  <div className="mx-auto flex max-w-[720px] items-center px-6 py-3">
    <Logo theme={theme} />
  </div>
</header>
```

- [ ] **Step 2: Add the import**

At the top of the file, add to the import block:

```tsx
import { HeaderActions } from "./HeaderActions";
```

(Alphabetical position between `ChatInput` and `MessageView`.)

- [ ] **Step 3: Replace the header**

Replace the header block above with:

```tsx
<header className="border-b border-border">
  <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3 px-6 py-3">
    <Logo theme={theme} />
    <HeaderActions threadId={threadId} />
  </div>
</header>
```

(`onNewSession` is intentionally omitted — `HeaderActions` falls back to a URL-based new-session push, which is correct for embed contexts.)

- [ ] **Step 4: Update the docstring**

Find the JSDoc above `export function MinimalLayout(...)`:

Before:
```tsx
/**
 * Embedded chat layout (D5 in the MVP spec).
 *
 * Single column, no sidebar, no halo around the welcome state, and a
 * pared-down header that only shows the logo+appName — appropriate for
 * embed contexts where the host page handles "New conversation" and
 * sign-out concerns. Reuses the same building blocks as `BrandedLayout`
 * (`MessageView`, `ChatInput`) so theme tokens and behaviour stay aligned.
 */
```

After:
```tsx
/**
 * Embedded chat layout (D5 in the MVP spec).
 *
 * Single column, no sidebar, no halo around the welcome state. The
 * header carries the logo+appName plus the shared `HeaderActions`
 * pills (Admin link, sign-out when applicable) so operators can
 * always reach the back-office. Reuses the same building blocks as
 * `BrandedLayout` (`MessageView`, `ChatInput`) so theme tokens and
 * behaviour stay aligned.
 */
```

- [ ] **Step 5: Lint check**

Run: `cd services/idun_agent_standalone_ui && pnpm lint -- components/chat/MinimalLayout.tsx`

Expected: no lint errors.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/components/chat/MinimalLayout.tsx
git commit -m "feat(ui): show admin link in MinimalLayout header"
```

---

## Task 7: Frontend — Show header on BrandedLayout's empty/welcome state

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx`

In `BrandedLayout`, the `empty ?` branch replaces the entire header with `<WelcomeHero>`, hiding the Admin pill until the first message. Add a stripped header above the hero.

- [ ] **Step 1: Locate the empty branch**

Open `services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx`. Find the JSX block that begins with `{empty ? (` (around line 105). The current structure:

```tsx
{empty ? (
  <>
    <div className="absolute top-4 left-4 z-20 md:hidden">
      <HamburgerButton onClick={() => setDrawerOpen(true)} />
    </div>
    <WelcomeHero
      onSend={send}
      streaming={status === "streaming"}
      onStop={stop}
    />
  </>
) : (
  /* unchanged conversation branch with full header */
)}
```

- [ ] **Step 2: Replace the empty branch**

Replace the entire `{empty ? (...)` block with:

```tsx
{empty ? (
  <>
    <header className="relative z-10">
      <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <HamburgerButton onClick={() => setDrawerOpen(true)} />
          <Logo theme={theme} />
        </div>
        <HeaderActions
          threadId={threadId}
          onNewSession={newConversation}
        />
      </div>
    </header>
    <WelcomeHero
      onSend={send}
      streaming={status === "streaming"}
      onStop={stop}
    />
  </>
) : (
  /* conversation branch unchanged */
```

The mobile `HamburgerButton` moves out of its absolute-positioned overlay into the inline flex flow alongside `<Logo>`, mirroring the conversation-state header. No `hairline` divider on welcome — keeps the visual quiet.

- [ ] **Step 3: Lint check**

Run: `cd services/idun_agent_standalone_ui && pnpm lint -- components/chat/BrandedLayout.tsx`

Expected: no lint errors.

- [ ] **Step 4: Visual smoke (manual)**

Boot the standalone, open `/`, confirm:
1. Welcome state shows logo on left, Admin pill on right, no horizontal hairline.
2. After sending a message, conversation state still renders correctly with hairline.

If you cannot boot the full standalone in this session, defer to Task 11.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx
git commit -m "feat(ui): show admin link on BrandedLayout welcome state"
```

---

## Task 8: Frontend — Developer sidebar group with `/docs` and `/redoc`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`

Extend the sidebar's `NavItem` type to support external links, render them with `<a target="_blank">` and an `ExternalLink` icon, and add a Developer group below System.

- [ ] **Step 1: Extend the icon imports**

At the top of `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`, the existing `lucide-react` import block is one big `import { Activity, ArrowLeft, ... } from "lucide-react"` block. Add `BookOpen`, `Code2`, and `ExternalLink` to it (alphabetical):

Before (excerpt — partial list):
```tsx
import {
  Activity,
  ArrowLeft,
  Cog,
  Database,
  Eye,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plug,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
```

After:
```tsx
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Code2,
  Cog,
  Database,
  ExternalLink,
  Eye,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plug,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
```

- [ ] **Step 2: Extend the `NavItem` type**

Find the `NavItem` type definition (around line 40):

Before:
```tsx
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
```

After:
```tsx
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};
```

- [ ] **Step 3: Add the Developer group**

Find the `NAV` array. After the `System` entry (which currently has only `Settings`), append a new group:

Before:
```tsx
const NAV: NavGroup[] = [
  // ... Overview, Agent groups ...
  {
    label: "System",
    items: [
      { href: "/admin/settings/", label: "Settings", icon: SettingsIcon },
    ],
  },
];
```

After:
```tsx
const NAV: NavGroup[] = [
  // ... Overview, Agent groups ...
  {
    label: "System",
    items: [
      { href: "/admin/settings/", label: "Settings", icon: SettingsIcon },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/docs", label: "API Docs (Swagger)", icon: Code2, external: true },
      { href: "/redoc", label: "API Reference", icon: BookOpen, external: true },
    ],
  },
];
```

- [ ] **Step 4: Render external entries**

Find the `group.items.map((item) => ( ... ))` block inside `<SidebarMenu>` (around line 130). The current rendering wraps the link with `<Link href={item.href}>`. Update it to fork on `item.external`:

Before:
```tsx
<SidebarMenuItem key={item.href}>
  <SidebarMenuButton
    asChild
    isActive={isActive(pathname, item.href)}
    tooltip={item.label}
    data-tour={
      item.href === "/admin/agent/"
        ? "sidebar-agent-config"
        : item.href === "/admin/observability/"
        ? "sidebar-observability"
        : undefined
    }
  >
    <Link href={item.href}>
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

After:
```tsx
<SidebarMenuItem key={item.href}>
  <SidebarMenuButton
    asChild
    isActive={item.external ? false : isActive(pathname, item.href)}
    tooltip={item.label}
    data-tour={
      item.href === "/admin/agent/"
        ? "sidebar-agent-config"
        : item.href === "/admin/observability/"
        ? "sidebar-observability"
        : undefined
    }
  >
    {item.external ? (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <item.icon className="h-4 w-4" />
        <span>{item.label}</span>
        <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
      </a>
    ) : (
      <Link href={item.href}>
        <item.icon className="h-4 w-4" />
        <span>{item.label}</span>
      </Link>
    )}
  </SidebarMenuButton>
</SidebarMenuItem>
```

- [ ] **Step 5: Lint check**

Run: `cd services/idun_agent_standalone_ui && pnpm lint -- components/admin/AppSidebar.tsx`

Expected: no lint errors.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx
git commit -m "feat(ui): add Developer sidebar group linking to /docs and /redoc"
```

---

## Task 9: Frontend — Playwright spec for chat layouts

**Files:**
- Modify: `services/idun_agent_standalone_ui/e2e/chat.spec.ts`

Add one parameterized test that asserts the Admin link is visible in welcome and conversation states across all 3 layouts.

- [ ] **Step 1: Read the existing spec for layout-injection patterns**

Run: `head -80 services/idun_agent_standalone_ui/e2e/chat.spec.ts`

Note the existing helpers — particularly how `runtime_config.layout` is mocked or set, and the existing send-message helper. Reuse those.

If the existing spec hard-codes `branded` and there's no parametrization scaffold, you may need to introduce one. The Playwright fixtures in `services/idun_agent_standalone_ui/e2e/boot-standalone.sh` and the `playwright.config.ts` projects are the source of truth — do not invent new layout-injection mechanisms.

- [ ] **Step 2: Add the new test**

Append to `services/idun_agent_standalone_ui/e2e/chat.spec.ts`:

```ts
test.describe("admin link discoverability", () => {
  for (const layout of ["branded", "minimal", "inspector"] as const) {
    test(`admin link visible on welcome and conversation in ${layout} layout`, async ({
      page,
    }) => {
      // Inject layout via the existing runtime-config mock helper — replace
      // `setLayout` with whatever the spec already uses (look at other tests).
      await setLayout(page, layout);

      await page.goto("/");

      // Welcome state — no messages yet.
      await expect(
        page.getByRole("link", { name: "Admin" }),
      ).toBeVisible();

      // Send a message and wait for the conversation state to render.
      // Reuse the existing chat-send helper — replace `sendChatMessage`
      // with whatever's already exported in this spec.
      await sendChatMessage(page, "hello");
      await expect(page.locator("[data-testid='message']").first()).toBeVisible();

      // Conversation state — link still visible.
      await expect(
        page.getByRole("link", { name: "Admin" }),
      ).toBeVisible();
    });
  }
});
```

If `setLayout` and `sendChatMessage` don't already exist in the spec, replace them with the actual local helpers (the engineer reading the existing spec will see what's used). Do not import from outside the e2e directory.

- [ ] **Step 3: Run the spec locally (or document inability)**

Run: `cd services/idun_agent_standalone_ui && pnpm playwright test chat.spec.ts -g "admin link discoverability"`

Expected: 3 tests PASS (one per layout).

If the dev infrastructure isn't available in this session (no DB, no agent fixture), document that the test was written but unverified, and defer execution to Task 11.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e/chat.spec.ts
git commit -m "test(e2e): assert admin link visible in all 3 chat layouts"
```

---

## Task 10: Frontend — Playwright spec for the Developer sidebar group

**Files:**
- Create: `services/idun_agent_standalone_ui/e2e/admin-developer-group.spec.ts`

- [ ] **Step 1: Write the spec**

Write `services/idun_agent_standalone_ui/e2e/admin-developer-group.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("admin sidebar — Developer group", () => {
  test("renders /docs and /redoc external links", async ({ page }) => {
    await page.goto("/admin/");

    // Group label
    const developerGroup = page.locator('text=Developer').first();
    await expect(developerGroup).toBeVisible();

    // Swagger entry
    const swagger = page.getByRole("link", { name: /API Docs \(Swagger\)/ });
    await expect(swagger).toBeVisible();
    await expect(swagger).toHaveAttribute("href", "/docs");
    await expect(swagger).toHaveAttribute("target", "_blank");
    await expect(swagger).toHaveAttribute("rel", /noopener/);

    // ReDoc entry
    const redoc = page.getByRole("link", { name: /API Reference/ });
    await expect(redoc).toBeVisible();
    await expect(redoc).toHaveAttribute("href", "/redoc");
    await expect(redoc).toHaveAttribute("target", "_blank");
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `cd services/idun_agent_standalone_ui && pnpm playwright test admin-developer-group.spec.ts`

Expected: 1 test PASS.

If admin auth gates `/admin/`, the existing chat.spec.ts auth-bootstrap helper is the model — reuse it. Look at how other admin specs (if any) handle auth in `e2e/`.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e/admin-developer-group.spec.ts
git commit -m "test(e2e): Developer sidebar group renders /docs and /redoc"
```

---

## Task 11: End-to-end smoke + lint sweep + push

- [ ] **Step 1: Lint all touched code**

Run: `make lint` (Python) and `cd services/idun_agent_standalone_ui && pnpm lint` (TS).

Expected: clean.

- [ ] **Step 2: Run the full Python test suite**

Run: `make test`

Expected: all tests pass.

- [ ] **Step 3: Manual smoke (skip if not bootable in this environment)**

Boot the standalone:
```bash
make dev
idun init --no-browser
```

Then in a browser:

1. Visit `/` (chat). Switch through all 3 layouts via runtime-config injection (see `services/idun_agent_standalone_ui/lib/runtime-config.ts` for how layout is read). Confirm Admin pill on welcome and conversation states.
2. Visit `/admin/`. Confirm Developer group below System with both entries. Click each — opens in new tab to `/docs` and `/redoc`.
3. On `/docs` confirm 5 tag groups in this order: **Runtime**, **Agent Configuration**, **Auth & SSO**, **Integrations & Tools**, **Observability**. Each group has at least one operation.
4. On `/redoc` confirm same grouping.

- [ ] **Step 4: Push**

```bash
git push -u origin feat/admin-discoverability
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --base develop --title "feat: admin discoverability — chat→admin pill in all layouts, Developer sidebar group, OpenAPI tag bundling" --body "$(cat <<'EOF'
## Summary
- show the chat-header Admin pill in MinimalLayout and on BrandedLayout's empty/welcome state
- add a Developer sidebar group in /admin/ with API Docs (Swagger) + API Reference (ReDoc) external links
- bundle OpenAPI tags into 5 domain groups (Runtime, Agent Configuration, Auth & SSO, Integrations & Tools, Observability), set openapi_tags metadata on the standalone app, and move engine include_router tag overrides to router-level so tagging has a single source of truth

Spec: `docs/docs/superpowers/specs/2026-05-08-admin-discoverability-design.md`
Plan: `docs/docs/superpowers/plans/2026-05-08-admin-discoverability.md`

## Test plan
- [ ] `uv run pytest libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py -v` (3 tests pass)
- [ ] `make test` clean
- [ ] `cd services/idun_agent_standalone_ui && pnpm playwright test chat.spec.ts -g "admin link discoverability"` (3 layouts pass)
- [ ] `cd services/idun_agent_standalone_ui && pnpm playwright test admin-developer-group.spec.ts` (1 test pass)
- [ ] manual `/docs` smoke: 5 tag groups in declared order

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run before declaring done)

- [ ] Every router file in the spec's tag table is in the modified-files list above.
- [ ] `engine/server/routers/agent.py:507` deprecated `/agent/invoke` route — `tags=` removed, `deprecated=True` kept.
- [ ] `app.openapi_tags = OPENAPI_TAGS` placed before any `app.include_router(...)` call in `app.py` (display order discipline).
- [ ] `git grep 'tags=\["admin"\]\|tags=\["sso"\]\|tags=\["runtime-config"\]'` returns empty.
- [ ] `git grep -nE 'tags=\["(Discord|Slack|Teams|WhatsApp|Google[ _]?Chat|Agent|Base)"\]' libs/` returns empty.
- [ ] `_build_test_app()` in the openapi test mounts every router that ships in `create_standalone_app(...)` (cross-check against `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` include_router block).
- [ ] No new TypeScript `any`. Lint clean on all 3 touched `.tsx` files.
- [ ] Playwright specs reuse existing fixtures rather than inventing new ones.
