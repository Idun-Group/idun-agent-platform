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
      width: `${w}px`,
      height: `${h}px`,
      transform: `translate(${-cfg.bounds.x + padding}px, ${
        -cfg.bounds.y + padding
      }px) scale(1)`,
      transformOrigin: "0 0",
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
  try {
    a.click();
  } finally {
    a.remove();
  }
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
