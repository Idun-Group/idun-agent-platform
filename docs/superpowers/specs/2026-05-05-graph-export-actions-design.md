# Graph Export Actions Design

> **Status:** Locked — ready for implementation plan
> **Branch:** `worktree-graph-display` (continues the ADK + LangGraph graph visualizer work)
> **Depends on:** the AgentGraph ReactFlow canvas shipped on this branch (`5da1b5f9`)

---

## 1. Goal

Add a small "Export ▾" dropdown to the Agent graph card in the standalone UI (both `WizardDone` and `app/admin/agent`). Four menu items:

1. **Copy as image** — copies the graph as a PNG to the OS clipboard.
2. **Download PNG** — downloads `<agent-slug>-graph.png` (raster, 2x retina-friendly).
3. **Download SVG** — downloads `<agent-slug>-graph.svg` (vector).
4. **Copy Mermaid source** — copies the engine's Mermaid source string (calls the existing `/agent/graph/mermaid` route) to the clipboard as text.

All exports capture the **whole graph** regardless of current pan/zoom (24px padding around the fitted bounds, white background for raster).

## 2. Why

The graph is the demo target — users want to drop it into Slack, slide decks, design docs, and markdown READMEs. Today the only path is OS-level screenshot, which captures whatever is on screen, fights browser chrome, and looks unprofessional. Native export from inside the app removes friction and produces deterministic results regardless of viewport.

Mermaid copy is included because the engine already exposes the source via `/agent/graph/mermaid`; piping it to the clipboard turns "use this in markdown" into a single click for technical users.

## 3. Out of scope

- **PDF export** — no current demand, would add another dependency.
- **Background-color picker / theme-aware (dark-mode) export** — locked to white background for raster. SVG keeps `currentColor` where applicable so it inherits the embedding context. Configurable in v2 if asked.
- **Resolution picker / @1x toggle** — locked to 2x device pixel ratio.
- **Bulk export across multiple agents** — single-graph only.
- **Server-side rendering of images in the engine** — explicit non-goal per `2026-04-30-adk-langgraph-graph-visualizer-design.md` §3 ("the engine never renders an image; UI does"). Stays client-only.
- **Admin web (`services/idun_agent_web`) propagation** — that surface still uses Mermaid; adding the Export dropdown there is a follow-up branch.
- **Permalink / shareable URL copy** — standalone has no shareable URLs.
- **Current-viewport-only export** — covered by Q3 of the brainstorm; rejected because the "share my agent" use case wants completeness.

## 4. Architecture

Three new units, two existing components touched, one new dependency.

```
services/idun_agent_standalone_ui/
  ├─ package.json                               MODIFY — add html-to-image
  ├─ lib/graph-export.ts                        NEW    — pure helpers (4 functions + slug)
  ├─ components/graph/
  │   ├─ AgentGraph.tsx                         MODIFY — wrap in forwardRef, expose handle
  │   └─ ExportMenu.tsx                         NEW    — dropdown UI + click handlers
  ├─ components/onboarding/WizardDone.tsx       MODIFY — render <ExportMenu> in card header
  └─ app/admin/agent/page.tsx                   MODIFY — same
```

**Boundary**: `lib/graph-export.ts` is pure — takes a DOM element + IR + name, performs file/clipboard side-effects. `<ExportMenu>` is the UI shell. `<AgentGraph>` exposes a handle (`forwardRef` + `useImperativeHandle`) so the menu — which lives in the card *header*, outside the ReactFlowProvider tree — can reach the canvas DOM and node bounds at click time.

The ref handle is the load-bearing decision: it's chosen over a compound component or render prop so the two consumers (`WizardDone`, `app/admin/agent`) keep their existing card layouts and only add `<ExportMenu>` next to their existing title.

## 5. Dependencies

Add to `services/idun_agent_standalone_ui/package.json`:

- `html-to-image` (^1.x, MIT) — ~20KB gzipped. ReactFlow v12 docs' recommended companion for image export. Provides `toPng`, `toSvg`, `toBlob`.

No other dependencies needed. Sonner (toast), shadcn `<DropdownMenu>`, lucide icons (`Download`, `Image`, `FileImage`, `FileText`) are already in the codebase.

## 6. AgentGraph handle

Modify `components/graph/AgentGraph.tsx`. Wrap the existing component in `forwardRef`, add `useImperativeHandle`:

```ts
export interface AgentGraphHandle {
  /** The .react-flow root DOM element (for html-to-image), or null before mount. */
  getCanvasElement(): HTMLElement | null;
  /** World-coordinate bounding box of all nodes; null if no nodes. */
  getNodesBounds(): { x: number; y: number; width: number; height: number } | null;
}

export const AgentGraph = forwardRef<AgentGraphHandle, AgentGraphProps>(
  function AgentGraph({ graph, height = 420 }, ref) {
    // Inside ReactFlowProvider — useReactFlow() works here.
    // useImperativeHandle exposes the two methods using the existing
    // `nodes` array and a `containerRef` on the canvas div.
    ...
  },
);
```

`getNodesBounds` uses ReactFlow's `getNodesBounds` helper from `@xyflow/react` against the layout-positioned nodes (post-dagre).

## 7. `lib/graph-export.ts` — pure helpers

Single module, four exports plus the slug helper.

```ts
import { toPng, toSvg, toBlob } from "html-to-image";
import { api } from "@/lib/api";

export function slugifyAgentName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "agent";
}

interface ExportConfig {
  bounds: { x: number; y: number; width: number; height: number };
  padding?: number;        // default 24
  pixelRatio?: number;     // default 2 (PNG only; SVG ignores)
  background?: string;     // default "#ffffff"
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
      // Strip ReactFlow chrome from the export.
      const cls = node.classList;
      if (!cls) return true;
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

**Notes**:

- `htmlToImageOpts` centralizes the bounds/transform/filter logic so all four entry points behave identically.
- The `filter` predicate strips minimap/controls/attribution/dotted-background so the exported image shows just the graph on a clean plate.
- Errors propagate as rejected promises; the UI layer (`<ExportMenu>`) handles them with toasts.

## 8. `<ExportMenu>` UI

New file `components/graph/ExportMenu.tsx`. Uses shadcn `<DropdownMenu>` (already in codebase per existing admin pages). Lucide icons for the trigger and items.

```tsx
"use client";

import { Download, Image as ImageIcon, FileImage, FileText, ChevronDown } from "lucide-react";
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
  graphRef: React.RefObject<AgentGraphHandle | null>;
  agentName: string;
  disabled?: boolean;
}

export function ExportMenu({ graphRef, agentName, disabled }: ExportMenuProps) {
  const guard = (action: () => Promise<void>, success: string, failure: string) =>
    async () => {
      try {
        await action();
        toast.success(success);
      } catch (err) {
        console.error(err);
        toast.error(failure);
      }
    };

  const withCanvas = (kind: "png-clip" | "png-dl" | "svg-dl") => async () => {
    const canvas = graphRef.current?.getCanvasElement();
    const bounds = graphRef.current?.getNodesBounds();
    if (!canvas || !bounds) {
      toast.error("Graph not ready");
      return;
    }
    const cfg = { bounds };
    if (kind === "png-clip")
      await guard(
        () => copyPngToClipboard(canvas, cfg),
        "Copied graph image to clipboard",
        "Clipboard not available — try downloading instead",
      )();
    if (kind === "png-dl")
      await guard(
        () => exportToPng(canvas, agentName, cfg),
        "Downloaded PNG",
        "Couldn't export PNG",
      )();
    if (kind === "svg-dl")
      await guard(
        () => exportToSvg(canvas, agentName, cfg),
        "Downloaded SVG",
        "Couldn't export SVG",
      )();
  };

  const onCopyMermaid = guard(
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

The `disabled` prop is wired by the parent based on `graphQuery.isLoading || isError`. The `withCanvas` guard handles the rare race where the menu opens before the canvas mounted (button disabled state should already prevent it; defense in depth).

## 9. Render-point integration

### `WizardDone.tsx`

Current state (post-Task 16): the second card has `<CardHeader><CardTitle>Your agent</CardTitle></CardHeader>` and a body with `<AgentGraph graph={data} />`. Diff:

1. `import { ExportMenu } from "@/components/graph/ExportMenu";`
2. Add `const graphRef = useRef<AgentGraphHandle>(null);`.
3. Replace the title-only header with a flex header:
   ```tsx
   <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
     <CardTitle className="text-base">Your agent</CardTitle>
     <ExportMenu
       graphRef={graphRef}
       agentName={agent.name}
       disabled={graphQuery.isLoading || graphQuery.isError}
     />
   </CardHeader>
   ```
4. Pass `ref={graphRef}` to `<AgentGraph>`.

### `app/admin/agent/page.tsx`

Same pattern. The "Agent graph" card already has a `<CardHeader>` with title + description; we add `<ExportMenu>` to the right of the title using the same flex layout (or keep description in a second row).

## 10. Testing

### `lib/__tests__/graph-export.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { slugifyAgentName, exportToPng, copyMermaidToClipboard } from "../graph-export";

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,FAKE"),
  toSvg: vi.fn().mockResolvedValue("data:image/svg+xml;FAKE"),
  toBlob: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" })),
}));
vi.mock("@/lib/api", () => ({
  api: { getAgentGraphMermaid: vi.fn().mockResolvedValue({ mermaid: "graph TD\n  a-->b" }) },
}));

describe("slugifyAgentName", () => {
  it("lowercases + dashes spaces", () => {
    expect(slugifyAgentName("My Cool Agent")).toBe("my-cool-agent");
  });
  it("strips non-ASCII", () => {
    expect(slugifyAgentName("naïve Agent")).toBe("nave-agent");
  });
  it("falls back to 'agent' for empty result", () => {
    expect(slugifyAgentName("***")).toBe("agent");
  });
});

describe("exportToPng", () => {
  it("triggers a download with slug-based filename", async () => {
    const canvas = document.createElement("div");
    const clickSpy = vi.fn();
    document.createElement = ((orig) =>
      function (tag: string) {
        const el = orig.call(document, tag);
        if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
        return el;
      })(document.createElement.bind(document));
    await exportToPng(canvas, "My Agent", {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("copyMermaidToClipboard", () => {
  it("writes mermaid text to clipboard", async () => {
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

### `components/graph/__tests__/ExportMenu.test.tsx`

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/graph-export", () => ({
  copyPngToClipboard: vi.fn().mockResolvedValue(undefined),
  copyMermaidToClipboard: vi.fn().mockResolvedValue(undefined),
  exportToPng: vi.fn().mockResolvedValue(undefined),
  exportToSvg: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ExportMenu } from "../ExportMenu";
import * as exporters from "@/lib/graph-export";
import { toast } from "sonner";

const mkRef = () => ({
  current: {
    getCanvasElement: () => document.createElement("div"),
    getNodesBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  },
});

describe("ExportMenu", () => {
  it("renders 4 menu items when opened", async () => {
    render(<ExportMenu graphRef={mkRef() as any} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByText("Copy as image")).toBeInTheDocument();
    expect(screen.getByText("Download PNG")).toBeInTheDocument();
    expect(screen.getByText("Download SVG")).toBeInTheDocument();
    expect(screen.getByText("Copy Mermaid source")).toBeInTheDocument();
  });

  it("calls exportToPng on Download PNG click", async () => {
    render(<ExportMenu graphRef={mkRef() as any} agentName="x" />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText("Download PNG"));
    expect(exporters.exportToPng).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Downloaded PNG");
  });

  it("button is disabled when disabled prop set", () => {
    render(<ExportMenu graphRef={mkRef() as any} agentName="x" disabled />);
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
  });
});
```

### E2E

Extend `e2e/onboarding.spec.ts` with one assertion: the Export button is visible after `WizardDone` renders the graph. **No** click-through (Playwright's download API works but adds 5+ seconds for marginal value over the unit tests).

## 11. Known unknowns to verify during implementation

1. **Minimap / controls in the export**: the `filter` predicate in `htmlToImageOpts` strips them; verify against actual output. If anything leaks (e.g., handle dots, inline SVG of edges), extend the filter list.
2. **SVG `currentColor` handling**: html-to-image inlines computed styles; some `currentColor` references may resolve to whatever the page's foreground is at export time. Acceptable for v1 — the SVG is meant to be rendered, not edited.
3. **Safari clipboard image API**: `ClipboardItem` with image/png blobs is supported in Safari 13.4+ but historically flaky for async paths. The destructive toast fallback covers this; verify behavior on Safari before claiming "all browsers".
4. **html-to-image and `<canvas>` tainting**: ReactFlow renders nodes as DOM, not canvas, so no CORS taint. Confirmed safe.

## 12. Follow-ups (out of scope)

- **Admin web (`idun_agent_web`) propagation**: when that surface migrates from Mermaid to `<AgentGraph>` (already a follow-up from the original visualizer spec), wire up the same Export dropdown.
- **PDF export, theme-aware export, resolution picker**: see §3.
- **Server-side export endpoint**: explicit non-goal; the engine never renders images.
- **"Copy as Markdown" with embedded base64 PNG**: trivial future v2 if asked.
