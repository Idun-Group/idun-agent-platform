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
