# Config UX Bundle A — Status & Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface runtime state via a new admin route, route backend `field_errors` into form fields with a shared helper, show the running engine version, and add a shell-level banner when the last reload failed.

**Architecture:** Add one backend GET route reusing the existing `StandaloneRuntimeReload` schema and `runtime_state.get()` helper. On the frontend, extend `ApiError` to expose pre-parsed `fieldErrors`, add a thin `applyFieldErrors` helper that calls react-hook-form's `setError`, mount a `<ReloadFailedBanner>` in the admin layout that polls `/admin/api/v1/runtime/status` every 60s via TanStack Query, and add a runtime-status card + engine version chip on `/admin/agent`.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, pytest, Next.js 15 App Router, react-hook-form, TanStack Query, vitest, shadcn/ui (Card, Alert, Badge), Lucide icons.

**Branch:** `feat/config-ux-status-errors` opens against `feat/config-ux`.

**Spec:** `docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` (Bundle A section).

---

## File structure

**Backend (Python):**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/runtime.py` — new admin router
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` — include the router under `admin_auth`
- Create: `libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py` — unit-style happy/empty cases via FastAPI test client
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/test_runtime_route.py` — integration: DB row updates → next GET reflects it

**Frontend api layer (TypeScript):**
- Modify: `services/idun_agent_standalone_ui/lib/api/client.ts` — extend `ApiError` with `fieldErrors: FieldError[]`, parse at throw site
- Create: `services/idun_agent_standalone_ui/lib/api/form-errors.ts` — `applyFieldErrors(form, error, pathMap?)`
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts` — add `api.getRuntimeStatus()`
- Create: `services/idun_agent_standalone_ui/__tests__/api/form-errors.test.ts`
- Modify: `services/idun_agent_standalone_ui/__tests__/api/client.test.ts` — assert `fieldErrors` is parsed

**Frontend components:**
- Create: `services/idun_agent_standalone_ui/components/admin/ReloadFailedBanner.tsx`
- Create: `services/idun_agent_standalone_ui/components/admin/RuntimeStatusCard.tsx`
- Create: `services/idun_agent_standalone_ui/__tests__/reload-failed-banner.test.tsx`
- Modify: `services/idun_agent_standalone_ui/app/admin/layout.tsx` — mount the banner once
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx` — engine version chip in header, `<RuntimeStatusCard>` after the Connection card, `applyFieldErrors` wired into the patchAgent mutation's `onError`

---

## Task 1: Backend route returns the persisted reload row

**Files:**
- Create: `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/runtime.py`
- Test: `libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py`

- [ ] **Step 1: Write the failing test**

```python
# libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py
"""Unit tests for /admin/api/v1/runtime/status."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.standalone import StandaloneReloadStatus

from idun_agent_standalone.services import runtime_state


@pytest.mark.asyncio
async def test_returns_404_when_no_row(unconfigured_app, sessionmaker):
    transport = ASGITransport(app=unconfigured_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/runtime/status")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_returns_persisted_reload_row(unconfigured_app, sessionmaker):
    async with sessionmaker() as session:
        await runtime_state.record_reload_outcome(
            session,
            status=StandaloneReloadStatus.RELOAD_FAILED,
            message="Engine reload failed; config not saved.",
            error="ImportError: no module named 'app'",
            config_hash=None,
            reloaded_at=datetime(2026, 5, 5, 12, 0, tzinfo=UTC),
        )
        await session.commit()

    transport = ASGITransport(app=unconfigured_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/runtime/status")

    assert response.status_code == 200
    body = response.json()
    assert body["lastStatus"] == "reload_failed"
    assert body["lastMessage"] == "Engine reload failed; config not saved."
    assert body["lastError"].startswith("ImportError")
    assert body["lastReloadedAt"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py -v
```

Expected: 2 failures (one with 404, one with `404` instead of `200` because the route doesn't exist yet).

- [ ] **Step 3: Implement the router**

```python
# libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/runtime.py
"""``/admin/api/v1/runtime/status`` router.

Read-only operator-facing endpoint exposing the singleton
``runtime_state`` row. Returns the existing
``StandaloneRuntimeReload`` schema (lastStatus / lastMessage /
lastError / lastReloadedAt). 404 when no row exists yet — fresh
install, no reload has been attempted.

The UI polls this every 60s to drive the shell-level
ReloadFailedBanner and the per-page RuntimeStatusCard.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneReloadStatus,
)
from idun_agent_schema.standalone.runtime_status import StandaloneRuntimeReload

from idun_agent_standalone.api.v1.deps import SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.services import runtime_state

router = APIRouter(prefix="/admin/api/v1/runtime", tags=["admin"])

logger = get_logger(__name__)


@router.get("/status", response_model=StandaloneRuntimeReload)
async def get_runtime_status(session: SessionDep) -> StandaloneRuntimeReload:
    """Return the singleton runtime_state row as a reload-outcome payload.

    404 when no row exists yet (fresh install, no save attempted).
    """
    row = await runtime_state.get(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No reload outcome recorded yet.",
            ),
        )
    last_status = (
        StandaloneReloadStatus(row.last_status) if row.last_status else None
    )
    return StandaloneRuntimeReload(
        last_status=last_status,
        last_message=row.last_message,
        last_error=row.last_error,
        last_reloaded_at=row.last_reloaded_at,
    )
```

- [ ] **Step 4: Wire the router into the app**

Open `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` and add the import + include lines around the existing router includes (~line 235).

Add the import alongside the others (after the `prompts` import block):

```python
from idun_agent_standalone.api.v1.routers.runtime import (
    router as runtime_router,
)
```

Add the include line after `app.include_router(integrations_router, dependencies=admin_auth)`:

```python
    app.include_router(runtime_router, dependencies=admin_auth)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py -v
```

Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/runtime.py \
        libs/idun_agent_standalone/src/idun_agent_standalone/app.py \
        libs/idun_agent_standalone/tests/unit/api/v1/routers/test_runtime.py
git commit -m "feat(standalone): GET /admin/api/v1/runtime/status route"
```

---

## Task 2: Integration test — bad save round-trips into the row

**Files:**
- Create: `libs/idun_agent_standalone/tests/integration/api/v1/test_runtime_route.py`

- [ ] **Step 1: Write the failing test**

```python
# libs/idun_agent_standalone/tests/integration/api/v1/test_runtime_route.py
"""Integration test: bad save → runtime_state row updates → GET reflects it."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_failed_reload_surfaces_in_runtime_status(
    standalone_app_with_failing_reload,
):
    """A round-3 failure must show up on the runtime/status endpoint."""
    transport = ASGITransport(app=standalone_app_with_failing_reload)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger a save that the failing reload_callable rejects.
        save_response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "trigger-failure"},
        )
        assert save_response.status_code == 500

        # Read the runtime status — the row should now reflect the failure.
        status_response = await client.get("/admin/api/v1/runtime/status")
    assert status_response.status_code == 200
    body = status_response.json()
    assert body["lastStatus"] == "reload_failed"
    assert body["lastMessage"].startswith("Engine reload failed")
    assert body["lastError"] is not None
```

The fixture `standalone_app_with_failing_reload` mirrors the existing test pattern (see `tests/integration/api/v1/conftest.py` for `standalone` fixture). It composes a standalone app with `reload_callable` set to a function that always raises `ReloadInitFailed`.

- [ ] **Step 2: Add the fixture to the integration conftest**

Open `libs/idun_agent_standalone/tests/integration/api/v1/conftest.py` and add the new fixture next to the existing `standalone` fixture. Use the exact pattern that fixture uses for app composition.

```python
@pytest_asyncio.fixture
async def standalone_app_with_failing_reload(
    standalone_settings,
    sessionmaker,
):
    """Variant of `standalone` whose reload callable always fails.

    Used to drive a real round-3 failure end-to-end so we can assert
    the runtime_state row is updated and surfaced via /runtime/status.
    """
    from idun_agent_standalone.services.reload import ReloadInitFailed

    async def failing_reload(_engine_config) -> None:
        raise ReloadInitFailed("simulated engine init failure")

    app = await create_standalone_app(standalone_settings)
    app.state.sessionmaker = sessionmaker
    app.state.reload_callable = failing_reload
    return app
```

- [ ] **Step 3: Run the integration test**

```bash
uv run pytest libs/idun_agent_standalone/tests/integration/api/v1/test_runtime_route.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_standalone/tests/integration/api/v1/test_runtime_route.py \
        libs/idun_agent_standalone/tests/integration/api/v1/conftest.py
git commit -m "test(standalone): integration test for runtime/status round-trip"
```

---

## Task 3: Extend `ApiError` with parsed `fieldErrors`

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api/client.ts`
- Modify: `services/idun_agent_standalone_ui/__tests__/api/client.test.ts`

- [ ] **Step 1: Add a failing test asserting `fieldErrors` is exposed on ApiError**

Append to `services/idun_agent_standalone_ui/__tests__/api/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api/client";

describe("apiFetch fieldErrors parsing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("parses fieldErrors out of the admin error envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "validation_failed",
            message: "Bad config",
            fieldErrors: [
              { field: "agent.config.graphDefinition", message: "bad path", code: "invalid" },
              { field: "agent.config.name", message: "required", code: null },
            ],
          },
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    let caught: unknown = null;
    try {
      await apiFetch("/admin/api/v1/agent");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.fieldErrors).toHaveLength(2);
    expect(err.fieldErrors[0].field).toBe("agent.config.graphDefinition");
    expect(err.fieldErrors[1].code).toBeNull();
  });

  it("exposes empty fieldErrors when none present", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "internal_error", message: "boom" },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await apiFetch("/admin/api/v1/agent");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).fieldErrors).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/client.test.ts
```

Expected: 2 new test failures because `fieldErrors` doesn't exist on `ApiError`.

- [ ] **Step 3: Implement — extend ApiError and parse at throw site**

Replace the contents of `services/idun_agent_standalone_ui/lib/api/client.ts` with:

```typescript
/**
 * Low level fetch wrapper.
 *
 * - Sends the session cookie on every request.
 * - Redirects to /login/?next=<encoded path> once on 401 so the user
 *   lands back on their original page after authenticating. Skips the
 *   `?next=` round-trip when the request already came from /login.
 * - Throws ApiError on non-2xx so TanStack Query surfaces the failure.
 *   ApiError carries `fieldErrors` pre-parsed from the standard admin
 *   error envelope so consumers (forms via applyFieldErrors) don't need
 *   to traverse `error.detail.error.fieldErrors`.
 */

import type { FieldError } from "./types";

export class ApiError extends Error {
  public readonly fieldErrors: FieldError[];

  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`API ${status}`);
    this.fieldErrors = extractFieldErrors(detail);
  }
}

function extractFieldErrors(detail: unknown): FieldError[] {
  if (!detail || typeof detail !== "object") return [];
  const error = (detail as { error?: unknown }).error;
  if (!error || typeof error !== "object") return [];
  const raw = (error as { fieldErrors?: unknown }).fieldErrors;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is FieldError =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { field?: unknown }).field === "string" &&
      typeof (item as { message?: unknown }).message === "string",
  );
}

let redirected = false;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    if (window.location.pathname.startsWith("/login")) {
      throw new ApiError(401, null);
    }
    redirected = true;
    const nextPath = window.location.pathname + window.location.search;
    const next = encodeURIComponent(nextPath);
    window.location.href = `/login/?next=${next}`;
    throw new ApiError(401, null);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const j = (body: unknown) => JSON.stringify(body);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/client.test.ts
```

Expected: ALL PASS (existing 401 redirect tests + 2 new fieldErrors tests).

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/client.ts \
        services/idun_agent_standalone_ui/__tests__/api/client.test.ts
git commit -m "feat(standalone-ui): parse fieldErrors on ApiError at throw site"
```

---

## Task 4: `applyFieldErrors` helper module

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/api/form-errors.ts`
- Create: `services/idun_agent_standalone_ui/__tests__/api/form-errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// services/idun_agent_standalone_ui/__tests__/api/form-errors.test.ts
import { describe, it, expect, vi } from "vitest";
import { applyFieldErrors } from "@/lib/api/form-errors";
import { ApiError } from "@/lib/api/client";

function makeForm() {
  const setError = vi.fn();
  return { setError } as any;
}

describe("applyFieldErrors", () => {
  it("returns false for a non-ApiError", () => {
    const form = makeForm();
    expect(applyFieldErrors(form, new Error("boom"))).toBe(false);
    expect(form.setError).not.toHaveBeenCalled();
  });

  it("returns false for an ApiError with no fieldErrors", () => {
    const form = makeForm();
    const err = new ApiError(500, { error: { code: "boom", message: "x" } });
    expect(applyFieldErrors(form, err)).toBe(false);
    expect(form.setError).not.toHaveBeenCalled();
  });

  it("calls setError per FieldError using the literal field path when no map", () => {
    const form = makeForm();
    const err = new ApiError(422, {
      error: {
        code: "validation_failed",
        message: "x",
        fieldErrors: [
          { field: "name", message: "required", code: null },
          { field: "definition", message: "bad", code: "invalid" },
        ],
      },
    });
    expect(applyFieldErrors(form, err)).toBe(true);
    expect(form.setError).toHaveBeenCalledTimes(2);
    expect(form.setError).toHaveBeenCalledWith("name", {
      message: "required",
      type: "server",
    });
    expect(form.setError).toHaveBeenCalledWith("definition", {
      message: "bad",
      type: "invalid",
    });
  });

  it("translates field paths through the optional pathMap", () => {
    const form = makeForm();
    const err = new ApiError(422, {
      error: {
        code: "validation_failed",
        message: "x",
        fieldErrors: [
          { field: "agent.config.graphDefinition", message: "bad", code: null },
        ],
      },
    });
    const ok = applyFieldErrors(form, err, {
      "agent.config.graphDefinition": "definition",
    });
    expect(ok).toBe(true);
    expect(form.setError).toHaveBeenCalledWith("definition", {
      message: "bad",
      type: "server",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/form-errors.test.ts
```

Expected: 4 failures — module not found.

- [ ] **Step 3: Implement the helper**

```typescript
// services/idun_agent_standalone_ui/lib/api/form-errors.ts
/**
 * Routes backend field_errors into react-hook-form fields.
 *
 * The standalone admin contract emits 422 envelopes with a
 * `fieldErrors` array of `{ field, message, code }`. The frontend's
 * field paths sometimes differ from the backend's dotted paths
 * (e.g. backend `agent.config.graphDefinition` vs form `definition`),
 * so callers may pass an explicit pathMap.
 *
 * Returns:
 *   - `true`  if at least one field error was applied; the caller
 *             should suppress its top-level toast since the form is
 *             now showing the errors inline.
 *   - `false` if the error wasn't an ApiError, or had no fieldErrors;
 *             the caller should fall back to a generic toast.
 */

import type { UseFormReturn } from "react-hook-form";

import { ApiError } from "./client";

export function applyFieldErrors(
  form: UseFormReturn<any>,
  error: unknown,
  pathMap?: Record<string, string>,
): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.fieldErrors.length === 0) return false;
  for (const fe of error.fieldErrors) {
    const formPath = pathMap?.[fe.field] ?? fe.field;
    form.setError(formPath as any, {
      message: fe.message,
      type: fe.code ?? "server",
    });
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/form-errors.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/form-errors.ts \
        services/idun_agent_standalone_ui/__tests__/api/form-errors.test.ts
git commit -m "feat(standalone-ui): applyFieldErrors helper for react-hook-form"
```

---

## Task 5: `api.getRuntimeStatus()` typed wrapper

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts`
- Create: `services/idun_agent_standalone_ui/lib/api/types/runtime.ts`
- Modify: `services/idun_agent_standalone_ui/lib/api/types/index.ts`
- Create: `services/idun_agent_standalone_ui/__tests__/api/runtime.test.ts`

- [ ] **Step 1: Define the response type**

Create `services/idun_agent_standalone_ui/lib/api/types/runtime.ts`:

```typescript
export type ReloadStatusKind =
  | "reloaded"
  | "restart_required"
  | "reload_failed";

export type RuntimeStatus = {
  lastStatus: ReloadStatusKind | null;
  lastMessage: string | null;
  lastError: string | null;
  lastReloadedAt: string | null;  // ISO 8601
};
```

- [ ] **Step 2: Re-export the type**

Open `services/idun_agent_standalone_ui/lib/api/types/index.ts` and add:

```typescript
export type { RuntimeStatus, ReloadStatusKind } from "./runtime";
```

- [ ] **Step 3: Write the failing test**

```typescript
// services/idun_agent_standalone_ui/__tests__/api/runtime.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

describe("getRuntimeStatus", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("GETs /admin/api/v1/runtime/status and returns the typed payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          lastStatus: "reload_failed",
          lastMessage: "Engine reload failed; config not saved.",
          lastError: "ImportError: no module named 'app'",
          lastReloadedAt: "2026-05-05T12:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.getRuntimeStatus();

    expect(result.lastStatus).toBe("reload_failed");
    expect(result.lastError).toContain("ImportError");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/runtime/status");
    expect((init as RequestInit).method).toBeUndefined();
  });

  it("throws ApiError on 404 (no row yet)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "no row" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(api.getRuntimeStatus()).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/runtime.test.ts
```

Expected: 2 failures — `api.getRuntimeStatus` is not a function.

- [ ] **Step 5: Add the wrapper**

Open `services/idun_agent_standalone_ui/lib/api/index.ts` and add a new line within the `api` object literal, alongside the other admin singletons (after the `checkAgentHealth` block at the bottom):

```typescript
  // Runtime status (singleton — last reload outcome)
  getRuntimeStatus: () =>
    apiFetch<RuntimeStatus>(`${ADMIN}/runtime/status`),
```

Add the type to the imports at the top:

```typescript
  RuntimeStatus,
```

(merge into the existing destructured import block).

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/api/runtime.test.ts
```

Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/types/runtime.ts \
        services/idun_agent_standalone_ui/lib/api/types/index.ts \
        services/idun_agent_standalone_ui/lib/api/index.ts \
        services/idun_agent_standalone_ui/__tests__/api/runtime.test.ts
git commit -m "feat(standalone-ui): api.getRuntimeStatus typed wrapper"
```

---

## Task 6: `<ReloadFailedBanner>` component

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/ReloadFailedBanner.tsx`
- Create: `services/idun_agent_standalone_ui/__tests__/reload-failed-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// services/idun_agent_standalone_ui/__tests__/reload-failed-banner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ReloadFailedBanner } from "@/components/admin/ReloadFailedBanner";
import type { RuntimeStatus } from "@/lib/api/types";

function renderWithStatus(status: RuntimeStatus | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-seed the query cache so the component renders synchronously.
  queryClient.setQueryData(["runtime-status"], status);
  return render(
    <QueryClientProvider client={queryClient}>
      <ReloadFailedBanner />
    </QueryClientProvider>,
  );
}

describe("ReloadFailedBanner", () => {
  it("renders nothing when no status row exists yet", () => {
    renderWithStatus(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when last_status is reloaded", () => {
    renderWithStatus({
      lastStatus: "reloaded",
      lastMessage: "Saved and reloaded.",
      lastError: null,
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when last_status is restart_required", () => {
    renderWithStatus({
      lastStatus: "restart_required",
      lastMessage: "Saved. Restart required to apply.",
      lastError: null,
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the banner with the error when last_status is reload_failed", () => {
    renderWithStatus({
      lastStatus: "reload_failed",
      lastMessage: "Engine reload failed; config not saved.",
      lastError: "ImportError: no module named 'app'",
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/engine reload failed/i)).toBeInTheDocument();
    expect(screen.getByText(/importerror/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/reload-failed-banner.test.tsx
```

Expected: 4 failures — component not found.

- [ ] **Step 3: Implement the component**

```tsx
// services/idun_agent_standalone_ui/components/admin/ReloadFailedBanner.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError, api } from "@/lib/api";

const POLL_INTERVAL_MS = 60_000;

/**
 * Sticky shell-level banner that appears only when the last reload
 * attempt failed. Polls /admin/api/v1/runtime/status every 60s.
 *
 * Mounts in app/admin/layout.tsx so every admin page gets it without
 * each page wiring it up. 404 from the backend (fresh install, no
 * row yet) is treated as "nothing to show".
 */
export function ReloadFailedBanner() {
  const { data } = useQuery({
    queryKey: ["runtime-status"],
    queryFn: async () => {
      try {
        return await api.getRuntimeStatus();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  if (!data || data.lastStatus !== "reload_failed") {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-destructive/20 bg-destructive/5 px-6 py-3">
      <Alert variant="destructive" className="border-0 bg-transparent p-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {data.lastMessage ?? "Engine reload failed; config not saved."}
        </AlertTitle>
        {data.lastError && (
          <AlertDescription className="font-mono text-xs">
            {data.lastError}
          </AlertDescription>
        )}
      </Alert>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/reload-failed-banner.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/admin/ReloadFailedBanner.tsx \
        services/idun_agent_standalone_ui/__tests__/reload-failed-banner.test.tsx
git commit -m "feat(standalone-ui): ReloadFailedBanner shell component"
```

---

## Task 7: Mount the banner in the admin layout

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/layout.tsx`

- [ ] **Step 1: Inspect the current layout**

```bash
cat services/idun_agent_standalone_ui/app/admin/layout.tsx
```

Note where children are rendered — the banner must be a sibling above `{children}`.

- [ ] **Step 2: Add the import + mount**

Open `services/idun_agent_standalone_ui/app/admin/layout.tsx` and:

1. Add the import near the top (alongside other component imports):

```tsx
import { ReloadFailedBanner } from "@/components/admin/ReloadFailedBanner";
```

2. Inside the JSX returned by the layout component, add `<ReloadFailedBanner />` immediately above the `{children}` render. Use the smallest non-invasive insertion that fits the existing layout structure (typically inside the same wrapper element that already contains `{children}`).

Example shape (your file's exact structure may differ — preserve it):

```tsx
<TooltipProvider>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <Topbar />
      <ReloadFailedBanner />
      {children}
    </SidebarInset>
  </SidebarProvider>
</TooltipProvider>
```

- [ ] **Step 3: Run the existing admin layout tests to confirm no regression**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS (153+ tests including the 4 new banner tests).

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/layout.tsx
git commit -m "feat(standalone-ui): mount ReloadFailedBanner in admin layout"
```

---

## Task 8: `<RuntimeStatusCard>` on the agent page

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/RuntimeStatusCard.tsx`

- [ ] **Step 1: Implement the card**

```tsx
// services/idun_agent_standalone_ui/components/admin/RuntimeStatusCard.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import type { RuntimeStatus } from "@/lib/api/types";

const POLL_INTERVAL_MS = 60_000;

function StatusBadge({ status }: { status: RuntimeStatus["lastStatus"] }) {
  if (status === "reloaded") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Reloaded
      </Badge>
    );
  }
  if (status === "restart_required") {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
        <RotateCcw className="mr-1 h-3 w-3" />
        Restart required
      </Badge>
    );
  }
  if (status === "reload_failed") {
    return (
      <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Reload failed
      </Badge>
    );
  }
  return <Badge variant="outline">Unknown</Badge>;
}

export function RuntimeStatusCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["runtime-status"],
    queryFn: async () => {
      try {
        return await api.getRuntimeStatus();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime status</CardTitle>
        <CardDescription>
          The last reload outcome. Polls every {POLL_INTERVAL_MS / 1000}s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading && (
          <p className="text-muted-foreground">Loading…</p>
        )}
        {!isLoading && !data && (
          <p className="text-muted-foreground italic">
            No reload has been attempted yet.
          </p>
        )}
        {data && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <StatusBadge status={data.lastStatus} />
            </div>
            {data.lastMessage && (
              <div>
                <span className="font-medium">Message:</span>{" "}
                <span className="text-muted-foreground">{data.lastMessage}</span>
              </div>
            )}
            {data.lastError && (
              <div>
                <span className="font-medium">Error:</span>{" "}
                <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {data.lastError}
                </pre>
              </div>
            )}
            {data.lastReloadedAt && (
              <div>
                <span className="font-medium">Last reloaded:</span>{" "}
                <span className="text-muted-foreground">
                  {new Date(data.lastReloadedAt).toLocaleString()}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Run vitest to confirm no regression**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_standalone_ui/components/admin/RuntimeStatusCard.tsx
git commit -m "feat(standalone-ui): RuntimeStatusCard component"
```

---

## Task 9: Wire the card + version chip into `/admin/agent`

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1: Add imports**

Open `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`. In the import block at the top, add:

```tsx
import { RuntimeStatusCard } from "@/components/admin/RuntimeStatusCard";
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 2: Capture the engine version from `verifyConnection`**

The page already has a `verifyConnection` function calling `api.checkAgentHealth()`. Add a `verifiedVersion` state alongside `verifiedName`:

Find the existing block (top of the component):

```tsx
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
```

Add directly below:

```tsx
  const [verifiedVersion, setVerifiedVersion] = useState<string | null>(null);
```

In `verifyConnection`, after the `if (health.status === "ok") {` line and before `setVerifiedName(health.agent_name ?? null);`, add:

```tsx
        setVerifiedVersion(health.version ?? null);
```

- [ ] **Step 3: Render the version chip in the page header**

Find the page header block:

```tsx
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">Agent</h1>
        <p className="text-sm text-muted-foreground">
          Identity and graph definition for the running agent. Memory is configured
          on its own page.
        </p>
      </header>
```

Replace it with:

```tsx
      <header className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-medium text-foreground">Agent</h1>
          <p className="text-sm text-muted-foreground">
            Identity and graph definition for the running agent. Memory is configured
            on its own page.
          </p>
        </div>
        {verifiedVersion && (
          <Badge variant="outline" className="font-mono text-xs">
            engine {verifiedVersion}
          </Badge>
        )}
      </header>
```

- [ ] **Step 4: Render `<RuntimeStatusCard>` after the Connection card**

Find the closing `</Card>` of the Connection card (it ends just before `<Card>` for Configuration). Insert between them:

```tsx
      <RuntimeStatusCard />
```

- [ ] **Step 5: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "feat(standalone-ui): runtime status card + engine version chip on /admin/agent"
```

---

## Task 10: Wire `applyFieldErrors` into the agent page form

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1: Add the import**

In the import block of `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`:

```tsx
import { applyFieldErrors } from "@/lib/api/form-errors";
```

- [ ] **Step 2: Replace the existing `onError` in the `save` mutation**

Find the existing block:

```tsx
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)?.error
        ?.message;
      toast.error(message ?? "Save failed");
    },
```

Replace with:

```tsx
    onError: (e) => {
      const handled = applyFieldErrors(form, e, {
        "agent.config.graphDefinition": "definition",
        "agent.config.name": "name",
      });
      if (handled) return;
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)?.error
        ?.message;
      toast.error(message ?? "Save failed");
    },
```

- [ ] **Step 3: Run all vitest tests**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "feat(standalone-ui): wire applyFieldErrors into agent page mutation"
```

---

## Task 11: Acceptance — run all gates

- [ ] **Step 1: Standalone narrowed pytest gate**

```bash
uv run pytest libs/idun_agent_standalone/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS (no new failures vs the prior baseline).

- [ ] **Step 2: Engine narrowed pytest gate (Bundle A doesn't touch the engine, but verify nothing broke transitively)**

```bash
uv run pytest libs/idun_agent_engine/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS.

- [ ] **Step 3: Frontend vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 4: TypeScript check**

```bash
cd services/idun_agent_standalone_ui && npx tsc --noEmit 2>&1 | grep -E "^(lib/api/client|lib/api/form-errors|lib/api/index|lib/api/types/runtime|app/admin/agent|app/admin/layout|components/admin/ReloadFailedBanner|components/admin/RuntimeStatusCard)"
```

Expected: no output (no TypeScript errors on touched files; existing pre-existing errors elsewhere are tolerated by `next.config.mjs: typescript.ignoreBuildErrors: true`).

- [ ] **Step 5: Pre-commit hooks**

```bash
make precommit
```

Expected: clean.

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin feat/config-ux-status-errors
gh pr create --base feat/config-ux --title "feat(config-ux/A): status & errors" --body "$(cat <<'EOF'
## Summary

Bundle A from the config-UX umbrella. Three deliverables:

- `GET /admin/api/v1/runtime/status` — exposes the persisted `runtime_state` row as a `StandaloneRuntimeReload` payload (returns 404 when no row yet).
- `applyFieldErrors(form, error, pathMap?)` helper + pre-parsed `ApiError.fieldErrors` — routes backend `field_errors` directly to react-hook-form fields.
- `<ReloadFailedBanner>` mounted in the admin layout (60s polling); `<RuntimeStatusCard>` on `/admin/agent`; engine version chip in the agent page header.

## Spec
`docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` — Bundle A section.

## Test plan
- [x] standalone narrowed pytest gate
- [x] engine narrowed pytest gate
- [x] vitest (all tests including new helper + banner + runtime API tests)
- [x] tsc --noEmit on touched files
- [x] make precommit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (already applied)

- Spec coverage: every Bundle A item maps to a task — runtime route (Tasks 1-2), `applyFieldErrors` (Tasks 3-4), `getRuntimeStatus` wrapper (Task 5), banner (Tasks 6-7), runtime card + version chip (Tasks 8-9), form integration (Task 10).
- The spec mentioned a `StandaloneRuntimeStatusRead` model but the existing `StandaloneRuntimeReload` schema fits the same shape — reuse it instead of adding a parallel model. Plan reflects this.
- `last_applied_config_hash` from the spec's wire shape is intentionally omitted from Bundle A — `StandaloneRuntimeReload` doesn't carry it, and the UI's runtime card doesn't surface it. Adding it later is a one-field schema extension if demand surfaces.
- Path map example uses `{ "agent.config.graphDefinition": "definition", "agent.config.name": "name" }` — both fields are real on the agent form schema (`name`, `description`, `definition`).
