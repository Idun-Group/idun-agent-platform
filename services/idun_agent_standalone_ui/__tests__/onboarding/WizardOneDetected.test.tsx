import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import type { DetectedAgent } from "@/lib/api";

const HIGH: DetectedAgent = {
  framework: "LANGGRAPH",
  filePath: "agent.py",
  variableName: "graph",
  inferredName: "My Agent",
  confidence: "HIGH",
  source: "source",
};

const MEDIUM: DetectedAgent = { ...HIGH, confidence: "MEDIUM" };

describe("WizardOneDetected", () => {
  it("renders the framework, name, and path", () => {
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/found your agent/i)).toBeInTheDocument();
    expect(screen.getByText("My Agent")).toBeInTheDocument();
    expect(screen.getByText("agent.py:graph")).toBeInTheDocument();
    expect(screen.getByText(/langgraph/i)).toBeInTheDocument();
  });

  it("hides the confidence pill for HIGH detections", () => {
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.queryByText(/medium/i)).not.toBeInTheDocument();
  });

  it("shows the confidence pill for MEDIUM detections", () => {
    render(
      <WizardOneDetected
        detection={MEDIUM}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/medium confidence/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the detection when CTA clicked", () => {
    const onConfirm = vi.fn();
    render(
      <WizardOneDetected
        detection={HIGH}
        onConfirm={onConfirm}
        onRescan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /use this agent/i }));
    expect(onConfirm).toHaveBeenCalledWith(HIGH);
  });
});
