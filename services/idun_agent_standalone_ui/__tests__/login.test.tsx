import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const replace = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      login: vi.fn(),
    },
  };
});

import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { makeRuntimeConfig } from "./helpers/runtime-config-fixture";

describe("LoginPage", () => {
  beforeEach(() => {
    replace.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
    (api.login as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
    // Pretend the runtime config injected by the FastAPI backend says
    // password auth is enabled. The dead-end-redirect behavior covered
    // by its own test below explicitly overrides this to "none".
    window.__IDUN_CONFIG__ = makeRuntimeConfig({ authMode: "password" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete window.__IDUN_CONFIG__;
  });

  it("on success without ?next, redirects to /", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("on success with ?next=/onboarding, redirects there", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("next=/onboarding"));
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("on 401, fires toast.error and does not redirect", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(401, null),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects unsafe ?next= values and falls back to /", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("next=https://evil.com"),
    );
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("rejects protocol-relative ?next= values", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("next=//evil.com/path"),
    );
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/admin password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  describe("when runtime config is missing entirely", () => {
    // Fail-closed default: if window.__IDUN_CONFIG__ is undefined (network
    // blip, CDN failure, dev mode without backend), the form should still
    // render — never silently redirect operators away from their only
    // sign-in surface.
    beforeEach(() => {
      delete window.__IDUN_CONFIG__;
    });

    it("renders the sign-in form (no auto-redirect)", () => {
      render(<LoginPage />);
      expect(screen.getByLabelText(/admin password/i)).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe("when admin auth is disabled (UI-011)", () => {
    beforeEach(() => {
      window.__IDUN_CONFIG__ = makeRuntimeConfig({ authMode: "none" });
    });

    it("does not render the sign-in form", () => {
      render(<LoginPage />);
      expect(
        screen.queryByLabelText(/admin password/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /sign in/i }),
      ).not.toBeInTheDocument();
    });

    it("redirects to / on mount", async () => {
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    });

    it("honors ?next=/admin/ when the form would have redirected there", async () => {
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams("next=/admin/"),
      );
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/"));
    });

    it("falls back to / for unsafe ?next= values", async () => {
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams("next=https://evil.com"),
      );
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    });

    it("rejects ?next=/login to avoid an infinite redirect loop (CR-1)", async () => {
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams("next=/login"),
      );
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    });

    it("rejects ?next=/login/ (trailing slash) to avoid loops", async () => {
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams("next=/login/"),
      );
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    });
  });
});
