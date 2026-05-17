import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RangePicker } from "@/components/dashboard/RangePicker";

describe("RangePicker", () => {
  it("renders all four ranges and marks the active one", () => {
    const onChange = vi.fn();
    render(<RangePicker value="24h" onChange={onChange} />);
    for (const label of ["1h", "24h", "7d", "30d"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "24h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("calls onChange when a non-active range is clicked", () => {
    const onChange = vi.fn();
    render(<RangePicker value="24h" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onChange).toHaveBeenCalledWith("7d");
  });
});
