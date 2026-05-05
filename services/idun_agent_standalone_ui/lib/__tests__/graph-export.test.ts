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
