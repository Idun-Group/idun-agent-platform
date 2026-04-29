import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ApiFetch = typeof import("@/lib/api/client").apiFetch;

describe("apiFetch 401 redirect", () => {
  const fetchMock = vi.fn();
  const originalLocation = window.location;
  let apiFetch: ApiFetch;

  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock);
    // The 401 redirect uses a module-level `redirected` flag to avoid loops.
    // Reset modules so each test gets a fresh evaluation and the flag is
    // back to `false`.
    vi.resetModules();
    const mod = await import("@/lib/api/client");
    apiFetch = mod.apiFetch;
    // jsdom doesn't allow assigning to window.location.href directly without
    // this trick. Replace location with a writable mock so the redirect is
    // observable.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: "/onboarding",
        search: "",
        href: "",
      },
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("redirects to /login/?next=<pathname> on 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 }),
    );
    await expect(apiFetch("/admin/api/v1/agent")).rejects.toThrow();
    expect(window.location.href).toBe("/login/?next=%2Fonboarding");
  });

  it("encodes the pathname so query strings stay intact", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: "/admin/agent",
        search: "?foo=bar",
        href: "",
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 }),
    );
    await expect(apiFetch("/admin/api/v1/agent")).rejects.toThrow();
    expect(window.location.href).toBe(
      "/login/?next=%2Fadmin%2Fagent%3Ffoo%3Dbar",
    );
  });
});
