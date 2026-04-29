import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";

describe("WizardNoSupported", () => {
  it("renders the no-supported framing copy", () => {
    render(<WizardNoSupported onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(
      screen.getByText(/we found python code, but no supported agent/i),
    ).toBeInTheDocument();
  });

  it("calls onContinue with the selected framework", () => {
    const onContinue = vi.fn();
    render(<WizardNoSupported onContinue={onContinue} onRescan={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/adk/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith("ADK");
  });
});
