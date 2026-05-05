import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";

describe("mcp api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("discoverMcpTools() POSTs /admin/api/v1/mcp-servers/{id}/tools and returns the connection-check envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          details: { toolCount: 2, tools: ["search", "fetch"] },
          error: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.discoverMcpTools("abc-123");

    expect(result.ok).toBe(true);
    expect(result.details).toMatchObject({
      toolCount: 2,
      tools: ["search", "fetch"],
    });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/mcp-servers/abc-123/tools");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("discoverMcpTools() returns ok=false with the upstream error on connection failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          details: null,
          error: "ECONNREFUSED",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.discoverMcpTools("abc-123");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });
});
