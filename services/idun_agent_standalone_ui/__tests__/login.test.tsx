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

describe("LoginPage", () => {
  beforeEach(() => {
    replace.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
    (api.login as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});
