import { describe, it, expect, vi } from "vitest";
import { applyFieldErrors } from "@/lib/api/form-errors";
import { ApiError } from "@/lib/api/client";

function makeForm() {
  const setError = vi.fn();
  return { setError } as any;
}

describe("applyFieldErrors", () => {
  it("returns false for a non-ApiError", () => {
    const form = makeForm();
    expect(applyFieldErrors(form, new Error("boom"))).toBe(false);
    expect(form.setError).not.toHaveBeenCalled();
  });

  it("returns false for an ApiError with no fieldErrors", () => {
    const form = makeForm();
    const err = new ApiError(500, { error: { code: "boom", message: "x" } });
    expect(applyFieldErrors(form, err)).toBe(false);
    expect(form.setError).not.toHaveBeenCalled();
  });

  it("calls setError per FieldError using the literal field path when no map", () => {
    const form = makeForm();
    const err = new ApiError(422, {
      error: {
        code: "validation_failed",
        message: "x",
        fieldErrors: [
          { field: "name", message: "required", code: null },
          { field: "definition", message: "bad", code: "invalid" },
        ],
      },
    });
    expect(applyFieldErrors(form, err)).toBe(true);
    expect(form.setError).toHaveBeenCalledTimes(2);
    expect(form.setError).toHaveBeenCalledWith("name", {
      message: "required",
      type: "server",
    });
    expect(form.setError).toHaveBeenCalledWith("definition", {
      message: "bad",
      type: "invalid",
    });
  });

  it("translates field paths through the optional pathMap", () => {
    const form = makeForm();
    const err = new ApiError(422, {
      error: {
        code: "validation_failed",
        message: "x",
        fieldErrors: [
          { field: "agent.config.graphDefinition", message: "bad", code: null },
        ],
      },
    });
    const ok = applyFieldErrors(form, err, {
      "agent.config.graphDefinition": "definition",
    });
    expect(ok).toBe(true);
    expect(form.setError).toHaveBeenCalledWith("definition", {
      message: "bad",
      type: "server",
    });
  });
});
