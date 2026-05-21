import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { AuthGuard } from "@/components/admin/AuthGuard";

const replace = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("AuthGuard", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    replace.mockReset();
    useAuthMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setLocation(pathname: string, search = "", hash = "") {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, pathname, search, hash },
    });
  }

  it("renders children when authenticated", () => {
    useAuthMock.mockReturnValue({
      data: { authenticated: true },
      isLoading: false,
      error: null,
    });
    const { getByText } = render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    expect(getByText("inner")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login/?next=<current path> when not authenticated", async () => {
    setLocation("/admin/mcp/", "");
    useAuthMock.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
      error: null,
    });
    render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login/?next=%2Fadmin%2Fmcp%2F"),
    );
  });

  it("preserves the query string in ?next=", async () => {
    setLocation("/admin/agent/", "?foo=bar");
    useAuthMock.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
      error: null,
    });
    render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login/?next=%2Fadmin%2Fagent%2F%3Ffoo%3Dbar",
      ),
    );
  });

  it("redirects on auth query error (e.g. network failure)", async () => {
    setLocation("/admin/", "");
    useAuthMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    });
    render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login/?next=%2Fadmin%2F"),
    );
  });

  it("does not redirect while loading", () => {
    useAuthMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects exactly once after loading resolves to unauthenticated", async () => {
    setLocation("/admin/", "");
    useAuthMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { rerender } = render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    expect(replace).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
      error: null,
    });
    await act(async () => {
      rerender(
        <AuthGuard>
          <span>inner</span>
        </AuthGuard>,
      );
    });
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login/?next=%2Fadmin%2F"),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("drops the hash fragment from ?next= (login round-trip preserves path + search only)", async () => {
    // The hash is intentionally dropped — login.tsx's open-redirect
    // guard (``isSafeNext``) operates on path + search, and the hash
    // would need its own validation. Codify the current behavior so a
    // future change is explicit.
    setLocation("/admin/traces/", "", "#span-123");
    useAuthMock.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
      error: null,
    });
    render(
      <AuthGuard>
        <span>inner</span>
      </AuthGuard>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login/?next=%2Fadmin%2Ftraces%2F"),
    );
  });
});
