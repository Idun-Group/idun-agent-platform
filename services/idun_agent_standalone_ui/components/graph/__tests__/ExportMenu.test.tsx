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
