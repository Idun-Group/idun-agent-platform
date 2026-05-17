import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KpiCard } from "@/components/dashboard/KpiCard";

describe("KpiCard", () => {
  it("renders headline, label, and positive delta", () => {
    render(
      <KpiCard
        label="Requests"
        value="12,408"
        deltaLabel="↑ 14% vs prior 24h"
        deltaDirection="up"
      />,
    );
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("12,408")).toBeInTheDocument();
    expect(screen.getByText(/14% vs prior 24h/)).toBeInTheDocument();
  });

  it("renders a skeleton when loading", () => {
    render(<KpiCard label="Requests" loading />);
    expect(screen.getByTestId("kpi-skeleton")).toBeInTheDocument();
  });

  it("omits delta when no prior data", () => {
    render(<KpiCard label="Cost" value="$0.00" />);
    expect(screen.queryByText(/vs prior/)).not.toBeInTheDocument();
  });
});
