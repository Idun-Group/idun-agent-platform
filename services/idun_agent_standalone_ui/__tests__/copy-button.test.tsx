import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "@/components/common/CopyButton";

describe("CopyButton", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    vi.restoreAllMocks();
  });

  it("copies a string value verbatim", () => {
    render(<CopyButton value="hello" />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("pretty-prints an object value", () => {
    render(<CopyButton value={{ a: 1 }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it("falls back to String(...) when JSON.stringify returns undefined", () => {
    render(<CopyButton value={undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("undefined");
  });

  it("falls back to String(...) when JSON.stringify throws (circular ref)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    render(<CopyButton value={circular} />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const argument = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(typeof argument).toBe("string");
  });

  it("falls back to String(...) when JSON.stringify throws (BigInt)", () => {
    render(<CopyButton value={1n} />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("1");
  });
});
