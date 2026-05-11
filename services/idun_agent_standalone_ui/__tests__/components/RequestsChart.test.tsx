import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { RequestsChart } from "@/components/dashboard/RequestsChart";

describe("RequestsChart", () => {
  it("renders the chart when data is present", () => {
    render(
      <RequestsChart
        series={[
          { t: "2026-05-11T15:00:00Z", v: 10 },
          { t: "2026-05-11T15:05:00Z", v: 15 },
          { t: "2026-05-11T15:10:00Z", v: 8 },
        ]}
      />,
    );
    expect(screen.getByTestId("requests-chart")).toBeInTheDocument();
  });

  it("renders an empty-state when series is empty", () => {
    render(<RequestsChart series={[]} />);
    expect(screen.getByText(/Waiting for traffic/i)).toBeInTheDocument();
  });
});
