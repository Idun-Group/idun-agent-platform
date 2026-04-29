import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardStarterConfirm } from "@/components/onboarding/WizardStarterConfirm";

describe("WizardStarterConfirm", () => {
  it("renders the 5 file preview rows", () => {
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    for (const filename of [
      "agent.py",
      "requirements.txt",
      ".env.example",
      "README.md",
      ".gitignore",
    ]) {
      expect(screen.getByText(filename)).toBeInTheDocument();
    }
  });

  it("name input has the Starter Agent placeholder", () => {
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(/starter agent/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the typed name when set", () => {
    const onConfirm = vi.fn();
    render(
      <WizardStarterConfirm
        framework="ADK"
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/starter agent/i), {
      target: { value: "My Bot" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create starter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ framework: "ADK", name: "My Bot" });
  });

  it("calls onConfirm with name omitted when input is blank", () => {
    const onConfirm = vi.fn();
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /create starter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ framework: "LANGGRAPH" });
  });

  it("calls onBack when Back is clicked", () => {
    const onBack = vi.fn();
    render(
      <WizardStarterConfirm
        framework="LANGGRAPH"
        onConfirm={vi.fn()}
        onBack={onBack}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
