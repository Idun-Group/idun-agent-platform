import { describe, expect, it } from "vitest";

import { formatDuration } from "@/lib/format/duration";

describe("formatDuration", () => {
  it("returns an em-dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("renders sub-millisecond durations in microseconds", () => {
    // 0.3ms == 300µs
    expect(formatDuration(0.3)).toBe("300 µs");
    // 0.05ms == 50µs (rounds to whole µs)
    expect(formatDuration(0.05)).toBe("50 µs");
  });

  it("renders sub-second durations in milliseconds", () => {
    expect(formatDuration(1)).toBe("1 ms");
    expect(formatDuration(123)).toBe("123 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("renders sub-minute durations in seconds with two decimals", () => {
    expect(formatDuration(1000)).toBe("1.00 s");
    expect(formatDuration(3800)).toBe("3.80 s");
    expect(formatDuration(59999)).toBe("60.00 s");
  });

  it("renders minute+second for >= 60s", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(78_000)).toBe("1m 18s");
    expect(formatDuration(3_661_000)).toBe("61m 1s");
  });

  it("renders zero as 0 ms (not 0 µs)", () => {
    expect(formatDuration(0)).toBe("0 ms");
  });
});
