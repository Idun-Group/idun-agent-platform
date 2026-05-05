import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";

describe("onboarding api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("scan() POSTs /admin/api/v1/onboarding/scan with no body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: "EMPTY",
          scanResult: {
            root: "/tmp",
            detected: [],
            hasPythonFiles: false,
            hasIdunConfig: false,
            scanDurationMs: 12,
          },
          currentAgent: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await api.scan();
    expect(result.state).toBe("EMPTY");
    expect(result.scanResult.hasPythonFiles).toBe(false);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/scan");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("createFromDetection() POSTs the typed body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Foo" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await api.createFromDetection({
      framework: "LANGGRAPH",
      filePath: "agent.py",
      variableName: "graph",
    });
    expect(result.data.name).toBe("Foo");
    expect(result.reload.status).toBe("reloaded");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/create-from-detection");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "LANGGRAPH",
      filePath: "agent.py",
      variableName: "graph",
    });
  });

  it("createStarter() POSTs the typed body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Starter Agent" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await api.createStarter({ framework: "ADK", name: "My Bot" });
    expect(result.data.name).toBe("Starter Agent");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/admin/api/v1/onboarding/create-starter");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "ADK",
      name: "My Bot",
    });
  });

  it("createStarter() omits name when not provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: "x", name: "Starter Agent" },
          reload: { status: "reloaded" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await api.createStarter({ framework: "LANGGRAPH" });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      framework: "LANGGRAPH",
    });
  });

  it("409 conflict surfaces as ApiError with the conflict envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "conflict", message: "Agent already configured." },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await api.createStarter({ framework: "LANGGRAPH" });
      throw new Error("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).detail).toMatchObject({
        error: { code: "conflict" },
      });
    }
  });

  it("500 reload_failed surfaces as ApiError with the reload envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "reload_failed", message: "Engine init failed." },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await api.createStarter({ framework: "LANGGRAPH" });
      throw new Error("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).detail).toMatchObject({
        error: { code: "reload_failed" },
      });
    }
  });
});
