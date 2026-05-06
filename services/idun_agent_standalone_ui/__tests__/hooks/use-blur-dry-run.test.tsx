import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useBlurDryRun } from "@/hooks/use-blur-dry-run";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useBlurDryRun", () => {
  it("calls the mutation function with the current value on blur", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.run("./agent.py:graph");
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledWith("./agent.py:graph");
  });

  it("does not re-run for identical consecutive values", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError: () => {} }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.run("./a.py:g");
      await result.current.run("./a.py:g");
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it("forwards mutation errors to the provided onError callback", async () => {
    const error = new Error("boom");
    const mutationFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const { result } = renderHook(
      () => useBlurDryRun({ mutationFn, onError }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.run("./a.py:g");
    });
    expect(onError).toHaveBeenCalledWith(error);
  });
});
