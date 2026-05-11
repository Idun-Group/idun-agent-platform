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
});
