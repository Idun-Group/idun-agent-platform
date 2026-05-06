import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useBeforeUnload } from "@/hooks/use-before-unload";

describe("useBeforeUnload", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  it("does not add a listener when when=false", () => {
    renderHook(() => useBeforeUnload(false));
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.anything());
  });

  it("adds a beforeunload listener when when=true", () => {
    renderHook(() => useBeforeUnload(true));
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useBeforeUnload(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("toggles the listener when `when` flips", () => {
    const { rerender } = renderHook(({ when }) => useBeforeUnload(when), {
      initialProps: { when: false },
    });
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.anything());
    rerender({ when: true });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    rerender({ when: false });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("listener calls preventDefault and sets returnValue", () => {
    renderHook(() => useBeforeUnload(true));
    const handler = addSpy.mock.calls.find(
      ([event]) => event === "beforeunload",
    )?.[1] as (e: BeforeUnloadEvent) => void;
    expect(handler).toBeTypeOf("function");

    const event = { preventDefault: vi.fn(), returnValue: "" } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
  });
});
