import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TopErrorsTable } from "@/components/dashboard/TopErrorsTable";

describe("TopErrorsTable", () => {
  it("renders rows with span name, count and a trace link", () => {
    render(
      <TopErrorsTable
        rows={[
          {
            spanName: "execute_tool refund_api",
            count: 23,
            lastSeen: "2026-05-11T15:58:00Z",
            sampleTraceId: "7f3a2c00",
          },
        ]}
      />,
    );
    expect(screen.getByText("execute_tool refund_api")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /7f3a2c00/ })).toHaveAttribute(
      "href",
      "/admin/traces/7f3a2c00",
    );
  });

  it("renders empty-state when rows is empty", () => {
    render(<TopErrorsTable rows={[]} />);
    expect(screen.getByText(/No errors in this window/i)).toBeInTheDocument();
  });
});
