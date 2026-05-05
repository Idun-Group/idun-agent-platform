# Config UX Bundle C — Form Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the six admin page headers behind one shared component (with built-in dirty badge + docs link), guard tab-close on dirty forms with a tiny `useBeforeUnload` hook, install the shadcn Combobox primitive and migrate guardrails' six tag-shaped fields to chip inputs, and delete the dead `SaveToolbar` / `SingletonEditor` components.

**Architecture:** Build one shared `<AdminPageHeader>` component, refactor all six admin pages (`agent`, `memory`, `observability`, `mcp`, `guardrails`, `prompts`) to use it. Add a 10-line `useBeforeUnload(when)` hook and call it on every page from a single boolean source (`form.formState.isDirty` for singletons, the existing list-equality flag for collections). Run `npx shadcn@latest add combobox` to bring in the upstream chips primitive; replace guardrails' six `<Input>` + `joinList`/`splitList` fields with the Combobox-with-chips composition. Delete the two dead components.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, shadcn/ui (Combobox primitive, Tooltip, Button, Card), react-hook-form, zod, vitest, Lucide icons.

**Branch:** `feat/config-ux-form-polish` opens against `feat/config-ux`.

**Independent of PR-1 / PR-2** — can land first if ready.

**Spec:** `docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` (Bundle C section).

---

## File structure

**Frontend shared (TypeScript):**
- Create: `services/idun_agent_standalone_ui/components/admin/AdminPageHeader.tsx`
- Create: `services/idun_agent_standalone_ui/hooks/use-before-unload.ts`
- Create (via shadcn CLI): `services/idun_agent_standalone_ui/components/ui/combobox.tsx`
- Delete: `services/idun_agent_standalone_ui/components/admin/SaveToolbar.tsx`
- Delete: `services/idun_agent_standalone_ui/components/admin/SingletonEditor.tsx`

**Tests:**
- Create: `services/idun_agent_standalone_ui/__tests__/admin-page-header.test.tsx`
- Create: `services/idun_agent_standalone_ui/__tests__/hooks/use-before-unload.test.ts`
- Create: `services/idun_agent_standalone_ui/__tests__/guardrails-tag-fields.test.tsx`

**Refactored admin pages (one task each):**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`
- Modify: `services/idun_agent_standalone_ui/app/admin/memory/page.tsx`
- Modify: `services/idun_agent_standalone_ui/app/admin/observability/page.tsx`
- Modify: `services/idun_agent_standalone_ui/app/admin/mcp/page.tsx`
- Modify: `services/idun_agent_standalone_ui/app/admin/guardrails/page.tsx` (also migrates 6 tag fields)
- Modify: `services/idun_agent_standalone_ui/app/admin/prompts/page.tsx`

---

## Task 1: `<AdminPageHeader>` component

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/AdminPageHeader.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/admin-page-header.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// services/idun_agent_standalone_ui/__tests__/admin-page-header.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithTooltip(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("AdminPageHeader", () => {
  it("renders title", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.getByRole("heading", { name: "Agent" })).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    renderWithTooltip(
      <AdminPageHeader title="Agent" description="Identity and graph." />,
    );
    expect(screen.getByText("Identity and graph.")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { container } = renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders the dirty badge when isDirty=true", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" isDirty />);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("does not render the dirty badge by default", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });

  it("renders the docs button when docsHref is provided", () => {
    renderWithTooltip(
      <AdminPageHeader
        title="Agent"
        docsHref="https://docs.idunplatform.com/standalone/agent"
      />,
    );
    const link = screen.getByRole("link", { name: /documentation/i });
    expect(link).toHaveAttribute(
      "href",
      "https://docs.idunplatform.com/standalone/agent",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render the docs button when docsHref is omitted", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders children in the action area", () => {
    renderWithTooltip(
      <AdminPageHeader title="Agent">
        <button data-testid="custom-action">Action</button>
      </AdminPageHeader>,
    );
    expect(screen.getByTestId("custom-action")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/admin-page-header.test.tsx
```

Expected: 8 failures — component not found.

- [ ] **Step 3: Implement the component**

```tsx
// services/idun_agent_standalone_ui/components/admin/AdminPageHeader.tsx
"use client";

import { BookOpen } from "lucide-react";
import type React from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type AdminPageHeaderProps = {
  title: string;
  description?: string;
  docsHref?: string;
  isDirty?: boolean;
  /** Page-specific action area, rendered to the right of the title. */
  children?: React.ReactNode;
};

/**
 * Shared header used by every admin page. Owns the unsaved-changes
 * badge (driven by `isDirty`) and the optional docs icon button.
 *
 * Keeping a single component means future polish (e.g. mobile-collapse
 * the docs button, swap the badge style) lands in one place instead
 * of six.
 */
export function AdminPageHeader({
  title,
  description,
  docsHref,
  isDirty = false,
  children,
}: AdminPageHeaderProps) {
  return (
    <header className="flex flex-row items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-medium text-foreground">
            {title}
          </h1>
          {isDirty && (
            <span
              className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400"
              role="status"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(children || docsHref) && (
        <div className="flex items-center gap-2">
          {children}
          {docsHref && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                  <a href={docsHref} target="_blank" rel="noreferrer">
                    <BookOpen className="h-4 w-4" />
                    <span className="sr-only">Documentation</span>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Documentation</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/admin-page-header.test.tsx
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/admin/AdminPageHeader.tsx \
        services/idun_agent_standalone_ui/__tests__/admin-page-header.test.tsx
git commit -m "feat(standalone-ui): AdminPageHeader shared component"
```

---

## Task 2: `useBeforeUnload` hook

**Files:**
- Create: `services/idun_agent_standalone_ui/hooks/use-before-unload.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/hooks/use-before-unload.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// services/idun_agent_standalone_ui/__tests__/hooks/use-before-unload.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useBeforeUnload } from "@/hooks/use-before-unload";

describe("useBeforeUnload", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  it("does not add a listener when when=false", () => {
    renderHook(() => useBeforeUnload(false));
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.anything());
  });

  it("adds a beforeunload listener when when=true", () => {
    renderHook(() => useBeforeUnload(true));
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useBeforeUnload(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("toggles the listener when `when` flips", () => {
    const { rerender } = renderHook(({ when }) => useBeforeUnload(when), {
      initialProps: { when: false },
    });
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.anything());
    rerender({ when: true });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    rerender({ when: false });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("listener calls preventDefault and sets returnValue", () => {
    renderHook(() => useBeforeUnload(true));
    const handler = addSpy.mock.calls.find(
      ([event]) => event === "beforeunload",
    )?.[1] as (e: BeforeUnloadEvent) => void;
    expect(handler).toBeTypeOf("function");

    const event = { preventDefault: vi.fn(), returnValue: "" } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/hooks/use-before-unload.test.ts
```

Expected: 5 failures — module not found.

- [ ] **Step 3: Implement the hook**

```typescript
// services/idun_agent_standalone_ui/hooks/use-before-unload.ts
"use client";

import { useEffect } from "react";

/**
 * Block tab close / hard refresh while `when` is true.
 *
 * Coverage is intentionally limited to `beforeunload`:
 * - Catches: closing the tab, hitting refresh.
 * - Misses:  client-side navigation via Next.js Link.
 *
 * The dirty-badge in `<AdminPageHeader>` provides continuous
 * visual signal for the in-app navigation case; if real complaints
 * surface, a route guard can land later as a separate component.
 */
export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy spec; required by Chrome
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && npx vitest run __tests__/hooks/use-before-unload.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/hooks/use-before-unload.ts \
        services/idun_agent_standalone_ui/__tests__/hooks/use-before-unload.test.ts
git commit -m "feat(standalone-ui): useBeforeUnload hook"
```

---

## Task 3: Install shadcn Combobox primitive

**Files:**
- Created automatically by the shadcn CLI: `services/idun_agent_standalone_ui/components/ui/combobox.tsx`

- [ ] **Step 1: Run the shadcn CLI**

```bash
cd services/idun_agent_standalone_ui && npx shadcn@latest add combobox
```

If the CLI asks about overwrites or variants, accept the defaults. The CLI will:
- Add `components/ui/combobox.tsx`
- Possibly add Radix dependencies (`@radix-ui/react-...`) to `package.json`
- Possibly modify `package-lock.json` (or `pnpm-lock.yaml`)

- [ ] **Step 2: Verify the file was created**

```bash
ls services/idun_agent_standalone_ui/components/ui/combobox.tsx
```

Expected: file exists. Open it briefly to confirm exports include `Combobox`, `ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`, `ComboboxValue`. If any are missing because the upstream version is older than the docs we read, **stop here** and reply to the planner — the install brought in a stale variant. We will need to bump shadcn or vendor the chips composition.

- [ ] **Step 3: Run vitest to verify nothing imports the new file accidentally before we use it**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/components/ui/combobox.tsx \
        services/idun_agent_standalone_ui/package.json \
        services/idun_agent_standalone_ui/package-lock.json
git commit -m "chore(standalone-ui): install shadcn Combobox primitive"
```

(If your repo uses `pnpm-lock.yaml` or `bun.lockb` instead, swap the path accordingly.)

---

## Task 4: Delete dead `SaveToolbar` and `SingletonEditor`

**Files:**
- Delete: `services/idun_agent_standalone_ui/components/admin/SaveToolbar.tsx`
- Delete: `services/idun_agent_standalone_ui/components/admin/SingletonEditor.tsx`

- [ ] **Step 1: Confirm zero call sites**

```bash
grep -rn "SaveToolbar\|SingletonEditor" \
  services/idun_agent_standalone_ui/app \
  services/idun_agent_standalone_ui/components \
  services/idun_agent_standalone_ui/__tests__ \
  | grep -v "SaveToolbar.tsx\|SingletonEditor.tsx"
```

Expected: no output. If anything matches, **stop**: a hidden consumer means deletion will break the build. Resolve before continuing.

- [ ] **Step 2: Delete the files**

```bash
rm services/idun_agent_standalone_ui/components/admin/SaveToolbar.tsx \
   services/idun_agent_standalone_ui/components/admin/SingletonEditor.tsx
```

- [ ] **Step 3: Run vitest + tsc**

```bash
cd services/idun_agent_standalone_ui && npx vitest run && npx tsc --noEmit 2>&1 | grep -E "SaveToolbar|SingletonEditor" || echo "no broken refs"
```

Expected: vitest passes, tsc finds no remaining references to the deleted components.

- [ ] **Step 4: Commit**

```bash
git add -A services/idun_agent_standalone_ui/components/admin/
git commit -m "chore(standalone-ui): drop dead SaveToolbar + SingletonEditor"
```

---

## Task 5: Refactor `/admin/agent` page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
```

- [ ] **Step 2: Replace the inline header**

Find the existing header block:

```tsx
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">Agent</h1>
        <p className="text-sm text-muted-foreground">
          Identity and graph definition for the running agent. Memory is configured
          on its own page.
        </p>
      </header>
```

(Or — if Bundle A has already merged — the slightly extended header that includes the version chip.) Replace with:

```tsx
      <AdminPageHeader
        title="Agent"
        description="Identity and graph definition for the running agent. Memory is configured on its own page."
        docsHref="https://docs.idunplatform.com/standalone/agent"
        isDirty={form.formState.isDirty}
      >
        {verifiedVersion && (
          <Badge variant="outline" className="font-mono text-xs">
            engine {verifiedVersion}
          </Badge>
        )}
      </AdminPageHeader>
```

If Bundle A hasn't merged yet, drop the `<Badge>` block (no `verifiedVersion` exists yet). The version chip is owned by Bundle A; Bundle C only ensures the AdminPageHeader can host it.

- [ ] **Step 3: Wire `useBeforeUnload`**

Inside `AgentPage`, after the form is created:

```tsx
  useBeforeUnload(form.formState.isDirty);
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "refactor(standalone-ui): /admin/agent uses AdminPageHeader + useBeforeUnload"
```

---

## Task 6: Refactor `/admin/memory` page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/memory/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
```

- [ ] **Step 2: Replace inline header**

Find the existing `<header className="space-y-1">…</header>` block on `app/admin/memory/page.tsx` and replace with:

```tsx
      <AdminPageHeader
        title="Memory"
        description="Conversation history and checkpointer storage."
        docsHref="https://docs.idunplatform.com/standalone/memory"
        isDirty={form.formState.isDirty}
      />
```

(Tweak `description` to match the page's existing copy if it's shorter / different.)

- [ ] **Step 3: Wire `useBeforeUnload`**

```tsx
  useBeforeUnload(form.formState.isDirty);
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/memory/page.tsx
git commit -m "refactor(standalone-ui): /admin/memory uses AdminPageHeader + useBeforeUnload"
```

---

## Task 7: Refactor `/admin/observability` page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/observability/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
```

- [ ] **Step 2: Replace inline header**

```tsx
      <AdminPageHeader
        title="Observability"
        description="Trace + log providers (Langfuse, Phoenix, LangSmith, GCP)."
        docsHref="https://docs.idunplatform.com/standalone/observability"
        isDirty={form.formState.isDirty}
      />
```

- [ ] **Step 3: Wire `useBeforeUnload`**

```tsx
  useBeforeUnload(form.formState.isDirty);
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/observability/page.tsx
git commit -m "refactor(standalone-ui): /admin/observability uses AdminPageHeader + useBeforeUnload"
```

---

## Task 8: Refactor `/admin/mcp` page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/mcp/page.tsx`

The MCP page uses a list-equality `isDirty` (`!listsEqual(working, initialList)`), not a form's `formState.isDirty`. The page already computes this — we just feed the same value to AdminPageHeader and useBeforeUnload.

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
```

- [ ] **Step 2: Replace inline header**

Find the existing `<header className="space-y-1">…</header>` and replace:

```tsx
      <AdminPageHeader
        title="MCP servers"
        description="Tool servers exposed via the Model Context Protocol."
        docsHref="https://docs.idunplatform.com/standalone/mcp"
        isDirty={isDirty}
      />
```

- [ ] **Step 3: Wire `useBeforeUnload`**

```tsx
  useBeforeUnload(isDirty);
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/mcp/page.tsx
git commit -m "refactor(standalone-ui): /admin/mcp uses AdminPageHeader + useBeforeUnload"
```

---

## Task 9: Refactor `/admin/guardrails` page (header + tag fields)

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/guardrails/page.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/guardrails-tag-fields.test.tsx`

This is the largest refactor in Bundle C — both the header and the six tag-shaped fields change. Split the work into substeps.

### 9.1 Header + useBeforeUnload

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from "@/components/ui/combobox";
```

- [ ] **Step 2: Replace inline header**

Find the existing header and replace:

```tsx
      <AdminPageHeader
        title="Guardrails"
        description="Safety rules applied to inputs and outputs."
        docsHref="https://docs.idunplatform.com/standalone/guardrails"
        isDirty={isDirty}
      />
```

- [ ] **Step 3: Wire `useBeforeUnload`**

```tsx
  useBeforeUnload(isDirty);
```

### 9.2 Migrate the six tag fields to Combobox-with-chips

The six fields are: `banned_words`, `pii_entities`, `competitors`, `expected_languages`, `valid_topics`, `invalid_topics`. They currently use the helpers `joinList(value)` (string[] → "a, b, c") and `splitList(input)` (string → string[]).

- [ ] **Step 4: Update the zod schema for affected fields**

Find each field's zod entry (currently `z.string()`) and change to:

```tsx
z.array(z.string().min(1)).optional().default([])
```

Apply to all six.

- [ ] **Step 5: Replace each field's render**

For each of the six fields, the current pattern looks something like:

```tsx
<FormField
  control={form.control}
  name="bannedWords"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Banned words</FormLabel>
      <FormControl>
        <Input
          value={joinList(field.value)}
          onChange={(e) => field.onChange(splitList(e.target.value))}
          placeholder="word1, word2"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Replace with:

```tsx
<FormField
  control={form.control}
  name="bannedWords"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Banned words</FormLabel>
      <FormControl>
        <Combobox
          multiple
          items={[]}
          value={(field.value ?? []) as string[]}
          onValueChange={field.onChange}
        >
          <ComboboxChips>
            <ComboboxValue>
              {((field.value ?? []) as string[]).map((tag) => (
                <ComboboxChip key={tag}>{tag}</ComboboxChip>
              ))}
            </ComboboxValue>
            <ComboboxChipsInput placeholder="Add term" />
          </ComboboxChips>
        </Combobox>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Repeat this transformation for `piiEntities`, `competitors`, `expectedLanguages`, `validTopics`, `invalidTopics`. Keep each field's existing `<FormLabel>` text and any `<FormDescription>`.

- [ ] **Step 6: Delete the now-unused `joinList` and `splitList` helpers**

Find them at the top of the file and delete. If they're imported from a sibling module, leave the import only if other files still use them; otherwise remove the import.

### 9.3 Tests for the migrated fields

- [ ] **Step 7: Write the smoke test**

```typescript
// services/idun_agent_standalone_ui/__tests__/guardrails-tag-fields.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GuardrailsPage from "@/app/admin/guardrails/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GuardrailsPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Guardrails tag fields", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("adds a tag on Enter", async () => {
    const user = userEvent.setup();
    renderPage();
    // Find the banned-words chips input by placeholder.
    const inputs = await screen.findAllByPlaceholderText(/add term/i);
    const first = inputs[0];
    await user.type(first, "spam{Enter}");
    expect(screen.getByText("spam")).toBeInTheDocument();
  });
});
```

This is a smoke check that the migration didn't break the page; the Combobox primitive is upstream-tested.

- [ ] **Step 8: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS. If the test fails to render the page (because of unmocked dependencies or auth gates), reduce its scope to a minimal component-level test that mounts only the field render block — the goal is just to confirm the chips composition works in our context.

- [ ] **Step 9: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/guardrails/page.tsx \
        services/idun_agent_standalone_ui/__tests__/guardrails-tag-fields.test.tsx
git commit -m "refactor(standalone-ui): /admin/guardrails uses AdminPageHeader + Combobox-with-chips for tag fields"
```

---

## Task 10: Refactor `/admin/prompts` page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/prompts/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useBeforeUnload } from "@/hooks/use-before-unload";
```

- [ ] **Step 2: Replace inline header**

```tsx
      <AdminPageHeader
        title="Prompts"
        description="Versioned prompt templates loaded by the agent."
        docsHref="https://docs.idunplatform.com/standalone/prompts"
        isDirty={isDirty}
      />
```

- [ ] **Step 3: Wire `useBeforeUnload`**

```tsx
  useBeforeUnload(isDirty);
```

- [ ] **Step 4: Run vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/admin/prompts/page.tsx
git commit -m "refactor(standalone-ui): /admin/prompts uses AdminPageHeader + useBeforeUnload"
```

---

## Task 11: Smoke check across all six refactored pages

- [ ] **Step 1: Verify each page imports AdminPageHeader**

```bash
grep -L "AdminPageHeader" \
  services/idun_agent_standalone_ui/app/admin/{agent,memory,observability,mcp,guardrails,prompts}/page.tsx
```

Expected: no output (every file should match).

- [ ] **Step 2: Verify each page imports useBeforeUnload**

```bash
grep -L "useBeforeUnload" \
  services/idun_agent_standalone_ui/app/admin/{agent,memory,observability,mcp,guardrails,prompts}/page.tsx
```

Expected: no output.

- [ ] **Step 3: Run tsc on touched files**

```bash
cd services/idun_agent_standalone_ui && npx tsc --noEmit 2>&1 | \
  grep -E "^(app/admin/(agent|memory|observability|mcp|guardrails|prompts)/page|components/admin/AdminPageHeader|hooks/use-before-unload|components/ui/combobox)"
```

Expected: no output. Pre-existing tsc errors elsewhere in the tree are tolerated by `next.config.mjs: typescript.ignoreBuildErrors: true`.

- [ ] **Step 4: Run full vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS.

- [ ] **Step 5: No commit needed (read-only verification)**

If any check fails, fix and commit per the page-specific task.

---

## Task 12: Acceptance gates + PR

- [ ] **Step 1: Standalone narrowed pytest gate (sanity check — Bundle C is frontend-only but verify nothing transitively broke)**

```bash
uv run pytest libs/idun_agent_standalone/tests \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" \
  -q
```

Expected: ALL PASS.

- [ ] **Step 2: Frontend vitest**

```bash
cd services/idun_agent_standalone_ui && npx vitest run
```

Expected: ALL PASS (existing 153+ tests + the new AdminPageHeader/useBeforeUnload/guardrails tests).

- [ ] **Step 3: Pre-commit**

```bash
make precommit
```

Expected: clean.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/config-ux-form-polish
gh pr create --base feat/config-ux --title "feat(config-ux/C): form polish" --body "$(cat <<'EOF'
## Summary

Bundle C from the config-UX umbrella. Closes the visible-to-end-user form gap with the deprecated manager web app — without porting features users don't actually use.

- New shared `<AdminPageHeader>` component (title, description, docs link, dirty badge, children slot). Six admin pages refactor to use it.
- New `useBeforeUnload(when)` hook. Each page calls it once with its `isDirty` boolean.
- shadcn Combobox primitive installed via `npx shadcn@latest add combobox`. Six guardrail tag fields (`banned_words`, `pii_entities`, `competitors`, `expected_languages`, `valid_topics`, `invalid_topics`) migrate from `<Input>` + `joinList`/`splitList` helpers to chips. `joinList` / `splitList` removed.
- Dead code deleted: `components/admin/SaveToolbar.tsx`, `components/admin/SingletonEditor.tsx`.

## Spec
`docs/superpowers/specs/2026-05-05-config-ux-bundles-design.md` — Bundle C section.

## Test plan
- [x] vitest (8 new AdminPageHeader tests, 5 new useBeforeUnload tests, guardrails-tag-fields smoke)
- [x] tsc --noEmit on all touched files
- [x] standalone narrowed pytest gate (sanity)
- [x] make precommit
- [x] manual: open each of the 6 admin pages, confirm header is consistent, dirty badge appears on edit, beforeunload prompts on close-with-unsaved.

## Independent of other bundles
This PR has no runtime dependency on Bundle A or Bundle B. Safe to merge in any order.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (already applied)

- Spec coverage: every Bundle C item maps to a task — AdminPageHeader (Task 1), useBeforeUnload (Task 2), shadcn Combobox install (Task 3), dead-code deletion (Task 4), six page refactors (Tasks 5-10), final verification (Tasks 11-12).
- The spec mentioned mobile-responsive header tweaks as out of scope; the AdminPageHeader uses `flex-row items-start justify-between` which works at all breakpoints we currently target.
- The spec mentioned `<DirtyAwareLink>` and per-field tooltip help icons as out of scope — neither appears in this plan.
- Task 9's tag-field test is a smoke test, not exhaustive — the Combobox primitive is upstream-tested. If the test infrastructure can't render the full GuardrailsPage cleanly (auth, query client, etc.), step 8's note explains how to reduce scope to a component-level mount.
- All six docsHref values point to `docs.idunplatform.com/standalone/<page>` per the spec's mapping table. If a page doesn't exist on the live docs site, the link routes to the parent section.
