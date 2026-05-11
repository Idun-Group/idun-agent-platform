import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LatencyChart } from "@/components/dashboard/LatencyChart";

describe("LatencyChart", () => {
  it("renders dual lines when data present", () => {
    render(
      <LatencyChart
        series={[
          { t: "2026-05-11T15:00:00Z", p50: 220, p95: 820 },
          { t: "2026-05-11T15:05:00Z", p50: 240, p95: 900 },
        ]}
      />,
    );
    expect(screen.getByTestId("latency-chart")).toBeInTheDocument();
  });

  it("shows empty-state when no series", () => {
    render(<LatencyChart series={[]} />);
    expect(screen.getByText(/Waiting for traffic/i)).toBeInTheDocument();
  });
});
