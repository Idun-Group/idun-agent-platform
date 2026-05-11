import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SecretInput } from "@/components/admin/SecretInput";

describe("SecretInput", () => {
  it("renders as type=password by default", () => {
    render(<SecretInput aria-label="secret" defaultValue="hunter2" />);
    const input = screen.getByLabelText("secret");
    expect(input).toHaveAttribute("type", "password");
  });

  it("clicking the toggle flips to type=text and back", () => {
    render(<SecretInput aria-label="secret" defaultValue="hunter2" />);
    const input = screen.getByLabelText("secret");
    const toggle = screen.getByRole("button", { name: /show secret/i });

    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: /hide secret/i });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });

  it("preserves typed value across the reveal toggle", () => {
    render(<SecretInput aria-label="secret" />);
    const input = screen.getByLabelText("secret") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc123" } });
    expect(input.value).toBe("abc123");

    fireEvent.click(screen.getByRole("button", { name: /show secret/i }));
    expect(input.value).toBe("abc123");
    expect(input).toHaveAttribute("type", "text");
  });

  it("forwards autoComplete='off' and spellCheck=false by default", () => {
    render(<SecretInput aria-label="secret" />);
    const input = screen.getByLabelText("secret");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("links the toggle to the input via aria-controls (F7)", () => {
    render(<SecretInput aria-label="secret" id="my-secret" />);
    const input = screen.getByLabelText("secret");
    const toggle = screen.getByRole("button", { name: /show secret/i });
    expect(input).toHaveAttribute("id", "my-secret");
    expect(toggle).toHaveAttribute("aria-controls", "my-secret");
  });

  it("auto-derives an id when none is provided so aria-controls still points somewhere", () => {
    render(<SecretInput aria-label="secret" />);
    const input = screen.getByLabelText("secret");
    const toggle = screen.getByRole("button", { name: /show secret/i });
    const inputId = input.getAttribute("id");
    expect(inputId).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-controls", inputId!);
  });

  describe("when the input is disabled (F2)", () => {
    it("disables the toggle button so the secret cannot be revealed", () => {
      render(<SecretInput aria-label="secret" defaultValue="hunter2" disabled />);
      const input = screen.getByLabelText("secret");
      const toggle = screen.getByRole("button", { name: /show secret/i });
      expect(input).toBeDisabled();
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      expect(toggle).toHaveAttribute("tabindex", "-1");
    });

    it("does not flip type=password even if the toggle is somehow clicked", () => {
      render(<SecretInput aria-label="secret" defaultValue="hunter2" disabled />);
      const input = screen.getByLabelText("secret");
      const toggle = screen.getByRole("button", { name: /show secret/i });
      // Defensive: even if a stylesheet override let the user click, the
      // onClick handler must guard.
      fireEvent.click(toggle);
      expect(input).toHaveAttribute("type", "password");
    });
  });
});
