import { describe, expect, it } from "vitest";

import { formatCostUSD } from "@/lib/format/money";

describe("formatCostUSD", () => {
  it("returns an em-dash for null", () => {
    expect(formatCostUSD(null)).toBe("—");
  });

  it("formats zero as $0", () => {
    expect(formatCostUSD(0)).toBe("$0");
  });

  it("uses 4 fraction digits for very small values", () => {
    // Below $0.01 we still want a precise display, not '<$0.01'.
    expect(formatCostUSD(0.0042)).toBe("$0.0042");
    expect(formatCostUSD(0.0001)).toBe("$0.0001");
  });

  it("uses 4 fraction digits for sub-dollar values", () => {
    expect(formatCostUSD(0.04)).toBe("$0.0400");
    expect(formatCostUSD(0.0123)).toBe("$0.0123");
  });

  it("uses 2 fraction digits for >= $1", () => {
    expect(formatCostUSD(1)).toBe("$1.00");
    expect(formatCostUSD(12.5)).toBe("$12.50");
  });

  it("prefixes with ~ when partial=true", () => {
    expect(formatCostUSD(0.0042, { partial: true })).toBe("~$0.0042");
    expect(formatCostUSD(0, { partial: true })).toBe("~$0");
  });

  it("ignores partial when value is null", () => {
    expect(formatCostUSD(null, { partial: true })).toBe("—");
  });
});
