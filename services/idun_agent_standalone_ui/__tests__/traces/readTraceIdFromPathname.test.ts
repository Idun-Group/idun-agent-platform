import { describe, expect, it } from "vitest";

import { readTraceIdFromPathname } from "@/app/admin/traces/[traceId]/TraceDetailClient";

describe("readTraceIdFromPathname", () => {
  it("extracts the trace id from a real path", () => {
    expect(readTraceIdFromPathname("/admin/traces/abc123/")).toBe("abc123");
    expect(readTraceIdFromPathname("/admin/traces/abc123")).toBe("abc123");
  });

  it("returns null for the build-time placeholder", () => {
    expect(readTraceIdFromPathname("/admin/traces/__trace__/")).toBeNull();
    expect(readTraceIdFromPathname("/admin/traces/__trace__")).toBeNull();
  });

  it("returns null when pathname is null", () => {
    expect(readTraceIdFromPathname(null)).toBeNull();
  });

  it("returns null for the list page (no id segment)", () => {
    expect(readTraceIdFromPathname("/admin/traces/")).toBeNull();
    expect(readTraceIdFromPathname("/admin/traces")).toBeNull();
  });

  it("returns null for unrelated admin paths", () => {
    expect(readTraceIdFromPathname("/admin/agent/")).toBeNull();
    expect(readTraceIdFromPathname("/")).toBeNull();
  });
});
