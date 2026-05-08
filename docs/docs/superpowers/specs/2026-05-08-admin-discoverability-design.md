# Admin discoverability — design

**Date:** 2026-05-08
**Status:** Approved (brainstorm complete)
**Branch:** `feat/admin-discoverability` (off `origin/develop`)
**PR shape:** single PR (frontend + backend)
**Roadmap items addressed:** T2 "Admin button on chat page" (#9) · T1 Swagger polish sub-items 1 ("tags + grouping") and 3 ("admin UI button to access Swagger")

## Goal

Make the admin surface and the OpenAPI docs discoverable to operators without requiring them to know the URLs. Today, reaching `/admin/` from chat requires typing the path; reaching `/docs` or `/redoc` requires knowing FastAPI conventions. Both are public-by-default but invisible from the UI in some states.

This change adds three nudges:

1. **Chat → Admin pill** visible in every chat layout in every state (welcome and conversation).
2. **Developer sidebar group** in `/admin/` exposing Swagger UI and ReDoc links.
3. **OpenAPI tag bundling** so `/docs` clusters routes by domain instead of one flat `admin` bucket.

Out of scope: response examples on endpoints, OpenAPI security schemes, auth-gating `/docs` in prod, API versioning harmonization. (See "Deferred" below.)

## Current state

### Chat → Admin link

`HeaderActions` (`services/idun_agent_standalone_ui/components/chat/HeaderActions.tsx`) already renders an "Admin" pill linking to `/admin/`. It is wired into `BrandedLayout` and `InspectorLayout`. Two gaps remain:

- **MinimalLayout does not render `HeaderActions` at all.** Its docstring justifies this with "appropriate for embed contexts where the host page handles 'New conversation' and sign-out concerns." Decision: override that intent — add the pill unconditionally, update the docstring.
- **BrandedLayout's empty/welcome branch replaces the entire header with `<WelcomeHero>`.** The Admin pill is therefore invisible until the user sends the first message. Decision: render a stripped header above `<WelcomeHero>` showing `<Logo>` and `<HeaderActions>`.

`InspectorLayout` already shows the header in both states; no change needed.

### Admin sidebar

`AppSidebar` (`services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`) currently has 3 groups: Overview, Agent, System. System contains only "Settings". No entry points to `/docs` or `/redoc`.

### OpenAPI tags

10 standalone admin-prefixed routers (`/admin/api/v1/...`) all use `tags=["admin"]`: `agent`, `auth`, `guardrails`, `integrations`, `mcp_servers`, `memory`, `observability`, `onboarding`, `prompts`, `sso`. `sso_info.py` uses `tags=["sso"]`. `runtime_config.py` uses `tags=["runtime-config"]`. Engine `agent_router` uses `tags=["Agent"]`; engine `base_router` uses `tags=["Base"]`. Engine integration webhooks (Discord, Teams, WhatsApp) use brand-named tags; Slack and Google Chat are untagged. Net result: `/docs` is a confusing wall of `admin` operations with a few brand-tagged outliers.

## Design

### Frontend changes

Three files touched.

#### `MinimalLayout.tsx`

Add `<HeaderActions threadId={threadId} onNewSession={…} />` to the right of `<Logo>` in the existing `<header>`. Keep `max-w-[720px]` and the existing flex container; convert `flex items-center` to `flex items-center justify-between`. Update the docstring to remove the "embed-context" carve-out and note that the Admin pill is shown unconditionally.

`onNewSession` does not currently exist in MinimalLayout's surface — the layout has no "New conversation" affordance today. Pass it through using the same `useChat` hook pattern as the other layouts, or omit and rely on `HeaderActions`'s default URL-based new-session fallback. Default: omit; the URL-push fallback is sufficient for embed contexts.

#### `BrandedLayout.tsx`

In the `empty ?` branch, render a compact header above `<WelcomeHero>`:

```tsx
{empty ? (
  <>
    <header className="relative z-10">
      <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <HamburgerButton onClick={() => setDrawerOpen(true)} />
          <Logo theme={theme} />
        </div>
        <HeaderActions threadId={threadId} onNewSession={newConversation} />
      </div>
    </header>
    <WelcomeHero
      onSend={send}
      streaming={status === "streaming"}
      onStop={stop}
    />
  </>
) : ( /* unchanged */ )}
```

No `hairline` divider on welcome state — keep it visually quiet. The mobile `HamburgerButton` moves from its absolute-positioned overlay (`absolute top-4 left-4`) into the header flow alongside the logo, matching the conversation-state header.

#### `AppSidebar.tsx`

Extend `NavItem` with optional `external?: boolean`:

```ts
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};
```

Append a new `NavGroup` after `System`:

```ts
{
  label: "Developer",
  items: [
    { href: "/docs",  label: "API Docs (Swagger)", icon: Code2,    external: true },
    { href: "/redoc", label: "API Reference",      icon: BookOpen, external: true },
  ],
}
```

Render branch: when `external`, use `<a href={…} target="_blank" rel="noopener noreferrer">` instead of `<Link>`, append `<ExternalLink className="ml-auto h-3 w-3 opacity-60" />` after the label, and skip the `isActive` check entirely (external links never match the route).

Icon imports: `Code2`, `BookOpen`, `ExternalLink` from `lucide-react` (already present).

### Backend changes

Two concerns: per-router tag rewrites, and a new `openapi_tags` metadata array.

#### Tag mapping (final)

| Router | Module | New tag |
|---|---|---|
| `agent.py` (admin) | `idun_agent_standalone.api.v1.routers.agent` | `Agent Configuration` |
| `prompts.py` | `…routers.prompts` | `Agent Configuration` |
| `memory.py` | `…routers.memory` | `Agent Configuration` |
| `guardrails.py` | `…routers.guardrails` | `Agent Configuration` |
| `onboarding.py` | `…routers.onboarding` | `Agent Configuration` |
| `auth.py` | `…routers.auth` | `Auth & SSO` |
| `sso.py` | `…routers.sso` | `Auth & SSO` |
| `sso_info.py` | `…routers.sso_info` | `Auth & SSO` |
| `mcp_servers.py` | `…routers.mcp_servers` | `Integrations & Tools` |
| `integrations.py` | `…routers.integrations` | `Integrations & Tools` |
| `observability.py` | `…routers.observability` | `Observability` |
| `runtime_config.py` | `idun_agent_standalone.runtime_config` (serves `/runtime-config.js` to bootstrap the SPA) | `Runtime` |
| engine `agent_router` | `idun_agent_engine.server.routers.agent` | `Runtime` (router-level; remove the per-route `tags=["Agent"]` override on the deprecated `/agent/invoke` route — `deprecated=True` stays) |
| engine `base_router` | `idun_agent_engine.server.routers.base` | `Runtime` |
| engine integrations | `idun_agent_engine.integrations.*` (Discord, Slack, Teams, Google Chat, WhatsApp) | `Runtime` |

Per-router tags are set at `APIRouter(prefix=…, tags=[…])` for the standalone admin routers. Engine routers are tagged at `app.include_router(…, tags=[…])` in `idun_agent_engine.core.app_factory.py:178-179` (and at the equivalent integration `app.include_router` calls).

#### `openapi_tags` metadata

New module `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/openapi.py`:

```python
"""OpenAPI tag metadata for the standalone runtime.

Drives the section ordering and per-section descriptions shown in
``/docs`` (Swagger UI) and ``/redoc``. Wired in
``idun_agent_standalone.app.create_standalone_app`` immediately after
the engine app is constructed, so the engine API surface stays
unchanged across embedders.
"""

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
```

Wired in `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`:

```python
app = await create_engine_app(...)
app.openapi_tags = OPENAPI_TAGS
# ... existing include_router calls ...
```

Tag display order in Swagger follows array order — Runtime first (the public surface), then admin domains alphabetically by importance.

**Why post-construction mutation, not a `create_engine_app` argument:** keeps the engine `create_app(...)` signature unchanged. Standalone owns the standalone-shaped grouping; other engine embedders are free to set their own.

## Testing

### Frontend (Playwright)

Extend `services/idun_agent_standalone_ui/e2e/chat.spec.ts` with one new test:

```
"admin link visible on welcome state and during conversation in all 3 layouts"
```

Iterate over `branded`, `minimal`, `inspector` via `runtime_config.layout` injection (existing helper). For each:

1. Navigate to `/`, assert `getByRole('link', { name: 'Admin' })` is visible (welcome state).
2. Send a message via the existing chat fixture, wait for streaming to settle.
3. Assert the same link is still visible (conversation state).

Sidebar coverage as a new spec file `services/idun_agent_standalone_ui/e2e/admin-developer-group.spec.ts`: visit `/admin/`, assert "Developer" group renders below "System", and that both `API Docs (Swagger)` and `API Reference` entries exist with `target="_blank"` and the correct `href`. No /docs page navigation needed — FastAPI's docs rendering is upstream-tested.

### Backend (pytest)

New test file `libs/idun_agent_standalone/tests/unit/api/test_openapi_tags.py`:

1. **Tag metadata round-trip.** Build the standalone app, hit `app.openapi()`, assert `tags` array equals `OPENAPI_TAGS` ordering and content.
2. **No orphan operations.** Walk every operation in `app.openapi()["paths"]`. Assert each has at least one `tags` entry, and every entry is one of the 5 names. Catches a future router addition that forgets `tags=`.
3. **Tag distribution.** Assert each of the 5 tags has ≥1 operation. Catches a typo that orphans a whole bundle.

Existing route tests unchanged — tags are metadata; behavior is untouched.

### Manual smoke

1. `make dev`, visit `/`, switch through 3 layouts via `runtime_config.layout`, confirm Admin pill visible in welcome + conversation states for all 3.
2. Visit `/admin/`, confirm "Developer" group below "System", both entries open in new tab.
3. Visit `/docs`, confirm 5 tag groups in declared order, each with the expected operation list.
4. Visit `/redoc`, confirm same grouping.

## Risk & rollout

**Risk surface:**

- Tag renames are Swagger-UX-only. Auto-generated OpenAPI clients key on operation IDs (or method+path), not tags. No client-side breakage.
- BrandedLayout welcome-state header steals vertical space from `<WelcomeHero>`. Mitigation: keep header padding tight (`pt-6 pb-4`), let `<WelcomeHero>` flex-1 below.
- MinimalLayout's docstring carve-out for "embed contexts" needs to be deleted, not contradicted.
- The deprecated `/agent/invoke` route loses its per-route `tags=["Agent"]` override. The route stays `deprecated=True`. No functional change.

**Rollout:** single PR. One reviewer. ~30-min review. No migration. No env-flag toggle. No backwards-compat shim.

## Deferred

Out of scope for this spec; tracked elsewhere.

- **Response examples** (`@router.get(..., responses={...})`) on public endpoints. T1 Swagger polish sub-item 2 (~½ day).
- **OpenAPI security schemes.** Sequenced after SSO+Auth surface stabilizes.
- **`/docs` and `/redoc` auth-gating in production.** Open question; current behavior is public, accepted for v1.
- **API versioning harmonization.** Admin lives at `/api/v1/...`, engine routes are unversioned. Separate scope.
- **Mobile responsive polish** for the welcome-state header on Branded. The current pill width is constrained; if mobile collisions appear, add a follow-up.

## Decision log

- **Tag bundling (5 groups):** picked over per-router (10-12 tags) for scannability. Decided 2026-05-08.
- **Engine `base_router` and chat-channel webhooks fold into `Runtime`:** picked over separate "Engine Operations" / "Chat Channels" tags to keep the bundle count at 5. Decided 2026-05-08.
- **Branch off develop, not stack on `chore/cli-telemetry-port`:** PR #573 (telemetry) is mid-review; clean separation avoids coupling. Decided 2026-05-08.
- **One PR, not split:** all 3 changes are small enough to review together. Decided 2026-05-08.
- **Both `/docs` and `/redoc` in sidebar:** users may prefer one or the other; offering both is one extra row. Decided 2026-05-08.
- **`/docs` stays public:** existing behavior, deferred gating to a future SSO-coupled change. Decided 2026-05-08.
