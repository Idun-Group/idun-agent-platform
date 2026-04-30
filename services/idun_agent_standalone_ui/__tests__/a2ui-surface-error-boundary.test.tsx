import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { A2UISurfaceErrorBoundary } from "@/components/chat/a2ui/A2UISurfaceErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("kaboom");
}

describe("A2UISurfaceErrorBoundary", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it("renders children when no error is thrown", () => {
    const { getByText } = render(
      <A2UISurfaceErrorBoundary>
        <div>ok</div>
      </A2UISurfaceErrorBoundary>,
    );
    expect(getByText("ok")).toBeInTheDocument();
  });

  it("renders nothing when a child throws on render", () => {
    const { container } = render(
      <A2UISurfaceErrorBoundary>
        <Boom />
      </A2UISurfaceErrorBoundary>,
    );
    expect(container.textContent).toBe("");
  });

  it("calls console.error with the [a2ui] prefix when catching", () => {
    render(
      <A2UISurfaceErrorBoundary>
        <Boom />
      </A2UISurfaceErrorBoundary>,
    );
    // The boundary calls console.error once with our prefix; React itself
    // also logs the error multiple times during the dev render path.
    // Filter for the boundary's own log line.
    const ourLogs = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes("[a2ui]"),
    );
    expect(ourLogs.length).toBeGreaterThanOrEqual(1);
    expect(String(ourLogs[0][0])).toContain("surface render failed");
  });
});
