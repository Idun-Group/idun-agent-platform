import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardError } from "@/components/onboarding/WizardError";

describe("WizardError", () => {
  it("renders the error message verbatim", () => {
    render(
      <WizardError
        message="Engine init failed: bad import"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/engine init failed: bad import/i),
    ).toBeInTheDocument();
  });

  it("appends recovery hint when code is reload_failed", () => {
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // The hint may render with `agent.py` wrapped in a `<code>` element, so
    // assert against the surrounding paragraph's text content.
    const hintParagraph = screen.getByText(
      (_, node) =>
        node?.tagName.toLowerCase() === "p" &&
        Boolean(node.textContent?.match(/edit your.*agent\.py/i)),
    );
    expect(hintParagraph).toBeInTheDocument();
  });

  it("does not show the recovery hint for other codes", () => {
    render(
      <WizardError
        message="boom"
        code="other"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(
        (_, node) =>
          node?.tagName.toLowerCase() === "p" &&
          Boolean(node.textContent?.match(/edit your.*agent\.py/i)),
      ),
    ).not.toBeInTheDocument();
  });

  it("calls onRetry when retry clicked", () => {
    const onRetry = vi.fn();
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={onRetry}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("calls onBack when back link clicked", () => {
    const onBack = vi.fn();
    render(
      <WizardError
        message="boom"
        code="reload_failed"
        onRetry={vi.fn()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText(/back to wizard/i));
    expect(onBack).toHaveBeenCalled();
  });
});
