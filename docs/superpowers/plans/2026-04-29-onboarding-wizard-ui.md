# Onboarding Wizard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sub-project C from `2026-04-29-onboarding-wizard-ui-design.md`: the Next.js wizard at `/onboarding` that consumes sub-project B's three endpoints, plus the chat-root redirect that triggers it and the minimal `?next=` enhancement to login that makes password mode work end-to-end.

**Architecture:** Single-page state-driven wizard. The page (`app/onboarding/page.tsx`) holds a tagged-union `WizardStep` and dispatches to one of nine presentational screen components. TanStack Query owns the scan call and re-scan invalidation. Screens are pure props-in/callbacks-out — no global state, no router calls (the parent owns transitions).

**Tech Stack:** Next.js 15 + React 19 + TypeScript, Tailwind v4, shadcn primitives (already installed: card, button, radio-group, form, input, alert, skeleton, separator, sonner), TanStack Query, react-hook-form + zod, Vitest + RTL for unit tests, Playwright for E2E.

**Branch:** `feat/onboarding-scanner` — extending the same branch sub-projects A and B already live on. Additive only.

---

## Files at a glance

| Path | Action | Responsibility |
|---|---|---|
| `services/idun_agent_standalone_ui/lib/api/types/onboarding.ts` | Create | Wire types: `OnboardingState`, `Framework`, `DetectedAgent`, `ScanResult`, `ScanResponse`, `CreateFromDetectionBody`, `CreateStarterBody` |
| `services/idun_agent_standalone_ui/lib/api/types/index.ts` | Modify | Re-export `./onboarding` |
| `services/idun_agent_standalone_ui/lib/api/index.ts` | Modify | Add `scan`, `createFromDetection`, `createStarter` methods |
| `services/idun_agent_standalone_ui/lib/api/client.ts` | Modify | Append `?next=<path>` to the `/login/` redirect |
| `services/idun_agent_standalone_ui/app/login/page.tsx` | Modify | Read `?next=` and redirect there on success (default `/`) |
| `services/idun_agent_standalone_ui/app/page.tsx` | Modify | On mount, call `getAgent`; on 404 → `router.replace('/onboarding')` |
| `services/idun_agent_standalone_ui/app/onboarding/layout.tsx` | Create | Bare themed shell — logo + centered card area |
| `services/idun_agent_standalone_ui/app/onboarding/page.tsx` | Create | State machine + screen dispatch |
| `services/idun_agent_standalone_ui/components/onboarding/WizardScanning.tsx` | Create | Initial scan loading state |
| `services/idun_agent_standalone_ui/components/onboarding/WizardEmpty.tsx` | Create | EMPTY → framework picker (screen 1 of starter flow) |
| `services/idun_agent_standalone_ui/components/onboarding/WizardNoSupported.tsx` | Create | NO_SUPPORTED → same picker, different copy |
| `services/idun_agent_standalone_ui/components/onboarding/WizardOneDetected.tsx` | Create | ONE_DETECTED → single-card confirm |
| `services/idun_agent_standalone_ui/components/onboarding/WizardManyDetected.tsx` | Create | MANY_DETECTED → radio list + confirm |
| `services/idun_agent_standalone_ui/components/onboarding/WizardStarterConfirm.tsx` | Create | Starter flow screen 2 (name input + 5-file preview) |
| `services/idun_agent_standalone_ui/components/onboarding/WizardMaterializing.tsx` | Create | Loading during create-* call |
| `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx` | Create | Success + .env reminder + Go-to-chat |
| `services/idun_agent_standalone_ui/components/onboarding/WizardError.tsx` | Create | Reload-failure diagnostic + Retry |
| `services/idun_agent_standalone_ui/__tests__/api/onboarding.test.ts` | Create | API client unit tests |
| `services/idun_agent_standalone_ui/__tests__/onboarding/Wizard*.test.tsx` | Create | Per-screen component tests |
| `services/idun_agent_standalone_ui/__tests__/login.test.tsx` | Create | Login page tests |
| `services/idun_agent_standalone_ui/__tests__/page-redirect.test.tsx` | Create | Chat root redirect test |
| `services/idun_agent_standalone_ui/e2e/onboarding.spec.ts` | Create | Playwright flows |

---

## Pattern reminders for implementers

- **`apiFetch`** lives in `lib/api/client.ts`. It sets `credentials: include`, redirects to `/login/` on 401 (with the `redirected` flag preventing loops), throws `ApiError` on non-2xx. Don't bypass it.
- **TanStack Query** is configured at the root via `lib/query-client.tsx`'s `QueryProvider`. Use `useQuery` for `/scan` (key: `["onboarding-scan"]`), `useMutation` for materialize calls.
- **shadcn primitives** are already in `components/ui/`. Don't install or create new primitives — reuse what's there.
- **Tailwind v4** is configured. Use existing CSS variables (`bg-background`, `text-foreground`, `text-muted-foreground`, etc.) — don't write hex colors.
- **Theme**: every page automatically inherits `ThemeLoader`'s runtime-config theme via the root layout. The wizard layout doesn't need to do anything special.
- **camelCase wire format**: backend returns camelCase keys; types must use camelCase (`hasPythonFiles`, not `has_python_files`). The shared `apiFetch` doesn't transform; bodies you send must also be camelCase if the backend's `_CamelModel` schema expects camelCase aliases (it accepts both due to `populate_by_name=True`, but stay consistent).
- **Framework values on the wire are uppercase**: `"LANGGRAPH"`, `"ADK"` — match the schema's `Literal` exactly.
- **MutationResponse envelope**: every materialize call returns `{ data: AgentRead, reload: { status, ... } }`. Already typed in `lib/api/types/common.ts`.
- **No CSS-in-JS**: Tailwind utilities only.
- **Import paths**: use `@/...` (configured in `tsconfig.json` and `vitest.config.ts`).

---

## Task 1: API types + 3 onboarding methods

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/api/types/onboarding.ts`
- Modify: `services/idun_agent_standalone_ui/lib/api/types/index.ts`
- Modify: `services/idun_agent_standalone_ui/lib/api/index.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/api/onboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/api/onboarding.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";

describe("onboarding api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("scan() POSTs /admin/api/v1/onboarding/scan with no body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: "EMPTY",
          scanResult: {
            root: "/tmp",
            detected: [],
            hasPythonFiles: false,
            hasIdunConfig: false,
            scanDurationMs: 12,
          },
          currentAgent: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.scan();
    expect(result.state).toBe("EMPTY");
    expect(result.scanResult.hasPythonFiles).toBe(false);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/scan");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("createFromDetection() POSTs the typed body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Foo" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await api.createFromDetection({
      framework: "LANGGRAPH",
      filePath: "agent.py",
      variableName: "graph",
    });
    expect(result.data.name).toBe("Foo");
    expect(result.reload.status).toBe("reloaded");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/create-from-detection");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "LANGGRAPH",
      filePath: "agent.py",
      variableName: "graph",
    });
  });

  it("createStarter() POSTs the typed body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Starter Agent" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await api.createStarter({ framework: "ADK", name: "My Bot" });
    expect(result.data.name).toBe("Starter Agent");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/create-starter");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "ADK",
      name: "My Bot",
    });
  });

  it("createStarter() omits name when not provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Starter Agent" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await api.createStarter({ framework: "LANGGRAPH" });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "LANGGRAPH",
    });
  });

  it("409 conflict surfaces as ApiError with the conflict envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "conflict", message: "Agent already configured." },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await api.createStarter({ framework: "LANGGRAPH" });
      throw new Error("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).detail).toMatchObject({
        error: { code: "conflict" },
      });
    }
  });

  it("500 reload_failed surfaces as ApiError with the reload envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "reload_failed", message: "Engine init failed." },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await api.createStarter({ framework: "LANGGRAPH" });
      throw new Error("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).detail).toMatchObject({
        error: { code: "reload_failed" },
      });
    }
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
cd services/idun_agent_standalone_ui
pnpm test __tests__/api/onboarding.test.ts
```

Expected: ImportError on `api.scan` / `api.createFromDetection` / `api.createStarter`.

- [ ] **Step 3: Create the types file**

Create `services/idun_agent_standalone_ui/lib/api/types/onboarding.ts`:

```typescript
import type { AgentRead } from "./agent";

export type OnboardingState =
  | "EMPTY"
  | "NO_SUPPORTED"
  | "ONE_DETECTED"
  | "MANY_DETECTED"
  | "ALREADY_CONFIGURED";

export type Framework = "LANGGRAPH" | "ADK";
export type DetectionConfidence = "HIGH" | "MEDIUM";
export type DetectionSource = "config" | "source" | "langgraph_json";

export interface DetectedAgent {
  framework: Framework;
  filePath: string;
  variableName: string;
  inferredName: string;
  confidence: DetectionConfidence;
  source: DetectionSource;
}

export interface ScanResult {
  root: string;
  detected: DetectedAgent[];
  hasPythonFiles: boolean;
  hasIdunConfig: boolean;
  scanDurationMs: number;
}

export interface ScanResponse {
  state: OnboardingState;
  scanResult: ScanResult;
  currentAgent: AgentRead | null;
}

export interface CreateFromDetectionBody {
  framework: Framework;
  filePath: string;
  variableName: string;
}

export interface CreateStarterBody {
  framework: Framework;
  name?: string;
}
```

- [ ] **Step 4: Re-export from the types barrel**

Modify `services/idun_agent_standalone_ui/lib/api/types/index.ts` — append after the existing re-exports:

```typescript
export * from "./common";
export * from "./agent";
export * from "./memory";
export * from "./observability";
export * from "./mcp";
export * from "./guardrails";
export * from "./prompts";
export * from "./integrations";
export * from "./sessions";
export * from "./onboarding";
```

- [ ] **Step 5: Add the three methods to the api object**

Modify `services/idun_agent_standalone_ui/lib/api/index.ts`.

Add to the type-only import block (alongside the existing names):

```typescript
import type {
  AgentCapabilities,
  AgentPatch,
  AgentRead,
  AgentSessionDetail,
  AgentSessionSummary,
  CreateFromDetectionBody,
  CreateStarterBody,
  DeleteResult,
  GuardrailCreate,
  GuardrailPatch,
  GuardrailRead,
  IntegrationCreate,
  IntegrationPatch,
  IntegrationRead,
  McpCreate,
  McpPatch,
  McpRead,
  MemoryPatch,
  MemoryRead,
  MutationResponse,
  ObservabilityPatch,
  ObservabilityRead,
  PromptCreate,
  PromptPatch,
  PromptRead,
  ScanResponse,
  SingletonDeleteResult,
} from "./types";
```

Add the three methods inside the `api` object (place them after `getAgentCapabilities` at the end, or in their own block — doesn't matter as long as they're inside the object literal):

```typescript
  // onboarding wizard
  scan: () =>
    apiFetch<ScanResponse>(`${ADMIN}/onboarding/scan`, {
      method: "POST",
    }),
  createFromDetection: (body: CreateFromDetectionBody) =>
    apiFetch<MutationResponse<AgentRead>>(
      `${ADMIN}/onboarding/create-from-detection`,
      { method: "POST", body: j(body) },
    ),
  createStarter: (body: CreateStarterBody) =>
    apiFetch<MutationResponse<AgentRead>>(`${ADMIN}/onboarding/create-starter`, {
      method: "POST",
      body: j(body),
    }),
```

- [ ] **Step 6: Run tests — must pass**

```bash
pnpm test __tests__/api/onboarding.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 7: TypeScript check**

```bash
pnpm typecheck
```

Expected: no new errors. (The existing config has `ignoreBuildErrors: true` for the build, but `typecheck` runs `tsc --noEmit` and may surface pre-existing errors — only fix errors introduced by THIS task.)

- [ ] **Step 8: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/types/onboarding.ts \
        services/idun_agent_standalone_ui/lib/api/types/index.ts \
        services/idun_agent_standalone_ui/lib/api/index.ts \
        services/idun_agent_standalone_ui/__tests__/api/onboarding.test.ts
git commit -m "feat(standalone-ui): typed onboarding API client methods"
```

---

## Task 2: Append `?next=` to the apiFetch 401 redirect

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api/client.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/api/client.test.ts`

The current 401 redirect goes to `/login/` with no query param. The wizard's auth-redirect flow needs `?next=<originalPath>` so the user lands back on the wizard after logging in.

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/__tests__/api/client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";

describe("apiFetch 401 redirect", () => {
  const fetchMock = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    // jsdom doesn't allow assigning to window.location.href directly without
    // this trick. Replace location with a writable mock so the redirect is
    // observable.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: "/onboarding",
        search: "",
        href: "",
      },
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("redirects to /login/?next=<pathname> on 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 }),
    );
    await expect(apiFetch("/admin/api/v1/agent")).rejects.toThrow();
    expect(window.location.href).toBe("/login/?next=%2Fonboarding");
  });

  it("encodes the pathname so query strings stay intact", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: "/admin/agent",
        search: "?foo=bar",
        href: "",
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 }),
    );
    await expect(apiFetch("/admin/api/v1/agent")).rejects.toThrow();
    expect(window.location.href).toBe(
      "/login/?next=%2Fadmin%2Fagent%3Ffoo%3Dbar",
    );
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/api/client.test.ts
```

Expected: assertions fail because the current code redirects to `/login/` with no query param.

- [ ] **Step 3: Update the redirect logic**

Modify `services/idun_agent_standalone_ui/lib/api/client.ts`. Find the 401 block:

```typescript
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    redirected = true;
    window.location.href = "/login/";
    throw new ApiError(401, null);
  }
```

Replace with:

```typescript
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    redirected = true;
    const nextPath = window.location.pathname + window.location.search;
    const next = encodeURIComponent(nextPath);
    window.location.href = `/login/?next=${next}`;
    throw new ApiError(401, null);
  }
```

- [ ] **Step 4: Run tests — must pass**

```bash
pnpm test __tests__/api/client.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the full test suite — no regressions**

```bash
pnpm test
```

Expected: all pre-existing tests still pass. The 401 redirect was previously untested; the new behavior is purely additive (still goes to `/login/`, just with a query param now).

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/api/client.ts \
        services/idun_agent_standalone_ui/__tests__/api/client.test.ts
git commit -m "feat(standalone-ui): apiFetch 401 redirect carries ?next= path"
```

---

## Task 3: Login page — `?next=` support + default redirect to `/`

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/login/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/login.test.tsx`

The existing page hardcodes `router.replace("/admin/")` after login. We change two things:
1. Read `?next=` from search params; redirect there on success.
2. Default to `/` (not `/admin/`) when `?next=` is absent — `/` itself routes to wizard or chat appropriately.

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/login.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const replace = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      login: vi.fn(),
    },
  };
});

import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

describe("LoginPage", () => {
  beforeEach(() => {
    replace.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
    (api.login as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("on success without ?next, redirects to /", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("on success with ?next=/onboarding, redirects there", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("next=/onboarding"));
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("on 401, fires toast.error and does not redirect", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(401, null),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/login.test.tsx
```

Expected: the `useSearchParams` mock isn't honored by the current page (it doesn't read it), and the default redirect is `/admin/` not `/`.

- [ ] **Step 3: Update the login page**

Replace `services/idun_agent_standalone_ui/app/login/page.tsx` with:

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid place-items-center min-h-screen bg-background p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Enter the admin password configured for this deployment.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.login(password);
              const next = params?.get("next") ?? "/";
              router.replace(next);
            } catch (err) {
              const status = err instanceof ApiError ? err.status : 0;
              toast.error(
                status === 401 ? "Invalid credentials" : "Sign-in failed",
              );
              setPassword("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground" htmlFor="pw">
              Admin password
            </Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
pnpm test __tests__/login.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/login/page.tsx \
        services/idun_agent_standalone_ui/__tests__/login.test.tsx
git commit -m "feat(standalone-ui): login honors ?next= and defaults to /"
```

---

## Task 4: Chat root — redirect to `/onboarding` on agent 404

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/page-redirect.test.tsx`

The chat root page currently mounts a chat layout unconditionally. We add a `getAgent` probe on mount; on 404, replace the route with `/onboarding`.

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/page-redirect.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import Home from "@/app/page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getAgent: vi.fn(),
    },
  };
});

vi.mock("@/components/chat/BrandedLayout", () => ({
  BrandedLayout: () => <div data-testid="branded-layout" />,
}));

vi.mock("@/components/chat/MinimalLayout", () => ({
  MinimalLayout: () => <div data-testid="minimal-layout" />,
}));

vi.mock("@/components/chat/InspectorLayout", () => ({
  InspectorLayout: () => <div data-testid="inspector-layout" />,
}));

import { api, ApiError } from "@/lib/api";

describe("Home (chat root)", () => {
  beforeEach(() => {
    replace.mockReset();
    (api.getAgent as ReturnType<typeof vi.fn>).mockReset();
  });

  it("renders chat when getAgent returns 200", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "x",
      name: "Foo",
    });
    const { findByTestId } = render(<Home />);
    await findByTestId("branded-layout");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /onboarding when getAgent returns 404", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(404, null),
    );
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("does not redirect on non-404 errors (e.g. transient 500)", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(500, null),
    );
    render(<Home />);
    // Wait one tick to make sure no redirect happens.
    await new Promise((r) => setTimeout(r, 10));
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/page-redirect.test.tsx
```

Expected: the current page doesn't call `getAgent`, so the redirect tests fail and the chat-render test passes only because the layout renders unconditionally.

- [ ] **Step 3: Update the chat root**

Replace `services/idun_agent_standalone_ui/app/page.tsx` with:

```typescript
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { ApiError, api } from "@/lib/api";
import { BrandedLayout } from "@/components/chat/BrandedLayout";
import { MinimalLayout } from "@/components/chat/MinimalLayout";
import { InspectorLayout } from "@/components/chat/InspectorLayout";

function ChatHome() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = useMemo(
    () => params.get("session") ?? crypto.randomUUID(),
    [params],
  );
  const [layout, setLayout] = useState<"branded" | "minimal" | "inspector">(
    "branded",
  );
  const [agentReady, setAgentReady] = useState<boolean | null>(null);

  useEffect(() => {
    setLayout(getRuntimeConfig().layout);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getAgent()
      .then(() => {
        if (!cancelled) setAgentReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/onboarding");
        } else {
          // Non-404 errors don't block chat from rendering — let the chat
          // layouts surface their own loading/error state on the next API
          // call. Treat as "ready" so the user sees something.
          setAgentReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (agentReady !== true) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (layout === "minimal") return <MinimalLayout threadId={threadId} />;
  if (layout === "inspector") return <InspectorLayout threadId={threadId} />;
  return <BrandedLayout threadId={threadId} />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-sm">Loading…</div>}>
      <ChatHome />
    </Suspense>
  );
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
pnpm test __tests__/page-redirect.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: all pre-existing tests still pass (the chat root change is additive — chat still renders the same layouts when an agent exists).

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/app/page.tsx \
        services/idun_agent_standalone_ui/__tests__/page-redirect.test.tsx
git commit -m "feat(standalone-ui): chat root redirects to /onboarding when no agent"
```

---

## Task 5: Wizard layout + page skeleton + WizardScanning

**Files:**
- Create: `services/idun_agent_standalone_ui/app/onboarding/layout.tsx`
- Create: `services/idun_agent_standalone_ui/app/onboarding/page.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardScanning.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardScanning.test.tsx`

This task lands the wizard's bare bones: a layout, a page that calls `scan()` and dispatches on `kind: "scanning"`, and the scanning screen. Other screens land in subsequent tasks. The page handles the ALREADY_CONFIGURED branch (auto-redirect to `/`) and shows a placeholder for unhandled steps so we can land each subsequent task incrementally without rewriting the page.

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardScanning.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardScanning } from "@/components/onboarding/WizardScanning";

describe("WizardScanning", () => {
  it("renders the loading caption", () => {
    render(<WizardScanning />);
    expect(screen.getByText(/scanning your project/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — must fail**

```bash
pnpm test __tests__/onboarding/WizardScanning.test.tsx
```

Expected: ImportError on `@/components/onboarding/WizardScanning`.

- [ ] **Step 3: Create the WizardScanning component**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardScanning.tsx`:

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WizardScanning() {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Scanning your project…</p>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the wizard layout**

Create `services/idun_agent_standalone_ui/app/onboarding/layout.tsx`:

```typescript
import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4">
        <span className="text-sm font-semibold text-foreground">Idun</span>
      </header>
      <main className="flex-1 grid place-items-center px-6 pb-12">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create the wizard page (skeleton)**

Create `services/idun_agent_standalone_ui/app/onboarding/page.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
    retry: false,
  });

  useEffect(() => {
    if (data?.state === "ALREADY_CONFIGURED") {
      router.replace("/");
    }
  }, [data, router]);

  if (isLoading || data?.state === "ALREADY_CONFIGURED") {
    return <WizardScanning />;
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  // Subsequent tasks (6–9) replace this with screen dispatch.
  return (
    <div className="text-sm text-muted-foreground">
      State: {data?.state} (screens not yet implemented)
    </div>
  );
}
```

- [ ] **Step 6: Run tests — must pass**

```bash
pnpm test __tests__/onboarding/WizardScanning.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 7: TypeScript check**

```bash
pnpm typecheck
```

Expected: no new errors. (Pre-existing errors are tolerated; only block on new ones.)

- [ ] **Step 8: Commit**

```bash
git add services/idun_agent_standalone_ui/app/onboarding/ \
        services/idun_agent_standalone_ui/components/onboarding/WizardScanning.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/WizardScanning.test.tsx
git commit -m "feat(standalone-ui): wizard layout + scan loading screen"
```

---

## Task 6: WizardEmpty + WizardNoSupported (framework picker)

**Files:**
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardEmpty.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardNoSupported.tsx`
- Modify: `services/idun_agent_standalone_ui/app/onboarding/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardEmpty.test.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardNoSupported.test.tsx`

Both screens share a framework picker. We extract the picker into a shared `FrameworkPicker` component used by both.

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardEmpty.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";

describe("WizardEmpty", () => {
  it("renders the title and both framework options", () => {
    render(<WizardEmpty onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByText(/let's create your first idun agent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/langgraph/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/adk/i)).toBeInTheDocument();
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  });

  it("Continue is disabled until a framework is selected", () => {
    render(<WizardEmpty onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("calls onContinue with the selected framework", () => {
    const onContinue = vi.fn();
    render(<WizardEmpty onContinue={onContinue} onRescan={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/langgraph/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith("LANGGRAPH");
  });

  it("calls onRescan when re-scan link is clicked", () => {
    const onRescan = vi.fn();
    render(<WizardEmpty onContinue={vi.fn()} onRescan={onRescan} />);
    fireEvent.click(screen.getByText(/re-scan/i));
    expect(onRescan).toHaveBeenCalled();
  });
});
```

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardNoSupported.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";

describe("WizardNoSupported", () => {
  it("renders the no-supported framing copy", () => {
    render(<WizardNoSupported onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(
      screen.getByText(/we found python code, but no supported agent/i),
    ).toBeInTheDocument();
  });

  it("calls onContinue with the selected framework", () => {
    const onContinue = vi.fn();
    render(<WizardNoSupported onContinue={onContinue} onRescan={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/adk/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith("ADK");
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/onboarding/WizardEmpty.test.tsx __tests__/onboarding/WizardNoSupported.test.tsx
```

Expected: ImportError on both modules.

- [ ] **Step 3: Create the shared FrameworkPicker component**

Create `services/idun_agent_standalone_ui/components/onboarding/FrameworkPicker.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Framework } from "@/lib/api";

interface FrameworkPickerProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function FrameworkPicker({ onContinue, onRescan }: FrameworkPickerProps) {
  const [selected, setSelected] = useState<Framework | "">("");

  return (
    <div className="space-y-6">
      <RadioGroup
        value={selected}
        onValueChange={(value) => setSelected(value as Framework)}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3 rounded-md border border-border p-4">
          <RadioGroupItem value="LANGGRAPH" id="fw-langgraph" />
          <div className="flex-1">
            <Label htmlFor="fw-langgraph" className="flex items-center gap-2">
              LangGraph
              <Badge variant="secondary">Recommended</Badge>
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              StateGraph-based agents from the LangGraph Python SDK.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-md border border-border p-4">
          <RadioGroupItem value="ADK" id="fw-adk" />
          <div className="flex-1">
            <Label htmlFor="fw-adk">Google ADK</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Google Agent Development Kit (Gemini-based).
            </p>
          </div>
        </div>
      </RadioGroup>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onRescan}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Re-scan
        </button>
        <Button
          onClick={() => selected && onContinue(selected)}
          disabled={!selected}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create WizardEmpty**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardEmpty.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Framework } from "@/lib/api";
import { FrameworkPicker } from "./FrameworkPicker";

interface WizardEmptyProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function WizardEmpty({ onContinue, onRescan }: WizardEmptyProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Let's create your first Idun agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We didn't find any Python files in this folder. Pick a framework and
          we'll scaffold a starter for you.
        </p>
      </CardHeader>
      <CardContent>
        <FrameworkPicker onContinue={onContinue} onRescan={onRescan} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create WizardNoSupported**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardNoSupported.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Framework } from "@/lib/api";
import { FrameworkPicker } from "./FrameworkPicker";

interface WizardNoSupportedProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function WizardNoSupported({
  onContinue,
  onRescan,
}: WizardNoSupportedProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>We found Python code, but no supported agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          Idun supports LangGraph and Google ADK. Pick one to scaffold a
          starter alongside your existing code, or re-scan if you just added
          an agent.
        </p>
      </CardHeader>
      <CardContent>
        <FrameworkPicker onContinue={onContinue} onRescan={onRescan} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Wire the screens into the page**

Modify `services/idun_agent_standalone_ui/app/onboarding/page.tsx`. Replace the entire file contents with:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Framework, ScanResponse } from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework; name: string };

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
    retry: false,
  });

  const [step, setStep] = useState<WizardStep>({ kind: "scanning" });

  useEffect(() => {
    if (isLoading) {
      setStep({ kind: "scanning" });
      return;
    }
    if (data) {
      if (data.state === "ALREADY_CONFIGURED") {
        router.replace("/");
        return;
      }
      setStep({ kind: "scan-result", data });
    }
  }, [data, isLoading, router]);

  const onRescan = () => {
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
  };

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  if (step.kind === "scanning") {
    return <WizardScanning />;
  }

  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework, name: "" });
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    // ONE_DETECTED / MANY_DETECTED land in Task 7.
    return (
      <div className="text-sm text-muted-foreground">
        State: {step.data.state} (screen lands in Task 7)
      </div>
    );
  }

  // starter-confirm screen lands in Task 8.
  return (
    <div className="text-sm text-muted-foreground">
      Starter confirm (screen lands in Task 8)
    </div>
  );
}
```

- [ ] **Step 7: Run tests — must pass**

```bash
pnpm test __tests__/onboarding/WizardEmpty.test.tsx __tests__/onboarding/WizardNoSupported.test.tsx
```

Expected: 6 tests pass (4 in WizardEmpty + 2 in WizardNoSupported).

- [ ] **Step 8: TypeScript check**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add services/idun_agent_standalone_ui/components/onboarding/ \
        services/idun_agent_standalone_ui/app/onboarding/page.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/
git commit -m "feat(standalone-ui): wizard EMPTY + NO_SUPPORTED framework picker"
```

---

## Task 7: WizardOneDetected + WizardManyDetected

**Files:**
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardOneDetected.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardManyDetected.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/DetectionRow.tsx`
- Modify: `services/idun_agent_standalone_ui/app/onboarding/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardOneDetected.test.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardManyDetected.test.tsx`

`DetectionRow` is the shared visual unit for displaying a single detection (used as the body of OneDetected, and as a row inside ManyDetected's RadioGroup).

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardOneDetected.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import type { DetectedAgent } from "@/lib/api";

const HIGH: DetectedAgent = {
  framework: "LANGGRAPH",
  filePath: "agent.py",
  variableName: "graph",
  inferredName: "My Agent",
  confidence: "HIGH",
  source: "source",
};

const MEDIUM: DetectedAgent = { ...HIGH, confidence: "MEDIUM" };

describe("WizardOneDetected", () => {
  it("renders the framework, name, and path", () => {
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/found your agent/i)).toBeInTheDocument();
    expect(screen.getByText("My Agent")).toBeInTheDocument();
    expect(screen.getByText("agent.py:graph")).toBeInTheDocument();
    expect(screen.getByText(/langgraph/i)).toBeInTheDocument();
  });

  it("hides the confidence pill for HIGH detections", () => {
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.queryByText(/medium/i)).not.toBeInTheDocument();
  });

  it("shows the confidence pill for MEDIUM detections", () => {
    render(
      <WizardOneDetected
        detection={MEDIUM}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/medium confidence/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the detection when CTA clicked", () => {
    const onConfirm = vi.fn();
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={onConfirm}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /use this agent/i }));
    expect(onConfirm).toHaveBeenCalledWith(HIGH);
  });
});
```

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardManyDetected.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
import type { DetectedAgent } from "@/lib/api";

const detections: DetectedAgent[] = [
  {
    framework: "ADK",
    filePath: "main_adk.py",
    variableName: "agent",
    inferredName: "B Agent",
    confidence: "MEDIUM",
    source: "source",
  },
  {
    framework: "LANGGRAPH",
    filePath: "agent.py",
    variableName: "graph",
    inferredName: "A Agent",
    confidence: "HIGH",
    source: "source",
  },
];

describe("WizardManyDetected", () => {
  it("renders the title with the count", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/pick your agent/i)).toBeInTheDocument();
    expect(screen.getByText(/2 agents/i)).toBeInTheDocument();
  });

  it("sorts: HIGH confidence first, then LANGGRAPH first, then by name", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("radio");
    // First row should be the LANGGRAPH HIGH detection ("A Agent").
    expect(rows[0]).toHaveAttribute("value", "0");
    const aAgentText = screen.getByText("A Agent");
    const bAgentText = screen.getByText("B Agent");
    // A Agent should appear before B Agent in the document order.
    expect(
      aAgentText.compareDocumentPosition(bAgentText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Use selected agent is disabled until a row is picked", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /use selected/i }),
    ).toBeDisabled();
  });

  it("calls onConfirm with the picked detection", () => {
    const onConfirm = vi.fn();
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={onConfirm}
        onRescan={vi.fn()}
      />,
    );
    // Click the radio for "B Agent" (the second in sorted order).
    fireEvent.click(screen.getByLabelText(/B Agent/));
    fireEvent.click(screen.getByRole("button", { name: /use selected/i }));
    // B Agent is the ADK MEDIUM detection.
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ inferredName: "B Agent" }),
    );
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/onboarding/WizardOneDetected.test.tsx __tests__/onboarding/WizardManyDetected.test.tsx
```

Expected: ImportError on both.

- [ ] **Step 3: Create DetectionRow**

Create `services/idun_agent_standalone_ui/components/onboarding/DetectionRow.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";
import type { DetectedAgent } from "@/lib/api";

interface DetectionRowProps {
  detection: DetectedAgent;
  large?: boolean;
}

export function DetectionRow({ detection, large = false }: DetectionRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{detection.framework}</Badge>
        <span className={large ? "text-base font-medium" : "text-sm font-medium"}>
          {detection.inferredName}
        </span>
        {detection.confidence === "MEDIUM" && (
          <Badge variant="outline" className="text-xs">
            Medium confidence
          </Badge>
        )}
      </div>
      <code className="text-xs text-muted-foreground font-mono">
        {detection.filePath}:{detection.variableName}
      </code>
    </div>
  );
}
```

- [ ] **Step 4: Create WizardOneDetected**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardOneDetected.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DetectedAgent } from "@/lib/api";
import { DetectionRow } from "./DetectionRow";

interface WizardOneDetectedProps {
  detection: DetectedAgent;
  onConfirm: (detection: DetectedAgent) => void;
  onRescan: () => void;
}

export function WizardOneDetected({
  detection,
  onConfirm,
  onRescan,
}: WizardOneDetectedProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Found your agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We detected one agent in this folder.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-border p-4">
          <DetectionRow detection={detection} large />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRescan}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Re-scan
          </button>
          <Button onClick={() => onConfirm(detection)}>Use this agent</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create WizardManyDetected**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardManyDetected.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DetectedAgent } from "@/lib/api";
import { DetectionRow } from "./DetectionRow";

interface WizardManyDetectedProps {
  detections: DetectedAgent[];
  onConfirm: (detection: DetectedAgent) => void;
  onRescan: () => void;
}

const CONFIDENCE_RANK: Record<DetectedAgent["confidence"], number> = {
  HIGH: 0,
  MEDIUM: 1,
};
const FRAMEWORK_RANK: Record<DetectedAgent["framework"], number> = {
  LANGGRAPH: 0,
  ADK: 1,
};

export function WizardManyDetected({
  detections,
  onConfirm,
  onRescan,
}: WizardManyDetectedProps) {
  const sorted = useMemo(
    () =>
      [...detections].sort((a, b) => {
        const c = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
        if (c !== 0) return c;
        const f = FRAMEWORK_RANK[a.framework] - FRAMEWORK_RANK[b.framework];
        if (f !== 0) return f;
        return a.inferredName.localeCompare(b.inferredName);
      }),
    [detections],
  );
  const [selectedIndex, setSelectedIndex] = useState<string>("");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Pick your agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We found {sorted.length} agents in this folder. Choose one — Idun runs
          one agent per install.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={selectedIndex}
          onValueChange={setSelectedIndex}
          className="space-y-3"
        >
          {sorted.map((d, i) => (
            <div
              key={`${d.filePath}:${d.variableName}`}
              className="flex items-start space-x-3 rounded-md border border-border p-4"
            >
              <RadioGroupItem value={String(i)} id={`det-${i}`} />
              <Label htmlFor={`det-${i}`} className="flex-1 cursor-pointer">
                <DetectionRow detection={d} />
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRescan}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Re-scan
          </button>
          <Button
            onClick={() => {
              const idx = parseInt(selectedIndex, 10);
              if (!Number.isNaN(idx) && sorted[idx]) {
                onConfirm(sorted[idx]);
              }
            }}
            disabled={selectedIndex === ""}
          >
            Use selected agent
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Wire ONE_DETECTED + MANY_DETECTED into the page**

Modify `services/idun_agent_standalone_ui/app/onboarding/page.tsx`. Add the imports and replace the `if (step.kind === "scan-result")` branch.

Add to the imports at the top (alongside the existing onboarding component imports):

```typescript
import type { DetectedAgent, Framework, ScanResponse } from "@/lib/api";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
```

Replace the entire `if (step.kind === "scan-result")` block with:

```typescript
  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework, name: "" });
    };
    const onPickDetection = (_detection: DetectedAgent) => {
      // Materialize lands in Task 8 (advances to "materializing" step).
      // For now, this is a no-op placeholder.
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    if (step.data.state === "ONE_DETECTED") {
      return (
        <WizardOneDetected
          detection={step.data.scanResult.detected[0]}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
    if (step.data.state === "MANY_DETECTED") {
      return (
        <WizardManyDetected
          detections={step.data.scanResult.detected}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
  }
```

- [ ] **Step 7: Run tests — must pass**

```bash
pnpm test __tests__/onboarding/WizardOneDetected.test.tsx __tests__/onboarding/WizardManyDetected.test.tsx
```

Expected: 8 tests pass (4 + 4).

- [ ] **Step 8: Commit**

```bash
git add services/idun_agent_standalone_ui/components/onboarding/ \
        services/idun_agent_standalone_ui/app/onboarding/page.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/
git commit -m "feat(standalone-ui): wizard ONE_DETECTED + MANY_DETECTED screens"
```

---

## Task 8: WizardStarterConfirm + WizardMaterializing + materialize wiring

**Files:**
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardStarterConfirm.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardMaterializing.tsx`
- Modify: `services/idun_agent_standalone_ui/app/onboarding/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardStarterConfirm.test.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardMaterializing.test.tsx`

This task lands the starter flow's screen 2 + the loading state, and wires both materialize calls (`createFromDetection` and `createStarter`) into the page using `useMutation`. The Done and Error screens land in Task 9.

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardStarterConfirm.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardStarterConfirm } from "@/components/onboarding/WizardStarterConfirm";

describe("WizardStarterConfirm", () => {
  it("renders the 5 file preview rows", () => {
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    for (const filename of [
      "agent.py",
      "requirements.txt",
      ".env.example",
      "README.md",
      ".gitignore",
    ]) {
      expect(screen.getByText(filename)).toBeInTheDocument();
    }
  });

  it("name input has the Starter Agent placeholder", () => {
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(/starter agent/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the typed name when set", () => {
    const onConfirm = vi.fn();
    render(
      <WizardStarterConfirm
        framework="ADK"
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/starter agent/i), {
      target: { value: "My Bot" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create starter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ framework: "ADK", name: "My Bot" });
  });

  it("calls onConfirm with name omitted when input is blank", () => {
    const onConfirm = vi.fn();
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /create starter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ framework: "LANGGRAPH" });
  });

  it("calls onBack when Back is clicked", () => {
    const onBack = vi.fn();
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={onBack}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardMaterializing.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardMaterializing } from "@/components/onboarding/WizardMaterializing";

describe("WizardMaterializing", () => {
  it("renders the loading caption", () => {
    render(<WizardMaterializing />);
    expect(screen.getByText(/creating your agent/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/onboarding/WizardStarterConfirm.test.tsx __tests__/onboarding/WizardMaterializing.test.tsx
```

Expected: ImportError on both.

- [ ] **Step 3: Create WizardMaterializing**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardMaterializing.tsx`:

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WizardMaterializing() {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Creating your agent…</p>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create WizardStarterConfirm**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardStarterConfirm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { File } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Framework } from "@/lib/api";

const STARTER_FILES = [
  "agent.py",
  "requirements.txt",
  ".env.example",
  "README.md",
  ".gitignore",
];

interface WizardStarterConfirmProps {
  framework: Framework;
  onConfirm: (input: { framework: Framework; name?: string }) => void;
  onBack: () => void;
  onRescan: () => void;
}

export function WizardStarterConfirm({
  framework,
  onConfirm,
  onBack,
  onRescan,
}: WizardStarterConfirmProps) {
  const [name, setName] = useState("");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Confirm your starter</CardTitle>
        <p className="text-sm text-muted-foreground">
          We'll create the following files in your project:
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-2">
          {STARTER_FILES.map((filename) => (
            <li key={filename} className="flex items-center gap-2 text-sm">
              <File className="h-4 w-4 text-muted-foreground" />
              <code className="font-mono text-xs">{filename}</code>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <Label htmlFor="agent-name" className="text-xs text-muted-foreground">
            Agent name (optional)
          </Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Starter Agent"
            maxLength={80}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onRescan}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Re-scan
            </button>
          </div>
          <Button
            onClick={() => {
              const trimmed = name.trim();
              onConfirm(
                trimmed ? { framework, name: trimmed } : { framework },
              );
            }}
          >
            Create starter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Wire materialize calls into the page**

Modify `services/idun_agent_standalone_ui/app/onboarding/page.tsx`. Add the new imports and update the page to handle the materialize flow.

Replace the entire file contents with:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type {
  AgentRead,
  CreateFromDetectionBody,
  CreateStarterBody,
  DetectedAgent,
  Framework,
  ScanResponse,
} from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
import { WizardStarterConfirm } from "@/components/onboarding/WizardStarterConfirm";
import { WizardMaterializing } from "@/components/onboarding/WizardMaterializing";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework }
  | { kind: "materializing" };

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
    retry: false,
  });

  const [step, setStep] = useState<WizardStep>({ kind: "scanning" });

  useEffect(() => {
    if (isLoading) {
      setStep({ kind: "scanning" });
      return;
    }
    if (data) {
      if (data.state === "ALREADY_CONFIGURED") {
        router.replace("/");
        return;
      }
      // Only sync to scan-result if we're not in the middle of a downstream step.
      setStep((prev) => {
        if (
          prev.kind === "scanning" ||
          prev.kind === "scan-result" ||
          // After a 409 (handled below) we re-fetch and want to show the new state.
          prev.kind === "materializing"
        ) {
          return { kind: "scan-result", data };
        }
        return prev;
      });
    }
  }, [data, isLoading, router]);

  const onRescan = () => {
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
  };

  const detectionMutation = useMutation({
    mutationFn: (body: CreateFromDetectionBody) => api.createFromDetection(body),
    onSuccess: () => {
      // Done screen lands in Task 9 — for now, navigate home.
      router.replace("/");
    },
    onError: (err) => {
      handleMutationError(err);
    },
  });

  const starterMutation = useMutation({
    mutationFn: (body: CreateStarterBody) => api.createStarter(body),
    onSuccess: () => {
      router.replace("/");
    },
    onError: (err) => {
      handleMutationError(err);
    },
  });

  function handleMutationError(err: unknown) {
    if (err instanceof ApiError && err.status === 409) {
      const message =
        (err.detail as { error?: { message?: string } } | null)?.error
          ?.message ?? "Conflict";
      toast.error(message);
      queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
      setStep({ kind: "scanning" });
      return;
    }
    // Error screen lands in Task 9 — for now, just toast.
    const message =
      (err as ApiError | undefined)?.detail !== undefined
        ? ((err as ApiError).detail as { error?: { message?: string } } | null)
            ?.error?.message ?? "Something went wrong"
        : "Something went wrong";
    toast.error(message);
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
    setStep({ kind: "scanning" });
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  if (step.kind === "scanning") {
    return <WizardScanning />;
  }

  if (step.kind === "materializing") {
    return <WizardMaterializing />;
  }

  if (step.kind === "starter-confirm") {
    return (
      <WizardStarterConfirm
        framework={step.framework}
        onConfirm={(body) => {
          setStep({ kind: "materializing" });
          starterMutation.mutate(body);
        }}
        onBack={() => {
          if (data) setStep({ kind: "scan-result", data });
        }}
        onRescan={onRescan}
      />
    );
  }

  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework });
    };
    const onPickDetection = (detection: DetectedAgent) => {
      setStep({ kind: "materializing" });
      detectionMutation.mutate({
        framework: detection.framework,
        filePath: detection.filePath,
        variableName: detection.variableName,
      });
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    if (step.data.state === "ONE_DETECTED") {
      return (
        <WizardOneDetected
          detection={step.data.scanResult.detected[0]}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
    if (step.data.state === "MANY_DETECTED") {
      return (
        <WizardManyDetected
          detections={step.data.scanResult.detected}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
  }

  return null;
}
```

The temporary `router.replace("/")` on success is overwritten by Task 9 with proper Done-screen handling. The Error/Done states are stubbed via toast in this slice.

The unused `AgentRead` import will be removed in Task 9 when WizardDone consumes it. Leave it imported now so Task 9 doesn't have to re-edit the import list. Actually — drop it for now to keep ruff happy:

Replace the import line `import type { AgentRead, ...` with the version that excludes `AgentRead`:

```typescript
import type {
  CreateFromDetectionBody,
  CreateStarterBody,
  DetectedAgent,
  Framework,
  ScanResponse,
} from "@/lib/api";
```

- [ ] **Step 6: Run tests — must pass**

```bash
pnpm test __tests__/onboarding/WizardStarterConfirm.test.tsx __tests__/onboarding/WizardMaterializing.test.tsx
```

Expected: 6 tests pass (5 + 1).

- [ ] **Step 7: Run the full UI test suite — no regressions**

```bash
pnpm test
```

Expected: all tests still pass.

- [ ] **Step 8: Commit**

```bash
git add services/idun_agent_standalone_ui/components/onboarding/ \
        services/idun_agent_standalone_ui/app/onboarding/page.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/
git commit -m "feat(standalone-ui): wizard starter-confirm + materialize wiring"
```

---

## Task 9: WizardDone + WizardError

**Files:**
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx`
- Create: `services/idun_agent_standalone_ui/components/onboarding/WizardError.tsx`
- Modify: `services/idun_agent_standalone_ui/app/onboarding/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardDone.test.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/onboarding/WizardError.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardDone.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardDone } from "@/components/onboarding/WizardDone";
import type { AgentRead } from "@/lib/api";

const AGENT: AgentRead = {
  id: "x",
  slug: null,
  name: "Foo",
  description: null,
  version: null,
  status: "draft",
  baseUrl: null,
  baseEngineConfig: {},
  createdAt: "2026-04-29T00:00:00Z",
  updatedAt: "2026-04-29T00:00:00Z",
};

describe("WizardDone", () => {
  it("renders the agent name", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/Foo is ready/i)).toBeInTheDocument();
  });

  it("starter + LANGGRAPH shows OPENAI_API_KEY reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument();
  });

  it("starter + ADK shows GOOGLE_API_KEY reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="ADK"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/GOOGLE_API_KEY/)).toBeInTheDocument();
  });

  it("detection mode shows the generic env reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="detection"
        onGoToChat={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/make sure your agent's environment variables are set/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_API_KEY/)).not.toBeInTheDocument();
  });

  it("calls onGoToChat when CTA clicked", () => {
    const onGoToChat = vi.fn();
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={onGoToChat}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go to chat/i }));
    expect(onGoToChat).toHaveBeenCalled();
  });
});
```

Create `services/idun_agent_standalone_ui/__tests__/onboarding/WizardError.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardError } from "@/components/onboarding/WizardError";

describe("WizardError", () => {
  it("renders the error message verbatim", () => {
    render(
      <WizardError
        message="Engine init failed: bad import"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/engine init failed: bad import/i),
    ).toBeInTheDocument();
  });

  it("appends recovery hint when code is reload_failed", () => {
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/edit your `?agent\.py`? to fix the issue/i),
    ).toBeInTheDocument();
  });

  it("does not show the recovery hint for other codes", () => {
    render(
      <WizardError
        message="boom"
        code="other"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/edit your `?agent\.py`?/i),
    ).not.toBeInTheDocument();
  });

  it("calls onRetry when retry clicked", () => {
    const onRetry = vi.fn();
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={onRetry}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("calls onBack when back link clicked", () => {
    const onBack = vi.fn();
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText(/back to wizard/i));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
pnpm test __tests__/onboarding/WizardDone.test.tsx __tests__/onboarding/WizardError.test.tsx
```

Expected: ImportError on both.

- [ ] **Step 3: Create WizardDone**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx`:

```typescript
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgentRead, Framework } from "@/lib/api";

type Mode = "starter" | "detection";

interface WizardDoneProps {
  agent: AgentRead;
  framework: Framework;
  mode: Mode;
  onGoToChat: () => void;
}

function envReminder(framework: Framework, mode: Mode): string {
  if (mode === "detection") {
    return "Make sure your agent's environment variables are set before chatting.";
  }
  if (framework === "LANGGRAPH") {
    return "Set `OPENAI_API_KEY` in your environment before chatting. Copy `.env.example` to `.env` and fill it in, then restart `idun-standalone`.";
  }
  return "Set `GOOGLE_API_KEY` in your environment before chatting. Copy `.env.example` to `.env` and fill it in, then restart `idun-standalone`.";
}

export function WizardDone({
  agent,
  framework,
  mode,
  onGoToChat,
}: WizardDoneProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>{agent.name} is ready</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Framework</span>
            <Badge variant="secondary">{framework}</Badge>
          </div>
        </div>
        <Alert>
          <AlertTitle>Set up your model credentials</AlertTitle>
          <AlertDescription>{envReminder(framework, mode)}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button onClick={onGoToChat}>Go to chat</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create WizardError**

Create `services/idun_agent_standalone_ui/components/onboarding/WizardError.tsx`:

```typescript
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WizardErrorProps {
  message: string;
  code: string;
  onRetry: () => void;
  onBack: () => void;
}

export function WizardError({
  message,
  code,
  onRetry,
  onBack,
}: WizardErrorProps) {
  const isReloadFailed = code === "reload_failed";
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{message}</p>
            {isReloadFailed && (
              <p>
                Edit your <code>agent.py</code> to fix the issue, then click
                Retry.
              </p>
            )}
          </AlertDescription>
        </Alert>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Back to wizard
          </button>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Wire Done + Error into the page**

Modify `services/idun_agent_standalone_ui/app/onboarding/page.tsx`. Replace the entire file contents with:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type {
  AgentRead,
  CreateFromDetectionBody,
  CreateStarterBody,
  DetectedAgent,
  Framework,
  ScanResponse,
} from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
import { WizardStarterConfirm } from "@/components/onboarding/WizardStarterConfirm";
import { WizardMaterializing } from "@/components/onboarding/WizardMaterializing";
import { WizardDone } from "@/components/onboarding/WizardDone";
import { WizardError } from "@/components/onboarding/WizardError";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework }
  | { kind: "materializing" }
  | {
      kind: "done";
      agent: AgentRead;
      framework: Framework;
      mode: "starter" | "detection";
    }
  | {
      kind: "error";
      message: string;
      code: string;
      retry: () => void;
    };

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
    retry: false,
  });

  const [step, setStep] = useState<WizardStep>({ kind: "scanning" });

  // The framework / mode of the most recent materialize call. Used by the
  // Done screen to render the correct env reminder, and by the Error screen
  // to know what to retry.
  const lastFrameworkRef = useRef<Framework>("LANGGRAPH");
  const lastModeRef = useRef<"starter" | "detection">("starter");

  useEffect(() => {
    if (isLoading) {
      setStep({ kind: "scanning" });
      return;
    }
    if (data) {
      if (data.state === "ALREADY_CONFIGURED") {
        router.replace("/");
        return;
      }
      setStep((prev) => {
        // Only sync to scan-result when we're returning from a 409 conflict
        // (which routes through "scanning") or on first load. Don't clobber
        // done/error/starter-confirm with a stale scan refetch.
        if (prev.kind === "scanning" || prev.kind === "scan-result") {
          return { kind: "scan-result", data };
        }
        return prev;
      });
    }
  }, [data, isLoading, router]);

  const onRescan = () => {
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
    setStep({ kind: "scanning" });
  };

  function extractMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const detail = err.detail as { error?: { message?: string } } | null;
      return detail?.error?.message ?? `Request failed (${err.status})`;
    }
    return "Something went wrong";
  }

  function extractCode(err: unknown): string {
    if (err instanceof ApiError) {
      const detail = err.detail as { error?: { code?: string } } | null;
      return detail?.error?.code ?? "unknown";
    }
    return "unknown";
  }

  const detectionMutation = useMutation({
    mutationFn: (body: CreateFromDetectionBody) => api.createFromDetection(body),
    onSuccess: (response) => {
      setStep({
        kind: "done",
        agent: response.data,
        framework: lastFrameworkRef.current,
        mode: "detection",
      });
    },
    onError: (err) => {
      handleMutationError(err, () => {
        // Re-trigger the same mutation. The body is captured in the closure.
        // We grab it from the previous mutation's variables.
        const body = detectionMutation.variables;
        if (body) {
          setStep({ kind: "materializing" });
          detectionMutation.mutate(body);
        }
      });
    },
  });

  const starterMutation = useMutation({
    mutationFn: (body: CreateStarterBody) => api.createStarter(body),
    onSuccess: (response) => {
      setStep({
        kind: "done",
        agent: response.data,
        framework: lastFrameworkRef.current,
        mode: "starter",
      });
    },
    onError: (err) => {
      handleMutationError(err, () => {
        const body = starterMutation.variables;
        if (body) {
          setStep({ kind: "materializing" });
          starterMutation.mutate(body);
        }
      });
    },
  });

  function handleMutationError(err: unknown, retry: () => void) {
    if (err instanceof ApiError && err.status === 409) {
      // Conflict — return to scan and let the user see the new state.
      toast.error(extractMessage(err));
      queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
      setStep({ kind: "scanning" });
      return;
    }
    setStep({
      kind: "error",
      message: extractMessage(err),
      code: extractCode(err),
      retry,
    });
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  if (step.kind === "scanning") {
    return <WizardScanning />;
  }

  if (step.kind === "materializing") {
    return <WizardMaterializing />;
  }

  if (step.kind === "done") {
    return (
      <WizardDone
        agent={step.agent}
        framework={step.framework}
        mode={step.mode}
        onGoToChat={() => router.push("/")}
      />
    );
  }

  if (step.kind === "error") {
    return (
      <WizardError
        message={step.message}
        code={step.code}
        onRetry={step.retry}
        onBack={() => {
          if (data) setStep({ kind: "scan-result", data });
          else setStep({ kind: "scanning" });
        }}
      />
    );
  }

  if (step.kind === "starter-confirm") {
    return (
      <WizardStarterConfirm
        framework={step.framework}
        onConfirm={(body) => {
          lastFrameworkRef.current = body.framework;
          lastModeRef.current = "starter";
          setStep({ kind: "materializing" });
          starterMutation.mutate(body);
        }}
        onBack={() => {
          if (data) setStep({ kind: "scan-result", data });
        }}
        onRescan={onRescan}
      />
    );
  }

  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework });
    };
    const onPickDetection = (detection: DetectedAgent) => {
      lastFrameworkRef.current = detection.framework;
      lastModeRef.current = "detection";
      setStep({ kind: "materializing" });
      detectionMutation.mutate({
        framework: detection.framework,
        filePath: detection.filePath,
        variableName: detection.variableName,
      });
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    if (step.data.state === "ONE_DETECTED") {
      return (
        <WizardOneDetected
          detection={step.data.scanResult.detected[0]}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
    if (step.data.state === "MANY_DETECTED") {
      return (
        <WizardManyDetected
          detections={step.data.scanResult.detected}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
  }

  return null;
}
```

- [ ] **Step 6: Run tests — must pass**

```bash
pnpm test __tests__/onboarding/
```

Expected: all 9 onboarding test files pass (~22 tests total — Scanning 1 + Empty 4 + NoSupported 2 + OneDetected 4 + ManyDetected 4 + StarterConfirm 5 + Materializing 1 + Done 5 + Error 5).

- [ ] **Step 7: Run the full UI test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 8: TypeScript check**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add services/idun_agent_standalone_ui/components/onboarding/ \
        services/idun_agent_standalone_ui/app/onboarding/page.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/
git commit -m "feat(standalone-ui): wizard done + error screens, full state machine"
```

---

## Task 10: E2E tests + final pass

**Files:**
- Create: `services/idun_agent_standalone_ui/e2e/onboarding.spec.ts`

This task adds Playwright E2E tests for the seven flows from the spec. They run against route mocks (no real backend), exercising the wizard end-to-end through the browser.

- [ ] **Step 1: Write the E2E tests**

Create `services/idun_agent_standalone_ui/e2e/onboarding.spec.ts`:

```typescript
import { test, expect, type Route } from "@playwright/test";

const ADMIN = "/admin/api/v1";

interface MockState {
  scan: () => unknown;
  agent?: () => unknown;
  createStarter?: () => { status: number; body: unknown };
  createFromDetection?: () => { status: number; body: unknown };
}

async function setupMocks(page: import("@playwright/test").Page, state: MockState) {
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    if (state.agent) {
      await route.fulfill({ status: 200, body: JSON.stringify(state.agent()) });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "not_found" } }),
      });
    }
  });
  await page.route("**/admin/api/v1/onboarding/scan", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.scan()),
    });
  });
  if (state.createStarter) {
    await page.route(
      "**/admin/api/v1/onboarding/create-starter",
      async (route: Route) => {
        const r = state.createStarter!();
        await route.fulfill({
          status: r.status,
          contentType: "application/json",
          body: JSON.stringify(r.body),
        });
      },
    );
  }
  if (state.createFromDetection) {
    await page.route(
      "**/admin/api/v1/onboarding/create-from-detection",
      async (route: Route) => {
        const r = state.createFromDetection!();
        await route.fulfill({
          status: r.status,
          contentType: "application/json",
          body: JSON.stringify(r.body),
        });
      },
    );
  }
}

const EMPTY_SCAN = {
  state: "EMPTY",
  scanResult: {
    root: "/tmp",
    detected: [],
    hasPythonFiles: false,
    hasIdunConfig: false,
    scanDurationMs: 1,
  },
  currentAgent: null,
};

const ONE_LANGGRAPH_DETECTION = {
  framework: "LANGGRAPH" as const,
  filePath: "agent.py",
  variableName: "graph",
  inferredName: "My Agent",
  confidence: "HIGH" as const,
  source: "source" as const,
};

const ONE_DETECTED_SCAN = {
  state: "ONE_DETECTED",
  scanResult: {
    root: "/tmp",
    detected: [ONE_LANGGRAPH_DETECTION],
    hasPythonFiles: true,
    hasIdunConfig: false,
    scanDurationMs: 1,
  },
  currentAgent: null,
};

const STARTER_AGENT_RESPONSE = {
  data: {
    id: "x",
    slug: null,
    name: "Starter Agent",
    description: null,
    version: null,
    status: "draft",
    baseUrl: null,
    baseEngineConfig: { agent: { type: "LANGGRAPH" } },
    createdAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
  },
  reload: { status: "reloaded", message: "Reloaded." },
};

test("EMPTY → user picks LangGraph → confirms → done shows OPENAI_API_KEY", async ({
  page,
}) => {
  await setupMocks(page, {
    scan: () => EMPTY_SCAN,
    createStarter: () => ({ status: 200, body: STARTER_AGENT_RESPONSE }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText(/confirm your starter/i)).toBeVisible();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();
  await expect(page.getByText(/OPENAI_API_KEY/)).toBeVisible();
});

test("ONE_DETECTED → user clicks Use → done shows generic env reminder", async ({
  page,
}) => {
  await setupMocks(page, {
    scan: () => ONE_DETECTED_SCAN,
    createFromDetection: () => ({
      status: 200,
      body: {
        ...STARTER_AGENT_RESPONSE,
        data: { ...STARTER_AGENT_RESPONSE.data, name: "My Agent" },
      },
    }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/found your agent/i)).toBeVisible();
  await page.getByRole("button", { name: /use this agent/i }).click();
  await expect(page.getByText(/My Agent is ready/i)).toBeVisible();
  await expect(
    page.getByText(/make sure your agent's environment variables are set/i),
  ).toBeVisible();
});

test("MANY_DETECTED → user picks the second → confirms → done", async ({
  page,
}) => {
  const SECOND = {
    framework: "ADK" as const,
    filePath: "main_adk.py",
    variableName: "agent",
    inferredName: "B Agent",
    confidence: "HIGH" as const,
    source: "source" as const,
  };
  await setupMocks(page, {
    scan: () => ({
      ...ONE_DETECTED_SCAN,
      state: "MANY_DETECTED",
      scanResult: {
        ...ONE_DETECTED_SCAN.scanResult,
        detected: [ONE_LANGGRAPH_DETECTION, SECOND],
      },
    }),
    createFromDetection: () => ({
      status: 200,
      body: {
        ...STARTER_AGENT_RESPONSE,
        data: { ...STARTER_AGENT_RESPONSE.data, name: "B Agent" },
      },
    }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/pick your agent/i)).toBeVisible();
  await page.getByLabel(/B Agent/).click();
  await page.getByRole("button", { name: /use selected/i }).click();
  await expect(page.getByText(/B Agent is ready/i)).toBeVisible();
});

test("ALREADY_CONFIGURED → wizard auto-redirects to /", async ({ page }) => {
  await setupMocks(page, {
    scan: () => ({
      ...EMPTY_SCAN,
      state: "ALREADY_CONFIGURED",
      currentAgent: STARTER_AGENT_RESPONSE.data,
    }),
    agent: () => STARTER_AGENT_RESPONSE.data,
  });
  await page.goto("/onboarding");
  await page.waitForURL("**/");
});

test("Reload failure → error screen shows diagnostic + Retry → second attempt 200 → done", async ({
  page,
}) => {
  let attempts = 0;
  await setupMocks(page, {
    scan: () => EMPTY_SCAN,
    createStarter: () => {
      attempts++;
      if (attempts === 1) {
        return {
          status: 500,
          body: {
            error: {
              code: "reload_failed",
              message: "Engine init failed: bad import in agent.py.",
            },
          },
        };
      }
      return { status: 200, body: STARTER_AGENT_RESPONSE };
    },
  });
  await page.goto("/onboarding");
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/something went wrong/i)).toBeVisible();
  await expect(page.getByText(/bad import in agent\.py/i)).toBeVisible();
  await expect(page.getByText(/edit your `?agent\.py`?/i)).toBeVisible();
  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();
});

test("Re-scan: EMPTY → user clicks Re-scan → backend returns ONE_DETECTED → screen flips", async ({
  page,
}) => {
  let calls = 0;
  await setupMocks(page, {
    scan: () => {
      calls++;
      return calls === 1 ? EMPTY_SCAN : ONE_DETECTED_SCAN;
    },
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
  await page.getByText(/re-scan/i).click();
  await expect(page.getByText(/found your agent/i)).toBeVisible();
});

test("Login redirect (password mode): /onboarding 401 → /login → submit → back to /onboarding", async ({
  page,
}) => {
  let scanAttempts = 0;
  await page.route("**/admin/api/v1/onboarding/scan", async (route: Route) => {
    scanAttempts++;
    if (scanAttempts === 1) {
      await route.fulfill({ status: 401, body: JSON.stringify({}) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_SCAN),
      });
    }
  });
  await page.route("**/admin/api/v1/auth/login", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto("/onboarding");
  await page.waitForURL(/\/login\/\?next=/);
  await page.getByLabel(/admin password/i).fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/onboarding/);
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
});
```

- [ ] **Step 2: Run E2E tests**

```bash
cd services/idun_agent_standalone_ui
pnpm test:e2e e2e/onboarding.spec.ts
```

Expected: 7 E2E tests pass. If the existing playwright config requires the dev server running, follow the existing convention from `e2e/admin-shell.spec.ts` or whatever harness is in use.

If route mocking doesn't fire because the existing `e2e/boot-standalone.sh` boots a real backend, check the existing E2E tests to see whether route mocking works (it's a Playwright primitive — should work everywhere). If the existing E2E suite shells out to a real backend, this onboarding suite can either:
- Mock at the network layer (current approach — should still work since `page.route` short-circuits the real request).
- Skip these in CI and document a limitation.

- [ ] **Step 3: Run the full UI test suite (unit + e2e)**

```bash
pnpm test
pnpm test:e2e
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript check**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e/onboarding.spec.ts
git commit -m "test(standalone-ui): E2E coverage for the onboarding wizard"
```

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| §4 Locked decisions (Q1-Q12) | Tasks 4–9 collectively |
| §5 State machine | Tasks 5–9 (incremental: scanning in 5, scan-result branches in 6/7, starter-confirm + materializing in 8, done + error in 9) |
| §6 Module layout | All tasks |
| §7 API client additions | Task 1 |
| §8 Per-screen UX | Tasks 5–9 |
| §9 Login page | Task 3 (+ apiFetch enhancement in Task 2) |
| §10 Routing flow | Tasks 4 (chat root) + 5 (onboarding mount) + 3 (login) |
| §11 Theming | Task 5 (layout inherits ThemeLoader) |
| §12 Concurrency edge cases | Task 8/9 (mutation conflict handling) |
| §13 Testing strategy | Each task includes its tests; Task 10 covers E2E |
| §14–§15 Future work / open questions | Out of scope — explicitly deferred |

## Test count summary

- API + client: 6 + 2 = 8
- Login: 3
- Page-redirect: 3
- Wizard screens: 1 + 4 + 2 + 4 + 4 + 5 + 1 + 5 + 5 = 31
- E2E: 7

**Total new tests: 52** (45 unit + 7 E2E).
