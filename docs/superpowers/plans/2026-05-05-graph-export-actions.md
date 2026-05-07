# Graph Export Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export ▾" dropdown to the Agent graph card in the standalone UI with four actions (copy PNG to clipboard, download PNG, download SVG, copy Mermaid source).

**Architecture:** Pure helpers in `lib/graph-export.ts` perform the file/clipboard side effects. `<AgentGraph>` becomes a `forwardRef` component exposing a handle so the menu (rendered in the card header, outside the canvas's ReactFlowProvider) can reach the canvas DOM and node bounds. `<ExportMenu>` is the shadcn `<DropdownMenu>` shell that calls the helpers and surfaces sonner toasts.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, shadcn `<DropdownMenu>` (already installed), `lucide-react` (already installed), `sonner` (already installed), `@xyflow/react v12`, **new:** `html-to-image ^1.x` (~20KB gz, MIT).

**Spec:** `docs/superpowers/specs/2026-05-05-graph-export-actions-design.md`. If the spec and plan disagree, update the spec first.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `services/idun_agent_standalone_ui/package.json` | MODIFY | Add `html-to-image` dependency |
| `services/idun_agent_standalone_ui/lib/graph-export.ts` | NEW | Pure helpers: `slugifyAgentName`, `exportToPng`, `exportToSvg`, `copyPngToClipboard`, `copyMermaidToClipboard` |
| `services/idun_agent_standalone_ui/lib/__tests__/graph-export.test.ts` | NEW | Unit tests for slug + helpers |
| `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx` | MODIFY | Wrap in `forwardRef`, expose `AgentGraphHandle` via `useImperativeHandle` |
| `services/idun_agent_standalone_ui/components/graph/ExportMenu.tsx` | NEW | Dropdown UI + click handlers + toast feedback |
| `services/idun_agent_standalone_ui/components/graph/__tests__/ExportMenu.test.tsx` | NEW | Component tests for menu rendering + click → helper dispatch |
| `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx` | MODIFY | Mount `<ExportMenu>` in the "Your agent" card header, ref into `<AgentGraph>` |
| `services/idun_agent_standalone_ui/app/admin/agent/page.tsx` | MODIFY | Same: mount `<ExportMenu>` in the "Agent graph" card header |
| `services/idun_agent_standalone_ui/e2e/onboarding.spec.ts` | MODIFY | Light E2E assertion: Export button is visible on WizardDone |

---

## Task 1: Add `html-to-image` dependency

**Files:**
- Modify: `services/idun_agent_standalone_ui/package.json`
- Modify: `services/idun_agent_standalone_ui/pnpm-lock.yaml` (regenerated)

This is a single-step task — the lib is needed by Task 2's tests, which mock it.

- [ ] **Step 1: Install the dep**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm add html-to-image
```

Expected: `html-to-image` appears in `package.json` `dependencies`. Lockfile updated.

- [ ] **Step 2: Verify install**

```bash
node -e "console.log(require('html-to-image').toPng.toString().slice(0, 40))"
```

Expected: prints the first ~40 chars of the `toPng` function source — proves the module resolves.

- [ ] **Step 3: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/package.json \
        services/idun_agent_standalone_ui/pnpm-lock.yaml
git commit -m "build(standalone-ui): add html-to-image for graph export"
```

---

## Task 2: `lib/graph-export.ts` — pure helpers + slugify

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/graph-export.ts`
- Create: `services/idun_agent_standalone_ui/lib/__tests__/graph-export.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/lib/__tests__/graph-export.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,FAKEPNG"),
  toSvg: vi.fn().mockResolvedValue("data:image/svg+xml;FAKESVG"),
  toBlob: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAgentGraphMermaid: vi.fn().mockResolvedValue({ mermaid: "graph TD\n  a-->b" }),
  },
}));

import * as htmlToImage from "html-to-image";
import {
  copyMermaidToClipboard,
  copyPngToClipboard,
  exportToPng,
  exportToSvg,
  slugifyAgentName,
} from "../graph-export";

const sampleBounds = { x: 0, y: 0, width: 100, height: 100 };

describe("slugifyAgentName", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugifyAgentName("My Cool Agent")).toBe("my-cool-agent");
  });
  it("collapses non-ASCII", () => {
    expect(slugifyAgentName("naïve Agent")).toBe("nave-agent");
  });
  it("collapses multiple consecutive dashes", () => {
    expect(slugifyAgentName("foo   bar")).toBe("foo-bar");
  });
  it("strips leading/trailing dashes", () => {
    expect(slugifyAgentName("--foo--")).toBe("foo");
  });
  it("falls back to 'agent' for empty result", () => {
    expect(slugifyAgentName("***")).toBe("agent");
    expect(slugifyAgentName("")).toBe("agent");
  });
});

describe("exportToPng", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls html-to-image.toPng with bounds-derived dimensions", async () => {
    const canvas = document.createElement("div");
    await exportToPng(canvas, "Test", { bounds: sampleBounds });
    expect(htmlToImage.toPng).toHaveBeenCalledOnce();
    const opts = vi.mocked(htmlToImage.toPng).mock.calls[0][1]!;
    // 100 + 2 * 24 padding = 148
    expect(opts.width).toBe(148);
    expect(opts.height).toBe(148);
    expect(opts.pixelRatio).toBe(2);
    expect(opts.backgroundColor).toBe("#ffffff");
  });

  it("triggers an anchor download with slugified filename", async () => {
    const canvas = document.createElement("div");
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await exportToPng(canvas, "My Agent", { bounds: sampleBounds });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

describe("exportToSvg", () => {
  beforeEach(() => vi.clearAllMocks());
  it("calls html-to-image.toSvg", async () => {
    const canvas = document.createElement("div");
    await exportToSvg(canvas, "Test", { bounds: sampleBounds });
    expect(htmlToImage.toSvg).toHaveBeenCalledOnce();
  });
});

describe("copyPngToClipboard", () => {
  it("writes a PNG ClipboardItem to navigator.clipboard", async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { write: writeSpy },
      configurable: true,
    });
    // jsdom doesn't ship ClipboardItem; stub it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ClipboardItem = class {
      constructor(public payload: Record<string, Blob>) {}
    };
    const canvas = document.createElement("div");
    await copyPngToClipboard(canvas, { bounds: sampleBounds });
    expect(writeSpy).toHaveBeenCalledOnce();
  });

  it("throws when clipboard image API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const canvas = document.createElement("div");
    await expect(
      copyPngToClipboard(canvas, { bounds: sampleBounds }),
    ).rejects.toThrow(/clipboard/i);
  });
});

describe("copyMermaidToClipboard", () => {
  it("writes the mermaid source via clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await copyMermaidToClipboard();
    expect(writeText).toHaveBeenCalledWith("graph TD\n  a-->b");
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run lib/__tests__/graph-export.test.ts
```

Expected: import errors / module-not-found for `../graph-export`.

- [ ] **Step 3: Implement the module**

Create `services/idun_agent_standalone_ui/lib/graph-export.ts`:

```ts
/**
 * Pure helpers for exporting the AgentGraph canvas as image / clipboard data.
 *
 * Side effects (clipboard writes, anchor downloads) happen here so the
 * `<ExportMenu>` UI shell stays free of DOM trickery and easy to test.
 */

import { toBlob, toPng, toSvg } from "html-to-image";

import { api } from "@/lib/api";

export interface ExportConfig {
  bounds: { x: number; y: number; width: number; height: number };
  /** px around the fitted bounds. Default 24. */
  padding?: number;
  /** Raster scale factor. Default 2. SVG ignores this. */
  pixelRatio?: number;
  /** Background fill. Default white. */
  background?: string;
}

export function slugifyAgentName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "agent";
}

function htmlToImageOpts(cfg: ExportConfig) {
  const padding = cfg.padding ?? 24;
  const w = cfg.bounds.width + 2 * padding;
  const h = cfg.bounds.height + 2 * padding;
  return {
    width: w,
    height: h,
    pixelRatio: cfg.pixelRatio ?? 2,
    backgroundColor: cfg.background ?? "#ffffff",
    style: {
      transform: `translate(${-cfg.bounds.x + padding}px, ${
        -cfg.bounds.y + padding
      }px)`,
      transformOrigin: "0 0",
      width: `${w}px`,
      height: `${h}px`,
    },
    filter: (node: HTMLElement) => {
      const cls = node.classList;
      if (!cls) return true;
      // Strip ReactFlow chrome from the export — we want just nodes + edges
      // on a clean white plate, not the dotted background, minimap, controls,
      // or the attribution badge.
      return !(
        cls.contains("react-flow__minimap") ||
        cls.contains("react-flow__controls") ||
        cls.contains("react-flow__attribution") ||
        cls.contains("react-flow__background")
      );
    },
  };
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportToPng(
  canvas: HTMLElement,
  agentName: string,
  cfg: ExportConfig,
): Promise<void> {
  const dataUrl = await toPng(canvas, htmlToImageOpts(cfg));
  triggerDownload(dataUrl, `${slugifyAgentName(agentName)}-graph.png`);
}

export async function exportToSvg(
  canvas: HTMLElement,
  agentName: string,
  cfg: ExportConfig,
): Promise<void> {
  const dataUrl = await toSvg(canvas, htmlToImageOpts(cfg));
  triggerDownload(dataUrl, `${slugifyAgentName(agentName)}-graph.svg`);
}

export async function copyPngToClipboard(
  canvas: HTMLElement,
  cfg: ExportConfig,
): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error("Clipboard image API not available");
  }
  const blob = await toBlob(canvas, htmlToImageOpts(cfg));
  if (!blob) throw new Error("Failed to render image blob");
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}

export async function copyMermaidToClipboard(): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API not available");
  }
  const { mermaid } = await api.getAgentGraphMermaid();
  await navigator.clipboard.writeText(mermaid);
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run lib/__tests__/graph-export.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/lib/graph-export.ts \
        services/idun_agent_standalone_ui/lib/__tests__/graph-export.test.ts
git commit -m "feat(standalone-ui): add pure helpers for graph image + mermaid export"
```

---

## Task 3: `AgentGraph` exposes a handle via `forwardRef`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx`
- Modify: `services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx`

The existing `<AgentGraph>` is a plain function component. We change it to a `forwardRef` so a parent (the card header containing `<ExportMenu>`) can pull the canvas DOM element and the dagre-positioned node bounds at click time.

`getNodesBounds` from `@xyflow/react` lives outside `<ReactFlowProvider>` (it's a pure function over an array of nodes), so we can call it on our memoized `nodes` without needing `useReactFlow()`.

- [ ] **Step 1: Write the failing test addition**

Open `services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx`. Add this test alongside the existing one:

```tsx
import { useRef } from "react";

it("exposes a handle with getCanvasElement and getNodesBounds via ref", () => {
  function Probe() {
    const ref = useRef<import("../AgentGraph").AgentGraphHandle>(null);
    return (
      <div style={{ width: 800, height: 400 }}>
        <AgentGraph ref={ref} graph={FIXTURE} />
        <button
          data-testid="probe"
          onClick={() => {
            const el = ref.current?.getCanvasElement();
            const bounds = ref.current?.getNodesBounds();
            (window as unknown as { _probe: unknown })._probe = {
              hasEl: el instanceof HTMLElement,
              bounds,
            };
          }}
        />
      </div>
    );
  }
  render(<Probe />);
  screen.getByTestId("probe").click();
  const probe = (window as unknown as { _probe: { hasEl: boolean; bounds: unknown } })._probe;
  expect(probe.hasEl).toBe(true);
  expect(probe.bounds).toMatchObject({
    x: expect.any(Number),
    y: expect.any(Number),
    width: expect.any(Number),
    height: expect.any(Number),
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run components/graph/__tests__/AgentGraph.test.tsx
```

Expected: TS error or runtime error — `<AgentGraph>` doesn't accept a `ref` and doesn't export `AgentGraphHandle`.

- [ ] **Step 3: Convert `<AgentGraph>` to `forwardRef`**

Replace the entire content of `services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx`:

```tsx
"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  getNodesBounds,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";

import { PrettyEdge } from "./edges/PrettyEdge";
import { irToReactFlow } from "./irToReactFlow";
import { applyDagreLayout } from "./layout";
import { AgentNode } from "./nodes/AgentNode";
import { ToolNode } from "./nodes/ToolNode";

interface AgentGraphProps {
  graph: AgentGraphIR;
  /** Height of the canvas. Defaults to a sensible value for a card embed. */
  height?: number;
}

export interface AgentGraphHandle {
  /** The .react-flow root DOM element (for html-to-image), or null pre-mount. */
  getCanvasElement(): HTMLElement | null;
  /** World-coordinate bounding box of all nodes; null if no nodes. */
  getNodesBounds(): { x: number; y: number; width: number; height: number } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { agent: AgentNode, tool: ToolNode } as Record<string, React.ComponentType<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDGE_TYPES = { pretty: PrettyEdge } as Record<string, React.ComponentType<any>>;

export const AgentGraph = forwardRef<AgentGraphHandle, AgentGraphProps>(
  function AgentGraph({ graph, height = 420 }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const { nodes, edges } = useMemo(() => {
      const mapped = irToReactFlow(graph);
      return {
        nodes: applyDagreLayout(mapped.nodes, mapped.edges),
        edges: mapped.edges,
      };
    }, [graph]);

    useImperativeHandle(
      ref,
      () => ({
        getCanvasElement(): HTMLElement | null {
          // The .react-flow div is the deepest stable DOM ancestor of all
          // rendered nodes/edges. html-to-image walks down from here.
          return containerRef.current?.querySelector<HTMLElement>(".react-flow") ?? null;
        },
        getNodesBounds() {
          if (nodes.length === 0) return null;
          const b = getNodesBounds(nodes);
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        },
      }),
      [nodes],
    );

    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-md border bg-background"
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    );
  },
);
```

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run components/graph/__tests__/AgentGraph.test.tsx
```

Expected: all tests pass (existing single-node + new ref/handle test = 2 tests).

If the new test fails because `containerRef.current?.querySelector(".react-flow")` returns null in jsdom (the `<MiniMap pannable>` calls `ResizeObserver` which the existing setup stubs, but ReactFlow may or may not render a `.react-flow` class on the empty wrapper), relax the test to just assert `getNodesBounds()` returns a numeric box — `getCanvasElement()` correctness is verified end-to-end by Task 8's E2E.

- [ ] **Step 5: Run the full vitest suite — no regressions**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/components/graph/AgentGraph.tsx \
        services/idun_agent_standalone_ui/components/graph/__tests__/AgentGraph.test.tsx
git commit -m "feat(standalone-ui): expose AgentGraphHandle via forwardRef for export menu"
```

---

## Task 4: `<ExportMenu>` dropdown component

**Files:**
- Create: `services/idun_agent_standalone_ui/components/graph/ExportMenu.tsx`
- Create: `services/idun_agent_standalone_ui/components/graph/__tests__/ExportMenu.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `services/idun_agent_standalone_ui/components/graph/__tests__/ExportMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/graph-export", () => ({
  copyMermaidToClipboard: vi.fn().mockResolvedValue(undefined),
  copyPngToClipboard: vi.fn().mockResolvedValue(undefined),
  exportToPng: vi.fn().mockResolvedValue(undefined),
  exportToSvg: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import * as exporters from "@/lib/graph-export";
import { toast } from "sonner";
import type { AgentGraphHandle } from "../AgentGraph";
import { ExportMenu } from "../ExportMenu";

const mkRef = (): { current: AgentGraphHandle | null } => ({
  current: {
    getCanvasElement: () => document.createElement("div"),
    getNodesBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  },
});

describe("ExportMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders 4 menu items when opened", async () => {
    render(<ExportMenu graphRef={mkRef()} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByText("Copy as image")).toBeInTheDocument();
    expect(screen.getByText("Download PNG")).toBeInTheDocument();
    expect(screen.getByText("Download SVG")).toBeInTheDocument();
    expect(screen.getByText("Copy Mermaid source")).toBeInTheDocument();
  });

  it("calls exportToPng on Download PNG and toasts on success", async () => {
    render(<ExportMenu graphRef={mkRef()} agentName="my agent" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Download PNG"));
    expect(exporters.exportToPng).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Downloaded PNG");
  });

  it("calls exportToSvg on Download SVG", async () => {
    render(<ExportMenu graphRef={mkRef()} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Download SVG"));
    expect(exporters.exportToSvg).toHaveBeenCalledOnce();
  });

  it("calls copyPngToClipboard on Copy as image", async () => {
    render(<ExportMenu graphRef={mkRef()} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Copy as image"));
    expect(exporters.copyPngToClipboard).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Copied graph image to clipboard");
  });

  it("calls copyMermaidToClipboard on Copy Mermaid source", async () => {
    render(<ExportMenu graphRef={mkRef()} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Copy Mermaid source"));
    expect(exporters.copyMermaidToClipboard).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Copied Mermaid source");
  });

  it("surfaces an error toast when an exporter rejects", async () => {
    vi.mocked(exporters.exportToPng).mockRejectedValueOnce(new Error("boom"));
    render(<ExportMenu graphRef={mkRef()} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Download PNG"));
    expect(toast.error).toHaveBeenCalledWith("Couldn't export PNG");
  });

  it("disables the trigger button when disabled prop is true", () => {
    render(<ExportMenu graphRef={mkRef()} agentName="x" disabled />);
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
  });

  it("toasts an error when the canvas/bounds aren't ready", async () => {
    const ref: { current: AgentGraphHandle | null } = {
      current: {
        getCanvasElement: () => null,
        getNodesBounds: () => null,
      },
    };
    render(<ExportMenu graphRef={ref} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Download PNG"));
    expect(exporters.exportToPng).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Graph not ready");
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run components/graph/__tests__/ExportMenu.test.tsx
```

Expected: cannot find module `../ExportMenu`.

- [ ] **Step 3: Implement the component**

Create `services/idun_agent_standalone_ui/components/graph/ExportMenu.tsx`:

```tsx
"use client";

import {
  ChevronDown,
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  copyMermaidToClipboard,
  copyPngToClipboard,
  exportToPng,
  exportToSvg,
} from "@/lib/graph-export";

import type { AgentGraphHandle } from "./AgentGraph";

interface ExportMenuProps {
  graphRef: { current: AgentGraphHandle | null };
  agentName: string;
  /** Hide the menu while the graph query is loading or errored. */
  disabled?: boolean;
}

export function ExportMenu({ graphRef, agentName, disabled }: ExportMenuProps) {
  const guarded = (
    action: () => Promise<void>,
    success: string,
    failure: string,
  ) =>
    async () => {
      try {
        await action();
        toast.success(success);
      } catch (err) {
        console.error(err);
        toast.error(failure);
      }
    };

  // Resolve canvas + bounds at click time. The menu trigger's `disabled`
  // prop is the primary guard; this branch is defense in depth in case
  // the user clicks before the graph mounts (or html-to-image's bounds
  // helper fails for an empty IR).
  const withCanvas = (kind: "png-clip" | "png-dl" | "svg-dl") => async () => {
    const canvas = graphRef.current?.getCanvasElement();
    const bounds = graphRef.current?.getNodesBounds();
    if (!canvas || !bounds) {
      toast.error("Graph not ready");
      return;
    }
    const cfg = { bounds };
    if (kind === "png-clip")
      await guarded(
        () => copyPngToClipboard(canvas, cfg),
        "Copied graph image to clipboard",
        "Clipboard not available — try downloading instead",
      )();
    if (kind === "png-dl")
      await guarded(
        () => exportToPng(canvas, agentName, cfg),
        "Downloaded PNG",
        "Couldn't export PNG",
      )();
    if (kind === "svg-dl")
      await guarded(
        () => exportToSvg(canvas, agentName, cfg),
        "Downloaded SVG",
        "Couldn't export SVG",
      )();
  };

  const onCopyMermaid = guarded(
    copyMermaidToClipboard,
    "Copied Mermaid source",
    "Couldn't copy Mermaid source",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Export
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={withCanvas("png-clip")}>
          <ImageIcon className="mr-2 h-4 w-4" /> Copy as image
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={withCanvas("png-dl")}>
          <FileImage className="mr-2 h-4 w-4" /> Download PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={withCanvas("svg-dl")}>
          <FileImage className="mr-2 h-4 w-4" /> Download SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopyMermaid}>
          <FileText className="mr-2 h-4 w-4" /> Copy Mermaid source
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run components/graph/__tests__/ExportMenu.test.tsx
```

Expected: 8 tests pass.

- [ ] **Step 5: Run the full vitest suite — no regressions**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/components/graph/ExportMenu.tsx \
        services/idun_agent_standalone_ui/components/graph/__tests__/ExportMenu.test.tsx
git commit -m "feat(standalone-ui): add ExportMenu dropdown for graph actions"
```

---

## Task 5: Wire `<ExportMenu>` into `WizardDone`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx`

The "Your agent" card currently has a simple `<CardHeader><CardTitle>Your agent</CardTitle></CardHeader>` and a body with `<AgentGraph graph={data} />`. We add a ref to access the handle, a flex header to place the menu next to the title, and pass the ref to `<AgentGraph>`.

- [ ] **Step 1: Read the current file**

```bash
cat /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx
```

Identify the second `<Card>` block (titled "Your agent") and the imports.

- [ ] **Step 2: Add the import for `useRef`, the menu, and the handle type**

Near the top of the file, add to the existing imports:

```tsx
import { useRef } from "react";

import type { AgentGraphHandle } from "@/components/graph/AgentGraph";
import { ExportMenu } from "@/components/graph/ExportMenu";
```

(Adjust grouping to match the file's existing import-sort convention.)

- [ ] **Step 3: Add the ref and update the second card**

Inside the `WizardDone` component body, near the other hooks, add:

```tsx
const graphRef = useRef<AgentGraphHandle | null>(null);
```

Replace the second `<Card>` block (the "Your agent" one) with:

```tsx
<Card className="w-full">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-base">Your agent</CardTitle>
    <ExportMenu
      graphRef={graphRef}
      agentName={agent.name}
      disabled={
        graphQuery.isLoading || graphQuery.isError || !graphQuery.data
      }
    />
  </CardHeader>
  <CardContent>
    {graphQuery.isLoading && (
      <div className="h-[420px] animate-pulse rounded-md bg-muted" />
    )}
    {graphQuery.isError &&
      graphQuery.error instanceof ApiError &&
      graphQuery.error.status === 404 && (
        <p className="text-sm text-muted-foreground">
          Graph view isn&apos;t available for this agent type yet.
        </p>
      )}
    {graphQuery.isError &&
      !(
        graphQuery.error instanceof ApiError &&
        graphQuery.error.status === 404
      ) && (
        <Alert>
          <AlertTitle>Graph unavailable</AlertTitle>
          <AlertDescription>Try reloading the page.</AlertDescription>
        </Alert>
      )}
    {graphQuery.data && <AgentGraph ref={graphRef} graph={graphQuery.data} />}
  </CardContent>
</Card>
```

(The only changes vs. the existing block: `flex flex-row items-center justify-between space-y-0 pb-2` on the header, the `<ExportMenu>` element, and `ref={graphRef}` on `<AgentGraph>`.)

- [ ] **Step 4: Verify typecheck on the touched file**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec tsc --noEmit components/onboarding/WizardDone.tsx
```

Expected: no new errors specific to this file. Pre-existing project-wide errors are tracked in `next.config.mjs` (`ignoreBuildErrors: true`) — only flag NEW ones.

- [ ] **Step 5: Run the existing WizardDone tests — no regressions**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run __tests__/onboarding/WizardDone.test.tsx
```

Expected: all existing tests still pass. (The previous task added the graph-card and 404 cases; they should still hold.)

- [ ] **Step 6: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/components/onboarding/WizardDone.tsx
git commit -m "feat(standalone-ui): mount ExportMenu in WizardDone graph card"
```

---

## Task 6: Wire `<ExportMenu>` into the admin agent page

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

Same pattern as Task 5, in the Graph card section that was added in Task 17 of the prior plan.

- [ ] **Step 1: Read the file's current Graph card section**

```bash
grep -n "Agent graph\|graphQuery\|AgentGraph" /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui/app/admin/agent/page.tsx
```

Identify the imports and the Graph card block.

- [ ] **Step 2: Add the imports**

Near the top of the file, add:

```tsx
import { useRef } from "react";

import type { AgentGraphHandle } from "@/components/graph/AgentGraph";
import { ExportMenu } from "@/components/graph/ExportMenu";
```

(`useRef` may already be imported from React in this file — if so, just add the new symbols to the existing import.)

- [ ] **Step 3: Add the ref + update the Graph card**

Inside the page component's body, add:

```tsx
const graphRef = useRef<AgentGraphHandle | null>(null);
```

(Place near other hooks like `graphQuery`.)

Update the Graph card's `<CardHeader>` to use a flex layout and include the menu. The exact structure depends on the existing block; preserve the `<CardDescription>` if present. Example shape:

```tsx
<Card>
  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
    <div className="space-y-1.5">
      <CardTitle>Agent graph</CardTitle>
      <CardDescription>
        A visual map of this agent&apos;s sub-agents and tools.
      </CardDescription>
    </div>
    <ExportMenu
      graphRef={graphRef}
      agentName={agent.name}
      disabled={
        graphQuery.isLoading || graphQuery.isError || !graphQuery.data
      }
    />
  </CardHeader>
  <CardContent>
    {/* ... existing loading / 404 / error / data branches, unchanged ... */}
    {graphQuery.data && (
      <AgentGraph ref={graphRef} graph={graphQuery.data} height={480} />
    )}
  </CardContent>
</Card>
```

`agent.name` should be whatever this page already uses to display the agent's name (likely `agentQuery.data?.name` or similar — read the file for the exact identifier and substitute). If the agent name is not yet fetched at render time, fall back to `"agent"` so the slug still works.

- [ ] **Step 4: Typecheck the touched file**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec tsc --noEmit app/admin/agent/page.tsx
```

Expected: no new errors.

- [ ] **Step 5: Run the full vitest suite — no regressions**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/app/admin/agent/page.tsx
git commit -m "feat(standalone-ui): mount ExportMenu in admin agent Graph card"
```

---

## Task 7: E2E — Export button visible after WizardDone

**Files:**
- Modify: `services/idun_agent_standalone_ui/e2e/onboarding.spec.ts`

Light-touch assertion. We do NOT click-through to a real download (Playwright supports it but adds 5+ seconds for marginal coverage; the unit tests already verify dispatch).

- [ ] **Step 1: Locate the WizardDone-reaching test**

```bash
grep -n "Your agent\|Go to chat\|Set up your model" /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui/e2e/onboarding.spec.ts
```

Pick a test that already asserts WizardDone rendered (the existing graph-visible assertions added in the prior plan's Task 18 are good landmarks).

- [ ] **Step 2: Add the assertion**

Inside the chosen test, after the existing graph-visibility assertion (`page.locator('.react-flow__node').first()` or similar), append:

```ts
// Export dropdown is rendered in the "Your agent" card header.
await expect(
  page.getByRole("button", { name: /export/i }),
).toBeVisible();
```

If the test already has an explicit `expect(...).toBeVisible({ timeout })` pattern around the graph, mirror it here for consistency.

- [ ] **Step 3: Try to run the spec**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec playwright test e2e/onboarding.spec.ts
```

Expected: the spec passes including the new assertion. If the boot script fails locally with a stale `idun-standalone` (the published wheel without the post-rework CLI), report the failure — the assertion is still semantically correct and will pass in CI where the boot script's `uv run --project ROOT idun-standalone setup` resolves to the worktree's editable install.

- [ ] **Step 4: Commit**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
git add services/idun_agent_standalone_ui/e2e/onboarding.spec.ts
git commit -m "test(standalone-ui): assert Export dropdown is visible on WizardDone"
```

---

## Final verification

- [ ] **Standalone-UI typecheck (scoped to graph + onboarding)**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec tsc --noEmit
```

Expected: no NEW errors specific to the files added/modified by this plan. Pre-existing tracked errors are unchanged.

- [ ] **Full vitest suite**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/services/idun_agent_standalone_ui
pnpm exec vitest run
```

Expected: all green. Specifically: 9 new graph-export tests + 8 new ExportMenu tests + 1 new AgentGraph ref test + all pre-existing tests.

- [ ] **Standalone-UI build (catches lazy-load + bundle issues)**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display
make build-standalone-ui
```

Expected: clean build. Confirm `out/` contains the new bundle. The `html-to-image` chunk should appear in a chunk file (likely lazy-bundled with `<AgentGraph>`).

- [ ] **Manual smoke (optional, recommended)**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display

# Reuse the smoke-test orchestrator from .claude/smoke-test/ if available;
# otherwise spin up a single fixture:
mkdir -p /tmp/idun-export-smoke && cd /tmp/idun-export-smoke
cp /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/.claude/smoke-test/fixtures/adk_nested.py agent.py
cat > config.yaml <<EOF
agent:
  type: ADK
  config:
    name: smoke
    app_name: smoke
    agent: $(pwd)/agent.py:root_agent
EOF
PYTHONPATH=/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_engine/src:/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_schema/src:/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_standalone/src \
  IDUN_PORT=8000 IDUN_HOST=127.0.0.1 IDUN_ADMIN_AUTH_MODE=none \
  IDUN_CONFIG_PATH=$(pwd)/config.yaml \
  DATABASE_URL=sqlite+aiosqlite:///$(pwd)/standalone.db \
  /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/.venv/bin/idun-standalone setup --config $(pwd)/config.yaml
PYTHONPATH=/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_engine/src:/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_schema/src:/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/libs/idun_agent_standalone/src \
  IDUN_PORT=8000 IDUN_HOST=127.0.0.1 IDUN_ADMIN_AUTH_MODE=none \
  IDUN_CONFIG_PATH=$(pwd)/config.yaml \
  DATABASE_URL=sqlite+aiosqlite:///$(pwd)/standalone.db \
  /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.claude/worktrees/graph-display/.venv/bin/idun-standalone serve
```

Visit `http://localhost:8000/admin/agent/`. Verify:
- "Export ▾" button visible in the Agent graph card header.
- Click → 4 menu items appear.
- Click "Download PNG" → file downloads as `smoke-graph.png`. Open it: white background, fitted to all nodes, no minimap.
- Click "Download SVG" → file downloads. Open it: vector, scales cleanly.
- Click "Copy as image" → toast "Copied graph image to clipboard". Paste into a chat / image viewer.
- Click "Copy Mermaid source" → toast "Copied Mermaid source". Paste into a text editor.

---

## Self-review against the spec

| Spec section | Implemented in task |
|---|---|
| §4 Architecture (3 new units, 4 modified files) | Tasks 1-7 |
| §5 Dependency `html-to-image` | Task 1 |
| §6 `AgentGraphHandle` via forwardRef | Task 3 |
| §7 `lib/graph-export.ts` (5 functions) | Task 2 |
| §8 `<ExportMenu>` UI | Task 4 |
| §9 Render-point integration (WizardDone + admin page) | Tasks 5, 6 |
| §10 Tests (lib + ExportMenu + E2E) | Tasks 2, 4, 7 |
| §3 Out of scope (PDF, theme picker, resolution picker, server-side, admin web, permalink, viewport-only) | Honored — no tasks for these |

If a spec requirement isn't covered, add or extend a task — don't quietly drop it.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-05-graph-export-actions.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
