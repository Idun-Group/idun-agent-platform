import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

describe("getRuntimeStatus", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("GETs /admin/api/v1/runtime/status and returns the typed payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          lastStatus: "reload_failed",
          lastMessage: "Engine reload failed; config not saved.",
          lastError: "ImportError: no module named 'app'",
          lastReloadedAt: "2026-05-05T12:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.getRuntimeStatus();

    expect(result.lastStatus).toBe("reload_failed");
    expect(result.lastError).toContain("ImportError");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/runtime/status");
    expect((init as RequestInit).method).toBeUndefined();
  });

  it("throws ApiError on 404 (no row yet)", async () => {
    expect.assertions(1);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "no row" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await api.getRuntimeStatus();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
    }
  });
});
