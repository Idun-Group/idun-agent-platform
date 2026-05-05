import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";

describe("WizardEmpty", () => {
  it("renders the title and both framework options", () => {
    render(<WizardEmpty onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByText(/let's create your first idun agent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/langgraph/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/adk/i)).toBeInTheDocument();
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  });

  it("Continue is disabled until a framework is selected", () => {
    render(<WizardEmpty onContinue={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("calls onContinue with the selected framework", () => {
    const onContinue = vi.fn();
    render(<WizardEmpty onContinue={onContinue} onRescan={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/langgraph/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith("LANGGRAPH");
  });

  it("calls onRescan when re-scan link is clicked", () => {
    const onRescan = vi.fn();
    render(<WizardEmpty onContinue={vi.fn()} onRescan={onRescan} />);
    fireEvent.click(screen.getByText(/re-scan/i));
    expect(onRescan).toHaveBeenCalled();
  });
});
