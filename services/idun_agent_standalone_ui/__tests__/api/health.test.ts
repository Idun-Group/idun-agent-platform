import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";

describe("checkAgentHealth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("GETs /health on the engine surface and returns the body on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "idun-agent-engine",
          version: "0.5.1",
          agent_name: "demo",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.checkAgentHealth();

    expect(result.status).toBe("ok");
    expect(result.agent_name).toBe("demo");

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/health");
    // No method on default GET — apiFetch infers it
    expect((init as RequestInit).method).toBeUndefined();
  });

  it("throws ApiError on 503 agent_not_ready so callers can render a failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "agent_not_ready", message: "Engine not configured." },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(api.checkAgentHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
